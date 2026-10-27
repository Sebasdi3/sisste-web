const bcrypt = require('bcrypt');
const pool = require('../server/db/db.config');

const [, , cedula, nuevaClave] = process.argv;
if (!cedula || !nuevaClave) {
  console.error('Uso: node scripts/reset-password.js <cedula> <clave_nueva>');
  process.exit(1);
}

(async () => {
  const hash = await bcrypt.hash(nuevaClave, 12);
  const result = await pool.query(
    'UPDATE usuarios_auth SET password_hash = $1, debe_cambiar_password = TRUE WHERE cedula = $2 RETURNING id',
    [hash, cedula]
  );
  if (result.rows.length === 0) {
    console.error('No se encontró ningún usuario con esa cédula.');
  } else {
    console.log(`✅ Contraseña actualizada para el usuario id=${result.rows[0].id}.`);
  }
  await pool.end();
})();

