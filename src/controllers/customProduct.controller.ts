import { Request, Response } from 'express';
import { AppDataSource } from '../config/data-source';
import { CustomProduct } from '../entities/CustomProduct';
import { CustomTrack } from '../entities/CustomTrack';
import { User } from '../entities/User';

const customProductRepo = AppDataSource.getRepository(CustomProduct);
const customTrackRepo = AppDataSource.getRepository(CustomTrack);
const userRepo = AppDataSource.getRepository(User);

export const createCustomProduct = async (req: Request, res: Response): Promise<void> => {
  try {
    const authReq = req as any;
    let userId = authReq.user?.user_id || (req.body.user_id ? parseInt(req.body.user_id, 10) : null);

    // Si no se proporcionó user_id, intentar asignar el primer usuario registrado en la base de datos
    if (!userId) {
      const defaultUser = await userRepo.findOne({ order: { user_id: 'ASC' } });
      if (defaultUser) {
        userId = defaultUser.user_id;
      }
    }

    if (!userId) {
      res.status(400).json({ message: 'Se requiere un usuario para crear un producto personalizado' });
      return;
    }

    const { format, title, message, packaging_option, price } = req.body;
    const coverFile = req.file;
    const cover_image = coverFile ? `/uploads/covers/${coverFile.filename}` : null;

    const normalizedPrice = price
      ? parseFloat(price)
      : format === 'VINYL' || format === 'Vinyl'
        ? 799.0
        : 99.0;

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
    res.status(500).json({ message: 'Error al crear producto personalizado', error: error.message });
  }
};

export const addTracksToCustomProduct = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const custom_product_id = parseInt(id, 10);
    const files = (req.files as Express.Multer.File[]) || [];

    const customProduct = await customProductRepo.findOne({
      where: { custom_product_id },
    });

    if (!customProduct) {
      res.status(404).json({ message: 'Producto personalizado no encontrado' });
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
