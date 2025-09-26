import { Router } from 'express';
import { dockerService } from '../lib/docker';
import { SSEManager } from '../lib/sse';
import { Config, LogEntry } from '../lib/types';
import { asyncHandler } from '../middleware/error';
import { logger } from '../server';
import { Readable } from 'stream';

export function createLogsRouter(config: Config): Router {
  const router = Router();
  const sseManager = new SSEManager();

  // GET /api/logs/stream (SSE)
  router.get('/stream', asyncHandler(async (req, res) => {
    const connection = sseManager.createConnection(res);
    
    try {
      logger.info(`Starting log stream for container: ${config.pipelineContainer}`);
      
      // Get container logs with follow=true for streaming
      const logStream = await dockerService.getContainerLogs(config.pipelineContainer, true, 200);
      
      // Handle log stream data
      let buffer = Buffer.alloc(0);
      
      const processLogData = (chunk: Buffer) => {
        try {
          // Accumulate data in buffer
          buffer = Buffer.concat([buffer, chunk]);
          
          // Process complete log entries
          let processed = 0;
          
          while (processed < buffer.length) {
            // Check if we have enough data for header (8 bytes)
            if (buffer.length - processed < 8) break;
            
            const streamType = buffer[processed];
            const size = buffer.readUInt32BE(processed + 4);
            
            // Check if we have the complete message
            if (buffer.length - processed < 8 + size) break;
            
            // Extract the log data
            const logData = buffer.subarray(processed + 8, processed + 8 + size).toString('utf8');
            const source = streamType === 1 ? 'stdout' : 'stderr';
            const level: 'info' | 'error' = source === 'stderr' ? 'error' : 'info';
            
            // Split by newlines and send each line
            const lines = logData.split('\n').filter(line => line.trim());
            
            for (const line of lines) {
              // Extract timestamp if present
              const timestampMatch = line.match(/^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d+Z)\s+(.*)$/);
              
              const logEntry: LogEntry = {
                ts: timestampMatch ? timestampMatch[1] : new Date().toISOString(),
                line: timestampMatch ? timestampMatch[2] : line,
                level
              };
              
              connection.sendData(logEntry);
            }
            
            processed += 8 + size;
          }
          
          // Keep unprocessed data for next chunk
          if (processed > 0) {
            buffer = buffer.subarray(processed);
          }
        } catch (error) {
          logger.error('Error processing log data:', error);
          connection.sendError('Error processing log data');
        }
      };

      // Set up stream event handlers
      if (logStream instanceof Readable) {
        logStream.on('data', processLogData);
        
        logStream.on('end', () => {
          logger.info('Log stream ended');
          // Don't close connection, keep it open for potential reconnection
          connection.sendEvent('info', { message: 'Container log stream ended' });
        });
        
        logStream.on('error', (error: Error) => {
          logger.error('Log stream error:', error);
          connection.sendError(`Log stream error: ${error.message}`);
        });
        
        // Handle connection close
        res.on('close', () => {
          logger.info('Log stream SSE connection closed');
          if (logStream && !logStream.destroyed) {
            logStream.destroy();
          }
        });
      } else {
        // Handle case where logStream is a Buffer (no follow mode)
        processLogData(logStream as Buffer);
      }

      // Send periodic heartbeat when no log activity
      const heartbeatInterval = setInterval(() => {
        if (connection.isClosed_()) {
          clearInterval(heartbeatInterval);
          return;
        }
        
        // Send an idle heartbeat
        connection.sendEvent('heartbeat', { 
          timestamp: new Date().toISOString(),
          message: 'Log stream active'
        });
      }, 30000); // Every 30 seconds

      // Cleanup on connection close
      res.on('close', () => {
        clearInterval(heartbeatInterval);
        if (logStream instanceof Readable && !logStream.destroyed) {
          logStream.destroy();
        }
      });

    } catch (error) {
      logger.error('Error setting up log stream:', error);
      connection.sendError(`Failed to establish log stream: ${error.message}`);
      connection.close();
    }
  }));

  return router;
}
