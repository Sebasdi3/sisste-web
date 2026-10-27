-- =====================================================================
-- SISSTe - Migración 011
-- La tabla auditoria_admin (creada en 007_auditoria.sql, dentro de
-- sigesot_db) queda reemplazada por la nueva base de datos separada
-- sigesot_audit (ver sql-auditoria/), que desde ahora es la única que
-- recibe auditoría nueva y cubre TODAS las acciones, no solo usuarios.
--
-- Esta migración NO borra auditoria_admin ni su historial — solo la
-- "congela": revoca UPDATE/DELETE/TRUNCATE de todos los roles y agrega
-- un trigger de solo-inserción, para que los datos que ya existían
-- también queden protegidos contra alteraciones, aunque ya no reciban
-- filas nuevas.
--
-- LIMITACIÓN HONESTA: como esta tabla vive en sigesot_db y su dueño es
-- el mismo rol que usa toda la aplicación (admindb), ese rol técnicamente
-- podría desactivar el trigger (ALTER TABLE ... DISABLE TRIGGER) porque
-- Postgres sí permite eso al dueño de una tabla. El trigger protege
-- contra ediciones accidentales o vía la aplicación normal, pero NO es
-- a prueba de alguien con las credenciales completas de admindb y
-- acceso SQL directo. La protección "a prueba de admin" de verdad está
-- en la base NUEVA (sigesot_audit), donde el rol que usa la app
-- (sigesot_audit_svc) nunca es el dueño de la tabla — ver
-- sql-auditoria/001_schema.sql.
-- =====================================================================

BEGIN;

REVOKE UPDATE, DELETE, TRUNCATE ON auditoria_admin FROM PUBLIC;

CREATE OR REPLACE FUNCTION bloquear_edicion_auditoria_legacy()
RETURNS TRIGGER AS $$
BEGIN
    RAISE EXCEPTION 'auditoria_admin quedó congelada (solo-inserción): no se permite % sobre registros ya escritos. La auditoría activa ahora vive en la base sigesot_audit.', TG_OP;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_bloquear_update_auditoria_legacy ON auditoria_admin;
CREATE TRIGGER trg_bloquear_update_auditoria_legacy
    BEFORE UPDATE ON auditoria_admin
    FOR EACH ROW EXECUTE FUNCTION bloquear_edicion_auditoria_legacy();

DROP TRIGGER IF EXISTS trg_bloquear_delete_auditoria_legacy ON auditoria_admin;
CREATE TRIGGER trg_bloquear_delete_auditoria_legacy
    BEFORE DELETE ON auditoria_admin
    FOR EACH ROW EXECUTE FUNCTION bloquear_edicion_auditoria_legacy();

COMMIT;
