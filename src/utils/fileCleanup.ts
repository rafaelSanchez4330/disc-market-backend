import fs from 'fs';

/**
 * Elimina de manera segura un archivo en disco si existe.
 * Ignora silenciosamente errores de archivo inexistente.
 */
export const safelyDeleteFile = async (filePath?: string | null): Promise<void> => {
  if (!filePath) return;
  try {
    if (fs.existsSync(filePath)) {
      await fs.promises.unlink(filePath);
      console.log(`[fileCleanup] Archivo huérfano eliminado: ${filePath}`);
    }
  } catch (err: any) {
    console.warn(`[fileCleanup] Error al eliminar archivo huérfano ${filePath}:`, err?.message || err);
  }
};

/**
 * Elimina una lista de archivos Multer o rutas de disco de manera segura.
 */
export const safelyDeleteFiles = async (
  files?: Array<Express.Multer.File | { path: string }> | null
): Promise<void> => {
  if (!files || !Array.isArray(files) || files.length === 0) return;
  await Promise.all(
    files.map((file) => safelyDeleteFile(file.path))
  );
};

