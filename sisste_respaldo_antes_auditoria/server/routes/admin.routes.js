const express = require('express');
const router = express.Router();
const usuariosController = require('../controllers/usuarios.controller');
const categoriasController = require('../controllers/categorias.controller');
const rolesController = require('../controllers/roles.controller');
const papeleraController = require('../controllers/papelera.controller');
const plantillaReportesController = require('../controllers/plantillaReportes.controller');
const plantillaConstanciasController = require('../controllers/plantillaConstancias.controller');
const { crearControladorListaSimple } = require('../controllers/listaSimple.controller');
const { requiereRol } = require('../middleware/auth.middleware');

// Todo lo que cuelga de /api/admin exige sesión con rol 'admin'.
router.use(requiereRol('admin'));

// --- Usuarios ---
router.get('/users', usuariosController.listar);
router.post('/users', usuariosController.crear);
router.put('/users/:id', usuariosController.actualizar);
router.put('/users/:id/rol', usuariosController.cambiarRol);
router.delete('/users/:id', usuariosController.eliminar);
router.post('/users/carga-masiva', usuariosController.cargaMasiva);
router.post('/users/eliminacion-masiva', usuariosController.eliminacionMasiva);

// --- Categorías ---
router.get('/categorias', categoriasController.listarTodasAdmin);
router.post('/categorias', categoriasController.crearCategoria);
router.put('/categorias/:id', categoriasController.actualizarCategoria);
router.delete('/categorias/:id', categoriasController.eliminarCategoria);

// --- Subcategorías ---
router.post('/subcategorias', categoriasController.crearSubcategoria);
router.put('/subcategorias/:id', categoriasController.actualizarSubcategoria);
router.delete('/subcategorias/:id', categoriasController.eliminarSubcategoria);

// --- Listas simples: Áreas / Cargos / Pisos (mismo CRUD reutilizado) ---
const areasController = crearControladorListaSimple('areas_departamento');
router.get('/areas', areasController.listar);
router.post('/areas', areasController.crear);
router.put('/areas/:id', areasController.actualizar);
router.delete('/areas/:id', areasController.eliminar);

const cargosController = crearControladorListaSimple('cargos');
router.get('/cargos', cargosController.listar);
router.post('/cargos', cargosController.crear);
router.put('/cargos/:id', cargosController.actualizar);
router.delete('/cargos/:id', cargosController.eliminar);

const pisosController = crearControladorListaSimple('pisos');
router.get('/pisos', pisosController.listar);
router.post('/pisos', pisosController.crear);
router.put('/pisos/:id', pisosController.actualizar);
router.delete('/pisos/:id', pisosController.eliminar);

// --- Roles personalizados ---
router.get('/roles', rolesController.listar);
router.get('/roles/disponibles', rolesController.listarTodosDisponibles);
router.get('/roles/core', rolesController.listarEtiquetasCore);
router.put('/roles/core/:clave', rolesController.actualizarEtiquetaCore);
router.post('/roles', rolesController.crear);
router.put('/roles/:id', rolesController.actualizar);
router.delete('/roles/:id', rolesController.eliminar);

// --- Papelera ---
router.get('/papelera', papeleraController.listar);
router.post('/papelera/:id/restaurar', papeleraController.restaurar);
router.delete('/papelera/:id', papeleraController.eliminarPermanente);

// --- Plantilla de reportes (logo, encabezado, pie de página en PDF) ---
router.get('/plantilla-reportes', plantillaReportesController.obtener);
router.put('/plantilla-reportes', plantillaReportesController.actualizar);

// --- Plantilla de constancias (encabezado, pie de página en PDF) ---
router.get('/plantilla-constancias', plantillaConstanciasController.obtener);
router.put('/plantilla-constancias', plantillaConstanciasController.actualizar);

module.exports = router;
