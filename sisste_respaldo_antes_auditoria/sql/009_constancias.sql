-- =====================================================================
-- SISSTe - Migración 009
-- Constancias de Soporte Técnico: tabla propia, con sus equipos
-- atendidos (uno a muchos), su plantilla independiente de encabezado/
-- pie de página, y el mapeo de categorías a las 6 casillas fijas del
-- formato de constancia.
-- =====================================================================

BEGIN;

-- ---------------------------------------------------------------------
-- 1. Mapeo de categorías a las casillas fijas de la constancia.
-- ---------------------------------------------------------------------
ALTER TABLE categorias ADD COLUMN IF NOT EXISTS tipo_constancia VARCHAR(30)
    CHECK (tipo_constancia IN (
        'mant_correctivo', 'ofimatica', 'carpeta_compartida',
        'mant_preventivo', 'impresora', 'otros'
    ) OR tipo_constancia IS NULL);

-- ---------------------------------------------------------------------
-- 2. Constancias (snapshot de datos al momento de generarse, para que
--    no cambien si después se edita la categoría, el usuario, etc.)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS constancias (
    id                    SERIAL PRIMARY KEY,
    solicitud_id          INTEGER NOT NULL UNIQUE REFERENCES solicitudes_v2(id),
    numero_documento      VARCHAR(60) NOT NULL,

    -- Snapshot del solicitante
    solicitante_nombre    VARCHAR(100),
    solicitante_apellido  VARCHAR(100),
    solicitante_cedula    VARCHAR(20),
    solicitante_area      VARCHAR(100),
    solicitante_piso      VARCHAR(10),
    solicitante_cargo     VARCHAR(100),

    -- Snapshot del técnico
    tecnico_id            INTEGER REFERENCES usuarios_auth(id),
    tecnico_nombre        VARCHAR(100),
    tecnico_apellido      VARCHAR(100),

    -- Snapshot de categoría/sub-categoría
    categoria_nombre      VARCHAR(100),
    subcategoria_nombre   VARCHAR(100),
    tipo_constancia        VARCHAR(30),

    diagnostico           TEXT NOT NULL,
    recomendaciones       TEXT,

    fecha_generacion       TIMESTAMP NOT NULL DEFAULT NOW()
);

-- ---------------------------------------------------------------------
-- 3. Equipos atendidos en cada constancia (uno a muchos)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS constancia_equipos (
    id                SERIAL PRIMARY KEY,
    constancia_id     INTEGER NOT NULL REFERENCES constancias(id) ON DELETE CASCADE,
    tipo_equipo       VARCHAR(50),
    marca             VARCHAR(50),
    modelo            VARCHAR(50),
    numero_bien       VARCHAR(50),
    serial            VARCHAR(50)
);

-- ---------------------------------------------------------------------
-- 4. Plantilla de encabezado/pie de página para constancias — igual
--    patrón que configuracion_reportes, pero independiente (pueden
--    tener imágenes distintas).
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS configuracion_constancias (
    id                          INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
    encabezado_imagen_base64    TEXT,
    pie_imagen_base64           TEXT,
    actualizado_en              TIMESTAMP NOT NULL DEFAULT NOW()
);

INSERT INTO configuracion_constancias (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

COMMIT;
