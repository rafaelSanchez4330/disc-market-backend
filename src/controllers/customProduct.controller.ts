import { Request, Response } from 'express';
import { AppDataSource } from '../config/data-source';
import { CustomProduct } from '../entities/CustomProduct';
import { CustomTrack } from '../entities/CustomTrack';
import { Product } from '../entities/Product';
import { User } from '../entities/User';
import { safelyDeleteFile, safelyDeleteFiles } from '../utils/fileCleanup';
import { CopyrightService } from '../services/copyright.service';

const customProductRepo = AppDataSource.getRepository(CustomProduct);
const customTrackRepo = AppDataSource.getRepository(CustomTrack);
const productRepo = AppDataSource.getRepository(Product);
const userRepo = AppDataSource.getRepository(User);

export const createCustomProduct = async (req: Request, res: Response): Promise<void> => {
  try {
    const authReq = req as any;
    const userId = authReq.user?.user_id;

    if (!userId) {
      await safelyDeleteFile(req.file?.path);
      res.status(401).json({ message: 'Se requiere iniciar sesión para crear un producto personalizado' });
      return;
    }

    const { format, title, message, packaging_option, price, copyright_disclaimer_accepted } = req.body;
    const coverFile = req.file;
    const cover_image = coverFile ? `/uploads/covers/${coverFile.filename}` : null;

    // Consultar precio base oficial desde PostgreSQL para evitar desincronización y manipulación
    const isVinyl = (format || '').toUpperCase() === 'VINYL';
    const templateProduct = await productRepo.findOne({
      where: isVinyl
        ? [{ name: 'Custom Vinyl' }, { name: 'Vinilo Personalizado' }]
        : [{ name: 'Custom CD' }, { name: 'CD Personalizado' }],
    });

    const officialBasePrice = templateProduct
      ? Number(templateProduct.price)
      : isVinyl
        ? 799.0
        : 99.0;

    // Si el frontend envía un precio que coincide o se confía en la tarifa oficial calculada
    const normalizedPrice = officialBasePrice;

    const isDisclaimerAccepted = copyright_disclaimer_accepted === true || copyright_disclaimer_accepted === 'true';
    const clientIp = (req.headers['x-forwarded-for'] as string) || req.socket.remoteAddress || '127.0.0.1';

    const newCustomProduct = customProductRepo.create({
      user_id: userId,
      format: format || 'CD',
      title: title || 'Mi Disco Personalizado',
      cover_image: cover_image || undefined,
      message,
      packaging_option: packaging_option || 'standard',
      price: normalizedPrice,
      total_duration: 0,
      copyright_disclaimer_accepted: isDisclaimerAccepted,
      copyright_disclaimer_timestamp: isDisclaimerAccepted ? new Date() : null,
      copyright_disclaimer_ip: isDisclaimerAccepted ? clientIp : null,
    });

    const saved = await customProductRepo.save(newCustomProduct);

    // Si se enviaron pistas directamente en el payload (como JSON o array)
    let tracksData: any[] = [];
    if (req.body.tracks) {
      try {
        tracksData = typeof req.body.tracks === 'string' ? JSON.parse(req.body.tracks) : req.body.tracks;
      } catch {
        // Ignorar error de parsing
      }
    } else if (req.body.tracks_meta) {
      try {
        tracksData = typeof req.body.tracks_meta === 'string' ? JSON.parse(req.body.tracks_meta) : req.body.tracks_meta;
      } catch {
        // Ignorar
      }
    }

    if (Array.isArray(tracksData) && tracksData.length > 0) {
      for (let i = 0; i < tracksData.length; i++) {
        const item = tracksData[i];
        const track = customTrackRepo.create({
          custom_product_id: saved.custom_product_id,
          track_name: item.track_name || item.name || `Pista ${i + 1}`,
          file_path: item.file_path || '/uploads/tracks/placeholder.mp3',
          track_order: item.track_order || item.order || i + 1,
          duration: item.duration || item.durationSeconds || 180,
        });
        await customTrackRepo.save(track);
      }
    }

    // Retornar el producto con sus pistas asociadas
    const result = await customProductRepo.findOne({
      where: { custom_product_id: saved.custom_product_id },
      relations: ['custom_tracks'],
    });

    res.status(201).json(result);
  } catch (error: any) {
    // Rollback de archivo si la inserción en BD falla
    await safelyDeleteFile(req.file?.path);
    res.status(500).json({ message: 'Error al crear producto personalizado', error: error.message });
  }
};

