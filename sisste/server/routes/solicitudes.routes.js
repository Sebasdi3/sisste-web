const express = require('express');
const router = express.Router();
const solicitudesController = require('../controllers/solicitudes.controller');
const constanciasController = require('../controllers/constancias.controller');
const { requiereSesion, requierePermiso } = require('../middleware/auth.middleware');

router.get('/', requierePermiso('ver_solicitudes'), solicitudesController.listar);
router.post('/', requiereSesion, solicitudesController.crear); // crear solicitud: cualquier sesión activa, no requiere permiso especial
router.get('/:seguimiento/historial', requiereSesion, solicitudesController.historial);
router.put('/:seguimiento/aceptar', requierePermiso('gestionar_tickets'), solicitudesController.aceptar);
router.put('/:seguimiento/finalizar', requierePermiso('gestionar_tickets'), solicitudesController.finalizar);

// Finalizar generando la Constancia de Soporte Técnico (diagnóstico,
// recomendaciones y equipos atendidos). Reemplaza al /finalizar simple
// para el flujo normal del técnico desde el dashboard.
router.put('/:seguimiento/finalizar-con-constancia', requierePermiso('gestionar_tickets'), constanciasController.finalizarConConstancia);

module.exports = router;
