const pool = require('../db/db.config');

/// GET /api/categorias — usado por la app/web para pintar el formulario.
/// Devuelve solo categorías/subcategorías activas, anidadas.
async function listarActivas(req, res) {
  try {
    const categorias = await pool.query(
      'SELECT id, nombre FROM categorias WHERE activo = TRUE ORDER BY orden ASC, nombre ASC'
    );
    const subcategorias = await pool.query(
      `SELECT id, categoria_id, nombre, permite_texto_libre
       FROM subcategorias WHERE activo = TRUE ORDER BY orden ASC, nombre ASC`
    );

    const data = categorias.rows.map((cat) => ({
      id: cat.id,
      nombre: cat.nombre,
      subcategorias: subcategorias.rows
        .filter((sub) => sub.categoria_id === cat.id)
        .map((sub) => ({ id: sub.id, nombre: sub.nombre, permiteTextoLibre: sub.permite_texto_libre })),
    }));

    res.json({ success: true, data });
  } catch (err) {
    console.error('Error al listar categorías:', err);
    res.status(500).json({ success: false, data: [] });
  }
}

/// GET /api/admin/categorias — incluye inactivas, para gestión.
async function listarTodasAdmin(req, res) {
  try {
    const categorias = await pool.query('SELECT * FROM categorias ORDER BY orden ASC, nombre ASC');
    const subcategorias = await pool.query('SELECT * FROM subcategorias ORDER BY orden ASC, nombre ASC');

    const data = categorias.rows.map((cat) => ({
      ...cat,
      subcategorias: subcategorias.rows.filter((sub) => sub.categoria_id === cat.id),
    }));

    res.json({ success: true, data });
  } catch (err) {
    console.error('Error al listar categorías (admin):', err);
    res.status(500).json({ success: false, data: [] });
  }
}

async function crearCategoria(req, res) {
  const { nombre, orden = 0, tipoConstancia } = req.body;
  if (req.auditoria) { req.auditoria.accion = 'crear_categoria'; req.auditoria.detalle = { nombre }; }
  if (!nombre || !nombre.trim()) {
    return res.status(400).json({ success: false, message: 'El nombre es requerido.' });
  }
  try {
    const result = await pool.query(
      'INSERT INTO categorias (nombre, orden, tipo_constancia) VALUES ($1, $2, $3) RETURNING *',
      [nombre.trim(), orden, tipoConstancia || null]
    );
    res.json({ success: true, data: result.rows[0] });
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ success: false, message: 'Ya existe una categoría con ese nombre.' });
    }
    console.error('Error al crear categoría:', err);
    res.status(500).json({ success: false });
  }
}

async function actualizarCategoria(req, res) {
  const { id } = req.params;
  const { nombre, activo, orden, tipoConstancia } = req.body;
  if (req.auditoria) { req.auditoria.accion = 'actualizar_categoria'; req.auditoria.detalle = { categoriaId: id, cambios: req.body }; }
  try {
    const result = await pool.query(
      `UPDATE categorias SET nombre = COALESCE($1, nombre), activo = COALESCE($2, activo),
       orden = COALESCE($3, orden), tipo_constancia = COALESCE($4, tipo_constancia) WHERE id = $5 RETURNING *`,
      [nombre, activo, orden, tipoConstancia, id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Categoría no encontrada.' });
    }
    res.json({ success: true, data: result.rows[0] });
  } catch (err) {
    console.error('Error al actualizar categoría:', err);
    res.status(500).json({ success: false });
  }
}

async function eliminarCategoria(req, res) {
  if (req.auditoria) { req.auditoria.accion = 'eliminar_categoria'; req.auditoria.detalle = { categoriaId: req.params.id }; }
  try {
    await pool.query('DELETE FROM categorias WHERE id = $1', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    console.error('Error al eliminar categoría:', err);
    res.status(500).json({ success: false });
  }
}

async function crearSubcategoria(req, res) {
  const { categoriaId, nombre, permiteTextoLibre = false, orden = 0 } = req.body;
  if (req.auditoria) { req.auditoria.accion = 'crear_subcategoria'; req.auditoria.detalle = { categoriaId, nombre }; }
  if (!categoriaId || !nombre || !nombre.trim()) {
    return res.status(400).json({ success: false, message: 'categoriaId y nombre son requeridos.' });
  }
  try {
    const result = await pool.query(
      `INSERT INTO subcategorias (categoria_id, nombre, permite_texto_libre, orden)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [categoriaId, nombre.trim(), permiteTextoLibre, orden]
    );
    res.json({ success: true, data: result.rows[0] });
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ success: false, message: 'Ya existe esa sub-opción en esta categoría.' });
    }
    console.error('Error al crear subcategoría:', err);
    res.status(500).json({ success: false });
  }
}

async function actualizarSubcategoria(req, res) {
  const { id } = req.params;
  const { nombre, permiteTextoLibre, activo, orden } = req.body;
  if (req.auditoria) { req.auditoria.accion = 'actualizar_subcategoria'; req.auditoria.detalle = { subcategoriaId: id, cambios: req.body }; }
  try {
    const result = await pool.query(
      `UPDATE subcategorias SET nombre = COALESCE($1, nombre),
       permite_texto_libre = COALESCE($2, permite_texto_libre),
       activo = COALESCE($3, activo), orden = COALESCE($4, orden)
       WHERE id = $5 RETURNING *`,
      [nombre, permiteTextoLibre, activo, orden, id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Sub-categoría no encontrada.' });
    }
    res.json({ success: true, data: result.rows[0] });
  } catch (err) {
    console.error('Error al actualizar subcategoría:', err);
    res.status(500).json({ success: false });
  }
}

async function eliminarSubcategoria(req, res) {
  if (req.auditoria) { req.auditoria.accion = 'eliminar_subcategoria'; req.auditoria.detalle = { subcategoriaId: req.params.id }; }
  try {
    await pool.query('DELETE FROM subcategorias WHERE id = $1', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    console.error('Error al eliminar subcategoría:', err);
    res.status(500).json({ success: false });
  }
}

module.exports = {
  listarActivas,
  listarTodasAdmin,
  crearCategoria,
  actualizarCategoria,
  eliminarCategoria,
  crearSubcategoria,
  actualizarSubcategoria,
  eliminarSubcategoria,
};
