import { Response, NextFunction } from 'express';
import { AuthenticatedRequest } from './auth.middleware';

/**
 * Middleware generador de orden superior para restringir endpoints según roles (RBAC).
 * Requiere que se ejecute después de `authenticateToken`.
 *
 * @param allowedRoles Lista de roles con permiso (ej: ['admin', 'inventory_manager'])
 */
export const requireRole = (allowedRoles: string[]) => {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ message: 'Acceso no autenticado: se requiere token válido' });
      return;
    }

    if (!allowedRoles.includes(req.user.role)) {
      res.status(403).json({
        message: 'Acceso denegado: no posees los privilegios requeridos para esta operación',
        requiredRoles: allowedRoles,
        userRole: req.user.role,
      });
      return;
    }

    next();
  };
};

