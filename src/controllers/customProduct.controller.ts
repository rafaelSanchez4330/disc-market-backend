import { Request, Response } from 'express';
import { AppDataSource } from '../config/data-source';
import { CustomProduct } from '../entities/CustomProduct';
import { CustomTrack } from '../entities/CustomTrack';

const customProductRepo = AppDataSource.getRepository(CustomProduct);
const customTrackRepo = AppDataSource.getRepository(CustomTrack);

export const createCustomProduct = async (req: Request, res: Response): Promise<void> => {
  try {
    const { user_id, format, title, message, packaging_option, price } = req.body;

    const coverFile = req.file;
    const cover_image = coverFile ? `/uploads/covers/${coverFile.filename}` : null;

    const newCustomProduct = customProductRepo.create({
      user_id: parseInt(user_id, 10),
      format: format || 'CD',
      title,
      cover_image: cover_image || undefined,
      message,
      packaging_option,
      price: price ? parseFloat(price) : (format === 'Vinyl' ? 799.00 : 99.00),
    });

    const saved = await customProductRepo.save(newCustomProduct);
    res.status(201).json(saved);
  } catch (error: any) {
    res.status(500).json({ message: 'Error al crear producto personalizado', error: error.message });
  }
};

export const addTracksToCustomProduct = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const custom_product_id = parseInt(id, 10);
    const files = req.files as Express.Multer.File[];

    if (!files || files.length === 0) {
      res.status(400).json({ message: 'No se enviaron archivos de audio' });
      return;
    }

    const customProduct = await customProductRepo.findOne({
      where: { custom_product_id },
    });

    if (!customProduct) {
      res.status(404).json({ message: 'Producto personalizado no encontrado' });
      return;
    }

    // tracks_meta puede venir como un string JSON o campos individuales
    let trackMetadata: Array<{ track_name: string; track_order: number; duration: number }> = [];
    if (req.body.tracks_meta) {
      try {
        trackMetadata = JSON.parse(req.body.tracks_meta);
      } catch (e) {
        // Fallback si no es JSON válido
      }
    }

    const savedTracks: CustomTrack[] = [];

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const meta = trackMetadata[i] || {};
      const track = customTrackRepo.create({
        custom_product_id,
        track_name: meta.track_name || file.originalname,
        file_path: `/uploads/tracks/${file.filename}`,
        track_order: meta.track_order || i + 1,
        duration: meta.duration || 0,
      });

      const savedTrack = await customTrackRepo.save(track);
      savedTracks.push(savedTrack);
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
    customProduct.custom_tracks.sort((a, b) => a.track_order - b.track_order);

    res.json(customProduct);
  } catch (error: any) {
    res.status(500).json({ message: 'Error al obtener producto personalizado', error: error.message });
  }
};
