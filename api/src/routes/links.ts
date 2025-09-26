import { Router } from 'express';
import { FileService } from '../lib/files';
import { 
  AddLinkSchema, 
  BulkAddLinksSchema,
  Config,
  LinksResponse,
  AddLinkResponse,
  BulkAddResponse,
  SuccessResponse
} from '../lib/types';
import { asyncHandler, ApiError } from '../middleware/error';
import { logger } from '../server';

export function createLinksRouter(config: Config): Router {
  const router = Router();
  const fileService = new FileService(config.linksFile);

  // GET /api/links
  router.get('/', asyncHandler(async (req, res) => {
    logger.info('Fetching all links');
    
    try {
      const links = await fileService.readLinks();
      
      const response: LinksResponse = {
        items: links
      };
      
      res.json(response);
      logger.info(`Retrieved ${links.length} links`);
    } catch (error) {
      logger.error('Failed to read links:', error);
      throw new ApiError(
        'FILE_ERROR',
        'Failed to read links file',
        500
      );
    }
  }));

  // POST /api/links
  router.post('/', asyncHandler(async (req, res) => {
    logger.info('Adding new link:', { url: req.body.url });
    
    // Validate request body
    const validation = AddLinkSchema.safeParse(req.body);
    if (!validation.success) {
      throw new ApiError(
        'VALIDATION_ERROR',
        'Invalid request data',
        400,
        validation.error.errors
      );
    }

    const { url } = validation.data;
    
    try {
      const result = await fileService.addLink(url);
      
      const response: AddLinkResponse = {
        id: result.id
      };
      
      // Return 200 even for duplicates, but log the difference
      if (result.isNew) {
        logger.info(`Added new link: ${url} (ID: ${result.id})`);
      } else {
        logger.info(`Link already exists: ${url} (ID: ${result.id})`);
      }
      
      res.json(response);
    } catch (error) {
      logger.error('Failed to add link:', error);
      throw new ApiError(
        'FILE_ERROR',
        'Failed to add link to file',
        500
      );
    }
  }));

  // POST /api/links/bulk
  router.post('/bulk', asyncHandler(async (req, res) => {
    logger.info('Adding bulk links:', { count: req.body.urls?.length || 0 });
    
    // Validate request body
    const validation = BulkAddLinksSchema.safeParse(req.body);
    if (!validation.success) {
      throw new ApiError(
        'VALIDATION_ERROR',
        'Invalid request data',
        400,
        validation.error.errors
      );
    }

    const { urls } = validation.data;
    
    if (urls.length === 0) {
      const response: BulkAddResponse = { created: 0 };
      return res.json(response);
    }
    
    try {
      const created = await fileService.addBulkLinks(urls);
      
      const response: BulkAddResponse = {
        created
      };
      
      logger.info(`Bulk add completed: ${created}/${urls.length} new links added`);
      res.json(response);
    } catch (error) {
      logger.error('Failed to add bulk links:', error);
      throw new ApiError(
        'FILE_ERROR',
        'Failed to add bulk links to file',
        500
      );
    }
  }));

  // DELETE /api/links/:id
  router.delete('/:id', asyncHandler(async (req, res) => {
    const { id } = req.params;
    
    if (!id || id.trim().length === 0) {
      throw new ApiError(
        'VALIDATION_ERROR',
        'Link ID is required',
        400
      );
    }

    logger.info('Removing link:', { id });
    
    try {
      const removed = await fileService.removeLink(id);
      
      if (!removed) {
        throw new ApiError(
          'NOT_FOUND',
          'Link not found',
          404
        );
      }
      
      const response: SuccessResponse = { ok: true };
      res.json(response);
      
      logger.info(`Successfully removed link: ${id}`);
    } catch (error) {
      if (error instanceof ApiError) {
        throw error;
      }
      
      logger.error('Failed to remove link:', error);
      throw new ApiError(
        'FILE_ERROR',
        'Failed to remove link from file',
        500
      );
    }
  }));

  return router;
}