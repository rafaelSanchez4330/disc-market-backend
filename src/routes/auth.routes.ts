import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { register, login, getMe } from '../controllers/auth.controller';
import {
  forgotPassword,
  resetPassword,
  requestOtp,
  verifyOtp,
} from '../controllers/authRecovery.controller';
import { authenticateToken } from '../middlewares/auth.middleware';

const router = Router();

// Rate limiters para mitigar ataques de denegación de servicio y fuerza bruta
const authRequestLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: 5,
  message: { message: 'Demasiadas solicitudes. Por favor intenta nuevamente en 15 minutos.' },
  standardHeaders: true,
  legacyHeaders: false,
});

const otpVerifyLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: 10,
  message: { message: 'Demasiados intentos de verificación. Intenta de nuevo en 15 minutos.' },
  standardHeaders: true,
  legacyHeaders: false,
});

router.post('/register', register);
router.post('/login', login);
router.get('/me', authenticateToken, getMe);

// Recuperación de contraseña
router.post('/forgot-password', authRequestLimiter, forgotPassword);
router.post('/reset-password', authRequestLimiter, resetPassword);

// Inicio de sesión y verificación OTP (Passwordless)
router.post('/otp/request', authRequestLimiter, requestOtp);
router.post('/otp/verify', otpVerifyLimiter, verifyOtp);

export default router;

