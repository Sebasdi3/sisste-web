/// Ejecuta un archivo de migración SQL contra la base de datos
/// configurada en config/.env.
///
/// Uso: node scripts/run-migration.js <nombre_del_archivo.sql>
///   ej: node scripts/run-migration.js 002_listas_roles_papelera.sql
/// Si no se pasa argumento, corre 001_migracion_completa.sql por
/// compatibilidad con el flujo anterior.
///
/// IMPORTANTE: este script asume la estructura real del servidor:
///   - Los .sql viven en /var/www/sisste/sql/
///   - La conexión a la BD vive en /var/www/sisste/server/db/db.config.js
/// Si tu estructura es distinta, ajusta las dos rutas de abajo.
const fs = require('fs');
const path = require('path');

require('dotenv').config({ path: path.join(__dirname, '../config/.env') });

const pool = require('../server/db/db.config');

async function main() {
  const nombreArchivo = process.argv[2] || '001_migracion_completa.sql';
  const rutaSql = path.join(__dirname, '../sql', nombreArchivo);

  if (!fs.existsSync(rutaSql)) {
    console.error(`❌ No se encontró el archivo: ${rutaSql}`);
    process.exit(1);
  }

  const sql = fs.readFileSync(rutaSql, 'utf8');

  console.log(`🔄 Ejecutando migración: ${nombreArchivo}...`);
  try {
    await pool.query(sql);
    console.log('✅ Migración completada exitosamente.');
  } catch (err) {
    console.error('❌ Error durante la migración:', err.message);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

main();
