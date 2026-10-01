import 'reflect-metadata';
import dotenv from 'dotenv';
import app from './app';
import { AppDataSource } from './config/data-source';

dotenv.config();

const PORT = process.env.PORT || 5000;

const startServer = async () => {
  try {
    console.log('🔄 Conectando a la base de datos PostgreSQL...');
    await AppDataSource.initialize();
    console.log('✅ Base de datos PostgreSQL conectada con éxito y entidades sincronizadas.');

    app.listen(PORT, () => {
      console.log(`🚀 Servidor ejecutándose en: http://localhost:${PORT}`);
      console.log(`📁 Servidor de archivos multimedia en: http://localhost:${PORT}/uploads`);
      console.log(`🩺 Health check: http://localhost:${PORT}/api/health`);
    });
  } catch (error) {
    console.error('❌ Error al iniciar el servidor:', error);
    process.exit(1);
  }
};

startServer();
