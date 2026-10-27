-- =====================================================================
-- SISSTe - Migración 005
-- Amplía la columna "seguimiento" de VARCHAR(30) a VARCHAR(50).
-- Causa: el placeholder temporal usado al crear una solicitud (un
-- UUID de 36 caracteres) superaba el límite de 30, haciendo fallar
-- el INSERT con "value too long for type character varying(30)".
-- =====================================================================

BEGIN;

ALTER TABLE solicitudes_v2 ALTER COLUMN seguimiento TYPE VARCHAR(50);

COMMIT;
