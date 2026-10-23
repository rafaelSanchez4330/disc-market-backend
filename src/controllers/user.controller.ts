import { Response } from 'express';
import bcrypt from 'bcrypt';
import { AppDataSource } from '../config/data-source';
import { User } from '../entities/User';
import { UserPreference } from '../entities/UserPreference';
import { Order } from '../entities/Order';
import { AuthenticatedRequest } from '../middlewares/auth.middleware';

const userRepo = AppDataSource.getRepository(User);
const prefRepo = AppDataSource.getRepository(UserPreference);
const orderRepo = AppDataSource.getRepository(Order);

/**
 * Obtiene o inicializa las preferencias por defecto de un usuario
 */
const getOrCreatePreferences = async (userId: number): Promise<UserPreference> => {
  let prefs = await prefRepo.findOne({ where: { user_id: userId } });
  if (!prefs) {
    prefs = prefRepo.create({
      user_id: userId,
      preferred_format: 'ALL',
      theme: 'dark',
      notify_order_status: true,
      notify_newsletter: false,
      default_country: 'México',
    });
    prefs = await prefRepo.save(prefs);
  }
  return prefs;
};

/**
 * GET /api/users/profile
 * Devuelve el perfil del usuario autenticado, sus preferencias y estadísticas de compras
 */
export const getProfile = async (
  req: AuthenticatedRequest,
  res: Response
): Promise<void> => {
  try {
    const userId = req.user?.user_id;
    if (!userId) {
      res.status(401).json({ message: 'Usuario no autenticado' });
      return;
    }

    const user = await userRepo.findOne({
      where: { user_id: userId },
    });

    if (!user) {
      res.status(404).json({ message: 'Usuario no encontrado' });
      return;
    }

    const preferences = await getOrCreatePreferences(userId);

    // Calcular estadísticas de compras
    const orders = await orderRepo.find({
      where: { user_id: userId },
      order: { created_at: 'DESC' },
    });

    const totalOrders = orders.length;
    const totalSpent = orders
      .filter((o) => o.payment_status === 'paid' || o.order_status !== 'cancelled')
      .reduce((acc, o) => acc + Number(o.total_amount || 0), 0);
    const lastOrderDate = orders.length > 0 ? orders[0].created_at : null;

    res.json({
      user: {
        user_id: user.user_id,
        name: user.name,
        email: user.email,
        role: user.role,
        created_at: user.created_at,
      },
      preferences,
      stats: {
        total_orders: totalOrders,
        total_spent: totalSpent,
        last_order_date: lastOrderDate,
      },
    });
  } catch (error: any) {
    res.status(500).json({ message: 'Error al obtener el perfil', error: error.message });
  }
};

/**
 * PUT /api/users/profile
 * Actualiza los datos personales básicos (nombre, teléfono, avatar)
 */
export const updateProfile = async (
  req: AuthenticatedRequest,
  res: Response
): Promise<void> => {
  try {
    const userId = req.user?.user_id;
    if (!userId) {
      res.status(401).json({ message: 'Usuario no autenticado' });
      return;
    }

    const { name, phone, avatar_url } = req.body;

    const user = await userRepo.findOne({ where: { user_id: userId } });
    if (!user) {
      res.status(404).json({ message: 'Usuario no encontrado' });
      return;
    }

    if (name !== undefined) {
      if (typeof name !== 'string' || name.trim().length < 2) {
        res.status(400).json({ message: 'El nombre debe tener al menos 2 caracteres' });
        return;
      }
      user.name = name.trim();
      await userRepo.save(user);
    }

    const preferences = await getOrCreatePreferences(userId);
    let prefUpdated = false;

    if (phone !== undefined) {
      preferences.phone = phone ? String(phone).trim() : null;
      prefUpdated = true;
    }

    if (avatar_url !== undefined) {
      preferences.avatar_url = avatar_url ? String(avatar_url).trim() : null;
      prefUpdated = true;
    }

    if (prefUpdated) {
      await prefRepo.save(preferences);
    }

    res.json({
      message: 'Perfil actualizado exitosamente',
      user: {
        user_id: user.user_id,
        name: user.name,
        email: user.email,
        role: user.role,
      },
      preferences,
    });
  } catch (error: any) {
    res.status(500).json({ message: 'Error al actualizar el perfil', error: error.message });
  }
};

/**
 * PUT /api/users/password
 * Permite cambiar la contraseña verificando la actual
 */
