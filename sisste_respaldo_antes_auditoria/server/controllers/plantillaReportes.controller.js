const pool = require('../db/db.config');

/// GET /api/admin/plantilla-reportes
async function obtener(req, res) {
  try {
    const result = await pool.query('SELECT * FROM configuracion_reportes WHERE id = 1');
    res.json({ success: true, data: result.rows[0] || {} });
  } catch (err) {
    console.error('Error al obtener plantilla de reportes:', err);
    res.status(500).json({ success: false });
  }
}

/// PUT /api/admin/plantilla-reportes
/// Body: { encabezadoImagenBase64?, pieImagenBase64?, textoEncabezado?, textoPie? }
/// Cualquier campo omitido (undefined/null) conserva su valor actual.
async function actualizar(req, res) {
  const { encabezadoImagenBase64, pieImagenBase64, textoEncabezado, textoPie } = req.body;

  // En la auditoría solo se anota QUÉ se cambió, no el contenido de las
  // imágenes en base64 (serían megabytes por fila y no aportan nada).
  if (req.auditoria) {
    req.auditoria.accion = 'actualizar_plantilla_reportes';
    req.auditoria.detalle = {
      cambioEncabezadoImagen: !!encabezadoImagenBase64,
      cambioPieImagen: !!pieImagenBase64,
      textoEncabezado: textoEncabezado ?? null,
      textoPie: textoPie ?? null,
    };
  }

  try {
    const result = await pool.query(
      `UPDATE configuracion_reportes SET
         encabezado_imagen_base64 = COALESCE($1, encabezado_imagen_base64),
         pie_imagen_base64 = COALESCE($2, pie_imagen_base64),
         texto_encabezado = COALESCE($3, texto_encabezado),
         texto_pie = COALESCE($4, texto_pie),
         actualizado_en = NOW()
       WHERE id = 1
       RETURNING *`,
      [encabezadoImagenBase64, pieImagenBase64, textoEncabezado, textoPie]
    );
    res.json({ success: true, data: result.rows[0] });
  } catch (err) {
    console.error('Error al actualizar plantilla de reportes:', err);
    res.status(500).json({ success: false });
  }
}

module.exports = { obtener, actualizar };
