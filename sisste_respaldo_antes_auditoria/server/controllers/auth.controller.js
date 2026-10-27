const bcrypt = require('bcrypt');
const pool = require('../db/db.config');

const SALT_ROUNDS = 12;

/// Determina si un hash guardado ya es un hash bcrypt (empieza con
/// $2a$/$2b$/$2y$) o si es texto plano heredado del sistema viejo.
function esHashBcrypt(valor) {
  return typeof valor === 'string' && /^\$2[aby]\$/.test(valor);
}

/// Todas las ramas de login() etiquetan req.auditoria.accion como
/// 'login_exitoso' o 'login_fallido' (con el motivo en detalle). El
/// registro real lo hace el middleware global de auditoría al terminar
/// la respuesta (ver middleware/auditoria.middleware.js) — esta ruta
/// es POST, así que siempre queda cubierta, éxito o fallo.
async function login(req, res) {
  const { cedula, password } = req.body;

  if (req.auditoria) req.auditoria.detalle.cedulaIntentada = cedula || null;

  if (!cedula || !password) {
    if (req.auditoria) { req.auditoria.accion = 'login_fallido'; req.auditoria.detalle.motivo = 'datos_faltantes'; }
    return res.status(400).json({ success: false, message: 'Cédula y contraseña son requeridas.' });
  }

  try {
    const result = await pool.query(
      'SELECT id, password_hash, rol, debe_cambiar_password FROM usuarios_auth WHERE cedula = $1 AND activo = TRUE',
      [cedula]
    );

    if (result.rows.length === 0) {
      if (req.auditoria) { req.auditoria.accion = 'login_fallido'; req.auditoria.detalle.motivo = 'usuario_no_encontrado_o_inactivo'; }
      return res.status(401).json({ success: false, message: 'Credenciales inválidas' });
    }

    const user = result.rows[0];
    let claveValida;

    if (esHashBcrypt(user.password_hash)) {
      claveValida = await bcrypt.compare(password, user.password_hash);
    } else {
      // Contraseña heredada en texto plano: comparación directa por
      // esta única vez, y si es correcta, la re-hasheamos con bcrypt
      // de forma transparente para el usuario.
      claveValida = user.password_hash === password;
      if (claveValida) {
        const nuevoHash = await bcrypt.hash(password, SALT_ROUNDS);
        await pool.query('UPDATE usuarios_auth SET password_hash = $1 WHERE id = $2', [nuevoHash, user.id]);
      }
    }

    if (!claveValida) {
      if (req.auditoria) { req.auditoria.accion = 'login_fallido'; req.auditoria.detalle.motivo = 'password_incorrecta'; req.auditoria.actorOverride = { usuarioId: user.id, rol: user.rol, nombre: null }; }
      return res.status(401).json({ success: false, message: 'Credenciales inválidas' });
    }

    const nombre = await obtenerNombreCompleto(user.id, user.rol);

    req.session.userId = user.id;
    req.session.rol = user.rol;
    req.session.nombre = nombre;

    if (req.auditoria) req.auditoria.accion = 'login_exitoso';

    const REDIRECT_CORE = { usuario: 'solicitud-panel.html', tecnico: 'dashboard-tecnico.html', admin: 'admin-users.html' };
    // Roles personalizados no tienen una pantalla propia todavía:
    // por ahora los mandamos al panel de solicitudes por defecto.
    const redirectUrl = REDIRECT_CORE[user.rol] || 'solicitud-panel.html';

    res.json({
      success: true,
      userId: user.id,
      nombre,
      rol: user.rol,
      redirectUrl,
      debeCambiarPassword: user.debe_cambiar_password === true,
    });
  } catch (err) {
    console.error('Error en login:', err);
    if (req.auditoria) { req.auditoria.accion = 'login_fallido'; req.auditoria.detalle.motivo = 'error_interno'; }
    res.status(500).json({ success: false, message: 'Error interno del servidor.' });
  }
}

/// Busca el nombre completo en la tabla de perfil correspondiente al
/// rol. Roles core usan su tabla fija; roles personalizados usan el
/// perfil genérico.
async function obtenerNombreCompleto(usuarioId, rol) {
  const TABLA_CORE = { usuario: 'perfil_usuario_estandar', tecnico: 'perfil_tecnico', admin: 'perfil_admin' };
  const tabla = TABLA_CORE[rol] || 'perfil_personalizado';

  const result = await pool.query(`SELECT nombre, apellido FROM ${tabla} WHERE usuario_id = $1`, [usuarioId]);
  if (result.rows.length === 0) return '';
  const { nombre, apellido } = result.rows[0];
  return [nombre, apellido].filter(Boolean).join(' ');
}

function logout(req, res) {
  // La sesión se destruye ANTES de que el middleware global registre
  // el evento (que ocurre al terminar la respuesta), así que hay que
  // capturar quién era el usuario aquí mismo, antes de perderlo.
  if (req.auditoria) {
    req.auditoria.accion = 'logout';
    req.auditoria.actorOverride = { usuarioId: req.session.userId, rol: req.session.rol, nombre: req.session.nombre };
  }

  req.session.destroy((err) => {
    if (err) return res.status(500).json({ success: false });
    res.clearCookie('connect.sid');
    res.json({ success: true });
  });
}

function sesionActual(req, res) {
  if (req.session.userId) {
    res.json({ success: true, userId: req.session.userId, rol: req.session.rol, nombre: req.session.nombre });
  } else {
    res.json({ success: false });
  }
}

/// PUT /api/cambiar-password — usado tanto para el cambio obligatorio
/// en el primer login como (a futuro) para que cualquier usuario
/// cambie su propia contraseña voluntariamente.
async function cambiarPasswordPropia(req, res) {
  const { passwordNueva } = req.body;
  if (req.auditoria) req.auditoria.accion = 'cambiar_password_propia';

  if (!passwordNueva || passwordNueva.length < 4) {
    return res.status(400).json({ success: false, message: 'La nueva contraseña debe tener al menos 4 caracteres.' });
  }

  try {
    const hash = await bcrypt.hash(passwordNueva, SALT_ROUNDS);
    await pool.query(
      'UPDATE usuarios_auth SET password_hash = $1, debe_cambiar_password = FALSE WHERE id = $2',
      [hash, req.session.userId]
    );
    res.json({ success: true });
  } catch (err) {
    console.error('Error al cambiar contraseña propia:', err);
    res.status(500).json({ success: false });
  }
}

module.exports = { login, logout, sesionActual, cambiarPasswordPropia };
