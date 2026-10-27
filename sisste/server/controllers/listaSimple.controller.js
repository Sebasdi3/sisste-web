const pool = require('../db/db.config');

/// Crea un controller CRUD completo para una tabla de "lista simple"
/// (id, nombre, activo, orden) — reutilizado por áreas, cargos y pisos,
/// que son estructuralmente idénticas. Evita mantener 3 archivos casi
/// iguales por separado.
///
/// Cada acción etiqueta req.auditoria.accion con el nombre de la tabla
/// (ej. "crear_areas_departamento", "eliminar_cargos", "actualizar_pisos")
/// para que el reporte de auditoría distinga de qué lista se trata.
function crearControladorListaSimple(nombreTabla) {
  async function listar(req, res) {
    try {
      const result = await pool.query(
        `SELECT * FROM ${nombreTabla} ORDER BY orden ASC, nombre ASC`
      );
      res.json({ success: true, data: result.rows });
    } catch (err) {
      console.error(`Error al listar ${nombreTabla}:`, err);
      res.status(500).json({ success: false, data: [] });
    }
  }

  async function listarActivos(req, res) {
    try {
      const result = await pool.query(
        `SELECT * FROM ${nombreTabla} WHERE activo = TRUE ORDER BY orden ASC, nombre ASC`
      );
      res.json({ success: true, data: result.rows });
    } catch (err) {
      console.error(`Error al listar ${nombreTabla} activos:`, err);
      res.status(500).json({ success: false, data: [] });
    }
  }

  async function crear(req, res) {
    const { nombre, orden = 0 } = req.body;
    if (req.auditoria) { req.auditoria.accion = `crear_${nombreTabla}`; req.auditoria.detalle = { nombre }; }
    if (!nombre || !nombre.trim()) {
      return res.status(400).json({ success: false, message: 'El nombre es requerido.' });
    }
    try {
      const result = await pool.query(
        `INSERT INTO ${nombreTabla} (nombre, orden) VALUES ($1, $2) RETURNING *`,
        [nombre.trim(), orden]
      );
      res.json({ success: true, data: result.rows[0] });
    } catch (err) {
      if (err.code === '23505') {
        return res.status(409).json({ success: false, message: 'Ya existe un elemento con ese nombre.' });
      }
      console.error(`Error al crear en ${nombreTabla}:`, err);
      res.status(500).json({ success: false });
    }
  }

  async function actualizar(req, res) {
    const { id } = req.params;
    const { nombre, activo, orden } = req.body;
    if (req.auditoria) { req.auditoria.accion = `actualizar_${nombreTabla}`; req.auditoria.detalle = { id, cambios: req.body }; }
    try {
      const result = await pool.query(
        `UPDATE ${nombreTabla} SET nombre = COALESCE($1, nombre),
         activo = COALESCE($2, activo), orden = COALESCE($3, orden)
         WHERE id = $4 RETURNING *`,
        [nombre, activo, orden, id]
      );
      if (result.rows.length === 0) {
        return res.status(404).json({ success: false, message: 'No encontrado.' });
      }
      res.json({ success: true, data: result.rows[0] });
    } catch (err) {
      console.error(`Error al actualizar en ${nombreTabla}:`, err);
      res.status(500).json({ success: false });
    }
  }

  /// Elimina, pero primero guarda una copia en la papelera.
  async function eliminar(req, res) {
    const { id } = req.params;
    if (req.auditoria) { req.auditoria.accion = `eliminar_${nombreTabla}`; req.auditoria.detalle = { id }; }
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const fila = await client.query(`SELECT * FROM ${nombreTabla} WHERE id = $1`, [id]);
      if (fila.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ success: false, message: 'No encontrado.' });
      }

      await client.query(
        `INSERT INTO papelera (tipo_elemento, datos, eliminado_por) VALUES ($1, $2, $3)`,
        [nombreTabla, JSON.stringify(fila.rows[0]), req.session.userId]
      );
      await client.query(`DELETE FROM ${nombreTabla} WHERE id = $1`, [id]);

      await client.query('COMMIT');
      res.json({ success: true });
    } catch (err) {
      await client.query('ROLLBACK');
      console.error(`Error al eliminar en ${nombreTabla}:`, err);
      res.status(500).json({ success: false });
    } finally {
      client.release();
    }
  }

  return { listar, listarActivos, crear, actualizar, eliminar };
}

module.exports = { crearControladorListaSimple };
