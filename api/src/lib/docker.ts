import Docker from 'dockerode';
import { ContainerInfo } from './types';
import { logger } from '../server';

export class DockerService {
  private docker: Docker;

  constructor() {
    this.docker = new Docker({ socketPath: '/var/run/docker.sock' });
  }

  async getContainerInfo(containerName: string): Promise<ContainerInfo> {
    try {
      const container = this.docker.getContainer(containerName);
      const info = await container.inspect();
      
      return {
        name: containerName,
        state: info.State.Running ? 'running' : 'stopped',
        health: info.State.Health?.Status as any || 'none',
        startedAt: info.State.StartedAt,
        finishedAt: info.State.FinishedAt
      };
    } catch (error) {
      logger.warn(`Failed to inspect container ${containerName}:`, error);
      return {
        name: containerName,
        state: 'unknown'
      };
    }
  }

  async startContainer(containerName: string): Promise<void> {
    try {
      const container = this.docker.getContainer(containerName);
      const info = await container.inspect();
      
      if (!info.State.Running) {
        await container.start();
        logger.info(`Started container: ${containerName}`);
      }
    } catch (error) {
      logger.error(`Failed to start container ${containerName}:`, error);
      throw new Error(`Failed to start container: ${error.message}`);
    }
  }

  async stopContainer(containerName: string): Promise<void> {
    try {
      const container = this.docker.getContainer(containerName);
      const info = await container.inspect();
      
      if (info.State.Running) {
        // Graceful stop with 10 second timeout
        await container.stop({ t: 10 });
        logger.info(`Stopped container: ${containerName}`);
      }
    } catch (error) {
      logger.error(`Failed to stop container ${containerName}:`, error);
      throw new Error(`Failed to stop container: ${error.message}`);
    }
  }

  async getContainerLogs(containerName: string, follow: boolean = false, tail: number = 200) {
    try {
      const container = this.docker.getContainer(containerName);
      return await container.logs({
        follow,
        stdout: true,
        stderr: true,
        tail,
        timestamps: true
      });
    } catch (error) {
      logger.error(`Failed to get logs for container ${containerName}:`, error);
      throw new Error(`Failed to get container logs: ${error.message}`);
    }
  }

  async getDockerEvents(filters?: any) {
    try {
      return await this.docker.getEvents(filters);
    } catch (error) {
      logger.error('Failed to get docker events:', error);
      throw new Error(`Failed to get docker events: ${error.message}`);
    }
  }

  demuxLogs(buffer: Buffer): Array<{ timestamp: string; line: string; source: 'stdout' | 'stderr' }> {
    const logs: Array<{ timestamp: string; line: string; source: 'stdout' | 'stderr' }> = [];
    let offset = 0;

    while (offset < buffer.length) {
      if (offset + 8 > buffer.length) break;

      // Docker log format: [stream_type][padding][size][data]
      const streamType = buffer[offset];
      const size = buffer.readUInt32BE(offset + 4);
      
      if (offset + 8 + size > buffer.length) break;

      const logData = buffer.subarray(offset + 8, offset + 8 + size).toString('utf8');
      const source = streamType === 1 ? 'stdout' : 'stderr';
      
      // Split by newlines and process each line
      const lines = logData.split('\n').filter(line => line.trim());
      
      for (const line of lines) {
        // Extract timestamp if present (Docker format: 2025-01-01T00:00:00.000000000Z message)
        const timestampMatch = line.match(/^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d+Z)\s+(.*)$/);
        
        if (timestampMatch) {
          logs.push({
            timestamp: timestampMatch[1],
            line: timestampMatch[2],
            source
          });
        } else {
          logs.push({
            timestamp: new Date().toISOString(),
            line: line,
            source
          });
        }
      }
      
      offset += 8 + size;
    }

    return logs;
  }

  validateContainerName(containerName: string, allowedContainers: string[]): boolean {
    return allowedContainers.includes(containerName);
  }
}

export const dockerService = new DockerService();