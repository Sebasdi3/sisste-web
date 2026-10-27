const pool = require('../db/db.config');
const crypto = require('crypto');

/// POST /api/solicitudes
/// Body: { categoriaId, subcategoriaId, detalleTexto?, comentario }
/// userId sale de la sesión, NUNCA del body (evita que alguien cree
/// solicitudes a nombre de otro usuario).
///
/// Formato del folio (seguimiento): categoríaId + subcategoríaId (0 si
/// no aplica) + id del usuario que solicita (orden de registro, ya que
/// usuarios_auth.id es autoincremental) + id global del ticket (también
/// autoincremental, único en todo el sistema). Ej: categoría 4,
/// subcategoría 6, usuario #25, ticket #7 -> "462507".
///
/// El id del ticket no se conoce hasta después del INSERT, así que
/// insertamos con un valor temporal único (UUID, nunca choca con otro
/// concurrente) y luego actualizamos con el folio real ya calculado,
/// todo dentro de la misma transacción.
async function crear(req, res) {
  const { categoriaId, subcategoriaId, detalleTexto, comentario } = req.body;
  const solicitanteId = req.session.userId;
  if (req.auditoria) { req.auditoria.accion = 'crear_solicitud'; req.auditoria.detalle = { categoriaId, subcategoriaId: subcategoriaId || null }; }

  if (!categoriaId) {
    return res.status(400).json({ success: false, message: 'La categoría es requerida.' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Placeholder corto (no un UUID completo de 36 caracteres, que
    // llegó a superar el límite de la columna) pero igual de único en
    // la práctica: timestamp en base36 + 6 caracteres aleatorios.
    const placeholder = `tmp_${Date.now().toString(36)}${crypto.randomBytes(4).toString('hex')}`;

    const insertResult = await client.query(
      `INSERT INTO solicitudes_v2
         (seguimiento, solicitante_id, categoria_id, subcategoria_id, detalle_texto, comentario, estado)
       VALUES ($1, $2, $3, $4, $5, $6, 'en_espera')
       RETURNING id`,
      [placeholder, solicitanteId, categoriaId, subcategoriaId || null, detalleTexto || null, comentario || null]
    );

    const nuevoId = insertResult.rows[0].id;
    const folio = `${categoriaId}${subcategoriaId || 0}${solicitanteId}${nuevoId}`;

    await client.query('UPDATE solicitudes_v2 SET seguimiento = $1 WHERE id = $2', [folio, nuevoId]);

    const nuevaSolicitud = { id: nuevoId, seguimiento: folio };

    await client.query(
      `INSERT INTO historial_estados (solicitud_id, estado_anterior, estado_nuevo, usuario_id)
       VALUES ($1, NULL, 'en_espera', $2)`,
      [nuevaSolicitud.id, solicitanteId]
    );

    await client.query('COMMIT');
    if (req.auditoria) req.auditoria.detalle.seguimiento = folio;
    res.json({ success: true, seguimiento: nuevaSolicitud.seguimiento });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Error al crear solicitud:', err);
    res.status(500).json({ success: false });
  } finally {
    client.release();
  }
}

/// GET /api/solicitudes — listado con filtros (igual comportamiento
/// que la versión anterior, pero sobre el esquema nuevo).
async function listar(req, res) {
  try {
    const { userId, estado, tecnicoId, desde, hasta, buscar, pagina = 1 } = req.query;
    const limite = req.query.limite ? parseInt(req.query.limite, 10) : 5000;
    const offset = (parseInt(pagina, 10) - 1) * limite;

    const condiciones = [];
    const params = [];

    if (userId) {
      params.push(userId);
      condiciones.push(`s.solicitante_id = $${params.length}`);
    }
    if (estado && estado !== 'todas' && estado !== 'todos') {
      if (estado === 'pendientes') {
        condiciones.push(`s.estado IN ('en_espera', 'en_proceso')`);
      } else {
        params.push(estado);
        condiciones.push(`s.estado = $${params.length}`);
      }
    }
    if (tecnicoId) {
      params.push(tecnicoId);
      condiciones.push(`s.tecnico_id = $${params.length}`);
    }
    if (desde && hasta) {
      params.push(desde, hasta);
      condiciones.push(`s.fecha_creacion::date BETWEEN $${params.length - 1} AND $${params.length}`);
    }
    if (buscar && buscar.trim() !== '') {
      params.push(`%${buscar}%`);
      condiciones.push(`(s.seguimiento ILIKE $${params.length} OR pu.nombre ILIKE $${params.length})`);
    }

    const whereClause = condiciones.length > 0 ? ' WHERE ' + condiciones.join(' AND ') : '';

    const countQuery = `
      SELECT COUNT(*) FROM solicitudes_v2 s
      JOIN usuarios_auth ua ON s.solicitante_id = ua.id
      LEFT JOIN perfil_usuario_estandar pu ON pu.usuario_id = ua.id
      ${whereClause}`;
    const countResult = await pool.query(countQuery, params);
    const total = parseInt(countResult.rows[0].count, 10);

    const dataParams = [...params, limite, offset];
    const dataQuery = `
      SELECT
        s.id, s.seguimiento, s.detalle_texto, s.comentario, s.estado,
        s.fecha_creacion, s.fecha_actualizacion,
        c.nombre AS categoria_nombre, sc.nombre AS subcategoria_nombre,
        pu.nombre AS solicitante_nombre, pu.apellido AS solicitante_apellido,
        pu.area AS solicitante_area, pu.piso AS solicitante_piso,
        ua.cedula AS solicitante_cedula,
        pt.nombre AS tecnico_nombre, pt.apellido AS tecnico_apellido
      FROM solicitudes_v2 s
      JOIN usuarios_auth ua ON s.solicitante_id = ua.id
      LEFT JOIN perfil_usuario_estandar pu ON pu.usuario_id = ua.id
      LEFT JOIN categorias c ON c.id = s.categoria_id
      LEFT JOIN subcategorias sc ON sc.id = s.subcategoria_id
      LEFT JOIN usuarios_auth ta ON s.tecnico_id = ta.id
      LEFT JOIN perfil_tecnico pt ON pt.usuario_id = ta.id
      ${whereClause}
      ORDER BY s.fecha_creacion DESC
      LIMIT $${dataParams.length - 1} OFFSET $${dataParams.length}`;

    const result = await pool.query(dataQuery, dataParams);
    res.json({ success: true, data: result.rows, total, paginas: Math.ceil(total / limite) || 1 });
  } catch (err) {
    console.error('Error al listar solicitudes:', err);
    res.status(500).json({ success: false, data: [], error: err.message });
  }
}

/// Cambia el estado de una solicitud y registra el cambio en el
/// historial (fecha/hora + quién lo hizo).
async function cambiarEstado(seguimiento, nuevoEstado, req, res, camposExtra = {}) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const actual = await client.query('SELECT id, estado FROM solicitudes_v2 WHERE seguimiento = $1', [seguimiento]);
    if (actual.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ success: false, message: 'Solicitud no encontrada.' });
    }

    const { id, estado: estadoAnterior } = actual.rows[0];
    const setClauses = ['estado = $1', 'fecha_actualizacion = NOW()'];
    const params = [nuevoEstado];

    if (camposExtra.tecnicoId) {
      params.push(camposExtra.tecnicoId);
      setClauses.push(`tecnico_id = $${params.length}`);
    }
    params.push(id);

    await client.query(`UPDATE solicitudes_v2 SET ${setClauses.join(', ')} WHERE id = $${params.length}`, params);

    await client.query(
      `INSERT INTO historial_estados (solicitud_id, estado_anterior, estado_nuevo, usuario_id)
       VALUES ($1, $2, $3, $4)`,
      [id, estadoAnterior, nuevoEstado, req.session.userId]
    );

    await client.query('COMMIT');
    if (req.auditoria) req.auditoria.detalle = { seguimiento, estadoAnterior, estadoNuevo: nuevoEstado, tecnicoId: camposExtra.tecnicoId || null };
    res.json({ success: true });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Error al cambiar estado:', err);
    res.status(500).json({ success: false });
  } finally {
    client.release();
  }
}

