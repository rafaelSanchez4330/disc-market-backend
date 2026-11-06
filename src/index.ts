import 'reflect-metadata';
import dotenv from 'dotenv';
import app from './app';
import { AppDataSource } from './config/data-source';

dotenv.config();

const PORT = process.env.PORT || 5000;
const MAX_DB_RETRIES = 5;
const INITIAL_RETRY_DELAY_MS = 2000;

const connectWithRetry = async (retries = MAX_DB_RETRIES, delayMs = INITIAL_RETRY_DELAY_MS): Promise<void> => {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      console.log(`🔄 [Intento ${attempt}/${retries}] Conectando a la base de datos PostgreSQL...`);
      await AppDataSource.initialize();
      console.log('✅ Base de datos PostgreSQL conectada con éxito y entidades sincronizadas.');
      return;
    } catch (error: any) {
      console.error(`⚠️ Error en intento ${attempt}/${retries} de conexión a PostgreSQL:`, error?.message || error);
      if (attempt === retries) {
        throw new Error(`Fallo definitivo al conectar con la base de datos tras ${retries} intentos: ${error?.message || error}`);
      }
      console.log(`⏳ Reintentando conexión en ${delayMs / 1000}s...`);
      await new Promise((resolve) => setTimeout(resolve, delayMs));
      delayMs *= 2; // Retroceso exponencial (2s, 4s, 8s, 16s...)
    }
  }
};

const startServer = async () => {
  try {
    await connectWithRetry();

    app.listen(PORT, () => {
      console.log(`🚀 Servidor ejecutándose en: http://localhost:${PORT}`);
      console.log(`📁 Servidor de archivos multimedia en: http://localhost:${PORT}/uploads`);
      console.log(`🩺 Health check: http://localhost:${PORT}/api/health`);
    });
  } catch (error) {
    console.error('❌ Error crítico al iniciar el servidor:', error);
    process.exit(1);
  }
};

startServer();
