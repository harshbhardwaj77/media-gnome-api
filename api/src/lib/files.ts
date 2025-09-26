import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import { Link } from './types';
import { logger } from '../server';

export class FileService {
  constructor(private linksFilePath: string) {}

  private generateId(url: string): string {
    return crypto.createHash('sha256').update(url).digest('hex');
  }

  private async ensureDirectoryExists(): Promise<void> {
    const dir = path.dirname(this.linksFilePath);
    try {
      await fs.access(dir);
    } catch {
      await fs.mkdir(dir, { recursive: true });
    }
  }

  private async getFileStats(): Promise<{ mtime: Date } | null> {
    try {
      const stats = await fs.stat(this.linksFilePath);
      return { mtime: stats.mtime };
    } catch {
      return null;
    }
  }

  async readLinks(): Promise<Link[]> {
    try {
      const content = await fs.readFile(this.linksFilePath, 'utf-8');
      const urls = content
        .split('\n')
        .map(line => line.trim())
        .filter(line => line.length > 0);
      
      const stats = await this.getFileStats();
      const addedAt = stats?.mtime.toISOString() || new Date().toISOString();

      return urls.map(url => ({
        id: this.generateId(url),
        url,
        addedAt
      }));
    } catch (error) {
      if (error.code === 'ENOENT') {
        return []; // File doesn't exist yet
      }
      logger.error('Failed to read links file:', error);
      throw new Error('Failed to read links file');
    }
  }

  async addLink(url: string): Promise<{ id: string; isNew: boolean }> {
    await this.ensureDirectoryExists();
    
    const id = this.generateId(url);
    const existingLinks = await this.readLinks();
    
    // Check if URL already exists
    const existing = existingLinks.find(link => link.url === url);
    if (existing) {
      return { id: existing.id, isNew: false };
    }

    // Append to file atomically
    const tempFile = `${this.linksFilePath}.tmp`;
    
    try {
      // Read current content
      let currentContent = '';
      try {
        currentContent = await fs.readFile(this.linksFilePath, 'utf-8');
      } catch (error) {
        if (error.code !== 'ENOENT') {
          throw error;
        }
      }

      // Append new URL
      const newContent = currentContent + (currentContent && !currentContent.endsWith('\n') ? '\n' : '') + url + '\n';
      
      // Write to temp file and rename (atomic operation)
      await fs.writeFile(tempFile, newContent, 'utf-8');
      await fs.rename(tempFile, this.linksFilePath);
      
      logger.info(`Added new link: ${url}`);
      return { id, isNew: true };
    } catch (error) {
      // Clean up temp file if it exists
      try {
        await fs.unlink(tempFile);
      } catch {}
      
      logger.error('Failed to add link:', error);
      throw new Error('Failed to add link to file');
    }
  }

  async addBulkLinks(urls: string[]): Promise<number> {
    await this.ensureDirectoryExists();
    
    const existingLinks = await this.readLinks();
    const existingUrls = new Set(existingLinks.map(link => link.url));
    
    // Filter out duplicates
    const newUrls = urls.filter(url => !existingUrls.has(url));
    
    if (newUrls.length === 0) {
      return 0;
    }

    // Add all new URLs atomically
    const tempFile = `${this.linksFilePath}.tmp`;
    
    try {
      // Read current content
      let currentContent = '';
      try {
        currentContent = await fs.readFile(this.linksFilePath, 'utf-8');
      } catch (error) {
        if (error.code !== 'ENOENT') {
          throw error;
        }
      }

      // Append new URLs
      const newLines = newUrls.join('\n');
      const newContent = currentContent + 
        (currentContent && !currentContent.endsWith('\n') ? '\n' : '') + 
        newLines + '\n';
      
      // Write to temp file and rename (atomic operation)
      await fs.writeFile(tempFile, newContent, 'utf-8');
      await fs.rename(tempFile, this.linksFilePath);
      
      logger.info(`Added ${newUrls.length} new links`);
      return newUrls.length;
    } catch (error) {
      // Clean up temp file if it exists
      try {
        await fs.unlink(tempFile);
      } catch {}
      
      logger.error('Failed to add bulk links:', error);
      throw new Error('Failed to add bulk links to file');
    }
  }

  async removeLink(id: string): Promise<boolean> {
    const links = await this.readLinks();
    const linkToRemove = links.find(link => link.id === id);
    
    if (!linkToRemove) {
      return false; // Link not found
    }

    // Filter out the link and rewrite file atomically
    const remainingUrls = links
      .filter(link => link.id !== id)
      .map(link => link.url);
    
    const tempFile = `${this.linksFilePath}.tmp`;
    
    try {
      const newContent = remainingUrls.length > 0 ? remainingUrls.join('\n') + '\n' : '';
      
      // Write to temp file and rename (atomic operation)
      await fs.writeFile(tempFile, newContent, 'utf-8');
      await fs.rename(tempFile, this.linksFilePath);
      
      logger.info(`Removed link: ${linkToRemove.url}`);
      return true;
    } catch (error) {
      // Clean up temp file if it exists
      try {
        await fs.unlink(tempFile);
      } catch {}
      
      logger.error('Failed to remove link:', error);
      throw new Error('Failed to remove link from file');
    }
  }
}