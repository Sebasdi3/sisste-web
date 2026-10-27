-- =====================================================================
-- SISSTe - Migración 004
-- Elimina la columna "direccion" de las tablas de perfil: es
-- redundante con "área/departamento" y generaba inconsistencia de
-- datos al tener dos campos para lo mismo. Solo queda Área/Departamento.
-- =====================================================================

BEGIN;

ALTER TABLE perfil_usuario_estandar DROP COLUMN IF EXISTS direccion;
ALTER TABLE perfil_tecnico DROP COLUMN IF EXISTS direccion;
ALTER TABLE perfil_admin DROP COLUMN IF EXISTS direccion;
ALTER TABLE perfil_personalizado DROP COLUMN IF EXISTS direccion;

COMMIT;
