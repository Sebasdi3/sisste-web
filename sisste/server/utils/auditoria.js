const auditPool = require('../db/auditoria.db');

/// Registra un evento en la base de datos de auditoría SEPARADA
/// (sigesot_audit). La tabla eventos_auditoria es de solo-inserción
/// (ver sql-auditoria/001_schema.sql): ni este código ni nadie con el
/// usuario de servicio puede editar o borrar un registro ya escrito.
///
/// "Fire and forget" con manejo de error NO silencioso: si falla el
/// registro, la operación real que lo originó (crear un usuario,
/// iniciar sesión, etc.) debe tener éxito igual — la auditoría nunca
/// debe tumbar una funcionalidad del sistema — pero el error SÍ se
/// imprime bien visible por consola (a diferencia de la versión
/// anterior), porque un fallo de auditoría es en sí mismo un evento de
/// seguridad que alguien debe poder notar.
///
/// Parámetros:
///   usuarioId — id en usuarios_auth, o null (ej. login fallido con
///               una cédula que no existe).
///   accion    — nombre corto y legible, ej. "login_exitoso",
///               "crear_usuario". Si el middleware global es quien
///               llama a esto (ver middleware/auditoria.middleware.js),
///               ya viene con un valor por defecto tipo
///               "POST /api/admin/roles" cuando ningún controller puso
///               uno más descriptivo.
///   opciones  — { rol, cedula, nombreActor, ip, userAgent, sessionId,
///                 metodoHttp, ruta, exito, statusHttp, detalle }
async function registrarEvento(usuarioId, accion, opciones = {}) {
  const {
    rol = null,
    cedula = null,
    nombreActor = null,
    ip = null,
    userAgent = null,
    sessionId = null,
    metodoHttp = null,
    ruta = null,
    exito = true,
    statusHttp = null,
    detalle = {},
  } = opciones;

  try {
    await auditPool.query(
      `INSERT INTO eventos_auditoria
         (usuario_id, cedula, rol, nombre_actor, accion, metodo_http, ruta,
          exito, status_http, ip_origen, user_agent, session_id, detalle)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
      [
        usuarioId || null, cedula, rol, nombreActor, accion, metodoHttp, ruta,
        exito, statusHttp, ip, userAgent, sessionId, JSON.stringify(detalle || {}),
      ]
    );
  } catch (err) {
    console.error(`❌ [AUDITORÍA] No se pudo registrar el evento "${accion}" (no bloqueante):`, err.message);
  }
}

module.exports = { registrarEvento };
