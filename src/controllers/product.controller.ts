import { Request, Response } from 'express';
import { AppDataSource } from '../config/data-source';
import { Product } from '../entities/Product';
import { Inventory } from '../entities/Inventory';

const productRepository = AppDataSource.getRepository(Product);
const inventoryRepository = AppDataSource.getRepository(Inventory);

export const getProducts = async (req: Request, res: Response): Promise<void> => {
  try {
    const { format, artist, search, category_id } = req.query;

    const query = productRepository
      .createQueryBuilder('product')
      .leftJoinAndSelect('product.category', 'category')
      .leftJoinAndSelect('product.inventory', 'inventory');

    if (format) {
      query.andWhere('LOWER(product.format) = LOWER(:format)', { format });
    }

    if (artist) {
      query.andWhere('LOWER(product.artist) LIKE LOWER(:artist)', {
        artist: `%${artist}%`,
      });
    }

    if (search) {
      query.andWhere(
        '(LOWER(product.name) LIKE LOWER(:search) OR LOWER(product.artist) LIKE LOWER(:search))',
        { search: `%${search}%` }
      );
    }

    if (category_id) {
      query.andWhere('product.category_id = :category_id', { category_id });
    }

    const products = await query.getMany();
    res.json(products);
  } catch (error: any) {
    res.status(500).json({ message: 'Error al obtener productos', error: error.message });
  }
};

export const getProductById = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const product = await productRepository.findOne({
      where: { product_id: parseInt(id, 10) },
      relations: ['category', 'inventory'],
    });

    if (!product) {
      res.status(404).json({ message: 'Producto no encontrado' });
      return;
    }

    res.json(product);
  } catch (error: any) {
    res.status(500).json({ message: 'Error al obtener producto', error: error.message });
  }
};

export const createProduct = async (req: Request, res: Response): Promise<void> => {
  try {
    const { name, artist, format, price, description, image_url, category_id, stock } = req.body;

    const newProduct = productRepository.create({
      name,
      artist,
      format,
      price,
      description,
      image_url,
      category: category_id ? { category_id } : undefined,
    });

    const savedProduct = await productRepository.save(newProduct);

    // Crear inventario inicial
    const initialInventory = inventoryRepository.create({
      product_id: savedProduct.product_id,
      quantity_available: stock || 0,
      quantity_reserved: 0,
    });
    await inventoryRepository.save(initialInventory);

    res.status(201).json(savedProduct);
  } catch (error: any) {
    res.status(500).json({ message: 'Error al crear producto', error: error.message });
  }
};
