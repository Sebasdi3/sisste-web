const pool = require('../db/db.config');

/// Middlewares de autenticación/autorización.

/// Exige que exista una sesión activa (cualquier rol).
function requiereSesion(req, res, next) {
  if (!req.session.userId) {
    return res.status(401).json({ success: false, message: 'Sesión no iniciada.' });
  }
  next();
}

/// Exige que la sesión activa tenga uno de los roles CORE permitidos
/// (usuario/tecnico/admin). No reconoce roles personalizados — para
/// eso usa requierePermiso.
/// Uso: requiereRol('admin') o requiereRol('admin', 'tecnico')
function requiereRol(...rolesPermitidos) {
  return (req, res, next) => {
    if (!req.session.userId) {
      return res.status(401).json({ success: false, message: 'Sesión no iniciada.' });
    }
    if (!rolesPermitidos.includes(req.session.rol)) {
      return res.status(403).json({ success: false, message: 'No autorizado para esta acción.' });
    }
    next();
  };
}

/// Exige un PERMISO específico. A diferencia de requiereRol, esta sí
/// entiende roles personalizados: revisa su columna `permisos` (JSONB)
/// en roles_personalizados. Los roles core tienen un mapeo fijo de
/// qué permisos ya implican (admin los tiene todos; tecnico y usuario
/// tienen los que siempre tuvieron, para no romper nada existente).
///
/// Uso: requierePermiso('gestionar_tickets')
const PERMISOS_IMPLICITOS_CORE = {
  admin: ['ver_solicitudes', 'gestionar_tickets', 'ver_dashboard'],
  tecnico: ['ver_solicitudes', 'gestionar_tickets', 'ver_dashboard'],
  usuario: ['ver_solicitudes'],
};

function requierePermiso(permiso) {
  return async (req, res, next) => {
    if (!req.session.userId) {
      return res.status(401).json({ success: false, message: 'Sesión no iniciada.' });
    }

    const rol = req.session.rol;

    // Rol core: chequeo fijo, sin consultar la base de datos.
    if (PERMISOS_IMPLICITOS_CORE[rol]) {
      if (PERMISOS_IMPLICITOS_CORE[rol].includes(permiso)) return next();
      return res.status(403).json({ success: false, message: 'No autorizado para esta acción.' });
    }

    // Rol personalizado: revisa su lista de permisos en la BD.
    try {
      const result = await pool.query(
        'SELECT permisos FROM roles_personalizados WHERE clave = $1 AND activo = TRUE',
        [rol]
      );
      const permisos = result.rows[0]?.permisos || [];
      if (permisos.includes(permiso)) return next();
      return res.status(403).json({ success: false, message: 'No autorizado para esta acción.' });
    } catch (err) {
      console.error('Error al verificar permiso personalizado:', err);
      return res.status(500).json({ success: false });
    }
  };
}

module.exports = { requiereSesion, requiereRol, requierePermiso };
