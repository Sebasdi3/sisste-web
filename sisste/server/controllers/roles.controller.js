const pool = require('../db/db.config');

const ROLES_CORE = ['usuario', 'tecnico', 'admin'];

async function listar(req, res) {
  try {
    const result = await pool.query('SELECT * FROM roles_personalizados ORDER BY nombre_mostrar ASC');
    res.json({ success: true, data: result.rows });
  } catch (err) {
    console.error('Error al listar roles personalizados:', err);
    res.status(500).json({ success: false, data: [] });
  }
}

/// Devuelve TODOS los roles disponibles para asignar a un usuario:
/// los 3 core + los personalizados activos. Es lo que consume el
/// <select> de rol en admin-users.html.
async function listarTodosDisponibles(req, res) {
  try {
    const personalizados = await pool.query(
      "SELECT clave, nombre_mostrar FROM roles_personalizados WHERE activo = TRUE ORDER BY nombre_mostrar ASC"
    );
    const coreResult = await pool.query('SELECT clave, nombre_mostrar FROM core_roles_config ORDER BY clave ASC');
    // Fallback por si la migración 003 (etiquetas) aún no corrió.
    const core = coreResult.rows.length > 0 ? coreResult.rows : [
      { clave: 'usuario', nombre_mostrar: 'Usuario (Solicitante)' },
      { clave: 'tecnico', nombre_mostrar: 'Técnico (Soporte)' },
      { clave: 'admin', nombre_mostrar: 'Administrador' },
    ];
    res.json({ success: true, data: [...core, ...personalizados.rows] });
  } catch (err) {
    console.error('Error al listar roles disponibles:', err);
    res.status(500).json({ success: false, data: [] });
  }
}

/// Devuelve las etiquetas (nombre a mostrar) editables de los 3
/// roles del sistema. La clave interna NUNCA se expone como editable
/// aquí — solo el texto que ve el humano en la interfaz.
async function listarEtiquetasCore(req, res) {
  try {
    const result = await pool.query('SELECT clave, nombre_mostrar FROM core_roles_config ORDER BY clave ASC');
    res.json({ success: true, data: result.rows });
  } catch (err) {
    console.error('Error al listar etiquetas de roles core:', err);
    res.status(500).json({ success: false, data: [] });
  }
}

/// Actualiza SOLO el nombre_mostrar de un rol core. La clave (:clave
/// en la URL) debe ser una de usuario/tecnico/admin — no se puede
/// crear ni renombrar la clave en sí, por eso la ruta la recibe como
/// parámetro de identificación, no de modificación.
async function actualizarEtiquetaCore(req, res) {
  const { clave } = req.params;
  const { nombreMostrar } = req.body;
  if (req.auditoria) { req.auditoria.accion = 'actualizar_etiqueta_rol_core'; req.auditoria.detalle = { clave, nombreMostrar }; }

  if (!['usuario', 'tecnico', 'admin'].includes(clave)) {
    return res.status(400).json({ success: false, message: 'Clave de rol del sistema inválida.' });
  }
  if (!nombreMostrar || !nombreMostrar.trim()) {
    return res.status(400).json({ success: false, message: 'El nombre a mostrar es requerido.' });
  }

  try {
    const result = await pool.query(
      `UPDATE core_roles_config SET nombre_mostrar = $1 WHERE clave = $2 RETURNING *`,
      [nombreMostrar.trim(), clave]
    );
    if (result.rows.length === 0) {
      // Por si la migración no corrió el seed para esta clave puntual.
      const inserted = await pool.query(
        `INSERT INTO core_roles_config (clave, nombre_mostrar) VALUES ($1, $2) RETURNING *`,
        [clave, nombreMostrar.trim()]
      );
      return res.json({ success: true, data: inserted.rows[0] });
    }
    res.json({ success: true, data: result.rows[0] });
  } catch (err) {
    console.error('Error al actualizar etiqueta de rol core:', err);
    res.status(500).json({ success: false });
  }
}

async function crear(req, res) {
  const { clave, nombreMostrar, permisos = [] } = req.body;
  if (req.auditoria) { req.auditoria.accion = 'crear_rol'; req.auditoria.detalle = { clave, nombreMostrar, permisos }; }

  if (!clave || !clave.trim() || !nombreMostrar || !nombreMostrar.trim()) {
    return res.status(400).json({ success: false, message: 'Clave y nombre a mostrar son requeridos.' });
  }
  const claveNormalizada = clave.trim().toLowerCase().replace(/\s+/g, '_');
  if (ROLES_CORE.includes(claveNormalizada)) {
    return res.status(409).json({ success: false, message: 'Esa clave ya la usa un rol del sistema (usuario/tecnico/admin).' });
  }

  try {
    const result = await pool.query(
      `INSERT INTO roles_personalizados (clave, nombre_mostrar, permisos) VALUES ($1, $2, $3) RETURNING *`,
      [claveNormalizada, nombreMostrar.trim(), JSON.stringify(permisos)]
    );
    res.json({ success: true, data: result.rows[0] });
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ success: false, message: 'Ya existe un rol con esa clave.' });
    }
    console.error('Error al crear rol personalizado:', err);
    res.status(500).json({ success: false });
  }
}

async function actualizar(req, res) {
  const { id } = req.params;
  const { nombreMostrar, permisos, activo } = req.body;
  if (req.auditoria) { req.auditoria.accion = 'actualizar_rol'; req.auditoria.detalle = { rolId: id, cambios: req.body }; }
  try {
    const result = await pool.query(
      `UPDATE roles_personalizados SET
         nombre_mostrar = COALESCE($1, nombre_mostrar),
         permisos = COALESCE($2, permisos),
         activo = COALESCE($3, activo)
       WHERE id = $4 RETURNING *`,
      [nombreMostrar, permisos ? JSON.stringify(permisos) : null, activo, id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Rol no encontrado.' });
    }
    res.json({ success: true, data: result.rows[0] });
  } catch (err) {
    console.error('Error al actualizar rol personalizado:', err);
    res.status(500).json({ success: false });
  }
}

/// Elimina el rol y lo manda a la papelera. Si hay usuarios activos
/// con ese rol, se rechaza — primero hay que reasignarlos.
async function eliminar(req, res) {
  const { id } = req.params;
  if (req.auditoria) { req.auditoria.accion = 'eliminar_rol'; req.auditoria.detalle = { rolId: id }; }
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const rol = await client.query('SELECT * FROM roles_personalizados WHERE id = $1', [id]);
    if (rol.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ success: false, message: 'Rol no encontrado.' });
    }

    const enUso = await client.query(
      'SELECT COUNT(*) FROM perfil_personalizado WHERE rol_personalizado_id = $1',
      [id]
    );
    if (parseInt(enUso.rows[0].count, 10) > 0) {
      await client.query('ROLLBACK');
      return res.status(409).json({
        success: false,
        message: 'Hay usuarios con este rol activos. Reasígnalos antes de eliminarlo.',
      });
    }

    await client.query(
      `INSERT INTO papelera (tipo_elemento, datos, eliminado_por) VALUES ('rol_personalizado', $1, $2)`,
      [JSON.stringify(rol.rows[0]), req.session.userId]
    );
    await client.query('DELETE FROM roles_personalizados WHERE id = $1', [id]);

    await client.query('COMMIT');
    res.json({ success: true });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Error al eliminar rol personalizado:', err);
    res.status(500).json({ success: false });
  } finally {
    client.release();
  }
}

module.exports = { listar, listarTodosDisponibles, listarEtiquetasCore, actualizarEtiquetaCore, crear, actualizar, eliminar };
