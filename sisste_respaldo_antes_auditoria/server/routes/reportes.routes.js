const express = require('express');
const router = express.Router();
const reportesController = require('../controllers/reportes.controller');
const { requierePermiso, requiereRol } = require('../middleware/auth.middleware');

router.get('/soportes', requierePermiso('ver_dashboard'), reportesController.reporteSoportes);
router.get('/tiempos', requierePermiso('ver_dashboard'), reportesController.reporteTiempos);
router.get('/cola-pendientes', requierePermiso('ver_dashboard'), reportesController.reporteColaPendientes);
router.get('/por-area', requierePermiso('ver_dashboard'), reportesController.reportePorArea);
router.get('/ranking-tecnicos', requierePermiso('ver_dashboard'), reportesController.reporteRankingTecnicos);

// La auditoría de acciones administrativas es sensible: solo admin.
router.get('/auditoria', requiereRol('admin'), reportesController.reporteAuditoria);

// Descarga en PDF de cualquiera de los reportes de arriba. La
// auditoría en PDF también se restringe a admin dentro del controller.
router.get('/pdf/:tipo', requierePermiso('ver_dashboard'), reportesController.descargarPDF);

module.exports = router;
