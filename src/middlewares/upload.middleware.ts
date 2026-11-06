import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { Request, Response, NextFunction } from 'express';
import { safelyDeleteFile, safelyDeleteFiles } from '../utils/fileCleanup';

// Asegurar directorios de carga locales
const baseUploadDir = path.resolve(process.env.UPLOAD_DIR || 'uploads');
const coversDir = path.join(baseUploadDir, 'covers');
const tracksDir = path.join(baseUploadDir, 'tracks');

[baseUploadDir, coversDir, tracksDir].forEach((dir) => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
});

// Almacenamiento para carátulas / portadas de discos
const coverStorage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, coversDir);
  },
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname);
    const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    cb(null, `cover-${uniqueSuffix}${ext}`);
  },
});

// Almacenamiento para archivos de audio / pistas de música
const trackStorage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, tracksDir);
  },
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname);
    const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    cb(null, `track-${uniqueSuffix}${ext}`);
  },
});

// Filtro de imágenes
const imageFilter = (
  _req: any,
  file: Express.Multer.File,
  cb: multer.FileFilterCallback
) => {
  const allowedMime = ['image/jpeg', 'image/png', 'image/webp', 'image/jpg'];
  if (allowedMime.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Solo se permiten archivos de imagen (JPEG, PNG, WEBP)'));
  }
};

// Filtro de audio
const audioFilter = (
  _req: any,
  file: Express.Multer.File,
  cb: multer.FileFilterCallback
) => {
  const allowedMime = [
    'audio/mpeg',
    'audio/wav',
    'audio/ogg',
    'audio/flac',
    'audio/mp3',
    'audio/x-m4a',
    'audio/mp4',
  ];
  if (allowedMime.includes(file.mimetype) || file.originalname.match(/\.(mp3|wav|ogg|flac|m4a)$/i)) {
    cb(null, true);
  } else {
    cb(new Error('Solo se permiten archivos de audio válidos (MP3, WAV, OGG, FLAC, M4A)'));
  }
};

export const uploadCover = multer({
  storage: coverStorage,
  fileFilter: imageFilter,
  limits: { fileSize: 10 * 1024 * 1024 }, // Límite de 10MB para imágenes
});

export const uploadTracks = multer({
  storage: trackStorage,
  fileFilter: audioFilter,
  limits: { fileSize: 50 * 1024 * 1024 }, // Límite de 50MB por canción
});

/**
 * Validador de Magic Bytes para imágenes (JPEG, PNG, WEBP)
 */
export const isValidImageMagicBytes = async (filePath: string): Promise<boolean> => {
  let fileHandle: fs.promises.FileHandle | null = null;
  try {
    fileHandle = await fs.promises.open(filePath, 'r');
    const buffer = Buffer.alloc(16);
    const { bytesRead } = await fileHandle.read(buffer, 0, 16, 0);
    if (bytesRead < 4) return false;

    // JPEG: FF D8 FF
    if (buffer[0] === 0xFF && buffer[1] === 0xD8 && buffer[2] === 0xFF) return true;

    // PNG: 89 50 4E 47 0D 0A 1A 0A
    if (
      bytesRead >= 8 &&
      buffer[0] === 0x89 &&
      buffer[1] === 0x50 &&
      buffer[2] === 0x4E &&
      buffer[3] === 0x47 &&
      buffer[4] === 0x0D &&
      buffer[5] === 0x0A &&
      buffer[6] === 0x1A &&
      buffer[7] === 0x0A
    ) {
      return true;
    }

    // WEBP: RIFF....WEBP
    if (
      bytesRead >= 12 &&
      buffer.toString('ascii', 0, 4) === 'RIFF' &&
      buffer.toString('ascii', 8, 12) === 'WEBP'
    ) {
      return true;
    }

    return false;
  } catch {
    return false;
  } finally {
    if (fileHandle) {
      await fileHandle.close();
    }
  }
};

/**
 * Validador de Magic Bytes para audio (MP3, WAV, OGG, FLAC, M4A)
 */
export const isValidAudioMagicBytes = async (filePath: string): Promise<boolean> => {
  let fileHandle: fs.promises.FileHandle | null = null;
  try {
    fileHandle = await fs.promises.open(filePath, 'r');
    const buffer = Buffer.alloc(16);
    const { bytesRead } = await fileHandle.read(buffer, 0, 16, 0);
    if (bytesRead < 4) return false;

    // MP3 con tag ID3: 'ID3'
    if (buffer.toString('ascii', 0, 3) === 'ID3') return true;

    // MP3 cuadro sync sin ID3: FF FB, FF F3, FF F2 (primer byte FF y segundo byte con 3 bits superiores en 1)
    if (buffer[0] === 0xFF && (buffer[1] & 0xE0) === 0xE0) return true;

    // WAV: RIFF....WAVE
    if (
      bytesRead >= 12 &&
      buffer.toString('ascii', 0, 4) === 'RIFF' &&
      buffer.toString('ascii', 8, 12) === 'WAVE'
    ) {
      return true;
    }

    // OGG: 'OggS'
    if (buffer.toString('ascii', 0, 4) === 'OggS') return true;

    // FLAC: 'fLaC'
    if (buffer.toString('ascii', 0, 4) === 'fLaC') return true;

    // M4A / MP4 Audio: ftyp en byte 4
    if (bytesRead >= 8 && buffer.toString('ascii', 4, 8) === 'ftyp') return true;

    return false;
  } catch {
    return false;
  } finally {
    if (fileHandle) {
      await fileHandle.close();
    }
  }
};

/**
 * Middleware para validar la firma binaria (Magic Bytes) de la carátula subida.
 * Si no es válida, elimina el archivo del disco y responde con 400 Bad Request.
 */
export const validateImageMagicBytes = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  if (!req.file) {
    return next();
  }

  const isValid = await isValidImageMagicBytes(req.file.path);
  if (!isValid) {
    await safelyDeleteFile(req.file.path);
    res.status(400).json({
      message: 'Firma binaria inválida: el archivo subido no corresponde a una imagen legítima (JPEG, PNG o WEBP).',
    });
    return;
  }

  next();
};

/**
 * Middleware para validar la firma binaria (Magic Bytes) de las pistas de audio subidas.
 * Si algún archivo es inválido, elimina todos los archivos subidos y responde con 400 Bad Request.
 */
export const validateAudioMagicBytes = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  const files = (req.files as Express.Multer.File[]) || [];
  if (files.length === 0) {
    return next();
  }

  for (const file of files) {
    const isValid = await isValidAudioMagicBytes(file.path);
    if (!isValid) {
      await safelyDeleteFiles(files);
      res.status(400).json({
        message: `Firma binaria inválida en el archivo "${file.originalname}": no corresponde a un formato de audio legítimo (MP3, WAV, OGG, FLAC o M4A).`,
      });
      return;
    }
  }

  next();
};

