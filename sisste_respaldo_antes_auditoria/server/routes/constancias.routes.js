const express = require('express');
const router = express.Router();
const constanciasController = require('../controllers/constancias.controller');
const { requiereSesion, requierePermiso } = require('../middleware/auth.middleware');

// Cualquier sesión activa puede pedir ver si existe una constancia
// (el controller valida internamente que sea el dueño o personal técnico
// antes de dejar descargar el PDF real).
router.get('/:seguimiento', requiereSesion, constanciasController.existeConstancia);
router.get('/:seguimiento/pdf', requiereSesion, constanciasController.descargarConstanciaPDF);

module.exports = router;
