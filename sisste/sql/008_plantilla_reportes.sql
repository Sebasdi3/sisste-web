-- =====================================================================
-- SISSTe - Migración 008
-- Configuración de plantilla PDF para reportes: imágenes de ancho
-- completo para encabezado y pie de página (ej. bandera institucional),
-- más textos opcionales que las acompañan (nombre de la institución,
-- datos de contacto).
-- =====================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS configuracion_reportes (
    id                          INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
    encabezado_imagen_base64    TEXT,
    pie_imagen_base64           TEXT,
    texto_encabezado            TEXT,
    texto_pie                   TEXT,
    actualizado_en              TIMESTAMP NOT NULL DEFAULT NOW()
);

INSERT INTO configuracion_reportes (id, texto_encabezado, texto_pie) VALUES
    (1, 'SISSTe - Sistema Interno de Soporte Técnico', 'Documento generado automáticamente por SISSTe')
ON CONFLICT (id) DO NOTHING;

COMMIT;
