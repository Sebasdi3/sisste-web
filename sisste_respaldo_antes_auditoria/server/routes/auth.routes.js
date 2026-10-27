const express = require('express');
const router = express.Router();
const authController = require('../controllers/auth.controller');
const { requiereSesion } = require('../middleware/auth.middleware');

router.post('/login', authController.login);
router.post('/logout', authController.logout);
router.get('/session', authController.sesionActual);
router.put('/cambiar-password', requiereSesion, authController.cambiarPasswordPropia);

module.exports = router;
