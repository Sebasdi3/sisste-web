const session = require('express-session');

/// Configuración de sesión. El "secret" debería venir de una
/// variable de entorno en producción (ver .env), no quedar hardcodeado
/// en el código fuente — lo dejamos con fallback solo para que el
/// proyecto siga arrancando si alguien olvida configurarlo, pero
/// AVISA en consola para que no pase desapercibido.
const SESSION_SECRET = process.env.SESSION_SECRET;

if (!SESSION_SECRET) {
  console.warn(
    '⚠️  SESSION_SECRET no está definido en .env. Usando un valor por ' +
    'defecto NO seguro. Define SESSION_SECRET antes de ir a producción.'
  );
}

module.exports = session({
  secret: SESSION_SECRET || 'sisste_dev_only_change_me',
  resave: false,
  saveUninitialized: false,
  cookie: {
    maxAge: 8 * 60 * 60 * 1000, // 8 horas
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    sameSite: 'lax',
  },
});
