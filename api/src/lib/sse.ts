import { Response } from 'express';
import { logger } from '../server';

export class SSEConnection {
  private heartbeatInterval?: NodeJS.Timeout;
  private isClosed = false;

  constructor(private res: Response, private connectionId: string) {
    this.setupConnection();
    this.startHeartbeat();
  }

  private setupConnection(): void {
    // Set SSE headers
    this.res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Cache-Control'
    });

    // Send retry instruction for auto-reconnect
    this.res.write('retry: 3000\n\n');
    this.res.flushHeaders();

    // Handle client disconnect
    this.res.on('close', () => {
      logger.info(`SSE connection closed: ${this.connectionId}`);
      this.close();
    });

    // Handle connection errors
    this.res.on('error', (error) => {
      logger.error(`SSE connection error: ${this.connectionId}`, error);
      this.close();
    });

    logger.info(`SSE connection established: ${this.connectionId}`);
  }

  private startHeartbeat(): void {
    // Send heartbeat every 15 seconds to keep connection alive
    this.heartbeatInterval = setInterval(() => {
      if (!this.isClosed) {
        this.sendEvent('ping', { timestamp: new Date().toISOString() });
      }
    }, 15000);
  }

  public sendData(data: any): void {
    if (this.isClosed) return;
    
    try {
      this.res.write(`data: ${JSON.stringify(data)}\n\n`);
    } catch (error) {
      logger.error(`Failed to send SSE data: ${this.connectionId}`, error);
      this.close();
    }
  }

  public sendEvent(event: string, data: any): void {
    if (this.isClosed) return;
    
    try {
      this.res.write(`event: ${event}\n`);
      this.res.write(`data: ${JSON.stringify(data)}\n\n`);
    } catch (error) {
      logger.error(`Failed to send SSE event: ${this.connectionId}`, error);
      this.close();
    }
  }

  public sendError(message: string): void {
    this.sendEvent('error', { message });
  }

  public close(): void {
    if (this.isClosed) return;
    
    this.isClosed = true;
    
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
    }

    try {
      if (!this.res.destroyed) {
        this.res.end();
      }
    } catch (error) {
      logger.error(`Error closing SSE connection: ${this.connectionId}`, error);
    }
  }

  public isClosed_(): boolean {
    return this.isClosed || this.res.destroyed;
  }
}

export class SSEManager {
  private connections = new Map<string, SSEConnection>();

  public createConnection(res: Response): SSEConnection {
    const connectionId = `sse_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const connection = new SSEConnection(res, connectionId);
    
    this.connections.set(connectionId, connection);
    
    // Auto-cleanup when connection closes
    res.on('close', () => {
      this.connections.delete(connectionId);
    });

    return connection;
  }

  public broadcast(event: string, data: any): void {
    for (const [id, connection] of this.connections) {
      if (connection.isClosed_()) {
        this.connections.delete(id);
      } else {
        connection.sendEvent(event, data);
      }
    }
  }

  public broadcastData(data: any): void {
    for (const [id, connection] of this.connections) {
      if (connection.isClosed_()) {
        this.connections.delete(id);
      } else {
        connection.sendData(data);
      }
    }
  }

  public getActiveConnections(): number {
    // Clean up closed connections
    for (const [id, connection] of this.connections) {
      if (connection.isClosed_()) {
        this.connections.delete(id);
      }
    }
    return this.connections.size;
  }

  public closeAll(): void {
    for (const connection of this.connections.values()) {
      connection.close();
    }
    this.connections.clear();
  }
}
