-- =====================================================================
-- SISSTe - Migración 007
-- Tabla de auditoría para el reporte de "Acciones administrativas":
-- quién hizo qué (cambios de rol, creación/eliminación de usuarios,
-- cargas masivas), y cuándo.
-- =====================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS auditoria_admin (
    id              SERIAL PRIMARY KEY,
    usuario_id      INTEGER REFERENCES usuarios_auth(id),
    accion          VARCHAR(50) NOT NULL,
    detalle         JSONB NOT NULL DEFAULT '{}',
    fecha_hora      TIMESTAMP NOT NULL DEFAULT NOW()
);

COMMIT;