export const addTracksToCustomProduct = async (req: Request, res: Response): Promise<void> => {
  const files = (req.files as Express.Multer.File[]) || [];
  try {
    const authReq = req as any;
    const userId = authReq.user?.user_id;

    if (!userId) {
      await safelyDeleteFiles(files);
      res.status(401).json({ message: 'Se requiere iniciar sesión para agregar pistas a un disco personalizado' });
      return;
    }

    const { id } = req.params;
    const custom_product_id = parseInt(id, 10);

    const customProduct = await customProductRepo.findOne({
      where: { custom_product_id },
    });

    if (!customProduct) {
      await safelyDeleteFiles(files);
      res.status(404).json({ message: 'Producto personalizado no encontrado' });
      return;
    }

    // Comprobar pertenencia de la creación personalizada
    if (customProduct.user_id !== userId && authReq.user?.role !== 'admin') {
      await safelyDeleteFiles(files);
      res.status(403).json({ message: 'No estás autorizado para modificar este producto personalizado' });
      return;
    }

    // tracks_meta o tracks puede venir como JSON string o array
    let trackMetadata: Array<any> = [];
    if (req.body.tracks_meta) {
      try {
        trackMetadata = typeof req.body.tracks_meta === 'string' ? JSON.parse(req.body.tracks_meta) : req.body.tracks_meta;
      } catch {
        // Fallback
      }
    } else if (req.body.tracks) {
      try {
        trackMetadata = typeof req.body.tracks === 'string' ? JSON.parse(req.body.tracks) : req.body.tracks;
      } catch {
        // Fallback
      }
    }

    if (files.length === 0 && (!trackMetadata || trackMetadata.length === 0)) {
      await safelyDeleteFiles(files);
      res.status(400).json({ message: 'No se enviaron pistas de audio ni metadatos' });
      return;
    }

    // Consultar pistas existentes para cálculo acumulado de capacidades
    let existingTracks = await customTrackRepo.find({
      where: { custom_product_id },
      order: { track_order: 'ASC' },
    });

    // Si las pistas existentes eran meros placeholders creados preliminarmente, reemplazarlas al subir archivos reales
    const isOnlyPlaceholders = existingTracks.length > 0 && existingTracks.every((t) => t.file_path === '/uploads/tracks/placeholder.mp3');
    if (isOnlyPlaceholders && files.length > 0) {
      await customTrackRepo.remove(existingTracks);
      existingTracks = [];
    }

    const savedTracks: CustomTrack[] = [];
    const trackHashes: string[] = [];

    // Caso A: Se subieron archivos de audio reales
    if (files.length > 0) {
      // 1. Escaneo preliminar de cada archivo de audio
      const scannedList = files.map((file, i) => {
        const meta = trackMetadata[i] || {};
        const scan = CopyrightService.scanAudioFile(file.path, file.originalname, meta.duration);
        return { file, meta, scan };
      });

      // 2. Si alguna pista coincide con fonograma protegido (FLAGGED), abortar y hacer rollback de todos los archivos
      const flaggedTrack = scannedList.find((item) => item.scan.status === 'FLAGGED');
      if (flaggedTrack) {
        await safelyDeleteFiles(files);
        res.status(400).json({
          message: flaggedTrack.scan.reason,
          status: 'FLAGGED',
          trackName: flaggedTrack.file.originalname,
          matchedTitle: flaggedTrack.scan.matchedTitle,
          matchedArtist: flaggedTrack.scan.matchedArtist,
        });
        return;
      }

      // 3. Validar capacidad física acumulada del formato (CD: 80 min, Vinilo: 44 min)
      const combinedTracks = [
        ...existingTracks.map((t) => ({ duration: t.duration, fileSizeBytes: Number(t.file_size_bytes) })),
        ...scannedList.map((item) => ({ duration: item.scan.durationSeconds, fileSizeBytes: item.scan.fileSizeBytes })),
      ];

      const formatValidation = CopyrightService.validateFormatLimits(customProduct.format, combinedTracks);
      if (!formatValidation.valid) {
        await safelyDeleteFiles(files);
        res.status(400).json({
          message: formatValidation.error,
          totalSeconds: formatValidation.totalSeconds,
          maxSeconds: formatValidation.maxSeconds,
          maxTracks: formatValidation.maxTracks,
        });
        return;
      }

      // 4. Persistir las pistas verificadas
      for (let i = 0; i < scannedList.length; i++) {
        const { file, meta, scan } = scannedList[i];
        const trackOrder = existingTracks.length + i + 1;

        const track = customTrackRepo.create({
          custom_product_id,
          track_name: meta.track_name || meta.name || file.originalname,
          file_path: `/uploads/tracks/${file.filename}`,
          track_order: meta.track_order || trackOrder,
          duration: scan.durationSeconds,
          file_size_bytes: scan.fileSizeBytes,
          copyright_status: scan.status,
          copyright_match_title: scan.matchedTitle,
          copyright_match_artist: scan.matchedArtist,
          audio_fingerprint: scan.fingerprint,
        });

        const savedTrack = await customTrackRepo.save(track);
        savedTracks.push(savedTrack);
        trackHashes.push(scan.sha256Hash);
      }

      // 5. Actualizar duración total del disco personalizado y hash de firma digital
      customProduct.total_duration = formatValidation.totalSeconds;
      if (customProduct.copyright_disclaimer_accepted) {
        const clientIp = (req.headers['x-forwarded-for'] as string) || req.socket.remoteAddress || '127.0.0.1';
        customProduct.copyright_disclaimer_hash = CopyrightService.generateDisclaimerHash(
          userId,
          trackHashes,
          customProduct.copyright_disclaimer_timestamp || new Date(),
          clientIp
        );
      }
      await customProductRepo.save(customProduct);
    } else {
      // Caso B: Se subieron solo nombres de pistas sin archivo binario
      const combinedTracks = [
        ...existingTracks.map((t) => ({ duration: t.duration })),
        ...trackMetadata.map((m) => ({ duration: m.duration || 180 })),
      ];

      const formatValidation = CopyrightService.validateFormatLimits(customProduct.format, combinedTracks);
      if (!formatValidation.valid) {
        res.status(400).json({ message: formatValidation.error });
        return;
      }

      for (let i = 0; i < trackMetadata.length; i++) {
        const meta = trackMetadata[i];
        const track = customTrackRepo.create({
          custom_product_id,
          track_name: meta.track_name || meta.name || `Pista ${existingTracks.length + i + 1}`,
          file_path: '/uploads/tracks/placeholder.mp3',
          track_order: meta.track_order || existingTracks.length + i + 1,
          duration: meta.duration || 180,
          copyright_status: 'VERIFIED',
          file_size_bytes: 0,
        });

        const savedTrack = await customTrackRepo.save(track);
        savedTracks.push(savedTrack);
      }

      customProduct.total_duration = formatValidation.totalSeconds;
      await customProductRepo.save(customProduct);
    }

    res.status(201).json({
      message: 'Pistas agregadas y verificadas exitosamente',
      tracks: savedTracks,
      total_duration: customProduct.total_duration,
    });
  } catch (error: any) {
    // Rollback de archivos de audio si la inserción en BD falla
    await safelyDeleteFiles(files);
    res.status(500).json({ message: 'Error al agregar pistas de audio', error: error.message });
  }
};

