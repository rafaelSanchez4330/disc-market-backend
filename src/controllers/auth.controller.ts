import { Request, Response } from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { AppDataSource } from '../config/data-source';
import { User } from '../entities/User';

const userRepository = AppDataSource.getRepository(User);

export const register = async (req: Request, res: Response): Promise<void> => {
  try {
    const { name, email, password, role } = req.body;

    if (!name || !email || !password) {
      res.status(400).json({ message: 'Todos los campos son obligatorios' });
      return;
    }

    const existingUser = await userRepository.findOne({ where: { email } });
    if (existingUser) {
      res.status(400).json({ message: 'El correo electrónico ya está registrado' });
      return;
    }

    const salt = await bcrypt.genSalt(10);
    const password_hash = await bcrypt.hash(password, salt);

    const newUser = userRepository.create({
      name,
      email,
      password_hash,
      role: role || 'customer',
    });

    await userRepository.save(newUser);

    const token = jwt.sign(
      { user_id: newUser.user_id, email: newUser.email, role: newUser.role },
      process.env.JWT_SECRET || 'secret_key',
      { expiresIn: '7d' }
    );

    res.status(201).json({
      message: 'Usuario registrado exitosamente',
      user: {
        user_id: newUser.user_id,
        name: newUser.name,
        email: newUser.email,
        role: newUser.role,
      },
      token,
    });
  } catch (error: any) {
    res.status(500).json({ message: 'Error al registrar usuario', error: error.message });
  }
};

export const login = async (req: Request, res: Response): Promise<void> => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      res.status(400).json({ message: 'Email y contraseña requeridos' });
      return;
    }

    const user = await userRepository.findOne({ where: { email } });
    if (!user) {
      res.status(401).json({ message: 'Credenciales inválidas' });
      return;
    }

    const isMatch = await bcrypt.compare(password, user.password_hash);
    if (!isMatch) {
      res.status(401).json({ message: 'Credenciales inválidas' });
      return;
    }

    const token = jwt.sign(
      { user_id: user.user_id, email: user.email, role: user.role },
      process.env.JWT_SECRET || 'secret_key',
      { expiresIn: '7d' }
    );

    res.json({
      message: 'Inicio de sesión exitoso',
      user: {
        user_id: user.user_id,
        name: user.name,
        email: user.email,
        role: user.role,
      },
      token,
    });
  } catch (error: any) {
    res.status(500).json({ message: 'Error en inicio de sesión', error: error.message });
  }
};
