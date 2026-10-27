const { Pool } = require('pg');
const path = require('path');

// Pool COMPLETAMENTE SEPARADO del pool principal (server/db/db.config.js):
// otra base de datos (sigesot_audit), otro usuario de PostgreSQL
// (AUDIT_DB_USER, normalmente sigesot_audit_svc). Ese usuario no tiene
// ningún privilegio sobre sigesot_db, y el usuario del pool principal
// (admindb) tampoco tiene privilegios sobre sigesot_audit — así, tener
// las credenciales de uno no da acceso al otro.
require('dotenv').config({ path: path.join(__dirname, '../../.env') });

const auditPool = new Pool({
  user: process.env.AUDIT_DB_USER,
  host: process.env.AUDIT_DB_HOST || process.env.DB_HOST,
  database: process.env.AUDIT_DB_NAME || 'sigesot_audit',
  password: process.env.AUDIT_DB_PASSWORD,
  port: process.env.AUDIT_DB_PORT || process.env.DB_PORT,
});

// Mismo criterio que el pool principal: fuerza la zona horaria de
// Venezuela en cada conexión, para que fecha_hora sea consistente con
// el resto del sistema (reportes, "hoy", etc.).
auditPool.on('connect', (client) => {
  client.query("SET TIME ZONE 'America/Caracas'").catch((err) => {
    console.error('[auditoria] No se pudo fijar la zona horaria de la conexión:', err.message);
  });
});

auditPool.on('error', (err) => {
  // Un error en el pool de auditoría NUNCA debe tumbar el proceso
  // principal — se reporta bien visible por consola para que alguien
  // lo note, pero el resto del sistema (login, solicitudes, etc.) debe
  // seguir funcionando aunque la auditoría esté temporalmente caída.
  console.error('❌ [auditoria] Error inesperado en el pool de PostgreSQL de auditoría:', err);
});

module.exports = auditPool;
