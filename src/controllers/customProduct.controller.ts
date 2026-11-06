import { Request, Response } from 'express';
import { AppDataSource } from '../config/data-source';
import { CustomProduct } from '../entities/CustomProduct';
import { CustomTrack } from '../entities/CustomTrack';
import { Product } from '../entities/Product';
import { User } from '../entities/User';
import { safelyDeleteFile, safelyDeleteFiles } from '../utils/fileCleanup';

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

    const { format, title, message, packaging_option, price } = req.body;
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

    const newCustomProduct = customProductRepo.create({
      user_id: userId,
      format: format || 'CD',
      title: title || 'Mi Disco Personalizado',
      cover_image: cover_image || undefined,
      message,
      packaging_option: packaging_option || 'standard',
      price: normalizedPrice,
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

    const savedTracks: CustomTrack[] = [];

    // Caso A: Se subieron archivos de audio reales
    if (files.length > 0) {
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const meta = trackMetadata[i] || {};
        const track = customTrackRepo.create({
          custom_product_id,
          track_name: meta.track_name || meta.name || file.originalname,
          file_path: `/uploads/tracks/${file.filename}`,
          track_order: meta.track_order || meta.order || i + 1,
          duration: meta.duration || 180,
        });

        const savedTrack = await customTrackRepo.save(track);
        savedTracks.push(savedTrack);
      }
    } else {
      // Caso B: Se subieron solo nombres de pistas sin archivo binario
      for (let i = 0; i < trackMetadata.length; i++) {
        const meta = trackMetadata[i];
        const track = customTrackRepo.create({
          custom_product_id,
          track_name: meta.track_name || meta.name || `Pista ${i + 1}`,
          file_path: '/uploads/tracks/placeholder.mp3',
          track_order: meta.track_order || meta.order || i + 1,
          duration: meta.duration || 180,
        });

        const savedTrack = await customTrackRepo.save(track);
        savedTracks.push(savedTrack);
      }
    }

    res.status(201).json({
      message: 'Pistas agregadas exitosamente',
      tracks: savedTracks,
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
