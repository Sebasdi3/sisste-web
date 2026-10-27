/**
 * SISSTe - Servidor Backend
 * Versión: 6.1.0 (agrega auditoría global insert-only en base
 * separada: cubre inicios de sesión y toda acción que modifique
 * datos, con IP de origen, sin depender de que cada controller la
 * llame a mano)
 */

const express = require('express');
const cors = require('cors');
const path = require('path');

const sessionMiddleware = require('./config/session');
const { capturarContexto, registrarAlFinalizar } = require('./middleware/auditoria.middleware');

const authRoutes = require('./routes/auth.routes');
const solicitudesRoutes = require('./routes/solicitudes.routes');
const categoriasRoutes = require('./routes/categorias.routes');
const adminRoutes = require('./routes/admin.routes');
const statsRoutes = require('./routes/stats.routes');
const reportesRoutes = require('./routes/reportes.routes');
const constanciasRoutes = require('./routes/constancias.routes');

const app = express();
const PORT = process.env.PORT || 3000;

// Si el servidor corre detrás de un proxy inverso (nginx, etc.),
// descomenta la siguiente línea para que req.ip refleje la IP real del
// cliente (vía X-Forwarded-For) en vez de la IP del proxy. Déjala
// comentada si Node recibe las conexiones directamente.
// app.set('trust proxy', 1);

// =================================================
// 1. MIDDLEWARE GLOBAL
// =================================================
app.use(cors({ origin: true, credentials: true }));
// Límite ampliado: la carga masiva de usuarios puede enviar varios
// cientos de filas parseadas de Excel como JSON, superando el límite
// por defecto de Express (100kb).
app.use(express.json({ limit: '5mb' }));
app.use(sessionMiddleware);

// Auditoría global: capturarContexto calcula la IP y prepara
// req.auditoria ANTES de las rutas; registrarAlFinalizar escribe el
// evento en la base separada sigesot_audit CUANDO la respuesta ya se
// envió (así se conoce el status HTTP final). Cubre toda petición que
// modifique datos (POST/PUT/PATCH/DELETE) en cualquier ruta montada
// después de esta línea, incluido /api/login — sin excepciones y sin
// que cada controller tenga que llamarla a mano.
app.use(capturarContexto);
app.use(registrarAlFinalizar);

app.use((req, res, next) => {
  if (req.session.userId) {
    console.log(`[${new Date().toLocaleTimeString()}] Usuario activo: ${req.session.nombre} (${req.session.rol})`);
  }
  next();
});

// =================================================
// 2. ARCHIVOS ESTÁTICOS Y REDIRECCIÓN POR ROL
// =================================================
const publicPath = path.resolve(__dirname, '../public');
const appPath = path.resolve(__dirname, '../app');

app.use(express.static(publicPath));
app.use(express.static(appPath));

const REDIRECT_POR_ROL = {
  usuario: '/solicitud-panel.html',
  tecnico: '/dashboard-tecnico.html',
  admin: '/admin-users.html',
};

function redirectSiYaLogueado(req, res, next) {
  if (req.session.userId) {
    return res.redirect(REDIRECT_POR_ROL[req.session.rol] || '/solicitud-panel.html');
  }
  next();
}

app.get(['/', '/login.html'], redirectSiYaLogueado, (req, res) => {
  res.sendFile(path.join(appPath, 'login.html'));
});

// =================================================
// 3. API
// =================================================
app.use('/api', authRoutes);
app.use('/api/solicitudes', solicitudesRoutes);
app.use('/api/categorias', categoriasRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/stats', statsRoutes);
app.use('/api/reportes', reportesRoutes);
app.use('/api/constancias', constanciasRoutes);

// =================================================
// 4. MANEJO DE ERRORES NO CAPTURADOS
// =================================================
app.use((err, req, res, next) => {
  console.error('Error no manejado:', err);
  res.status(500).json({ success: false, message: 'Error interno del servidor.' });
});

app.listen(PORT, '0.0.0.0', () => console.log(`🚀 SISSTe operativo en puerto ${PORT}`));
