const pool = require('../db/db.config');

async function listar(req, res) {
  try {
    const result = await pool.query(
      `SELECT p.*, COALESCE(pu.nombre, pt.nombre, pa.nombre, pp.nombre) AS eliminado_por_nombre
       FROM papelera p
       LEFT JOIN perfil_usuario_estandar pu ON pu.usuario_id = p.eliminado_por
       LEFT JOIN perfil_tecnico pt ON pt.usuario_id = p.eliminado_por
       LEFT JOIN perfil_admin pa ON pa.usuario_id = p.eliminado_por
       LEFT JOIN perfil_personalizado pp ON pp.usuario_id = p.eliminado_por
       ORDER BY p.fecha_eliminacion DESC`
    );
    res.json({ success: true, data: result.rows });
  } catch (err) {
    console.error('Error al listar papelera:', err);
    res.status(500).json({ success: false, data: [] });
  }
}

/// Restaura un elemento de la papelera a su tabla original.
/// Solo soporta las tablas de "lista simple" y roles_personalizados
/// por ahora (son inserts directos sin relaciones complejas).
const TABLAS_RESTAURABLES = {
  areas_departamento: ['nombre', 'activo', 'orden'],
  cargos: ['nombre', 'activo', 'orden'],
  pisos: ['nombre', 'activo', 'orden'],
  rol_personalizado: null, // caso especial, ver abajo
};

async function restaurar(req, res) {
  const { id } = req.params;
  if (req.auditoria) { req.auditoria.accion = 'restaurar_papelera'; req.auditoria.detalle = { papeleraId: id }; }
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const item = await client.query('SELECT * FROM papelera WHERE id = $1', [id]);
    if (item.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ success: false, message: 'Elemento no encontrado en la papelera.' });
    }

    const { tipo_elemento: tipo, datos } = item.rows[0];
    if (req.auditoria) req.auditoria.detalle = { papeleraId: id, tipoElemento: tipo, datos };

    if (!(tipo in TABLAS_RESTAURABLES)) {
      await client.query('ROLLBACK');
      return res.status(400).json({ success: false, message: `No se sabe restaurar el tipo "${tipo}".` });
    }

    if (tipo === 'rol_personalizado') {
      await client.query(
        `INSERT INTO roles_personalizados (clave, nombre_mostrar, permisos, activo)
         VALUES ($1, $2, $3, $4) ON CONFLICT (clave) DO NOTHING`,
        [datos.clave, datos.nombre_mostrar, JSON.stringify(datos.permisos || []), datos.activo]
      );
    } else {
      const columnas = TABLAS_RESTAURABLES[tipo];
      const valores = columnas.map((c) => datos[c]);
      const placeholders = columnas.map((_, i) => `$${i + 1}`).join(', ');
      await client.query(
        `INSERT INTO ${tipo} (${columnas.join(', ')}) VALUES (${placeholders}) ON CONFLICT (nombre) DO NOTHING`,
        valores
      );
    }

    await client.query('DELETE FROM papelera WHERE id = $1', [id]);
    await client.query('COMMIT');
    res.json({ success: true });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Error al restaurar de papelera:', err);
    res.status(500).json({ success: false });
  } finally {
    client.release();
  }
}

/// Elimina permanentemente (sin posibilidad de restaurar). Como este
/// borrado sí destruye el dato original para siempre, se guarda en la
/// auditoría un snapshot completo de lo eliminado — es el único rastro
/// que queda de ese elemento.
async function eliminarPermanente(req, res) {
  if (req.auditoria) { req.auditoria.accion = 'eliminar_permanente_papelera'; req.auditoria.detalle = { papeleraId: req.params.id }; }
  try {
    const previo = await pool.query('SELECT tipo_elemento, datos FROM papelera WHERE id = $1', [req.params.id]);
    if (previo.rows.length > 0 && req.auditoria) {
      req.auditoria.detalle = { papeleraId: req.params.id, tipoElemento: previo.rows[0].tipo_elemento, datos: previo.rows[0].datos };
    }
    await pool.query('DELETE FROM papelera WHERE id = $1', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    console.error('Error al eliminar de papelera:', err);
    res.status(500).json({ success: false });
  }
}

module.exports = { listar, restaurar, eliminarPermanente };
