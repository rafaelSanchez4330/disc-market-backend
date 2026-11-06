import { Request, Response } from 'express';
import { AppDataSource } from '../config/data-source';
import { Product } from '../entities/Product';
import { Inventory } from '../entities/Inventory';
import { quantityValue, StockError } from '../services/stock.service';

const productRepository = AppDataSource.getRepository(Product);

export const getProducts = async (req: Request, res: Response): Promise<void> => {
  try {
    const { format, artist, search, category_id, category } = req.query;

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

    if (category) {
      query.andWhere('LOWER(category.category_name) = LOWER(:category)', { category });
    }

    const products = await query.getMany();

    // Asegurar que price sea un número JavaScript
    const formattedProducts = products.map((p) => ({
      ...p,
      price: Number(p.price),
    }));

    res.json(formattedProducts);
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

    res.json({
      ...product,
      price: Number(product.price),
    });
  } catch (error: any) {
    res.status(500).json({ message: 'Error al obtener producto', error: error.message });
  }
};

export const createProduct = async (req: Request, res: Response): Promise<void> => {
  try {
    const { name, artist, format, price, description, image_url, category_id, stock } = req.body;

    const initialStock = quantityValue(stock ?? 0, true);
    if (typeof name !== 'string' || !name.trim() || typeof artist !== 'string' || !artist.trim()
      || typeof format !== 'string' || !['CD', 'VINYL'].includes(format.toUpperCase())
      || typeof price !== 'number' || !Number.isFinite(price) || price <= 0 || price > 99999999.99) {
      throw new StockError('Nombre, artista, formato y precio válidos son obligatorios.', 400);
    }
    const savedProduct = await AppDataSource.transaction(async manager => {
      const newProduct = manager.getRepository(Product).create({
        name, artist, format, price, description, image_url,
        category: category_id ? { category_id } : undefined,
      });
      const savedProduct = await manager.getRepository(Product).save(newProduct);
      const initialInventory = manager.getRepository(Inventory).create({
        product_id: savedProduct.product_id, quantity_available: initialStock, quantity_reserved: 0,
      });
      await manager.getRepository(Inventory).save(initialInventory);
      return savedProduct;
    });

    res.status(201).json(savedProduct);
  } catch (error: any) {
    res.status(error instanceof StockError ? error.status : 500).json({ message: error instanceof StockError ? error.message : 'Error al crear producto' });
  }
};
