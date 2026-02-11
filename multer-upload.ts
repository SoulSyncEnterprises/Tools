/**
 * Multer File Upload Integration (Standalone)
 *
 * ABOUT:
 *   Multer is the standard file upload middleware for Express.js/Node.js. It
 *   handles multipart form data (the format browsers use to upload files) and
 *   saves files to disk with configurable size limits and type filtering. This
 *   tool wraps Multer with a cleaner API, built-in error handling, and ready-made
 *   presets for common file types (audio files up to 80MB, images up to 10MB,
 *   documents up to 25MB). It also includes utilities for file cleanup and
 *   ensuring upload directories exist.
 *
 * USE CASES:
 *   - Accept file uploads in your Express.js app
 *   - Limit uploads by file size and MIME type
 *   - Handle audio file uploads (WAV, MP3) for music features
 *   - Process image uploads for user avatars or content
 *   - Manage temporary files with automatic cleanup
 *
 * DEPENDENCIES:
 *   npm install multer express
 *   npm install -D @types/multer @types/express
 *
 * NO ENVIRONMENT VARIABLES REQUIRED
 */

import multer from 'multer';
import path from 'path';
import fs from 'fs/promises';
import type { Request, Response, NextFunction } from 'express';

// ─── Configuration ───────────────────────────────────────────────────────────

export interface UploadConfig {
  /** Directory to store uploads (default: 'uploads/') */
  destination?: string;
  /** Max file size in bytes (default: 80MB) */
  maxFileSize?: number;
  /** Allowed MIME types (default: all) */
  allowedMimeTypes?: string[];
  /** Preserve original filename (default: false, uses multer's random name) */
  preserveFilename?: boolean;
}

// ─── Types ───────────────────────────────────────────────────────────────────

export interface UploadedFile {
  fieldname: string;
  originalname: string;
  encoding: string;
  mimetype: string;
  destination: string;
  filename: string;
  path: string;
  size: number;
}

// ─── Core Functions ──────────────────────────────────────────────────────────

/**
 * Create a configured multer upload middleware
 */
export function createUploader(config: UploadConfig = {}) {
  const dest = config.destination || 'uploads/';
  const maxSize = config.maxFileSize || 80 * 1024 * 1024; // 80MB default

  // Create storage configuration
  const storage = config.preserveFilename
    ? multer.diskStorage({
        destination: dest,
        filename: (_req, file, cb) => {
          const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
          const ext = path.extname(file.originalname);
          cb(null, file.fieldname + '-' + uniqueSuffix + ext);
        },
      })
    : undefined;

  // Create file filter for MIME types
  const fileFilter = config.allowedMimeTypes
    ? (_req: Request, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
        if (config.allowedMimeTypes!.includes(file.mimetype)) {
          cb(null, true);
        } else {
          cb(new Error(`File type ${file.mimetype} not allowed. Allowed: ${config.allowedMimeTypes!.join(', ')}`));
        }
      }
    : undefined;

  const upload = multer({
    dest: storage ? undefined : dest,
    storage,
    limits: { fileSize: maxSize },
    fileFilter,
  });

  return upload;
}

/**
 * Create middleware for single file upload with error handling
 */
export function singleUpload(fieldName: string = 'file', config: UploadConfig = {}) {
  const upload = createUploader(config);

  return (req: Request, res: Response, next: NextFunction) => {
    upload.single(fieldName)(req, res, (err: any) => {
      if (err instanceof multer.MulterError) {
        if (err.code === 'LIMIT_FILE_SIZE') {
          const maxMB = (config.maxFileSize || 80 * 1024 * 1024) / 1024 / 1024;
          return res.status(413).json({ error: `File too large. Max size: ${maxMB}MB` });
        }
        return res.status(400).json({ error: err.message });
      }
      if (err) {
        return res.status(400).json({ error: err.message });
      }
      next();
    });
  };
}

/**
 * Create middleware for multiple file uploads
 */
export function multipleUpload(fieldName: string = 'files', maxCount: number = 10, config: UploadConfig = {}) {
  const upload = createUploader(config);

  return (req: Request, res: Response, next: NextFunction) => {
    upload.array(fieldName, maxCount)(req, res, (err: any) => {
      if (err instanceof multer.MulterError) {
        return res.status(400).json({ error: err.message });
      }
      if (err) {
        return res.status(400).json({ error: err.message });
      }
      next();
    });
  };
}

// ─── File Utilities ──────────────────────────────────────────────────────────

/**
 * Delete an uploaded file
 */
export async function deleteFile(filePath: string): Promise<boolean> {
  try {
    await fs.unlink(filePath);
    return true;
  } catch {
    return false;
  }
}

/**
 * Get file info from an upload
 */
export function getFileInfo(file: Express.Multer.File): UploadedFile {
  return {
    fieldname: file.fieldname,
    originalname: file.originalname,
    encoding: file.encoding,
    mimetype: file.mimetype,
    destination: file.destination,
    filename: file.filename,
    path: file.path,
    size: file.size,
  };
}

/**
 * Ensure the upload directory exists
 */
export async function ensureUploadDir(dir: string = 'uploads/'): Promise<void> {
  await fs.mkdir(dir, { recursive: true });
}

/**
 * Create common upload presets
 */
export const presets = {
  /** Audio files only (WAV, MP3, M4A, FLAC, OGG) - 80MB max */
  audio: (dest?: string) => createUploader({
    destination: dest,
    maxFileSize: 80 * 1024 * 1024,
    allowedMimeTypes: ['audio/wav', 'audio/mpeg', 'audio/mp4', 'audio/flac', 'audio/ogg', 'audio/x-wav'],
  }),

  /** Image files only (JPEG, PNG, GIF, WebP) - 10MB max */
  image: (dest?: string) => createUploader({
    destination: dest,
    maxFileSize: 10 * 1024 * 1024,
    allowedMimeTypes: ['image/jpeg', 'image/png', 'image/gif', 'image/webp'],
  }),

  /** Document files (PDF, TXT, DOC) - 25MB max */
  document: (dest?: string) => createUploader({
    destination: dest,
    maxFileSize: 25 * 1024 * 1024,
    allowedMimeTypes: ['application/pdf', 'text/plain', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
  }),

  /** Any file - 80MB max */
  any: (dest?: string) => createUploader({
    destination: dest,
    maxFileSize: 80 * 1024 * 1024,
  }),
};

// ─── Usage Example ───────────────────────────────────────────────────────────
/*
import express from 'express';

const app = express();

// Option 1: Quick middleware setup
app.post('/upload', singleUpload('file', { maxFileSize: 50 * 1024 * 1024 }), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file' });

  const info = getFileInfo(req.file);
  console.log(`Uploaded: ${info.originalname} (${info.size} bytes)`);
  res.json(info);
});

// Option 2: Audio-only uploads
const audioUpload = presets.audio('uploads/audio');
app.post('/upload-audio', audioUpload.single('audio'), (req, res) => {
  res.json({ path: req.file?.path });
});

// Option 3: Multiple files
app.post('/upload-many', multipleUpload('files', 5), (req, res) => {
  const files = (req.files as Express.Multer.File[]).map(getFileInfo);
  res.json({ files });
});

// Delete a file
app.delete('/files/:filename', async (req, res) => {
  const deleted = await deleteFile(`uploads/${req.params.filename}`);
  res.json({ deleted });
});
*/
