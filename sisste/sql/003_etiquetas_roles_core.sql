-- =====================================================================
-- SISSTe - Migración 003 (reemplaza la versión anterior de Oficinas,
-- que fue descartada)
--
-- Permite editar el NOMBRE A MOSTRAR de los 3 roles del sistema
-- (usuario/tecnico/admin) desde el panel admin, sin tocar la CLAVE
-- interna — la clave sigue fija porque está entrelazada en el
-- middleware de permisos, las redirecciones de login y las sesiones.
-- Cambiar la clave requeriría tocar código en varios lugares y sería
-- un riesgo de seguridad si queda inconsistente.
-- =====================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS core_roles_config (
    clave           VARCHAR(20) PRIMARY KEY CHECK (clave IN ('usuario', 'tecnico', 'admin')),
    nombre_mostrar  VARCHAR(100) NOT NULL
);

INSERT INTO core_roles_config (clave, nombre_mostrar) VALUES
    ('usuario', 'Usuario (Solicitante)'),
    ('tecnico', 'Técnico (Soporte)'),
    ('admin', 'Administrador')
ON CONFLICT (clave) DO NOTHING;

COMMIT;
