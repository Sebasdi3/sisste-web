-- =====================================================================
-- SISSTe - Migración 010
-- Agrega la cédula del técnico al snapshot de la constancia (faltaba
-- en el bloque de "Entrega").
-- =====================================================================

BEGIN;

ALTER TABLE constancias ADD COLUMN IF NOT EXISTS tecnico_cedula VARCHAR(20);

COMMIT;
