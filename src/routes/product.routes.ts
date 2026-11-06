import { Router } from 'express';
import {
  getProducts,
  getProductById,
  createProduct,
} from '../controllers/product.controller';
import { authenticateToken } from '../middlewares/auth.middleware';
import { requireRole } from '../middlewares/roles.middleware';

const router = Router();

router.get('/', getProducts);
router.get('/:id', getProductById);

// Alta de productos restringida a administradores y encargados de inventario
router.post('/', authenticateToken, requireRole(['admin', 'inventory_manager']), createProduct);

export default router;
