import { Request, Response } from 'express';
import { AppDataSource } from '../config/data-source';
import { ShoppingCart } from '../entities/ShoppingCart';
import { CartItem } from '../entities/CartItem';
import { Product } from '../entities/Product';
import { CustomProduct } from '../entities/CustomProduct';
import { User } from '../entities/User';

const cartRepo = AppDataSource.getRepository(ShoppingCart);
const cartItemRepo = AppDataSource.getRepository(CartItem);
const productRepo = AppDataSource.getRepository(Product);
const customProductRepo = AppDataSource.getRepository(CustomProduct);
const userRepo = AppDataSource.getRepository(User);

export const getUserCart = async (req: Request, res: Response): Promise<void> => {
  try {
    const authReq = req as any;
    let userId = authReq.user?.user_id || (req.params.user_id ? parseInt(req.params.user_id, 10) : null);

    if (!userId) {
      const firstUser = await userRepo.findOne({ order: { user_id: 'ASC' } });
      userId = firstUser ? firstUser.user_id : null;
    }

    if (!userId) {
      res.status(400).json({ message: 'Usuario no identificado para obtener el carrito' });
      return;
    }

    let cart = await cartRepo.findOne({
      where: { user_id: userId, status: 'active' },
      relations: [
        'cart_items',
        'cart_items.product',
        'cart_items.custom_product',
        'cart_items.custom_product.custom_tracks',
      ],
    });

    if (!cart) {
      cart = cartRepo.create({
        user_id: userId,
        status: 'active',
      });
      await cartRepo.save(cart);
      cart.cart_items = [];
    }

    // Formatear precios numéricos
    const formattedCart = {
      ...cart,
      cart_items: (cart.cart_items || []).map((item) => ({
        ...item,
        unit_price: Number(item.unit_price),
        product: item.product
          ? { ...item.product, price: Number(item.product.price) }
          : null,
        custom_product: item.custom_product
          ? { ...item.custom_product, price: Number(item.custom_product.price) }
          : null,
      })),
    };

    res.json(formattedCart);
  } catch (error: any) {
    res.status(500).json({ message: 'Error al obtener carrito', error: error.message });
  }
};

export const addToCart = async (req: Request, res: Response): Promise<void> => {
  try {
    const authReq = req as any;
    let userId = authReq.user?.user_id || (req.body.user_id ? parseInt(req.body.user_id, 10) : null);

    if (!userId) {
      const firstUser = await userRepo.findOne({ order: { user_id: 'ASC' } });
      userId = firstUser ? firstUser.user_id : null;
    }

    if (!userId) {
      res.status(400).json({ message: 'Se requiere un usuario para agregar al carrito' });
      return;
    }

    const { product_id, custom_product_id, quantity } = req.body;
    const qty = quantity ? parseInt(quantity, 10) : 1;

    let cart = await cartRepo.findOne({
      where: { user_id: userId, status: 'active' },
    });

    if (!cart) {
      cart = cartRepo.create({
        user_id: userId,
        status: 'active',
      });
      await cartRepo.save(cart);
    }

    let unit_price = 0;

    if (custom_product_id) {
      const customProduct = await customProductRepo.findOne({
        where: { custom_product_id: parseInt(custom_product_id, 10) },
      });
      if (!customProduct) {
        res.status(404).json({ message: 'Producto personalizado no encontrado' });
        return;
      }
      unit_price = Number(customProduct.price);
    } else if (product_id) {
      const product = await productRepo.findOne({
        where: { product_id: parseInt(product_id, 10) },
      });
      if (!product) {
        res.status(404).json({ message: 'Producto regular no encontrado' });
        return;
      }
      unit_price = Number(product.price);
    } else {
      res.status(400).json({ message: 'Debe especificar product_id o custom_product_id' });
      return;
    }

    // Verificar si el ítem ya existe en el carrito
    let existingItem = await cartItemRepo.findOne({
      where: custom_product_id
        ? { cart_id: cart.cart_id, custom_product_id: parseInt(custom_product_id, 10) }
        : { cart_id: cart.cart_id, product_id: parseInt(product_id, 10) },
      relations: ['product', 'custom_product'],
    });

    if (existingItem) {
      existingItem.quantity += qty;
      await cartItemRepo.save(existingItem);
      res.json({
        ...existingItem,
        unit_price: Number(existingItem.unit_price),
      });
    } else {
      const newItem = cartItemRepo.create({
        cart_id: cart.cart_id,
        product_id: product_id || null,
        custom_product_id: custom_product_id || null,
        quantity: qty,
        unit_price,
      });
      const savedItem = await cartItemRepo.save(newItem);
      const loaded = await cartItemRepo.findOne({
        where: { cart_item_id: savedItem.cart_item_id },
        relations: ['product', 'custom_product'],
      });
      res.status(201).json({
        ...loaded,
        unit_price: Number(loaded?.unit_price ?? unit_price),
      });
    }
  } catch (error: any) {
    res.status(500).json({ message: 'Error al agregar al carrito', error: error.message });
  }
};

export const updateCartItem = async (req: Request, res: Response): Promise<void> => {
  try {
    const { item_id } = req.params;
    const { quantity } = req.body;
    const qty = parseInt(quantity, 10);

    const item = await cartItemRepo.findOne({
      where: { cart_item_id: parseInt(item_id, 10) },
    });

    if (!item) {
      res.status(404).json({ message: 'Ítem no encontrado en el carrito' });
      return;
    }

    if (qty <= 0) {
      await cartItemRepo.delete({ cart_item_id: item.cart_item_id });
      res.json({ message: 'Ítem eliminado por cantidad cero' });
      return;
    }

    item.quantity = qty;
    await cartItemRepo.save(item);

    res.json({
      ...item,
      unit_price: Number(item.unit_price),
    });
  } catch (error: any) {
    res.status(500).json({ message: 'Error al actualizar cantidad del ítem', error: error.message });
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

export const clearCart = async (req: Request, res: Response): Promise<void> => {
  try {
    const authReq = req as any;
    let userId = authReq.user?.user_id || (req.params.user_id ? parseInt(req.params.user_id, 10) : null);

    if (!userId) {
      res.status(400).json({ message: 'Usuario no especificado' });
      return;
    }

    const cart = await cartRepo.findOne({
      where: { user_id: userId, status: 'active' },
    });

    if (cart) {
      await cartItemRepo.delete({ cart_id: cart.cart_id });
    }

    res.json({ message: 'Carrito vaciado exitosamente' });
  } catch (error: any) {
    res.status(500).json({ message: 'Error al vaciar carrito', error: error.message });
  }
};
