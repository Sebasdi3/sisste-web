const { Pool } = require('pg');
const path = require('path');

// db.config.js vive en SIGESOT/server/db/, y el .env vive en la RAÍZ
// del proyecto (SIGESOT/.env) — confirmado directamente con
// `find /var/www/sisste -iname ".env"` en el servidor real.
require('dotenv').config({ path: path.join(__dirname, '../../.env') });

const pool = new Pool({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
  password: process.env.DB_PASSWORD,
  port: process.env.DB_PORT,
});

// Fuerza la zona horaria de Venezuela en CADA conexión del pool, sin
// importar cómo esté configurado el reloj del sistema operativo del
// servidor. Esto es lo que realmente corrige NOW()/CURRENT_DATE en
// PostgreSQL (afecta reportes por fecha, "resueltos hoy", antigüedad
// de tickets pendientes, etc.) — el ajuste que hicimos antes en el
// PDF de la constancia solo corregía la fecha DENTRO de ese documento,
// no las consultas a la base de datos en general.
pool.on('connect', (client) => {
  client.query("SET TIME ZONE 'America/Caracas'").catch((err) => {
    console.error('No se pudo fijar la zona horaria de la conexión:', err.message);
  });
});

pool.on('error', (err) => {
  console.error('❌ Error inesperado en el pool de PostgreSQL:', err);
});

module.exports = pool;
