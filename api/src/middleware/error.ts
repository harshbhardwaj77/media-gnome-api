import { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import { logger } from '../server';

export interface ApiErrorResponse {
  error: {
    code: string;
    message: string;
    details?: any;
  };
}

export class ApiError extends Error {
  constructor(
    public code: string,
    public message: string,
    public statusCode: number = 500,
    public details?: any
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export function errorHandler(
  error: any,
  req: Request,
  res: Response,
  next: NextFunction
): void {
  logger.error('API Error:', {
    error: error.message,
    stack: error.stack,
    url: req.url,
    method: req.method,
    body: req.body,
    query: req.query
  });

  let statusCode = 500;
  let code = 'INTERNAL_ERROR';
  let message = 'An internal server error occurred';
  let details: any = undefined;

  if (error instanceof ApiError) {
    statusCode = error.statusCode;
    code = error.code;
    message = error.message;
    details = error.details;
  } else if (error instanceof ZodError) {
    statusCode = 400;
    code = 'VALIDATION_ERROR';
    message = 'Invalid request data';
    details = error.errors.map(err => ({
      field: err.path.join('.'),
      message: err.message
    }));
  } else if (error.code === 'ENOENT') {
    statusCode = 404;
    code = 'NOT_FOUND';
    message = 'Resource not found';
  } else if (error.code === 'EACCES' || error.code === 'EPERM') {
    statusCode = 403;
    code = 'PERMISSION_DENIED';
    message = 'Permission denied';
  } else if (error.message?.includes('container')) {
    statusCode = 404;
    code = 'CONTAINER_NOT_FOUND';
    message = error.message || 'Container not found';
  } else if (error.message?.includes('Docker')) {
    statusCode = 503;
    code = 'DOCKER_ERROR';
    message = error.message || 'Docker service error';
  }

  const response: ApiErrorResponse = {
    error: {
      code,
      message,
      ...(details && { details })
    }
  };

  res.status(statusCode).json(response);
}

// Async error wrapper
export function asyncHandler<T>(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<T>
) {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

// Create specific error types
export function createValidationError(message: string, details?: any): ApiError {
  return new ApiError('VALIDATION_ERROR', message, 400, details);
}

export function createNotFoundError(message: string): ApiError {
  return new ApiError('NOT_FOUND', message, 404);
}

export function createUnauthorizedError(message: string): ApiError {
  return new ApiError('UNAUTHORIZED', message, 401);
}

export function createForbiddenError(message: string): ApiError {
  return new ApiError('FORBIDDEN', message, 403);
}

export function createConflictError(message: string): ApiError {
  return new ApiError('CONFLICT', message, 409);
}

export function createServerError(message: string): ApiError {
  return new ApiError('INTERNAL_ERROR', message, 500);
}