export const getCustomProductById = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const customProduct = await customProductRepo.findOne({
      where: { custom_product_id: parseInt(id, 10) },
      relations: ['custom_tracks'],
    });

    if (!customProduct) {
      res.status(404).json({ message: 'Producto personalizado no encontrado' });
      return;
    }

    // Ordenar pistas por track_order
    if (customProduct.custom_tracks) {
      customProduct.custom_tracks.sort((a, b) => a.track_order - b.track_order);
    }

    res.json({
      ...customProduct,
      price: Number(customProduct.price),
    });
  } catch (error: any) {
    res.status(500).json({ message: 'Error al obtener producto personalizado', error: error.message });
  }
};

/**
 * GET /api/custom-products/pricing
 * Retorna las tarifas base vigentes para discos personalizados directamente desde PostgreSQL.
 */
export const getCustomProductPricing = async (_req: Request, res: Response): Promise<void> => {
  try {
    const cdProduct = await productRepo.findOne({
      where: [{ name: 'Custom CD' }, { name: 'CD Personalizado' }],
    });
    const vinylProduct = await productRepo.findOne({
      where: [{ name: 'Custom Vinyl' }, { name: 'Vinilo Personalizado' }],
    });

    const cdPrice = cdProduct ? Number(cdProduct.price) : 99.0;
    const vinylPrice = vinylProduct ? Number(vinylProduct.price) : 799.0;

    res.json({
      CD: {
        format: 'CD',
        name: cdProduct?.name || 'Custom CD',
        base_price: cdPrice,
        description: cdProduct?.description || 'CD personalizado con pistas y portada estándar.',
      },
      VINYL: {
        format: 'VINYL',
        name: vinylProduct?.name || 'Custom Vinyl',
        base_price: vinylPrice,
        description: vinylProduct?.description || 'Vinilo personalizado cortado bajo pedido.',
      },
    });
  } catch (error: any) {
    res.status(500).json({
      message: 'Error al consultar tarifas de personalización',
      error: error.message,
    });
  }
};

/**
 * POST /api/custom-products/scan-track
 * Endpoint para analizar un archivo de audio en vivo: detecta duración, peso y escaneo de copyright.
 * Al ser un endpoint de escaneo previo, el archivo temporal se elimina tras la respuesta.
 */
export const scanAudioTrack = async (req: Request, res: Response): Promise<void> => {
  const file = req.file;
  if (!file) {
    res.status(400).json({ message: 'No se envió ningún archivo de audio para escanear' });
    return;
  }

  try {
    const clientDuration = req.body.duration ? parseFloat(req.body.duration) : undefined;
    const scan = CopyrightService.scanAudioFile(file.path, file.originalname, clientDuration);

    // Borrado seguro del archivo temporal ya que solo fue para análisis previo
    await safelyDeleteFile(file.path);

    res.status(200).json({
      fileName: file.originalname,
      ...scan,
    });
  } catch (error: any) {
    await safelyDeleteFile(file?.path);
    res.status(500).json({ message: 'Error durante el escaneo del audio', error: error.message });
  }
};
