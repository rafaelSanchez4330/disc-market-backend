import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

export interface AuthUserPayload {
  user_id: number;
  email: string;
  role: string;
}

export interface AuthenticatedRequest extends Request {
  user?: AuthUserPayload;
}

export const authenticateToken = (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): void => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1]; // "Bearer <token>"

  if (!token) {
    res.status(401).json({ message: 'Token de acceso no proporcionado' });
    return;
  }

  try {
    const decoded = jwt.verify(
      token,
      process.env.JWT_SECRET || 'secret_key'
    ) as AuthUserPayload;

    req.user = decoded;
    next();
  } catch (error) {
    res.status(403).json({ message: 'Token inválido o expirado' });
  }
};
