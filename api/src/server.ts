import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import pino from 'pino';
import { Config } from './lib/types';
import { createAuthMiddleware } from './lib/auth';
import { errorHandler } from './middleware/error';
import { createStatusRouter } from './routes/status';
import { createPipelineRouter } from './routes/pipeline';
import { createLogsRouter } from './routes/logs';
import { createLinksRouter } from './routes/links';

// Initialize logger
export const logger = pino({
  level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
  ...(process.env.NODE_ENV !== 'production' && {
    transport: {
      target: 'pino-pretty',
      options: {
        colorize: true,
        translateTime: 'yyyy-mm-dd HH:MM:ss',
        ignore: 'pid,hostname'
      }
    }
  })
});

// Load configuration from environment
const config: Config = {
  port: parseInt(process.env.PORT || '8081'),
  apiToken: process.env.API_TOKEN,
  pipelineContainer: process.env.PIPELINE_CONTAINER || 'media-pipeline',
  gluetunContainer: process.env.GLUETUN_CONTAINER || 'gluetun',
  torContainer: process.env.TOR_CONTAINER || 'torproxy',
  linksFile: process.env.LINKS_FILE || '/opt/media-pipeline/data/links.txt',
  appVersion: process.env.APP_VERSION || '1.0.0'
};

logger.info('Starting Media Pipeline API', {
  config: {
    ...config,
    apiToken: config.apiToken ? '[SET]' : '[NOT SET]'
  }
});

const app = express();

// Trust proxy for rate limiting when behind reverse proxy
app.set('trust proxy', 1);

// Security middleware
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'"]
    },
    reportOnly: true // Use report-only mode for compatibility
  }
}));

// CORS configuration
app.use(cors({
  origin: [
    'http://localhost:8080',  // nginx UI
    'http://localhost:3000'   // vite dev
  ],
  credentials: true,
  methods: ['GET', 'POST', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Cache-Control']
}));

// Rate limiting
const globalRateLimit = rateLimit({
  windowMs: 5 * 60 * 1000, // 5 minutes
  max: 100, // 100 requests per 5 minutes
  message: {
    error: {
      code: 'RATE_LIMIT_EXCEEDED',
      message: 'Too many requests, please try again later'
    }
  },
  standardHeaders: true,
  legacyHeaders: false
});

const mutationRateLimit = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 30, // 30 mutations per minute
  message: {
    error: {
      code: 'MUTATION_RATE_LIMIT_EXCEEDED',
      message: 'Too many mutations, please try again later'
    }
  },
  standardHeaders: true,
  legacyHeaders: false
});

app.use(globalRateLimit);

// Body parsing
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

// Health check endpoint (no auth required)
app.get('/healthz', (req, res) => {
  res.json({ ok: true });
});

// Authentication middleware (applied to all API routes)
const authMiddleware = createAuthMiddleware(config);

// Apply mutation rate limit to POST and DELETE methods
app.use('/api', (req, res, next) => {
  if (req.method === 'POST' || req.method === 'DELETE') {
    return mutationRateLimit(req, res, next);
  }
  next();
});

// API routes with authentication
app.use('/api/status', authMiddleware, createStatusRouter(config));
app.use('/api/pipeline', authMiddleware, createPipelineRouter(config));
app.use('/api/logs', authMiddleware, createLogsRouter(config));
app.use('/api/links', authMiddleware, createLinksRouter(config));

// 404 handler for API routes
app.use('/api/*', (req, res) => {
  res.status(404).json({
    error: {
      code: 'NOT_FOUND',
      message: `API endpoint not found: ${req.method} ${req.path}`
    }
  });
});

// Error handling middleware (must be last)
app.use(errorHandler);

// Start server
const server = app.listen(config.port, '127.0.0.1', () => {
  logger.info(`Media Pipeline API listening on 127.0.0.1:${config.port}`);
  
  if (config.apiToken) {
    logger.info('API token authentication enabled');
  } else {
    logger.warn('API token authentication disabled - all requests allowed');
  }
});

// Graceful shutdown
process.on('SIGTERM', () => {
  logger.info('SIGTERM received, shutting down gracefully');
  server.close(() => {
    logger.info('Server closed');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  logger.info('SIGINT received, shutting down gracefully');
  server.close(() => {
    logger.info('Server closed');
    process.exit(0);
  });
});

export default app;