export const updatePassword = async (
  req: AuthenticatedRequest,
  res: Response
): Promise<void> => {
  try {
    const userId = req.user?.user_id;
    if (!userId) {
      res.status(401).json({ message: 'Usuario no autenticado' });
      return;
    }

    const { current_password, new_password } = req.body;

    if (!current_password || !new_password) {
      res.status(400).json({ message: 'La contraseña actual y la nueva son requeridas' });
      return;
    }

    if (typeof new_password !== 'string' || new_password.length < 6) {
      res.status(400).json({ message: 'La nueva contraseña debe tener al menos 6 caracteres' });
      return;
    }

    const user = await userRepo.findOne({ where: { user_id: userId } });
    if (!user) {
      res.status(404).json({ message: 'Usuario no encontrado' });
      return;
    }

    const isMatch = await bcrypt.compare(current_password, user.password_hash);
    if (!isMatch) {
      res.status(400).json({ message: 'La contraseña actual es incorrecta' });
      return;
    }

    const salt = await bcrypt.genSalt(10);
    user.password_hash = await bcrypt.hash(new_password, salt);
    await userRepo.save(user);

    res.json({ message: 'Contraseña actualizada correctamente' });
  } catch (error: any) {
    res.status(500).json({ message: 'Error al cambiar la contraseña', error: error.message });
  }
};

/**
 * PUT /api/users/preferences
 * Actualiza la dirección de entrega por defecto y configuraciones generales
 */
export const updatePreferences = async (
  req: AuthenticatedRequest,
  res: Response
): Promise<void> => {
  try {
    const userId = req.user?.user_id;
    if (!userId) {
      res.status(401).json({ message: 'Usuario no autenticado' });
      return;
    }

    const {
      phone,
      preferred_format,
      theme,
      notify_order_status,
      notify_newsletter,
      default_address_line1,
      default_address_line2,
      default_city,
      default_state,
      default_postal_code,
      default_country,
      avatar_url,
    } = req.body;

    const preferences = await getOrCreatePreferences(userId);

    if (phone !== undefined) preferences.phone = phone ? String(phone).trim() : null;
    if (preferred_format !== undefined) preferences.preferred_format = preferred_format;
    if (theme !== undefined) preferences.theme = theme;
    if (notify_order_status !== undefined) preferences.notify_order_status = Boolean(notify_order_status);
    if (notify_newsletter !== undefined) preferences.notify_newsletter = Boolean(notify_newsletter);

    if (default_address_line1 !== undefined) {
      preferences.default_address_line1 = default_address_line1 ? String(default_address_line1).trim() : null;
    }
    if (default_address_line2 !== undefined) {
      preferences.default_address_line2 = default_address_line2 ? String(default_address_line2).trim() : null;
    }
    if (default_city !== undefined) {
      preferences.default_city = default_city ? String(default_city).trim() : null;
    }
    if (default_state !== undefined) {
      preferences.default_state = default_state ? String(default_state).trim() : null;
    }
    if (default_postal_code !== undefined) {
      preferences.default_postal_code = default_postal_code ? String(default_postal_code).trim() : null;
    }
    if (default_country !== undefined) {
      preferences.default_country = default_country ? String(default_country).trim() : 'México';
    }
    if (avatar_url !== undefined) {
      preferences.avatar_url = avatar_url ? String(avatar_url).trim() : null;
    }

    const saved = await prefRepo.save(preferences);

    res.json({
      message: 'Preferencias actualizadas correctamente',
      preferences: saved,
    });
  } catch (error: any) {
    res.status(500).json({ message: 'Error al actualizar preferencias', error: error.message });
  }
};

/**
 * GET /api/users/orders
 * Obtiene el historial completo de pedidos del usuario autenticado
 */
export const getUserOrders = async (
  req: AuthenticatedRequest,
  res: Response
): Promise<void> => {
  try {
    const userId = req.user?.user_id;
    if (!userId) {
      res.status(401).json({ message: 'Usuario no autenticado' });
      return;
    }

    const orders = await orderRepo.find({
      where: { user_id: userId },
      relations: [
        'order_items',
        'order_items.product',
        'order_items.custom_product',
        'order_items.custom_product.tracks',
        'payment',
        'shipping',
      ],
      order: { created_at: 'DESC' },
    });

    const formattedOrders = orders.map((order) => ({
      ...order,
      total_amount: Number(order.total_amount),
    }));

    res.json({
      orders: formattedOrders,
    });
  } catch (error: any) {
    res.status(500).json({ message: 'Error al obtener historial de órdenes', error: error.message });
  }
};
