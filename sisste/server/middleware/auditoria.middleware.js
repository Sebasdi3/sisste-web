const { registrarEvento } = require('../utils/auditoria');

/// Middleware GLOBAL de auditoría (se monta en index.js justo después
/// de sessionMiddleware, antes de las rutas). Son dos piezas:
///
/// 1. capturarContexto — corre ANTES de las rutas. Calcula la IP real
///    una sola vez por petición y le da a los controllers un lugar
///    donde agregar detalle propio antes de responder
///    (req.auditoria.detalle), una etiqueta de acción más legible que
///    el valor por defecto (req.auditoria.accion), o —para logout,
///    donde la sesión ya no existirá cuando se registre el evento— un
///    snapshot manual del actor (req.auditoria.actorOverride).
///
/// 2. registrarAlFinalizar — corre cuando la respuesta YA se envió
///    (evento 'finish'), así se conoce el status HTTP final. Es lo que
///    efectivamente escribe en la base de auditoría, y lo hace para
///    TODA petición que modifique datos (POST/PUT/PATCH/DELETE), sin
///    que cada controller tenga que acordarse de llamarlo — así
///    "cubrir todo sin excepciones" no depende de que nadie lo olvide
///    en una ruta nueva el día de mañana.
///
/// Uso típico dentro de un controller (opcional, mejora el nombre y el
/// detalle del evento; si no se usa, igual se registra con valores
/// por defecto):
///
///   req.auditoria.accion = 'crear_usuario';
///   req.auditoria.detalle.usuarioCreadoId = nuevoId;

/// Obtiene la IP real del cliente. req.ip de Express ya respeta
/// X-Forwarded-For si `app.set('trust proxy', ...)` está activo (ver
/// index.js) — sin eso, detrás de un proxy inverso esto devolvería la
/// IP del proxy, no la del usuario final.
function obtenerIp(req) {
  return req.ip || req.socket?.remoteAddress || null;
}

function capturarContexto(req, res, next) {
  req.auditoria = {
    accion: null, // si queda null, registrarAlFinalizar pone el valor por defecto
    detalle: {},
    actorOverride: null, // { usuarioId, rol, nombre } — para casos como logout
    ip: obtenerIp(req),
    userAgent: req.headers['user-agent'] || null,
  };
  next();
}

// Solo estos métodos se auditan automáticamente: son los que cambian
// datos. Los GET normales (listar categorías, ver el dashboard, etc.)
// no generan una fila por defecto — de lo contrario cualquier lectura
// rutinaria de cualquier usuario inundaría la auditoría sin aportar
// valor de seguridad. Si algún GET puntual fuera sensible (ej. una
// descarga específica), el controller puede llamar registrarEvento()
// directamente para ese caso.
const METODOS_AUDITABLES = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

function registrarAlFinalizar(req, res, next) {
  res.on('finish', () => {
    if (!METODOS_AUDITABLES.has(req.method)) return;

    const ctx = req.auditoria || { detalle: {}, ip: obtenerIp(req), userAgent: req.headers['user-agent'] };
    const rutaBase = (req.baseUrl || '') + (req.route ? req.route.path : req.path);
    const accion = ctx.accion || `${req.method} ${rutaBase}`;

    const actor = ctx.actorOverride || {
      usuarioId: req.session?.userId || null,
      rol: req.session?.rol || null,
      nombre: req.session?.nombre || null,
    };

    registrarEvento(actor.usuarioId, accion, {
      rol: actor.rol,
      nombreActor: actor.nombre,
      ip: ctx.ip,
      userAgent: ctx.userAgent,
      sessionId: req.sessionID || null,
      metodoHttp: req.method,
      ruta: req.originalUrl,
      exito: res.statusCode < 400,
      statusHttp: res.statusCode,
      detalle: ctx.detalle,
    });
  });
  next();
}

module.exports = { capturarContexto, registrarAlFinalizar };
