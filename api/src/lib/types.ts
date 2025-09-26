import { z } from 'zod';

// Zod schemas for validation
export const AddLinkSchema = z.object({
  url: z.string()
    .url()
    .refine(url => url.startsWith('https://mega.nz/'), {
      message: 'URL must start with https://mega.nz/'
    })
});

export const BulkAddLinksSchema = z.object({
  urls: z.array(z.string()
    .url()
    .refine(url => url.startsWith('https://mega.nz/'), {
      message: 'Each URL must start with https://mega.nz/'
    }))
});

// TypeScript types
export interface Status {
  pipeline: "running" | "stopped" | "unknown";
  containerName: string;
  vpn: "up" | "down" | "unknown";
  tor: "up" | "down" | "unknown";
  lastRunAt?: string;
  cleanJobs?: number;
  version?: string;
}

export interface Link {
  id: string;
  url: string;
  addedAt: string;
}

export interface LinksResponse {
  items: Link[];
}

export interface AddLinkResponse {
  id: string;
}

export interface BulkAddResponse {
  created: number;
}

export interface LogEntry {
  ts: string;
  line: string;
  level: "info" | "error";
}

export interface ApiError {
  error: {
    code: string;
    message: string;
    details?: any;
  };
}

export interface SuccessResponse {
  ok: true;
}

// Environment configuration
export interface Config {
  port: number;
  apiToken?: string;
  pipelineContainer: string;
  gluetunContainer: string;
  torContainer: string;
  linksFile: string;
  appVersion: string;
}

// Docker container state
export interface ContainerInfo {
  name: string;
  state: 'running' | 'stopped' | 'unknown';
  health?: 'healthy' | 'unhealthy' | 'starting' | 'none';
  startedAt?: string;
  finishedAt?: string;
}