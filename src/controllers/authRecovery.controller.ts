import { Request, Response } from 'express';
import crypto from 'crypto';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { AppDataSource } from '../config/data-source';
import { User } from '../entities/User';
import { PasswordReset } from '../entities/PasswordReset';
import { UserOtp } from '../entities/UserOtp';
import { mailService } from '../services/mail.service';

const userRepo = AppDataSource.getRepository(User);
const resetRepo = AppDataSource.getRepository(PasswordReset);
const otpRepo = AppDataSource.getRepository(UserOtp);

/**
 * Genera el hash SHA-256 de una cadena de texto
 */
const hashSha256 = (value: string): string => {
  return crypto.createHash('sha256').update(value).digest('hex');
};

/**
 * POST /api/auth/forgot-password
 * Solicita el restablecimiento de contraseña mediante correo
 */
export const forgotPassword = async (req: Request, res: Response): Promise<void> => {
  try {
    const { email } = req.body;

    if (!email || typeof email !== 'string' || !email.includes('@')) {
      res.status(400).json({ message: 'Proporciona un correo electrónico válido' });
      return;
    }

    const normalizedEmail = email.trim().toLowerCase();
    const user = await userRepo.findOne({ where: { email: normalizedEmail } });

    // Respuesta genérica inmediata si el usuario no existe (evita enumeración)
    if (!user) {
      res.json({
        message: 'Si el correo electrónico está registrado, recibirás un enlace de recuperación.',
      });
      return;
    }

    // Invalidar solicitudes anteriores no usadas para este usuario
    await resetRepo.update({ user_id: user.user_id, used: false }, { used: true });

    // Generar token criptográfico de 32 bytes (64 caracteres hex)
    const rawToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = hashSha256(rawToken);
    const expiresAt = new Date(Date.now() + 30 * 60 * 1000); // 30 minutos

    const resetRecord = resetRepo.create({
      user_id: user.user_id,
      token_hash: tokenHash,
      expires_at: expiresAt,
      used: false,
    });
    await resetRepo.save(resetRecord);

    // Enviar correo vía Resend
    await mailService.sendPasswordResetEmail(user.email, rawToken, user.name);

    res.json({
      message: 'Si el correo electrónico está registrado, recibirás un enlace de recuperación.',
    });
  } catch (error: any) {
    res.status(500).json({
      message: 'Error al procesar la solicitud de recuperación',
      error: error.message,
    });
  }
};

/**
 * POST /api/auth/reset-password
 * Restablece la contraseña utilizando el token recibido por correo
 */
export const resetPassword = async (req: Request, res: Response): Promise<void> => {
  try {
    const { token, new_password } = req.body;

    if (!token || typeof token !== 'string') {
      res.status(400).json({ message: 'Token de recuperación no proporcionado o inválido' });
      return;
    }

    if (!new_password || typeof new_password !== 'string' || new_password.length < 6) {
      res.status(400).json({ message: 'La nueva contraseña debe tener al menos 6 caracteres' });
      return;
    }

    const tokenHash = hashSha256(token.trim());

    const resetRecord = await resetRepo.findOne({
      where: { token_hash: tokenHash, used: false },
      relations: ['user'],
    });

    if (!resetRecord) {
      res.status(400).json({ message: 'El enlace de recuperación es inválido o ya ha sido utilizado' });
      return;
    }

    if (new Date() > new Date(resetRecord.expires_at)) {
      resetRecord.used = true;
      await resetRepo.save(resetRecord);
      res.status(400).json({ message: 'El enlace de recuperación ha expirado. Solicita uno nuevo' });
      return;
    }

    const user = resetRecord.user || (await userRepo.findOne({ where: { user_id: resetRecord.user_id } }));
    if (!user) {
      res.status(404).json({ message: 'Usuario asociado no encontrado' });
      return;
    }

    // Actualizar contraseña con nuevo hash bcrypt
    const salt = await bcrypt.genSalt(10);
    user.password_hash = await bcrypt.hash(new_password, salt);
    await userRepo.save(user);

    // Marcar token como consumido
    resetRecord.used = true;
    await resetRepo.save(resetRecord);

    res.json({
      message: 'Contraseña restablecida exitosamente. Ya puedes iniciar sesión con tu nueva contraseña.',
    });
  } catch (error: any) {
    res.status(500).json({
      message: 'Error al restablecer la contraseña',
      error: error.message,
    });
  }
};

