const pool = require('../db/db.config');

/// GET /api/admin/plantilla-constancias
async function obtener(req, res) {
  try {
    const result = await pool.query('SELECT * FROM configuracion_constancias WHERE id = 1');
    res.json({ success: true, data: result.rows[0] || {} });
  } catch (err) {
    console.error('Error al obtener plantilla de constancias:', err);
    res.status(500).json({ success: false });
  }
}

/// PUT /api/admin/plantilla-constancias
/// Body: { encabezadoImagenBase64?, pieImagenBase64? }
async function actualizar(req, res) {
  const { encabezadoImagenBase64, pieImagenBase64 } = req.body;

  // Solo se anota QUÉ se cambió, no el contenido de las imágenes.
  if (req.auditoria) {
    req.auditoria.accion = 'actualizar_plantilla_constancias';
    req.auditoria.detalle = {
      cambioEncabezadoImagen: !!encabezadoImagenBase64,
      cambioPieImagen: !!pieImagenBase64,
    };
  }

  try {
    const result = await pool.query(
      `UPDATE configuracion_constancias SET
         encabezado_imagen_base64 = COALESCE($1, encabezado_imagen_base64),
         pie_imagen_base64 = COALESCE($2, pie_imagen_base64),
         actualizado_en = NOW()
       WHERE id = 1
       RETURNING *`,
      [encabezadoImagenBase64, pieImagenBase64]
    );
    res.json({ success: true, data: result.rows[0] });
  } catch (err) {
    console.error('Error al actualizar plantilla de constancias:', err);
    res.status(500).json({ success: false });
  }
}

module.exports = { obtener, actualizar };
