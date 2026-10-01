import express, { Application, Request, Response, NextFunction } from 'express';
import cors from 'cors';
import path from 'path';
import apiRoutes from './routes';

const app: Application = express();

// Middlewares globales
app.use(cors({ origin: '*' }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Servir archivos estáticos subidos localmente (portadas y pistas de audio)
const uploadDir = path.resolve(process.env.UPLOAD_DIR || 'uploads');
app.use('/uploads', express.static(uploadDir));

// Endpoint de verificación de estado
app.get('/api/health', (_req: Request, res: Response) => {
  res.json({
    status: 'OK',
    message: 'Disc Market Backend API está funcionando correctamente',
    timestamp: new Date().toISOString(),
  });
});

// Rutas de la API
app.use('/api', apiRoutes);

// Manejador global de errores
app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
  console.error('Error no controlado:', err);
  res.status(err.status || 500).json({
    message: err.message || 'Error interno del servidor',
    error: process.env.NODE_ENV === 'development' ? err : undefined,
  });
});

export default app;
