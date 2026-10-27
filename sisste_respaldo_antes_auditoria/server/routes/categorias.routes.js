const express = require('express');
const router = express.Router();
const categoriasController = require('../controllers/categorias.controller');
const { requiereSesion } = require('../middleware/auth.middleware');

// Cualquier usuario con sesión activa puede leer las categorías
// activas — es lo que pinta el formulario dinámico.
router.get('/', requiereSesion, categoriasController.listarActivas);

module.exports = router;
