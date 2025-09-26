import { Router } from 'express';
import { dockerService } from '../lib/docker';
import { Config, SuccessResponse } from '../lib/types';
import { asyncHandler, ApiError } from '../middleware/error';
import { logger } from '../server';

export function createPipelineRouter(config: Config): Router {
  const router = Router();

  // Validate container name against allow-list
  function validateContainer(containerName: string): void {
    if (containerName !== config.pipelineContainer) {
      throw new ApiError(
        'FORBIDDEN', 
        `Container '${containerName}' is not allowed. Only '${config.pipelineContainer}' is permitted.`,
        403
      );
    }
  }

  // POST /api/pipeline/start
  router.post('/start', asyncHandler(async (req, res) => {
    validateContainer(config.pipelineContainer);
    
    logger.info(`Starting pipeline container: ${config.pipelineContainer}`);
    
    try {
      await dockerService.startContainer(config.pipelineContainer);
      
      const response: SuccessResponse = { ok: true };
      res.json(response);
      
      logger.info(`Successfully started pipeline container: ${config.pipelineContainer}`);
    } catch (error) {
      logger.error(`Failed to start pipeline container: ${config.pipelineContainer}`, error);
      throw new ApiError(
        'DOCKER_ERROR',
        `Failed to start pipeline: ${error.message}`,
        503
      );
    }
  }));

  // POST /api/pipeline/stop
  router.post('/stop', asyncHandler(async (req, res) => {
    validateContainer(config.pipelineContainer);
    
    logger.info(`Stopping pipeline container: ${config.pipelineContainer}`);
    
    try {
      await dockerService.stopContainer(config.pipelineContainer);
      
      const response: SuccessResponse = { ok: true };
      res.json(response);
      
      logger.info(`Successfully stopped pipeline container: ${config.pipelineContainer}`);
    } catch (error) {
      logger.error(`Failed to stop pipeline container: ${config.pipelineContainer}`, error);
      throw new ApiError(
        'DOCKER_ERROR',
        `Failed to stop pipeline: ${error.message}`,
        503
      );
    }
  }));

  return router;
}