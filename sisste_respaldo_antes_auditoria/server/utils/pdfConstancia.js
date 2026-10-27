const PDFDocument = require('pdfkit');
const sizeOf = require('image-size').default || require('image-size');
const pool = require('../db/db.config');

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

const ETIQUETAS_TIPO_CONSTANCIA = {
  mant_correctivo: 'Mant. Correctivo',
  ofimatica: 'Ofimática',
  carpeta_compartida: 'Carp. Compartida',
  mant_preventivo: 'Mant. Preventivo',
  impresora: 'Impresora',
  otros: 'Otros',
};
const ORDEN_CASILLAS = ['mant_correctivo', 'ofimatica', 'carpeta_compartida', 'mant_preventivo', 'impresora', 'otros'];

const COLOR_INSTITUCIONAL = '#1e3a5f';
const COLOR_GRIS_CLARO = '#e2e8f0';

async function obtenerConfigPlantilla() {
  const result = await pool.query('SELECT * FROM configuracion_constancias WHERE id = 1');
  return result.rows[0] || {};
}

function base64ToBuffer(dataUrl) {
  if (!dataUrl) return null;
  const limpio = dataUrl.includes(',') ? dataUrl.split(',').pop() : dataUrl;
  return Buffer.from(limpio, 'base64');
}

function alturaProporcional(buffer, anchoDestino, alturaMinima, alturaMaxima) {
  try {
    const dim = sizeOf(buffer);
    let altura = anchoDestino * (dim.height / dim.width);
    if (alturaMaxima) altura = Math.min(altura, alturaMaxima);
    if (alturaMinima) altura = Math.max(altura, alturaMinima);
    return altura;
  } catch (err) {
    return alturaMinima || 60;
  }
}

/// Extrae día/mes/año de una fecha, forzando la zona horaria de
/// Venezuela sin importar cómo esté configurado el servidor.
function partesFechaCaracas(fecha) {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Caracas',
    year: 'numeric', month: '2-digit', day: '2-digit',
  });
  const partes = formatter.formatToParts(fecha).reduce((acc, p) => {
    acc[p.type] = p.value;
    return acc;
  }, {});
  return { dia: parseInt(partes.day, 10), mesIndex: parseInt(partes.month, 10) - 1, anio: parseInt(partes.year, 10) };
}

function numeroALetras(anio) {
  const resto = anio % 100;
  const UNIDADES = ['', 'uno', 'dos', 'tres', 'cuatro', 'cinco', 'seis', 'siete', 'ocho', 'nueve'];
  const DIECIS = ['diez', 'once', 'doce', 'trece', 'catorce', 'quince', 'dieciséis', 'diecisiete', 'dieciocho', 'diecinueve'];
  const VEINTIS = ['veinte', 'veintiuno', 'veintidós', 'veintitrés', 'veinticuatro', 'veinticinco', 'veintiséis', 'veintisiete', 'veintiocho', 'veintinueve'];
  const DECENAS = ['', '', '', 'treinta', 'cuarenta', 'cincuenta', 'sesenta', 'setenta', 'ochenta', 'noventa'];

  let textoResto = '';
  if (resto === 0) textoResto = '';
  else if (resto < 10) textoResto = UNIDADES[resto];
  else if (resto < 20) textoResto = DIECIS[resto - 10];
  else if (resto < 30) textoResto = VEINTIS[resto - 20];
  else {
    const d = Math.floor(resto / 10);
    const u = resto % 10;
    textoResto = DECENAS[d] + (u > 0 ? ' y ' + UNIDADES[u] : '');
  }
  return `dos mil${textoResto ? ' ' + textoResto : ''}`;
}

