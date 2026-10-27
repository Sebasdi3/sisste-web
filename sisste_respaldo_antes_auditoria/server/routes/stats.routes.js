const express = require('express');
const router = express.Router();
const statsController = require('../controllers/stats.controller');
const { requierePermiso } = require('../middleware/auth.middleware');

router.get('/contadores', requierePermiso('ver_dashboard'), statsController.contadores);

module.exports = router;
