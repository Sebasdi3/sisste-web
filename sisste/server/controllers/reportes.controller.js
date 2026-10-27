const pool = require('../db/db.config');
const auditPool = require('../db/auditoria.db');
const { registrarEvento } = require('../utils/auditoria');
const { generarPDFReporte } = require('../utils/pdfReportes');

/* =====================================================================
   Funciones de obtención de datos — separadas de los handlers HTTP
   para poder reusarlas tanto en las respuestas JSON como en el PDF.
   ===================================================================== */

async function obtenerDatosSoportes(desde, hasta) {
  const totalResult = await pool.query(
    `SELECT COUNT(*) AS total FROM solicitudes_v2
     WHERE estado = 'atendida' AND fecha_actualizacion::date BETWEEN $1 AND $2`,
    [desde, hasta]
  );
  const porTecnicoResult = await pool.query(
    `SELECT COALESCE(pt.nombre || ' ' || pt.apellido, 'Sin asignar') AS tecnico, COUNT(*) AS cantidad
     FROM solicitudes_v2 s
     LEFT JOIN perfil_tecnico pt ON pt.usuario_id = s.tecnico_id
     WHERE s.estado = 'atendida' AND s.fecha_actualizacion::date BETWEEN $1 AND $2
     GROUP BY tecnico ORDER BY cantidad DESC`,
    [desde, hasta]
  );
  const porCategoriaResult = await pool.query(
    `SELECT COALESCE(c.nombre, 'Sin categoría') AS categoria, COUNT(*) AS cantidad
     FROM solicitudes_v2 s
     LEFT JOIN categorias c ON c.id = s.categoria_id
     WHERE s.estado = 'atendida' AND s.fecha_actualizacion::date BETWEEN $1 AND $2
     GROUP BY categoria ORDER BY cantidad DESC`,
    [desde, hasta]
  );
  return {
    total: parseInt(totalResult.rows[0].total, 10),
    porTecnico: porTecnicoResult.rows.map((r) => ({ tecnico: r.tecnico, cantidad: parseInt(r.cantidad, 10) })),
    porCategoria: porCategoriaResult.rows.map((r) => ({ categoria: r.categoria, cantidad: parseInt(r.cantidad, 10) })),
  };
}

async function obtenerDatosTiempos(desde, hasta) {
  const result = await pool.query(
    `WITH tiempos AS (
       SELECT
         s.id, s.fecha_creacion,
         (SELECT MIN(h.fecha_hora) FROM historial_estados h WHERE h.solicitud_id = s.id AND h.estado_nuevo = 'en_proceso') AS fecha_aceptado,
         (SELECT MIN(h.fecha_hora) FROM historial_estados h WHERE h.solicitud_id = s.id AND h.estado_nuevo = 'atendida') AS fecha_resuelto
       FROM solicitudes_v2 s
       WHERE s.fecha_creacion::date BETWEEN $1 AND $2
     )
     SELECT
       COUNT(*) AS total_tickets,
       COUNT(fecha_aceptado) AS total_aceptados,
       COUNT(fecha_resuelto) AS total_resueltos,
       AVG(EXTRACT(EPOCH FROM (fecha_aceptado - fecha_creacion)) / 3600) AS horas_promedio_aceptar,
       AVG(EXTRACT(EPOCH FROM (fecha_resuelto - fecha_creacion)) / 3600) AS horas_promedio_resolver
     FROM tiempos`,
    [desde, hasta]
  );
  const row = result.rows[0];
  return {
    totalTickets: parseInt(row.total_tickets, 10),
    totalAceptados: parseInt(row.total_aceptados, 10),
    totalResueltos: parseInt(row.total_resueltos, 10),
    horasPromedioAceptar: row.horas_promedio_aceptar !== null ? parseFloat(row.horas_promedio_aceptar).toFixed(1) : null,
    horasPromedioResolver: row.horas_promedio_resolver !== null ? parseFloat(row.horas_promedio_resolver).toFixed(1) : null,
  };
}