async function aceptar(req, res) {
  const { tecnicoId } = req.body;
  if (req.auditoria) req.auditoria.accion = 'aceptar_solicitud';
  await cambiarEstado(req.params.seguimiento, 'en_proceso', req, res, { tecnicoId });
}

async function finalizar(req, res) {
  if (req.auditoria) req.auditoria.accion = 'finalizar_solicitud';
  await cambiarEstado(req.params.seguimiento, 'atendida', req, res);
}

/// GET /api/solicitudes/:seguimiento/historial — trazabilidad completa.
async function historial(req, res) {
  try {
    const result = await pool.query(
      `SELECT h.estado_anterior, h.estado_nuevo, h.fecha_hora,
              COALESCE(pu.nombre, pt.nombre, pa.nombre) AS usuario_nombre
       FROM historial_estados h
       JOIN solicitudes_v2 s ON s.id = h.solicitud_id
       LEFT JOIN perfil_usuario_estandar pu ON pu.usuario_id = h.usuario_id
       LEFT JOIN perfil_tecnico pt ON pt.usuario_id = h.usuario_id
       LEFT JOIN perfil_admin pa ON pa.usuario_id = h.usuario_id
       WHERE s.seguimiento = $1
       ORDER BY h.fecha_hora ASC`,
      [req.params.seguimiento]
    );
    res.json({ success: true, data: result.rows });
  } catch (err) {
    console.error('Error al obtener historial:', err);
    res.status(500).json({ success: false, data: [] });
  }
}

module.exports = { crear, listar, aceptar, finalizar, historial };
