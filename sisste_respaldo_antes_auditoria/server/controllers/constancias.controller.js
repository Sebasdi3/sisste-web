const pool = require('../db/db.config');
const { generarPDFConstancia } = require('../utils/pdfConstancia');

/// PUT /api/solicitudes/:seguimiento/finalizar-con-constancia
/// Body: { diagnostico, recomendaciones, equipos: [{tipoEquipo,marca,modelo,numeroBien,serial}, ...] }
///
/// Reemplaza al PUT /finalizar simple para técnicos: además de marcar
/// la solicitud como 'atendida', genera la Constancia de Soporte
/// Técnico correspondiente con un snapshot de todos los datos
/// relevantes (para que no cambie si después se edita la categoría,
/// el usuario, etc.), y guarda los equipos atendidos.
async function finalizarConConstancia(req, res) {
  const { seguimiento } = req.params;
  const { diagnostico, recomendaciones, equipos } = req.body;
  if (req.auditoria) {
    req.auditoria.accion = 'finalizar_con_constancia';
    req.auditoria.detalle = { seguimiento, cantidadEquipos: Array.isArray(equipos) ? equipos.length : 0 };
  }

  if (!diagnostico || !diagnostico.trim()) {
    return res.status(400).json({ success: false, message: 'El diagnóstico es requerido.' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const solicitudResult = await client.query(
      `SELECT s.id, s.estado, s.tecnico_id, s.solicitante_id,
              c.nombre AS categoria_nombre, c.tipo_constancia,
              sc.nombre AS subcategoria_nombre,
              pu.nombre AS solicitante_nombre, pu.apellido AS solicitante_apellido,
              ua.cedula AS solicitante_cedula, pu.area AS solicitante_area,
              pu.piso AS solicitante_piso, pu.cargo AS solicitante_cargo
       FROM solicitudes_v2 s
       JOIN usuarios_auth ua ON ua.id = s.solicitante_id
       LEFT JOIN perfil_usuario_estandar pu ON pu.usuario_id = ua.id
       LEFT JOIN categorias c ON c.id = s.categoria_id
       LEFT JOIN subcategorias sc ON sc.id = s.subcategoria_id
       WHERE s.seguimiento = $1
       FOR UPDATE OF s`,
      [seguimiento]
    );

    if (solicitudResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ success: false, message: 'Solicitud no encontrada.' });
    }
    const sol = solicitudResult.rows[0];

    const tecnicoId = req.body.tecnicoId || sol.tecnico_id || req.session.userId;
    const tecnicoResult = await client.query(
      `SELECT pt.nombre, pt.apellido, ua.cedula
       FROM perfil_tecnico pt JOIN usuarios_auth ua ON ua.id = pt.usuario_id
       WHERE pt.usuario_id = $1`,
      [tecnicoId]
    );
    const tecnico = tecnicoResult.rows[0] || {};

    // 1. Actualizar la solicitud a "atendida" (+ historial de estado).
    await client.query(
      `UPDATE solicitudes_v2 SET estado = 'atendida', tecnico_id = $1, fecha_actualizacion = NOW() WHERE id = $2`,
      [tecnicoId, sol.id]
    );
    await client.query(
      `INSERT INTO historial_estados (solicitud_id, estado_anterior, estado_nuevo, usuario_id)
       VALUES ($1, $2, 'atendida', $3)`,
      [sol.id, sol.estado, req.session.userId]
    );

    // 2. Crear la constancia (snapshot de todos los datos).
    const numeroDocumento = `CST-${seguimiento}-${new Date().getFullYear()}`;
    const constanciaResult = await client.query(
      `INSERT INTO constancias
         (solicitud_id, numero_documento, solicitante_nombre, solicitante_apellido,
          solicitante_cedula, solicitante_area, solicitante_piso, solicitante_cargo,
          tecnico_id, tecnico_nombre, tecnico_apellido, tecnico_cedula,
          categoria_nombre, subcategoria_nombre, tipo_constancia,
          diagnostico, recomendaciones)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
       RETURNING id`,
      [
        sol.id, numeroDocumento, sol.solicitante_nombre, sol.solicitante_apellido,
        sol.solicitante_cedula, sol.solicitante_area, sol.solicitante_piso, sol.solicitante_cargo,
        tecnicoId, tecnico.nombre || null, tecnico.apellido || null, tecnico.cedula || null,
        sol.categoria_nombre, sol.subcategoria_nombre, sol.tipo_constancia,
        diagnostico.trim(), (recomendaciones || '').trim() || null,
      ]
    );
    const constanciaId = constanciaResult.rows[0].id;

    // 3. Guardar los equipos atendidos.
    const listaEquipos = Array.isArray(equipos) ? equipos : [];
    for (const eq of listaEquipos) {
      await client.query(
        `INSERT INTO constancia_equipos (constancia_id, tipo_equipo, marca, modelo, numero_bien, serial)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [constanciaId, eq.tipoEquipo || null, eq.marca || null, eq.modelo || null, eq.numeroBien || null, eq.serial || null]
      );
    }

    await client.query('COMMIT');
    if (req.auditoria) req.auditoria.detalle.numeroDocumento = numeroDocumento;
    res.json({ success: true, numeroDocumento });
  } catch (err) {
    await client.query('ROLLBACK');
    if (err.code === '23505') {
      return res.status(409).json({ success: false, message: 'Esta solicitud ya tiene una constancia generada.' });
    }
    console.error('Error al finalizar con constancia:', err);
    res.status(500).json({ success: false, error: err.message });
  } finally {
    client.release();
  }
}

/// GET /api/constancias/:seguimiento/pdf
/// El solicitante (dueño de la solicitud), el técnico, o un admin
/// pueden descargarla.
async function descargarConstanciaPDF(req, res) {
  const { seguimiento } = req.params;

  try {
    const result = await pool.query(
      `SELECT c.*, s.solicitante_id
       FROM constancias c
       JOIN solicitudes_v2 s ON s.id = c.solicitud_id
       WHERE s.seguimiento = $1`,
      [seguimiento]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'No existe una constancia para esta solicitud.' });
    }
    const constancia = result.rows[0];

    const rol = req.session.rol;
    const esDueño = constancia.solicitante_id === req.session.userId;
    const esPersonalTecnico = rol === 'admin' || rol === 'tecnico';
    if (!esDueño && !esPersonalTecnico) {
      return res.status(403).json({ success: false, message: 'No autorizado para ver esta constancia.' });
    }

    const equiposResult = await pool.query(
      'SELECT tipo_equipo, marca, modelo, numero_bien, serial FROM constancia_equipos WHERE constancia_id = $1 ORDER BY id',
      [constancia.id]
    );

    await generarPDFConstancia(constancia, equiposResult.rows, res);
  } catch (err) {
    console.error('Error al generar PDF de constancia:', err);
    if (!res.headersSent) res.status(500).json({ success: false, message: 'No se pudo generar la constancia.' });
  }
}

/// GET /api/constancias/:seguimiento — para saber si ya existe (sin
/// descargar el PDF), usado por el frontend para mostrar/ocultar el
/// botón de descarga.
async function existeConstancia(req, res) {
  try {
    const result = await pool.query(
      `SELECT c.numero_documento FROM constancias c
       JOIN solicitudes_v2 s ON s.id = c.solicitud_id
       WHERE s.seguimiento = $1`,
      [req.params.seguimiento]
    );
    res.json({ success: true, existe: result.rows.length > 0, numeroDocumento: result.rows[0]?.numero_documento || null });
  } catch (err) {
    console.error('Error al verificar constancia:', err);
    res.status(500).json({ success: false, existe: false });
  }
}

module.exports = { finalizarConConstancia, descargarConstanciaPDF, existeConstancia };
