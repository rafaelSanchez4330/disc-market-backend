import { Request, Response } from 'express';
import { AppDataSource } from '../config/data-source';
import { ShoppingCart } from '../entities/ShoppingCart';
import { CartItem } from '../entities/CartItem';
import { Product } from '../entities/Product';
import { CustomProduct } from '../entities/CustomProduct';

const cartRepo = AppDataSource.getRepository(ShoppingCart);
const cartItemRepo = AppDataSource.getRepository(CartItem);
const productRepo = AppDataSource.getRepository(Product);
const customProductRepo = AppDataSource.getRepository(CustomProduct);

export const getUserCart = async (req: Request, res: Response): Promise<void> => {
  try {
    const { user_id } = req.params;

    let cart = await cartRepo.findOne({
      where: { user_id: parseInt(user_id, 10), status: 'active' },
      relations: [
        'cart_items',
        'cart_items.product',
        'cart_items.custom_product',
        'cart_items.custom_product.custom_tracks',
      ],
    });

    if (!cart) {
      cart = cartRepo.create({
        user_id: parseInt(user_id, 10),
        status: 'active',
      });
      await cartRepo.save(cart);
      cart.cart_items = [];
    }

    res.json(cart);
  } catch (error: any) {
    res.status(500).json({ message: 'Error al obtener carrito', error: error.message });
  }
};

export const addToCart = async (req: Request, res: Response): Promise<void> => {
  try {
    const { user_id, product_id, custom_product_id, quantity } = req.body;
    const qty = quantity ? parseInt(quantity, 10) : 1;

    let cart = await cartRepo.findOne({
      where: { user_id: parseInt(user_id, 10), status: 'active' },
    });

    if (!cart) {
      cart = cartRepo.create({
        user_id: parseInt(user_id, 10),
        status: 'active',
      });
      await cartRepo.save(cart);
    }

    let unit_price = 0;

    if (product_id) {
      const product = await productRepo.findOne({ where: { product_id } });
      if (!product) {
        res.status(404).json({ message: 'Producto regular no encontrado' });
        return;
      }
      unit_price = Number(product.price);
    } else if (custom_product_id) {
      const customProduct = await customProductRepo.findOne({
        where: { custom_product_id },
      });
      if (!customProduct) {
        res.status(404).json({ message: 'Producto personalizado no encontrado' });
        return;
      }
      unit_price = Number(customProduct.price);
    } else {
      res.status(400).json({ message: 'Debe especificar product_id o custom_product_id' });
      return;
    }

    // Verificar si el ítem ya existe en el carrito
    let existingItem = await cartItemRepo.findOne({
      where: {
        cart_id: cart.cart_id,
        product_id: product_id || undefined,
        custom_product_id: custom_product_id || undefined,
      },
    });

    if (existingItem) {
      existingItem.quantity += qty;
      await cartItemRepo.save(existingItem);
      res.json(existingItem);
    } else {
      const newItem = cartItemRepo.create({
        cart_id: cart.cart_id,
        product_id: product_id || null,
        custom_product_id: custom_product_id || null,
        quantity: qty,
        unit_price,
      });
      await cartItemRepo.save(newItem);
      res.status(201).json(newItem);
    }
  } catch (error: any) {
    res.status(500).json({ message: 'Error al agregar al carrito', error: error.message });
  }
};

export const removeFromCart = async (req: Request, res: Response): Promise<void> => {
  try {
    const { item_id } = req.params;
    await cartItemRepo.delete({ cart_item_id: parseInt(item_id, 10) });
    res.json({ message: 'Elemento eliminado del carrito' });
  } catch (error: any) {
    res.status(500).json({ message: 'Error al eliminar ítem del carrito', error: error.message });
  }
};