/**
 * POST /api/auth/otp/request
 * Solicita el envío de un código OTP de 6 dígitos al correo
 */
export const requestOtp = async (req: Request, res: Response): Promise<void> => {
  try {
    const { email } = req.body;

    if (!email || typeof email !== 'string' || !email.includes('@')) {
      res.status(400).json({ message: 'Proporciona un correo electrónico válido' });
      return;
    }

    const normalizedEmail = email.trim().toLowerCase();
    const user = await userRepo.findOne({ where: { email: normalizedEmail } });

    if (!user) {
      res.status(404).json({
        message: 'No existe una cuenta registrada con este correo electrónico. Por favor regístrate primero.',
      });
      return;
    }

    // Invalidar códigos OTP previos activos para este usuario
    await otpRepo.update({ user_id: user.user_id, used: false }, { used: true });

    // Generar código numérico de 6 dígitos aleatorio seguro (entre 100000 y 999999)
    const code = crypto.randomInt(100000, 1000000).toString();
    const codeHash = hashSha256(code);
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutos

    const otpRecord = otpRepo.create({
      user_id: user.user_id,
      code_hash: codeHash,
      purpose: 'login',
      attempts: 0,
      max_attempts: 3,
      expires_at: expiresAt,
      used: false,
    });
    await otpRepo.save(otpRecord);

    // Enviar código por correo
    await mailService.sendOtpEmail(user.email, code, user.name);

    res.json({
      message: 'Código de acceso temporal enviado a tu correo electrónico.',
      expiresIn: 600, // segundos
    });
  } catch (error: any) {
    res.status(500).json({
      message: 'Error al enviar código de acceso',
      error: error.message,
    });
  }
};

/**
 * POST /api/auth/otp/verify
 * Verifica el código OTP de 6 dígitos e inicia sesión
 */
export const verifyOtp = async (req: Request, res: Response): Promise<void> => {
  try {
    const { email, code } = req.body;

    if (!email || !code) {
      res.status(400).json({ message: 'Correo y código de verificación son requeridos' });
      return;
    }

    const cleanCode = String(code).trim();
    if (cleanCode.length !== 6 || !/^\d{6}$/.test(cleanCode)) {
      res.status(400).json({ message: 'El código debe tener exactamente 6 dígitos numéricos' });
      return;
    }

    const normalizedEmail = email.trim().toLowerCase();
    const user = await userRepo.findOne({ where: { email: normalizedEmail } });

    if (!user) {
      res.status(400).json({ message: 'Usuario no encontrado' });
      return;
    }

    // Buscar el OTP activo más reciente
    const otpRecord = await otpRepo.findOne({
      where: { user_id: user.user_id, used: false },
      order: { created_at: 'DESC' },
    });

    if (!otpRecord) {
      res.status(400).json({
        message: 'No hay un código activo para esta cuenta o ya ha sido utilizado. Solicita uno nuevo.',
      });
      return;
    }

    // Verificar expiración
    if (new Date() > new Date(otpRecord.expires_at)) {
      otpRecord.used = true;
      await otpRepo.save(otpRecord);
      res.status(400).json({ message: 'El código ha expirado. Por favor solicita uno nuevo.' });
      return;
    }

    // Verificar bloqueo por número de intentos
    if (otpRecord.attempts >= otpRecord.max_attempts) {
      otpRecord.used = true;
      await otpRepo.save(otpRecord);
      res.status(400).json({
        message: 'Has superado el número máximo de intentos permitidos (3). Solicita un nuevo código.',
      });
      return;
    }

    const providedHash = hashSha256(cleanCode);

    if (providedHash !== otpRecord.code_hash) {
      otpRecord.attempts += 1;
      const remaining = otpRecord.max_attempts - otpRecord.attempts;

      if (remaining <= 0) {
        otpRecord.used = true;
      }
      await otpRepo.save(otpRecord);

      if (remaining <= 0) {
        res.status(400).json({
          message: 'Código incorrecto. Has alcanzado el límite de intentos. Solicita un nuevo código.',
        });
      } else {
        res.status(400).json({
          message: `Código incorrecto. Te ${remaining === 1 ? 'queda 1 intento' : `quedan ${remaining} intentos`}.`,
        });
      }
      return;
    }

    // Código válido: marcar como usado
    otpRecord.used = true;
    await otpRepo.save(otpRecord);

    // Emitir JWT de sesión
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
    res.status(500).json({
      message: 'Error al verificar el código de acceso',
      error: error.message,
    });
  }
};
