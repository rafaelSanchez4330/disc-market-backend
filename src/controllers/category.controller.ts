import { Request, Response } from 'express';
import { AppDataSource } from '../config/data-source';
import { Category } from '../entities/Category';

const categoryRepository = AppDataSource.getRepository(Category);

export const getCategories = async (_req: Request, res: Response): Promise<void> => {
  try {
    const categories = await categoryRepository.find({
      order: { category_name: 'ASC' },
    });
    res.json(categories);
  } catch (error: any) {
    res.status(500).json({ message: 'Error al obtener categorías', error: error.message });
  }
};
