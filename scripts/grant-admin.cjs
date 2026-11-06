// Local operator command. It changes only an existing user's role, not the schema or stock.
require('dotenv').config();
const { Client } = require('pg');

async function main() {
  const email = process.argv[2]?.trim();
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || process.argv.length !== 3) {
    console.error('Uso: npm run admin:grant -- correo@ejemplo.com');
    process.exitCode = 1;
    return;
  }
  const client = new Client({
    host: process.env.DB_HOST || 'localhost', port: Number(process.env.DB_PORT || 5432),
    user: process.env.DB_USERNAME || 'postgres', password: process.env.DB_PASSWORD || 'postgres',
    database: process.env.DB_NAME || 'disc_market_db', connectionTimeoutMillis: 5000,
  });
  await client.connect();
  try {
    const result = await client.query("UPDATE users SET role = 'admin' WHERE email = $1 RETURNING user_id", [email]);
    if (result.rowCount !== 1) {
      console.error('No existe una cuenta con ese correo. Regístrala en la tienda y vuelve a ejecutar este comando.');
      process.exitCode = 1;
      return;
    }
    console.log(`Cuenta #${result.rows[0].user_id} habilitada como administradora en ${process.env.DB_NAME || 'disc_market_db'}.`);
    console.log('Cierra sesión en la tienda, vuelve a entrar y abre /admin.');
  } finally { await client.end(); }
}

main().catch(error => {
  console.error('No se pudo habilitar la cuenta:', error.code || error.name);
  process.exitCode = 1;
});