/// Genera el PDF de una constancia individual, tamaño CARTA (Letter),
/// con el mismo formato del documento institucional de referencia.
async function generarPDFConstancia(constancia, equipos, res) {
  const config = await obtenerConfigPlantilla();
  const anchoPagina = 612; // Carta (Letter) en puntos: 8.5in x 11in
  const margenLR = 40;
  const anchoUtil = anchoPagina - margenLR * 2;

  const bufferEncabezado = base64ToBuffer(config.encabezado_imagen_base64);
  const bufferPie = base64ToBuffer(config.pie_imagen_base64);
  const alturaImgEncabezado = bufferEncabezado ? alturaProporcional(bufferEncabezado, anchoPagina, 40, 130) : 0;
  const alturaImgPie = bufferPie ? alturaProporcional(bufferPie, anchoPagina, 30, 100) : 0;

  const ALTO_BARRA_TITULO = 26;
  const margenTop = alturaImgEncabezado + ALTO_BARRA_TITULO + 6;
  // Se reserva más espacio del que ocupa la imagen del pie, para que
  // el número de página tenga aire y (sobre todo) para que ningún
  // texto se dibuje justo en el borde del margen — eso era lo que
  // disparaba una segunda página en blanco por error.
  const margenBottom = alturaImgPie + 24;

  const doc = new PDFDocument({ size: 'LETTER', margins: { top: margenTop, bottom: margenBottom, left: margenLR, right: margenLR }, bufferPages: true });

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="constancia-${constancia.numero_documento}.pdf"`);
  doc.pipe(res);

  function dibujarEncabezadoCompleto() {
    if (bufferEncabezado) doc.image(bufferEncabezado, 0, 0, { width: anchoPagina, height: alturaImgEncabezado });
    doc.rect(margenLR, alturaImgEncabezado, anchoUtil, ALTO_BARRA_TITULO).fill(COLOR_INSTITUCIONAL);
    doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(12)
       .text('Oficina de Tecnología de la Información y Comunicación', margenLR, alturaImgEncabezado + 7, { width: anchoUtil, align: 'center' });
  }
  dibujarEncabezadoCompleto();
  doc.on('pageAdded', dibujarEncabezadoCompleto);

  doc.x = margenLR;
  doc.y = margenTop;

  // --- Tabla de referencia: Soporte Técnico + casillas + Documento + Fecha ---
  const fecha = new Date(constancia.fecha_generacion);
  const { dia, mesIndex, anio } = partesFechaCaracas(fecha);
  const mes = MESES[mesIndex];
  const fechaCorta = `${String(dia).padStart(2, '0')}/${String(mesIndex + 1).padStart(2, '0')}/${anio}`;

  const anchoDocumento = 150;
  const anchoCasillas = anchoUtil - 90 - anchoDocumento;
  const altoFilaCasillas = 16;
  const altoBloqueCasillas = altoFilaCasillas * 2;
  const altoFilaFecha = 18;
  const altoBloque = altoBloqueCasillas + altoFilaFecha;

  const yInicioBloque = doc.y;

  doc.rect(margenLR + 90 + anchoCasillas, yInicioBloque, anchoDocumento, altoBloqueCasillas).fill(COLOR_GRIS_CLARO);
  doc.rect(margenLR, yInicioBloque + altoBloqueCasillas, anchoUtil, altoFilaFecha).fill(COLOR_GRIS_CLARO);

  doc.rect(margenLR, yInicioBloque, anchoUtil, altoBloque).stroke('#94a3b8');
  doc.moveTo(margenLR + 90, yInicioBloque).lineTo(margenLR + 90, yInicioBloque + altoBloqueCasillas).stroke('#94a3b8');
  doc.moveTo(margenLR + 90 + anchoCasillas, yInicioBloque).lineTo(margenLR + 90 + anchoCasillas, yInicioBloque + altoBloqueCasillas).stroke('#94a3b8');
  doc.moveTo(margenLR, yInicioBloque + altoBloqueCasillas).lineTo(margenLR + anchoUtil, yInicioBloque + altoBloqueCasillas).stroke('#94a3b8');

  doc.fontSize(8).font('Helvetica-Bold').fillColor('#1e293b')
     .text('Soporte Técnico', margenLR + 4, yInicioBloque + 12, { width: 84 });

  const casillasCol = margenLR + 95;
  const anchoCasilla = anchoCasillas / 3;
  ORDEN_CASILLAS.forEach((clave, i) => {
    const marcado = clave === constancia.tipo_constancia;
    const fila = Math.floor(i / 3);
    const col = i % 3;
    const y = yInicioBloque + 4 + fila * altoFilaCasillas;
    const x = casillasCol + col * anchoCasilla;
    doc.rect(x, y + 1, 7, 7).stroke('#475569');
    if (marcado) doc.fontSize(7).font('Helvetica-Bold').text('X', x + 1.3, y + 1.3);
    doc.fontSize(7).font('Helvetica').fillColor('#1e293b').text(ETIQUETAS_TIPO_CONSTANCIA[clave], x + 10, y, { width: anchoCasilla - 12 });
  });

  const xDocumento = margenLR + 90 + anchoCasillas;
  doc.fontSize(9).font('Helvetica-Bold').fillColor('#1e293b')
     .text(`Documento`, xDocumento + 6, yInicioBloque + 10, { width: anchoDocumento - 10 });
  doc.fontSize(9).font('Helvetica').text(constancia.numero_documento, xDocumento + 6, yInicioBloque + 24, { width: anchoDocumento - 10 });

  doc.fontSize(8).font('Helvetica-Bold').fillColor('#1e293b')
     .text(`Fecha: `, margenLR + 4, yInicioBloque + altoBloqueCasillas + 5, { continued: true, width: anchoUtil - 8 });
  doc.font('Helvetica').text(fechaCorta);

  doc.x = margenLR;
  doc.y = yInicioBloque + altoBloque + 16;

  // --- Párrafo introductorio: texto literal del documento original,
  //     con sangría en la primera línea (como el original). ---
  const nombreCompleto = `${constancia.solicitante_nombre || ''} ${constancia.solicitante_apellido || ''}`.trim();
  const parrafoIntro =
    `En la ciudad de Caracas, Hoy a los ${dia} días del mes de ${mes.toUpperCase()} del año ${numeroALetras(anio)} (${anio}), ` +
    `se levanta la presente CONSTANCIA DE SOPORTE TÉCNICO por parte del técnico del departamento de tecnología para el funcionario: ` +
    `${nombreCompleto} adscrita a ${constancia.solicitante_area || '—'} Piso: ${constancia.solicitante_piso || '—'} ` +
    `con el cargo de ${constancia.solicitante_cargo || '—'} haciendo referencia de los siguientes equipos que se detallan a continuación:`;

  doc.fontSize(10).fillColor('#1e293b').font('Helvetica')
     .text(parrafoIntro, margenLR, doc.y, { align: 'justify', width: anchoUtil, indent: 20 });
  doc.moveDown(1);

  const solicitudTexto = [constancia.categoria_nombre, constancia.subcategoria_nombre].filter(Boolean).join(' - ') || 'General';
  seccionTexto(doc, 'Solicitud', solicitudTexto, anchoUtil, margenLR);
  seccionTexto(doc, 'Acciones Ejecutadas', `Soporte atendido por el técnico ${constancia.tecnico_nombre || ''} ${constancia.tecnico_apellido || ''}`.trim(), anchoUtil, margenLR);
  seccionTexto(doc, 'Diagnóstico', constancia.diagnostico || '—', anchoUtil, margenLR);
  seccionTexto(doc, 'Recomendaciones', constancia.recomendaciones || '—', anchoUtil, margenLR);

  doc.moveDown(0.5);
  dibujarTablaEquipos(doc, equipos, margenLR, anchoUtil);

  doc.moveDown(1.5);
  dibujarBloqueFirmas(doc, constancia, margenLR, anchoUtil);

  // --- Pie de página en todas las páginas ---
  // Se reduce temporalmente el margen inferior de PDFKit a 0 antes de
  // dibujar dentro de esa zona — sin esto, escribir texto tan cerca
  // del borde disparaba automáticamente una página nueva en blanco,
  // que era el bug reportado.
  const range = doc.bufferedPageRange();
  for (let i = range.start; i < range.start + range.count; i++) {
    doc.switchToPage(i);
    const margenInferiorOriginal = doc.page.margins.bottom;
    doc.page.margins.bottom = 0;

    if (bufferPie) {
      doc.image(bufferPie, 0, doc.page.height - alturaImgPie, { width: anchoPagina, height: alturaImgPie });
    }
    doc.fontSize(8).fillColor('#94a3b8')
       .text(`Página ${i + 1} de ${range.count}`, anchoPagina - 195, doc.page.height - alturaImgPie - 16, { width: 155, align: 'right' });

    doc.page.margins.bottom = margenInferiorOriginal;
  }

  doc.end();
}

function seccionTexto(doc, etiqueta, texto, anchoUtil, margenLR) {
  doc.x = margenLR;
  const anchoEtiqueta = doc.font('Helvetica-Bold').fontSize(10).widthOfString(`${etiqueta}: `);
  const yInicio = doc.y;

  doc.font('Helvetica-Bold').fillColor('#0f172a')
     .text(`${etiqueta}: `, margenLR, yInicio, { continued: true, width: anchoUtil });
  doc.font('Helvetica').fillColor('#1e293b').text(texto, { align: 'justify' });

  doc.moveTo(margenLR, yInicio + 12).lineTo(margenLR + anchoEtiqueta - 4, yInicio + 12).strokeColor('#0f172a').lineWidth(0.6).stroke();

  doc.moveDown(0.7);
  doc.x = margenLR;
}

function dibujarTablaEquipos(doc, equipos, margenLR, anchoUtil) {
  const columnas = [
    { titulo: 'TIPO EQUIPO', campo: 'tipo_equipo', ancho: anchoUtil * 0.2 },
    { titulo: 'MARCA', campo: 'marca', ancho: anchoUtil * 0.2 },
    { titulo: 'MODELO', campo: 'modelo', ancho: anchoUtil * 0.2 },
    { titulo: 'N° DE BIEN', campo: 'numero_bien', ancho: anchoUtil * 0.2 },
    { titulo: 'SERIAL', campo: 'serial', ancho: anchoUtil * 0.2 },
  ];

  let y = doc.y;
  let x = margenLR;
  doc.fontSize(8).font('Helvetica-Bold').fillColor('#ffffff');
  columnas.forEach((col) => {
    doc.rect(x, y, col.ancho, 18).fillAndStroke(COLOR_INSTITUCIONAL, COLOR_INSTITUCIONAL);
    doc.fillColor('#ffffff').text(col.titulo, x + 3, y + 5, { width: col.ancho - 6 });
    x += col.ancho;
  });

  y += 18;
  doc.font('Helvetica').fontSize(8);
  (equipos.length > 0 ? equipos : [{}]).forEach((eq) => {
    x = margenLR;
    columnas.forEach((col) => {
      doc.rect(x, y, col.ancho, 16).stroke('#cbd5e1');
      doc.fillColor('#1e293b').text(eq[col.campo] || '—', x + 3, y + 4, { width: col.ancho - 6 });
      x += col.ancho;
    });
    y += 16;
  });

  doc.y = y + 10;
}

/// Bloque Entrega/Recibe: DOS tablas SEPARADAS (con espacio real entre
/// ellas, como la columna central invisible del documento original),
/// no una sola tabla continua.
function dibujarBloqueFirmas(doc, constancia, margenLR, anchoUtil) {
  const gapCentral = 24;
  const anchoLado = (anchoUtil - gapCentral) / 2;
  const xRecibe = margenLR + anchoLado + gapCentral;
  const yInicio = doc.y;
  const altoEncabezado = 20;
  const altoFila = 16;

  const filasDatos = [
    ['Nombre:', `${constancia.tecnico_nombre || ''} ${constancia.tecnico_apellido || ''}`.trim(), `${constancia.solicitante_nombre || ''} ${constancia.solicitante_apellido || ''}`.trim()],
    ['Cédula:', constancia.tecnico_cedula || '', constancia.solicitante_cedula || ''],
    ['Departamento:', 'TECNOLOGÍA', constancia.solicitante_area || ''],
  ];

  // Encabezados "Entrega" / "Recibe", cada uno en su propia tabla.
  doc.rect(margenLR, yInicio, anchoLado, altoEncabezado).fillAndStroke(COLOR_INSTITUCIONAL, COLOR_INSTITUCIONAL);
  doc.rect(xRecibe, yInicio, anchoLado, altoEncabezado).fillAndStroke(COLOR_INSTITUCIONAL, COLOR_INSTITUCIONAL);
  doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(9);
  doc.text('Entrega', margenLR, yInicio + 6, { width: anchoLado, align: 'center' });
  doc.text('Recibe', xRecibe, yInicio + 6, { width: anchoLado, align: 'center' });

  doc.font('Helvetica').fontSize(8).fillColor('#1e293b');
  let yFila = yInicio + altoEncabezado;
  filasDatos.forEach(([etiqueta, entrega, recibe]) => {
    doc.rect(margenLR, yFila, anchoLado, altoFila).stroke('#cbd5e1');
    doc.rect(xRecibe, yFila, anchoLado, altoFila).stroke('#cbd5e1');
    doc.text(`${etiqueta} ${entrega}`, margenLR + 5, yFila + 4, { width: anchoLado - 10 });
    doc.text(`${etiqueta} ${recibe}`, xRecibe + 5, yFila + 4, { width: anchoLado - 10 });
    yFila += altoFila;
  });

  const yLinea = yFila + 34;
  doc.moveTo(margenLR + 10, yLinea).lineTo(margenLR + anchoLado - 10, yLinea).strokeColor('#475569').lineWidth(0.7).stroke();
  doc.moveTo(xRecibe + 10, yLinea).lineTo(xRecibe + anchoLado - 10, yLinea).stroke();
  doc.fontSize(8).fillColor('#1e293b')
     .text('Firma y Sello', margenLR, yLinea + 4, { width: anchoLado, align: 'center' })
     .text('Firma y Sello', xRecibe, yLinea + 4, { width: anchoLado, align: 'center' });

  doc.y = yLinea + 20;
}

module.exports = { generarPDFConstancia };
