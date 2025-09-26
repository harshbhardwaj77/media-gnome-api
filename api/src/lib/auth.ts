import { Request, Response, NextFunction } from 'express';
import { Config } from './types';

export interface AuthenticatedRequest extends Request {
  authenticated?: boolean;
}

export function createAuthMiddleware(config: Config) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    // If no API token is configured, allow all requests
    if (!config.apiToken) {
      req.authenticated = true;
      return next();
    }

    // Check for Authorization header
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        error: {
          code: 'UNAUTHORIZED',
          message: 'Missing or invalid Authorization header. Expected: Bearer <token>'
        }
      });
    }

    const token = authHeader.substring(7); // Remove 'Bearer ' prefix
    
    if (token !== config.apiToken) {
      return res.status(401).json({
        error: {
          code: 'INVALID_TOKEN',
          message: 'Invalid API token'
        }
      });
    }

    req.authenticated = true;
    next();
  };
}

// Helper to check if request is authenticated (for optional auth endpoints)
export function isAuthenticated(req: AuthenticatedRequest): boolean {
  return req.authenticated === true;
}