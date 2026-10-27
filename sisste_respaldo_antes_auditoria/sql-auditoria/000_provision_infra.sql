-- =====================================================================
-- SIGESOT / SISSTe - Auditoría segura: aprovisionamiento de infraestructura
-- EJECUTAR UNA SOLA VEZ, como superusuario de PostgreSQL (ej. "postgres"),
-- conectado a la base de datos "postgres" (NO a sigesot_db).
--
-- Uso:
--   psql -U postgres -h localhost -f 000_provision_infra.sql
--
-- Qué hace:
--   1. Crea una base de datos NUEVA y separada: sigesot_audit. Vive en
--      el mismo servidor PostgreSQL que sigesot_db, pero es una base
--      de datos distinta — PostgreSQL aísla el acceso por base de
--      datos, así que un rol sin privilegios explícitos sobre
--      sigesot_audit no puede ni conectarse a ella, aunque tenga
--      acceso total a sigesot_db (como el rol "admindb" actual).
--   2. Crea un rol "dueño" (sigesot_audit_owner) que controla la
--      estructura de las tablas — y por lo tanto es el único que en
--      teoría podría desactivar el trigger de solo-inserción. Este rol
--      NO lo usa la aplicación en ningún momento: solo se usa a mano,
--      con su propia contraseña, para mantenimiento puntual.
--   3. Crea el rol de SERVICIO que sí usa el backend Node.js
--      (sigesot_audit_svc): solo podrá insertar y leer filas, nunca
--      editarlas, borrarlas, ni tocar la estructura de las tablas.
--
-- IMPORTANTE: cambia las dos contraseñas de ejemplo antes de correr
-- esto en producción. Guarda la del rol "owner" en un lugar seguro y
-- SEPARADO del .env de la aplicación (ej. el gestor de contraseñas del
-- equipo) — el backend nunca debe tener ni usar esa contraseña.
-- =====================================================================

CREATE DATABASE sigesot_audit
    WITH ENCODING 'UTF8'
    TEMPLATE template0;

-- Nadie se conecta a sigesot_audit por defecto, ni siquiera roles que
-- ya tengan acceso a sigesot_db.
REVOKE CONNECT ON DATABASE sigesot_audit FROM PUBLIC;

-- --- Rol "dueño" (mantenimiento manual — la app NUNCA usa este rol) ---
CREATE ROLE sigesot_audit_owner WITH LOGIN PASSWORD 'CAMBIA_ESTA_CLAVE_OWNER';
GRANT CONNECT ON DATABASE sigesot_audit TO sigesot_audit_owner;
ALTER DATABASE sigesot_audit OWNER TO sigesot_audit_owner;

-- --- Rol de servicio (el que usa el backend Node.js, vía .env) ---
CREATE ROLE sigesot_audit_svc WITH LOGIN PASSWORD 'CAMBIA_ESTA_CLAVE_SVC';
GRANT CONNECT ON DATABASE sigesot_audit TO sigesot_audit_svc;

-- El resto (tablas, permisos exactos de INSERT/SELECT, trigger de
-- solo-inserción) se crea en 001_schema.sql, ya conectado a la base
-- sigesot_audit y autenticado como sigesot_audit_owner:
--
--   psql -U sigesot_audit_owner -h localhost -d sigesot_audit -f 001_schema.sql
