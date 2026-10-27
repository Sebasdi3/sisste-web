-- =====================================================================
-- SIGESOT / SISSTe - Auditoría segura: esquema
-- EJECUTAR UNA SOLA VEZ, conectado a la base sigesot_audit, autenticado
-- como el rol sigesot_audit_owner (el dueño creado en
-- 000_provision_infra.sql).
--
-- Uso:
--   psql -U sigesot_audit_owner -h localhost -d sigesot_audit -f 001_schema.sql
-- =====================================================================

BEGIN;

CREATE TABLE eventos_auditoria (
    id              BIGSERIAL PRIMARY KEY,
    fecha_hora      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Quién. usuario_id es el id de usuarios_auth en sigesot_db, pero
    -- deliberadamente SIN foreign key: esta base de datos está
    -- aislada de sigesot_db a propósito (son bases distintas, sin
    -- dependencia estructural entre ellas). cedula/rol/nombre_actor
    -- son un snapshot de texto tomado en el momento del evento, para
    -- que el reporte de auditoría se pueda leer sin tener que cruzar
    -- información con la otra base.
    usuario_id      INTEGER,
    cedula          VARCHAR(20),
    rol             VARCHAR(50),
    nombre_actor    VARCHAR(200),

    -- Qué. Nombre de acción legible (ej. "login_exitoso",
    -- "login_fallido", "crear_usuario", "eliminar_categoria") cuando
    -- el backend lo etiqueta explícitamente, o "METODO /ruta" como
    -- valor por defecto para cualquier otra petición que modifique
    -- datos y que no se haya etiquetado a mano — así ninguna acción
    -- administrativa queda fuera del registro, aunque en el futuro se
    -- agregue una ruta nueva y alguien olvide ponerle un nombre bonito.
    accion          VARCHAR(100) NOT NULL,
    metodo_http     VARCHAR(10),
    ruta            VARCHAR(300),
    exito           BOOLEAN NOT NULL DEFAULT TRUE,
    status_http     INTEGER,

    -- Origen: IP real del cliente en CADA evento, login incluido.
    ip_origen       INET,
    user_agent      TEXT,
    session_id      VARCHAR(100),

    -- Contexto adicional libre (ids afectados, motivo de un login
    -- fallido, valores relevantes de la operación, etc.)
    detalle         JSONB NOT NULL DEFAULT '{}'
);

CREATE INDEX idx_eventos_auditoria_fecha   ON eventos_auditoria (fecha_hora DESC);
CREATE INDEX idx_eventos_auditoria_usuario ON eventos_auditoria (usuario_id);
CREATE INDEX idx_eventos_auditoria_accion  ON eventos_auditoria (accion);
CREATE INDEX idx_eventos_auditoria_ip      ON eventos_auditoria (ip_origen);

-- ---------------------------------------------------------------------
-- SOLO-INSERCIÓN, forzado en dos capas independientes:
--
-- Capa 1 (permisos): sigesot_audit_svc —el único rol que usa el
-- backend— solo recibe INSERT y SELECT sobre esta tabla. Nunca
-- UPDATE, DELETE ni TRUNCATE. Como tampoco es el dueño de la tabla,
-- no puede alterar su estructura ni desactivar el trigger de abajo.
--
-- Capa 2 (trigger): por si algún día alguien le otorgara por error
-- privilegios de UPDATE/DELETE a otro rol, este trigger los bloquea
-- de todas formas, para cualquier rol que no sea el dueño de la tabla
-- (sigesot_audit_owner, que la app nunca usa).
-- ---------------------------------------------------------------------

REVOKE ALL ON eventos_auditoria FROM PUBLIC;
GRANT INSERT, SELECT ON eventos_auditoria TO sigesot_audit_svc;
GRANT USAGE, SELECT ON SEQUENCE eventos_auditoria_id_seq TO sigesot_audit_svc;

CREATE OR REPLACE FUNCTION bloquear_edicion_auditoria()
RETURNS TRIGGER AS $$
BEGIN
    RAISE EXCEPTION 'eventos_auditoria es de solo-inserción: no se permite % sobre registros ya escritos.', TG_OP;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_bloquear_update_auditoria
    BEFORE UPDATE ON eventos_auditoria
    FOR EACH ROW EXECUTE FUNCTION bloquear_edicion_auditoria();

CREATE TRIGGER trg_bloquear_delete_auditoria
    BEFORE DELETE ON eventos_auditoria
    FOR EACH ROW EXECUTE FUNCTION bloquear_edicion_auditoria();

COMMIT;