async function obtenerDatosColaPendientes() {
  const result = await pool.query(
    `SELECT s.id, s.seguimiento, s.estado, s.fecha_creacion,
            EXTRACT(DAY FROM (NOW() - s.fecha_creacion)) AS dias_abierto,
            COALESCE(c.nombre, 'Sin categoría') AS categoria_nombre
     FROM solicitudes_v2 s
     LEFT JOIN categorias c ON c.id = s.categoria_id
     WHERE s.estado IN ('en_espera', 'en_proceso')
     ORDER BY s.fecha_creacion ASC`
  );
  const filas = result.rows.map((r) => ({ ...r, dias_abierto: parseInt(r.dias_abierto, 10) }));
  const buckets = { hoy: 0, unoATres: 0, tresASiete: 0, masDeSiete: 0 };
  filas.forEach((f) => {
    if (f.dias_abierto <= 1) buckets.hoy++;
    else if (f.dias_abierto <= 3) buckets.unoATres++;
    else if (f.dias_abierto <= 7) buckets.tresASiete++;
    else buckets.masDeSiete++;
  });
  return { total: filas.length, buckets, masAntiguos: filas.slice(0, 10) };
}

async function obtenerDatosPorArea(desde, hasta) {
  const result = await pool.query(
    `SELECT COALESCE(pu.area, 'Sin área') AS area, COUNT(*) AS cantidad
     FROM solicitudes_v2 s
     JOIN usuarios_auth ua ON ua.id = s.solicitante_id
     LEFT JOIN perfil_usuario_estandar pu ON pu.usuario_id = ua.id
     WHERE s.fecha_creacion::date BETWEEN $1 AND $2
     GROUP BY area ORDER BY cantidad DESC`,
    [desde, hasta]
  );
  return { porArea: result.rows.map((r) => ({ area: r.area, cantidad: parseInt(r.cantidad, 10) })) };
}

async function obtenerDatosRankingTecnicos(desde, hasta) {
  const result = await pool.query(
    `WITH tiempos AS (
       SELECT s.id, s.tecnico_id, s.fecha_creacion,
         (SELECT MIN(h.fecha_hora) FROM historial_estados h WHERE h.solicitud_id = s.id AND h.estado_nuevo = 'atendida') AS fecha_resuelto
       FROM solicitudes_v2 s
       WHERE s.estado = 'atendida' AND s.fecha_actualizacion::date BETWEEN $1 AND $2
     )
     SELECT COALESCE(pt.nombre || ' ' || pt.apellido, 'Sin asignar') AS tecnico,
       COUNT(*) AS cantidad,
       AVG(EXTRACT(EPOCH FROM (fecha_resuelto - fecha_creacion)) / 3600) AS horas_promedio
     FROM tiempos t
     LEFT JOIN perfil_tecnico pt ON pt.usuario_id = t.tecnico_id
     GROUP BY tecnico ORDER BY cantidad DESC`,
    [desde, hasta]
  );
  return {
    ranking: result.rows.map((r) => ({
      tecnico: r.tecnico,
      cantidad: parseInt(r.cantidad, 10),
      horasPromedio: r.horas_promedio !== null ? parseFloat(r.horas_promedio).toFixed(1) : null,
    })),
  };
}

/// Lee de la base de datos de auditoría SEPARADA (sigesot_audit). Ya
/// no hace JOIN con las tablas de perfil: eventos_auditoria guarda un
/// snapshot de texto (nombre_actor, cedula, rol) tomado al momento del
/// evento, y las bases son distintas a propósito (no se pueden cruzar).
async function obtenerDatosAuditoria(desde, hasta) {
  const result = await auditPool.query(
    `SELECT id, fecha_hora, usuario_id, cedula, rol, nombre_actor, accion,
            metodo_http, ruta, exito, status_http, host(ip_origen) AS ip_origen, detalle
     FROM eventos_auditoria
     WHERE fecha_hora::date BETWEEN $1 AND $2
     ORDER BY fecha_hora DESC`,
    [desde, hasta]
  );
  return { data: result.rows };
}

/// Consultar o descargar la auditoría es en sí mismo un acto sensible
/// (¿quién estuvo mirando el registro?). Como son GET y el middleware
/// global solo audita POST/PUT/PATCH/DELETE, se registra a mano.
function registrarConsultaAuditoria(req, accion, detalle) {
  registrarEvento(req.session?.userId || null, accion, {
    rol: req.session?.rol || null,
    nombreActor: req.session?.nombre || null,
    ip: req.auditoria?.ip || req.ip || null,
    userAgent: req.auditoria?.userAgent || req.headers['user-agent'] || null,
    sessionId: req.sessionID || null,
    metodoHttp: req.method,
    ruta: req.originalUrl,
    exito: true,
    statusHttp: 200,
    detalle,
  });
}

/* =====================================================================
   Handlers HTTP (respuestas JSON, para la vista en pantalla)
   ===================================================================== */

