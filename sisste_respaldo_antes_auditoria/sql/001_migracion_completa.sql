-- =====================================================================
-- SISSTe - Migración de esquema v2
-- Separa usuarios por rol, agrega categorías/subcategorías dinámicas
-- y trazabilidad de cambios de estado en solicitudes.
--
-- IMPORTANTE: Esto asume que ya existe una tabla "usuarios" (única,
-- con columnas nombre/cedula/password_hash/area/cargo/piso/rol) y una
-- tabla "solicitudes" con datos reales. Este script:
--   1. Crea el nuevo esquema en tablas nuevas (no borra nada todavía).
--   2. Migra los datos existentes a las tablas nuevas.
--   3. Dejamos las tablas viejas intactas por seguridad; se renombran
--      a *_legacy al final, no se eliminan. Bórralas manualmente
--      cuando confirmes que todo funciona en producción.
-- =====================================================================

BEGIN;

-- ---------------------------------------------------------------------
-- 1. Tabla central de autenticación
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS usuarios_auth (
    id              SERIAL PRIMARY KEY,
    cedula          VARCHAR(20) UNIQUE NOT NULL,
    password_hash   TEXT NOT NULL,
    rol             VARCHAR(20) NOT NULL CHECK (rol IN ('usuario', 'tecnico', 'admin')),
    fecha_creacion  TIMESTAMP NOT NULL DEFAULT NOW(),
    activo          BOOLEAN NOT NULL DEFAULT TRUE
);

-- ---------------------------------------------------------------------
-- 2. Perfiles por rol (1:1 con usuarios_auth)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS perfil_usuario_estandar (
    usuario_id  INTEGER PRIMARY KEY REFERENCES usuarios_auth(id) ON DELETE CASCADE,
    nombre      VARCHAR(100) NOT NULL,
    apellido    VARCHAR(100) NOT NULL,
    direccion   VARCHAR(150),
    piso        VARCHAR(10),
    area        VARCHAR(100),
    cargo       VARCHAR(100)
);

CREATE TABLE IF NOT EXISTS perfil_tecnico (
    usuario_id  INTEGER PRIMARY KEY REFERENCES usuarios_auth(id) ON DELETE CASCADE,
    nombre      VARCHAR(100) NOT NULL,
    apellido    VARCHAR(100) NOT NULL,
    direccion   VARCHAR(150)
);

CREATE TABLE IF NOT EXISTS perfil_admin (
    usuario_id  INTEGER PRIMARY KEY REFERENCES usuarios_auth(id) ON DELETE CASCADE,
    nombre      VARCHAR(100) NOT NULL,
    apellido    VARCHAR(100) NOT NULL,
    direccion   VARCHAR(150)
);

