#!/usr/bin/env node
/**
 * Actualización ADITIVA del esquema de PostgreSQL en producción.
 *
 * En producción `synchronize` está desactivado, así que las tablas o columnas nuevas
 * de las entidades nunca llegaban a la base de datos y endpoints como el carrito
 * fallaban (p. ej. faltaba la tabla `checkout_reservations`).
 *
 * Este script compara las entidades compiladas (dist/) con la base de datos y aplica
 * SOLO cambios que agregan estructura: CREATE TABLE, CREATE INDEX, ADD COLUMN y
 * ADD CONSTRAINT. Nunca ejecuta DROP, RENAME ni ALTER COLUMN; esos se listan para
 * revisarlos a mano. Es idempotente: se puede correr en cada despliegue.
 *
 * Uso (desde la carpeta del backend, después de `npm run build`):
 *   npm run db:sync-schema            -> aplica los cambios aditivos
 *   npm run db:sync-schema -- --dry-run -> solo muestra lo que haría
 */
const path = require('path');
const fs = require('fs');

process.chdir(path.resolve(__dirname, '..', '..'));
require('dotenv').config();
// Fuerza synchronize=false al cargar la configuración: aquí controlamos cada sentencia.
process.env.NODE_ENV = 'production';

const { AppDataSource } = require(path.resolve('dist/config/data-source'));

const dryRun = process.argv.includes('--dry-run');
const SAFE = [
  /^CREATE TABLE /i,
  /^CREATE (UNIQUE )?INDEX /i,
  /^ALTER TABLE "[^"]+" ADD (?!.*\b(DROP|RENAME)\b)/i,
];
const isSafe = (sql) => SAFE.some((re) => re.test(sql.trim()));

// Migraciones SQL escritas a mano (usan gen_random_uuid, que no requiere extensiones).
const SQL_FILES = ['stripe-schema.sql', 'stock-reservations.sql'];

async function main() {
  await AppDataSource.initialize();
  const runner = AppDataSource.createQueryRunner();
  let applied = 0;
  let failed = 0;
  try {
    if (!dryRun) {
      for (const file of SQL_FILES) {
        const sql = fs.readFileSync(path.join(__dirname, file), 'utf8');
        await runner.query(sql);
        console.log(`✅ ${file} aplicado`);
      }
    }

    const { upQueries } = await AppDataSource.driver.createSchemaBuilder().log();
    const existingFks = new Set(
      (await runner.query(`
        SELECT tc.table_name, kcu.column_name
        FROM information_schema.table_constraints tc
        JOIN information_schema.key_column_usage kcu
          ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema
        WHERE tc.constraint_type = 'FOREIGN KEY' AND tc.table_schema = current_schema()`))
        .map((r) => `${r.table_name}.${r.column_name}`)
    );
    // Una llave foránea que ya existe con otro nombre no se duplica (TypeORM solo quiere renombrarla).
    const fkAlreadyExists = (sql) => {
      const m = /^ALTER TABLE "([^"]+)" ADD CONSTRAINT "[^"]+" FOREIGN KEY \("([^"]+)"\)/i.exec(sql.trim());
      return Boolean(m && existingFks.has(`${m[1]}.${m[2]}`));
    };
    const relevant = upQueries.filter((q) => !fkAlreadyExists(q.query));
    const isRenamedFkDrop = (sql) => {
      const m = /^ALTER TABLE "([^"]+)" DROP CONSTRAINT "[^"]+"$/i.exec(sql.trim());
      return Boolean(m && upQueries.some((q) => fkAlreadyExists(q.query) && q.query.includes(`ALTER TABLE "${m[1]}"`)));
    };
    const safe = relevant.filter((q) => isSafe(q.query));
    const skipped = relevant.filter((q) => !isSafe(q.query) && !isRenamedFkDrop(q.query));

    if (!safe.length && !skipped.length) console.log('✅ El esquema ya coincide con las entidades.');

    if (!dryRun && safe.length) {
      await runner.startTransaction();
      for (const q of safe) {
        await runner.query('SAVEPOINT schema_sync');
        try {
          await runner.query(q.query, q.parameters);
          await runner.query('RELEASE SAVEPOINT schema_sync');
          applied++;
          console.log(`  + ${q.query.slice(0, 160)}`);
        } catch (error) {
          await runner.query('ROLLBACK TO SAVEPOINT schema_sync');
          failed++;
          console.error(`  ✗ ${q.query.slice(0, 160)}\n    ${error.message}`);
        }
      }
      await runner.commitTransaction();
    } else if (dryRun) {
      safe.forEach((q) => console.log(`  (se aplicaría) ${q.query.slice(0, 160)}`));
      applied = safe.length;
    }

    skipped.forEach((q) => console.warn(`  ⚠ Omitido (no aditivo, revisar a mano): ${q.query.slice(0, 160)}`));
    console.log(`Resumen: ${applied} ${dryRun ? 'por aplicar' : 'aplicados'}, ${failed} con error, ${skipped.length} omitidos${dryRun ? ' (modo prueba)' : ''}.`);
  } finally {
    if (runner.isTransactionActive) await runner.rollbackTransaction();
    await runner.release();
    await AppDataSource.destroy();
  }
  if (failed) process.exitCode = 1;
}

main().catch((error) => {
  console.error('❌ No se pudo actualizar el esquema:', error.message || error);
  process.exit(1);
});
