-- =====================================================================
-- SISSTe - Migración 002
-- Listas configurables (áreas, cargos, pisos), roles personalizados
-- (más allá de los 3 core: usuario/tecnico/admin) y papelera para
-- elementos eliminados.
-- =====================================================================

BEGIN;

-- ---------------------------------------------------------------------
-- 1. Listas simples configurables desde el panel admin
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS areas_departamento (
    id      SERIAL PRIMARY KEY,
    nombre  VARCHAR(100) NOT NULL UNIQUE,
    activo  BOOLEAN NOT NULL DEFAULT TRUE,
    orden   INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS cargos (
    id      SERIAL PRIMARY KEY,
    nombre  VARCHAR(100) NOT NULL UNIQUE,
    activo  BOOLEAN NOT NULL DEFAULT TRUE,
    orden   INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS pisos (
    id      SERIAL PRIMARY KEY,
    nombre  VARCHAR(50) NOT NULL UNIQUE,
    activo  BOOLEAN NOT NULL DEFAULT TRUE,
    orden   INTEGER NOT NULL DEFAULT 0
);

-- Semillas con los valores que ya existían hardcodeados en el HTML,
-- para no perder nada al migrar.
INSERT INTO cargos (nombre, orden) VALUES
    ('Analista', 1), ('Director de Linea', 2), ('Director General', 3),
    ('Asistente', 4), ('Intendente', 5)
ON CONFLICT (nombre) DO NOTHING;

INSERT INTO pisos (nombre, orden) VALUES
    ('PB', 0), ('1', 1), ('2', 2), ('3', 3)
ON CONFLICT (nombre) DO NOTHING;

-- ---------------------------------------------------------------------
-- 2. Roles personalizados (además de los 3 core: usuario/tecnico/admin)
--
-- Los 3 roles core NO viven aquí — siguen siendo parte fija del
-- sistema (perfil_usuario_estandar/perfil_tecnico/perfil_admin) porque
-- ya tienen lógica y datos de producción dependiendo de ellos. Esta
-- tabla es para roles ADICIONALES que el admin cree desde el panel.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS roles_personalizados (
    id              SERIAL PRIMARY KEY,
    clave           VARCHAR(50) UNIQUE NOT NULL, -- identificador interno, ej. "supervisor"
    nombre_mostrar  VARCHAR(100) NOT NULL,        -- ej. "Supervisor de Piso"
    permisos        JSONB NOT NULL DEFAULT '[]',  -- ej. ["ver_solicitudes","ver_dashboard"]
    activo          BOOLEAN NOT NULL DEFAULT TRUE,
    fecha_creacion  TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Perfil GENÉRICO para usuarios con un rol personalizado. En vez de
-- crear una tabla física nueva por cada rol (riesgo de seguridad y
-- mantenimiento), un solo perfil flexible sirve para cualquier rol
-- personalizado; "datos_extra" guarda campos específicos de ese rol
-- si hicieran falta más adelante.
CREATE TABLE IF NOT EXISTS perfil_personalizado (
    usuario_id          INTEGER PRIMARY KEY REFERENCES usuarios_auth(id) ON DELETE CASCADE,
    rol_personalizado_id INTEGER NOT NULL REFERENCES roles_personalizados(id),
    nombre              VARCHAR(100) NOT NULL,
    apellido            VARCHAR(100) NOT NULL,
    direccion           VARCHAR(150),
    datos_extra         JSONB NOT NULL DEFAULT '{}'
);

-- usuarios_auth.rol tenía un CHECK que solo permitía los 3 roles core.
-- Lo quitamos: la validez de un rol personalizado se valida en el
-- backend contra roles_personalizados.clave (activos), y el rol
-- 'personalizado:<clave>' se guarda como texto para saber a qué fila
-- de roles_personalizados corresponde.
ALTER TABLE usuarios_auth DROP CONSTRAINT IF EXISTS usuarios_auth_rol_check;

-- ---------------------------------------------------------------------
-- 3. Papelera: elementos eliminados (roles personalizados, y a futuro
--    cualquier otra cosa que quieran poder "deshacer").
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS papelera (
    id                  SERIAL PRIMARY KEY,
    tipo_elemento       VARCHAR(50) NOT NULL,  -- ej. 'rol_personalizado', 'categoria', etc.
    datos               JSONB NOT NULL,         -- snapshot completo del elemento eliminado
    eliminado_por       INTEGER REFERENCES usuarios_auth(id),
    fecha_eliminacion   TIMESTAMP NOT NULL DEFAULT NOW()
);

COMMIT;