-- ---------------------------------------------------------------------
-- 3. Categorías y sub-categorías dinámicas (editables desde el panel admin)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS categorias (
    id      SERIAL PRIMARY KEY,
    nombre  VARCHAR(100) NOT NULL UNIQUE,
    activo  BOOLEAN NOT NULL DEFAULT TRUE,
    orden   INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS subcategorias (
    id                  SERIAL PRIMARY KEY,
    categoria_id        INTEGER NOT NULL REFERENCES categorias(id) ON DELETE CASCADE,
    nombre              VARCHAR(100) NOT NULL,
    permite_texto_libre BOOLEAN NOT NULL DEFAULT FALSE,
    activo              BOOLEAN NOT NULL DEFAULT TRUE,
    orden               INTEGER NOT NULL DEFAULT 0,
    UNIQUE (categoria_id, nombre)
);

-- ---------------------------------------------------------------------
-- 4. Solicitudes (nueva versión, referencia usuarios_auth)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS solicitudes_v2 (
    id                  SERIAL PRIMARY KEY,
    seguimiento         VARCHAR(30) UNIQUE NOT NULL,
    solicitante_id      INTEGER NOT NULL REFERENCES usuarios_auth(id),
    categoria_id        INTEGER REFERENCES categorias(id),
    subcategoria_id     INTEGER REFERENCES subcategorias(id),
    detalle_texto       TEXT,
    comentario          TEXT,
    estado              VARCHAR(20) NOT NULL DEFAULT 'en_espera'
                        CHECK (estado IN ('en_espera', 'en_proceso', 'atendida')),
    tecnico_id          INTEGER REFERENCES usuarios_auth(id),
    fecha_creacion      TIMESTAMP NOT NULL DEFAULT NOW(),
    fecha_actualizacion TIMESTAMP NOT NULL DEFAULT NOW()
);

-- ---------------------------------------------------------------------
-- 5. Historial de cambios de estado (trazabilidad fecha/hora)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS historial_estados (
    id              SERIAL PRIMARY KEY,
    solicitud_id    INTEGER NOT NULL REFERENCES solicitudes_v2(id) ON DELETE CASCADE,
    estado_anterior VARCHAR(20),
    estado_nuevo    VARCHAR(20) NOT NULL,
    usuario_id      INTEGER REFERENCES usuarios_auth(id),
    fecha_hora      TIMESTAMP NOT NULL DEFAULT NOW()
);

-- ---------------------------------------------------------------------
-- 6. Migración de datos existentes (usuarios -> usuarios_auth + perfiles)
--    NOTA: password_hash se copia tal cual (texto plano en la tabla
--    vieja). El backend nuevo re-hashea automáticamente la primera
--    vez que cada usuario inicie sesión exitosamente (ver
--    auth.controller.js), así no hace falta pedirle la contraseña a
--    nadie de nuevo.
-- ---------------------------------------------------------------------
INSERT INTO usuarios_auth (cedula, password_hash, rol, fecha_creacion)
SELECT cedula, password_hash, rol, NOW()
FROM usuarios
ON CONFLICT (cedula) DO NOTHING;

INSERT INTO perfil_usuario_estandar (usuario_id, nombre, apellido, direccion, piso, area, cargo)
SELECT ua.id,
       COALESCE(split_part(u.nombre, ' ', 1), u.nombre),
       COALESCE(NULLIF(substring(u.nombre FROM position(' ' IN u.nombre) + 1), ''), ''),
       NULL, u.piso, u.area, u.cargo
FROM usuarios u
JOIN usuarios_auth ua ON ua.cedula = u.cedula
WHERE u.rol = 'usuario'
ON CONFLICT (usuario_id) DO NOTHING;

INSERT INTO perfil_tecnico (usuario_id, nombre, apellido, direccion)
SELECT ua.id,
       COALESCE(split_part(u.nombre, ' ', 1), u.nombre),
       COALESCE(NULLIF(substring(u.nombre FROM position(' ' IN u.nombre) + 1), ''), ''),
       NULL
FROM usuarios u
JOIN usuarios_auth ua ON ua.cedula = u.cedula
WHERE u.rol = 'tecnico'
ON CONFLICT (usuario_id) DO NOTHING;

INSERT INTO perfil_admin (usuario_id, nombre, apellido, direccion)
SELECT ua.id,
       COALESCE(split_part(u.nombre, ' ', 1), u.nombre),
       COALESCE(NULLIF(substring(u.nombre FROM position(' ' IN u.nombre) + 1), ''), ''),
       NULL
FROM usuarios u
JOIN usuarios_auth ua ON ua.cedula = u.cedula
WHERE u.rol = 'admin'
ON CONFLICT (usuario_id) DO NOTHING;

-- ---------------------------------------------------------------------
-- 7. Migración de solicitudes existentes
--    "averia" (texto libre viejo) se guarda en detalle_texto sin
--    categoría asignada; el admin puede reclasificarlas luego si quiere.
-- ---------------------------------------------------------------------
INSERT INTO solicitudes_v2 (seguimiento, solicitante_id, detalle_texto, comentario, estado, tecnico_id, fecha_creacion)
SELECT s.seguimiento, ua.id, s.averia, s.comentario, s.estado, ua_tec.id, s.fecha_creacion
FROM solicitudes s
JOIN usuarios u ON u.id = s.solicitante_id
JOIN usuarios_auth ua ON ua.cedula = u.cedula
LEFT JOIN usuarios ut ON ut.id = s.tecnico_id
LEFT JOIN usuarios_auth ua_tec ON ua_tec.cedula = ut.cedula
ON CONFLICT (seguimiento) DO NOTHING;

-- ---------------------------------------------------------------------
-- 8. Categorías base (equivalentes a las 4 que ya existían en la web)
-- ---------------------------------------------------------------------
INSERT INTO categorias (nombre, orden) VALUES
    ('Software', 1), ('Hardware', 2), ('Red', 3), ('Impresora', 4)
ON CONFLICT (nombre) DO NOTHING;

INSERT INTO subcategorias (categoria_id, nombre, permite_texto_libre, orden)
SELECT c.id, x.nombre, x.libre, x.orden FROM categorias c
JOIN (VALUES
    ('Impresora', 'Atasco', false, 1),
    ('Impresora', 'Cambio de tóner', false, 2),
    ('Impresora', 'Configuración', false, 3),
    ('Impresora', 'Instalación', false, 4),
    ('Impresora', 'Movimiento', false, 5),
    ('Impresora', 'Otro', true, 6)
) AS x(categoria, nombre, libre, orden) ON c.nombre = x.categoria
ON CONFLICT (categoria_id, nombre) DO NOTHING;

-- ---------------------------------------------------------------------
-- 9. Renombrar tablas viejas (no se borran, quedan como respaldo)
-- ---------------------------------------------------------------------
ALTER TABLE IF EXISTS usuarios RENAME TO usuarios_legacy;
ALTER TABLE IF EXISTS solicitudes RENAME TO solicitudes_legacy;

COMMIT;