function requiereRangoFechas(req, res) {
  const { desde, hasta } = req.query;
  if (!desde || !hasta) {
    res.status(400).json({ success: false, message: 'Los parámetros "desde" y "hasta" son requeridos.' });
    return null;
  }
  return { desde, hasta };
}

async function reporteSoportes(req, res) {
  const rango = requiereRangoFechas(req, res);
  if (!rango) return;
  try {
    const data = await obtenerDatosSoportes(rango.desde, rango.hasta);
    res.json({ success: true, ...data });
  } catch (err) {
    console.error('Error al generar reporte de soportes:', err);
    res.status(500).json({ success: false });
  }
}

async function reporteTiempos(req, res) {
  const rango = requiereRangoFechas(req, res);
  if (!rango) return;
  try {
    const data = await obtenerDatosTiempos(rango.desde, rango.hasta);
    res.json({ success: true, ...data });
  } catch (err) {
    console.error('Error al generar reporte de tiempos:', err);
    res.status(500).json({ success: false });
  }
}

async function reporteColaPendientes(req, res) {
  try {
    const data = await obtenerDatosColaPendientes();
    res.json({ success: true, ...data });
  } catch (err) {
    console.error('Error al generar reporte de cola pendiente:', err);
    res.status(500).json({ success: false });
  }
}

async function reportePorArea(req, res) {
  const rango = requiereRangoFechas(req, res);
  if (!rango) return;
  try {
    const data = await obtenerDatosPorArea(rango.desde, rango.hasta);
    res.json({ success: true, ...data });
  } catch (err) {
    console.error('Error al generar reporte por área:', err);
    res.status(500).json({ success: false });
  }
}

async function reporteRankingTecnicos(req, res) {
  const rango = requiereRangoFechas(req, res);
  if (!rango) return;
  try {
    const data = await obtenerDatosRankingTecnicos(rango.desde, rango.hasta);
    res.json({ success: true, ...data });
  } catch (err) {
    console.error('Error al generar ranking de técnicos:', err);
    res.status(500).json({ success: false });
  }
}

async function reporteAuditoria(req, res) {
  const rango = requiereRangoFechas(req, res);
  if (!rango) return;
  try {
    const data = await obtenerDatosAuditoria(rango.desde, rango.hasta);
    registrarConsultaAuditoria(req, 'consultar_auditoria', { desde: rango.desde, hasta: rango.hasta, filas: data.data.length });
    res.json({ success: true, ...data });
  } catch (err) {
    console.error('Error al generar reporte de auditoría:', err);
    res.status(500).json({ success: false, data: [] });
  }
}

/* =====================================================================
   Descarga en PDF — GET /api/reportes/pdf/:tipo?desde&hasta
   Reusa las mismas funciones de obtención de datos de arriba.
   ===================================================================== */
async function descargarPDF(req, res) {
  const { tipo } = req.params;
  const { desde, hasta } = req.query;

  if (tipo === 'auditoria' && req.session.rol !== 'admin') {
    return res.status(403).json({ success: false, message: 'Solo administradores pueden descargar este reporte.' });
  }
  if (tipo !== 'cola' && (!desde || !hasta)) {
    return res.status(400).json({ success: false, message: 'Los parámetros "desde" y "hasta" son requeridos.' });
  }

  try {
    let datos;
    switch (tipo) {
      case 'soportes': datos = await obtenerDatosSoportes(desde, hasta); break;
      case 'tiempos': datos = await obtenerDatosTiempos(desde, hasta); break;
      case 'cola': datos = await obtenerDatosColaPendientes(); break;
      case 'area': datos = await obtenerDatosPorArea(desde, hasta); break;
      case 'ranking': datos = await obtenerDatosRankingTecnicos(desde, hasta); break;
      case 'auditoria':
        datos = await obtenerDatosAuditoria(desde, hasta);
        registrarConsultaAuditoria(req, 'descargar_auditoria_pdf', { desde, hasta, filas: datos.data.length });
        break;
      default:
        return res.status(400).json({ success: false, message: 'Tipo de reporte inválido.' });
    }
    await generarPDFReporte(tipo, datos, desde, hasta, res);
  } catch (err) {
    console.error('Error al generar PDF de reporte:', err);
    if (!res.headersSent) res.status(500).json({ success: false, message: 'No se pudo generar el PDF.' });
  }
}

module.exports = {
  reporteSoportes,
  reporteTiempos,
  reporteColaPendientes,
  reportePorArea,
  reporteRankingTecnicos,
  reporteAuditoria,
  descargarPDF,
};
