import { Router } from 'express';
import { dockerService } from '../lib/docker';
import { SSEManager } from '../lib/sse';
import { Status, Config } from '../lib/types';
import { asyncHandler } from '../middleware/error';
import { logger } from '../server';

export function createStatusRouter(config: Config): Router {
  const router = Router();
  const sseManager = new SSEManager();
  
  // Track status for change detection
  let lastStatus: Status | null = null;
  
  async function getCurrentStatus(): Promise<Status> {
    const [pipelineInfo, vpnInfo, torInfo] = await Promise.all([
      dockerService.getContainerInfo(config.pipelineContainer),
      dockerService.getContainerInfo(config.gluetunContainer),
      dockerService.getContainerInfo(config.torContainer)
    ]);

    // Determine VPN status (healthy or running = up)
    let vpnStatus: "up" | "down" | "unknown" = "unknown";
    if (vpnInfo.state === 'running') {
      vpnStatus = vpnInfo.health === 'healthy' || vpnInfo.health === 'none' ? 'up' : 'down';
    } else if (vpnInfo.state === 'stopped') {
      vpnStatus = 'down';
    }

    // Determine Tor status (running = up)
    let torStatus: "up" | "down" | "unknown" = "unknown";
    if (torInfo.state === 'running') {
      torStatus = 'up';
    } else if (torInfo.state === 'stopped') {
      torStatus = 'down';
    }

    // Get last run time (prefer StartedAt when running, otherwise FinishedAt)
    let lastRunAt: string | undefined;
    if (pipelineInfo.state === 'running' && pipelineInfo.startedAt) {
      lastRunAt = pipelineInfo.startedAt;
    } else if (pipelineInfo.finishedAt) {
      lastRunAt = pipelineInfo.finishedAt;
    }

    // Get clean jobs from pipeline container environment if available
    let cleanJobs: number | undefined;
    try {
      const container = dockerService['docker'].getContainer(config.pipelineContainer);
      const inspectData = await container.inspect();
      const env = inspectData.Config.Env || [];
      
      for (const envVar of env) {
        if (envVar.startsWith('CLEAN_JOBS=')) {
          const value = parseInt(envVar.split('=')[1]);
          if (!isNaN(value)) {
            cleanJobs = value;
          }
          break;
        }
      }
    } catch (error) {
      // Ignore errors when getting env vars
    }

    return {
      pipeline: pipelineInfo.state,
      containerName: config.pipelineContainer,
      vpn: vpnStatus,
      tor: torStatus,
      lastRunAt,
      cleanJobs,
      version: config.appVersion
    };
  }

  // GET /api/status
  router.get('/', asyncHandler(async (req, res) => {
    const status = await getCurrentStatus();
    res.json(status);
  }));

  // GET /api/status/stream (SSE)
  router.get('/stream', asyncHandler(async (req, res) => {
    const connection = sseManager.createConnection(res);
    
    try {
      // Send initial status
      const initialStatus = await getCurrentStatus();
      connection.sendData(initialStatus);
      lastStatus = initialStatus;
      
      // Set up Docker events monitoring
      const dockerEvents = await dockerService.getDockerEvents({
        filters: {
          container: [config.pipelineContainer, config.gluetunContainer, config.torContainer],
          event: ['start', 'stop', 'health_status']
        }
      });

      // Handle Docker events
      dockerEvents.on('data', async (chunk: Buffer) => {
        try {
          const events = chunk.toString().split('\n').filter(line => line.trim());
          
          for (const eventLine of events) {
            const event = JSON.parse(eventLine);
            logger.info('Docker event:', event);
            
            // Get updated status and broadcast if changed
            const currentStatus = await getCurrentStatus();
            
            if (!lastStatus || JSON.stringify(currentStatus) !== JSON.stringify(lastStatus)) {
              connection.sendData(currentStatus);
              lastStatus = currentStatus;
            }
          }
        } catch (error) {
          logger.error('Error processing Docker event:', error);
          connection.sendError('Failed to process status update');
        }
      });

      dockerEvents.on('error', (error: Error) => {
        logger.error('Docker events error:', error);
        connection.sendError('Docker events stream error');
      });

      // Heartbeat to send status updates every 5 seconds even without events
      const heartbeatInterval = setInterval(async () => {
        if (connection.isClosed_()) {
          clearInterval(heartbeatInterval);
          dockerEvents.destroy();
          return;
        }
        
        try {
          const currentStatus = await getCurrentStatus();
          
          if (!lastStatus || JSON.stringify(currentStatus) !== JSON.stringify(lastStatus)) {
            connection.sendData(currentStatus);
            lastStatus = currentStatus;
          }
        } catch (error) {
          logger.error('Error in status heartbeat:', error);
        }
      }, 5000);

      // Cleanup on connection close
      res.on('close', () => {
        clearInterval(heartbeatInterval);
        dockerEvents.destroy();
      });

    } catch (error) {
      logger.error('Error setting up status stream:', error);
      connection.sendError('Failed to establish status stream');
      connection.close();
    }
  }));

  return router;
}