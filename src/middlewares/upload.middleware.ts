import multer from 'multer';
import path from 'path';
import fs from 'fs';

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
