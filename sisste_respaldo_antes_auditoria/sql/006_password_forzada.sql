-- =====================================================================
-- SISSTe - Migración 006
-- Agrega la bandera "debe_cambiar_password" para forzar el cambio de
-- contraseña en el próximo inicio de sesión — usada por: (1) usuarios
-- creados por carga masiva (contraseña inicial = su cédula), y
-- (2) cualquier usuario al que un admin le resetee la contraseña con
-- el checkbox de "forzar cambio" marcado.
-- =====================================================================

BEGIN;

ALTER TABLE usuarios_auth ADD COLUMN IF NOT EXISTS debe_cambiar_password BOOLEAN NOT NULL DEFAULT FALSE;

COMMIT;
