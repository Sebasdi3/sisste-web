const PDFDocument = require('pdfkit');
const sizeOf = require('image-size').default || require('image-size');
const pool = require('../db/db.config');

const COLOR_INSTITUCIONAL = '#1e3a5f';

async function obtenerConfigPlantilla() {
  const result = await pool.query('SELECT * FROM configuracion_reportes WHERE id = 1');
  return result.rows[0] || { texto_encabezado: 'SISSTe', texto_pie: '' };
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
    console.error('No se pudo leer las dimensiones de la imagen (se usa altura por defecto):', err.message);
    return alturaMinima || 80;
  }
}

const TITULOS = {
  soportes: 'Reporte de Soportes Realizados',
  tiempos: 'Reporte de Tiempos de Atención',
  cola: 'Reporte de Cola de Pendientes',
  area: 'Reporte por Área / Departamento',
  ranking: 'Ranking de Técnicos',
  auditoria: 'Reporte de Auditoría del Sistema',
};

// Nombres legibles de las acciones que el backend etiqueta
// explícitamente. Cualquier acción que no esté aquí (por ejemplo una
// ruta nueva que nadie etiquetó) se muestra tal cual viene —
// "METODO /ruta" — así nunca queda un evento sin mostrar.
const ETIQUETAS_ACCION = {
  login_exitoso: 'Inicio de sesión exitoso',
  login_fallido: 'Inicio de sesión FALLIDO',
  logout: 'Cierre de sesión',
  cambiar_password_propia: 'Cambió su propia contraseña',
  crear_usuario: 'Creó un usuario',
  actualizar_usuario: 'Actualizó un usuario',
  eliminar_usuario: 'Eliminó un usuario',
  cambiar_rol: 'Cambió el rol de un usuario',
  carga_masiva_usuarios: 'Carga masiva de usuarios',
  eliminacion_masiva_usuarios: 'Eliminación masiva de usuarios',
  crear_categoria: 'Creó una categoría',
  actualizar_categoria: 'Actualizó una categoría',
  eliminar_categoria: 'Eliminó una categoría',
  crear_subcategoria: 'Creó una sub-opción',
  actualizar_subcategoria: 'Actualizó una sub-opción',
  eliminar_subcategoria: 'Eliminó una sub-opción',
  crear_areas_departamento: 'Creó un área',
  actualizar_areas_departamento: 'Actualizó un área',
  eliminar_areas_departamento: 'Eliminó un área',
  crear_cargos: 'Creó un cargo',
  actualizar_cargos: 'Actualizó un cargo',
  eliminar_cargos: 'Eliminó un cargo',
  crear_pisos: 'Creó un piso',
  actualizar_pisos: 'Actualizó un piso',
  eliminar_pisos: 'Eliminó un piso',
  crear_rol: 'Creó un rol',
  actualizar_rol: 'Actualizó un rol',
  eliminar_rol: 'Eliminó un rol',
  actualizar_etiqueta_rol_core: 'Renombró un rol del sistema',
  restaurar_papelera: 'Restauró un elemento de la papelera',
  eliminar_permanente_papelera: 'Eliminó permanentemente de la papelera',
  actualizar_plantilla_reportes: 'Cambió la plantilla de reportes',
  actualizar_plantilla_constancias: 'Cambió la plantilla de constancias',
  crear_solicitud: 'Creó una solicitud',
  aceptar_solicitud: 'Aceptó una solicitud',
  finalizar_solicitud: 'Finalizó una solicitud',
  finalizar_con_constancia: 'Finalizó solicitud con constancia',
  consultar_auditoria: 'Consultó la auditoría',
  descargar_auditoria_pdf: 'Descargó la auditoría en PDF',
};

function tituloSeccion(doc, texto, margenLR) {
  doc.x = margenLR;
  doc.moveDown(0.5);
  doc.fontSize(12).font('Helvetica-Bold').fillColor(COLOR_INSTITUCIONAL).text(texto, margenLR, doc.y);
  doc.moveDown(0.3);
  doc.x = margenLR;
}

function filaSimple(doc, etiqueta, valor, margenLR) {
  doc.x = margenLR;
  doc.font('Helvetica').fontSize(10).fillColor('#1e293b').text(`${etiqueta}: `, margenLR, doc.y, { continued: true });
  doc.font('Helvetica-Bold').text(String(valor));
  doc.x = margenLR;
}

/// Dibuja una tabla real con encabezado de color institucional y
/// bordes, reusada por todos los reportes que muestran listas.
function dibujarTabla(doc, columnas, filas, margenLR, anchoUtil) {
  if (filas.length === 0) {
    doc.font('Helvetica').fontSize(9).fillColor('#64748b').text('Sin datos en este período.', margenLR, doc.y);
    doc.moveDown(0.5);
    return;
  }

  let y = doc.y;
  let x = margenLR;
  doc.fontSize(8).font('Helvetica-Bold');
  columnas.forEach((col) => {
    doc.rect(x, y, col.ancho, 18).fillAndStroke(COLOR_INSTITUCIONAL, COLOR_INSTITUCIONAL);
    doc.fillColor('#ffffff').text(col.titulo, x + 4, y + 5, { width: col.ancho - 8 });
    x += col.ancho;
  });

  y += 18;
  doc.font('Helvetica').fontSize(8);
  filas.forEach((fila) => {
    x = margenLR;
    columnas.forEach((col) => {
      doc.rect(x, y, col.ancho, 16).stroke('#cbd5e1');
      doc.fillColor('#1e293b').text(String(fila[col.campo] ?? '—'), x + 4, y + 4, { width: col.ancho - 8, height: 10, ellipsis: true });
      x += col.ancho;
    });
    y += 16;
  });

  doc.x = margenLR;
  doc.y = y + 10;
}

/* ==================== Contenido por tipo de reporte ==================== */

function contenidoSoportes(doc, data, margenLR, anchoUtil) {
  filaSimple(doc, 'Total de soportes realizados', data.total, margenLR);

  tituloSeccion(doc, 'Por Técnico', margenLR);
  dibujarTabla(doc, [
    { titulo: 'TÉCNICO', campo: 'tecnico', ancho: anchoUtil * 0.7 },
    { titulo: 'CANTIDAD', campo: 'cantidad', ancho: anchoUtil * 0.3 },
  ], data.porTecnico || [], margenLR, anchoUtil);

  tituloSeccion(doc, 'Por Categoría', margenLR);
  dibujarTabla(doc, [
    { titulo: 'CATEGORÍA', campo: 'categoria', ancho: anchoUtil * 0.7 },
    { titulo: 'CANTIDAD', campo: 'cantidad', ancho: anchoUtil * 0.3 },
  ], data.porCategoria || [], margenLR, anchoUtil);
}

function contenidoTiempos(doc, data, margenLR, anchoUtil) {
  filaSimple(doc, 'Tickets creados en el período', data.totalTickets, margenLR);
  doc.moveDown(0.3);
  filaSimple(doc, 'Tickets aceptados', data.totalAceptados, margenLR);
  doc.moveDown(0.3);
  filaSimple(doc, 'Tickets resueltos', data.totalResueltos, margenLR);
  doc.moveDown(0.3);
  filaSimple(doc, 'Horas promedio hasta aceptar', data.horasPromedioAceptar ?? 'Sin datos suficientes', margenLR);
  doc.moveDown(0.3);
  filaSimple(doc, 'Horas promedio hasta resolver', data.horasPromedioResolver ?? 'Sin datos suficientes', margenLR);
}

function contenidoCola(doc, data, margenLR, anchoUtil) {
  filaSimple(doc, 'Total de tickets pendientes', data.total, margenLR);

  tituloSeccion(doc, 'Por antigüedad', margenLR);
  dibujarTabla(doc, [
    { titulo: 'RANGO', campo: 'rango', ancho: anchoUtil * 0.7 },
    { titulo: 'CANTIDAD', campo: 'cantidad', ancho: anchoUtil * 0.3 },
  ], [
    { rango: '0-1 día', cantidad: data.buckets.hoy },
    { rango: '1-3 días', cantidad: data.buckets.unoATres },
    { rango: '3-7 días', cantidad: data.buckets.tresASiete },
    { rango: 'Más de 7 días', cantidad: data.buckets.masDeSiete },
  ], margenLR, anchoUtil);

  tituloSeccion(doc, 'Los 10 más antiguos', margenLR);
  dibujarTabla(doc, [
    { titulo: 'FOLIO', campo: 'seguimiento', ancho: anchoUtil * 0.25 },
    { titulo: 'CATEGORÍA', campo: 'categoria_nombre', ancho: anchoUtil * 0.5 },
    { titulo: 'ANTIGÜEDAD', campo: 'antiguedad', ancho: anchoUtil * 0.25 },
  ], (data.masAntiguos || []).map((t) => ({ ...t, antiguedad: `${t.dias_abierto} día(s)` })), margenLR, anchoUtil);
}

function contenidoArea(doc, data, margenLR, anchoUtil) {
  tituloSeccion(doc, 'Solicitudes por Área / Departamento', margenLR);
  dibujarTabla(doc, [
    { titulo: 'ÁREA', campo: 'area', ancho: anchoUtil * 0.7 },
    { titulo: 'CANTIDAD', campo: 'cantidad', ancho: anchoUtil * 0.3 },
  ], data.porArea || [], margenLR, anchoUtil);
}

function contenidoRanking(doc, data, margenLR, anchoUtil) {
  tituloSeccion(doc, 'Ranking de Técnicos', margenLR);
  dibujarTabla(doc, [
    { titulo: 'TÉCNICO', campo: 'tecnico', ancho: anchoUtil * 0.4 },
    { titulo: 'CANTIDAD', campo: 'cantidad', ancho: anchoUtil * 0.3 },
    { titulo: 'H. PROMEDIO', campo: 'horasPromedio', ancho: anchoUtil * 0.3 },
  ], (data.ranking || []).map((r) => ({ ...r, horasPromedio: r.horasPromedio ?? '—' })), margenLR, anchoUtil);
}

function contenidoAuditoria(doc, data, margenLR, anchoUtil) {
  tituloSeccion(doc, 'Eventos de Auditoría', margenLR);
  const filas = (data.data || []).map((a) => {
    // Para un login fallido, el "actor" es la cédula que se intentó
    // (a veces no corresponde a ningún usuario real).
    const actor = a.nombre_actor
      || (a.detalle && a.detalle.cedulaIntentada ? `Cédula ${a.detalle.cedulaIntentada}` : null)
      || 'Desconocido';
    return {
      fecha: new Date(a.fecha_hora).toLocaleString('es-VE', { timeZone: 'America/Caracas' }),
      actor,
      accion: ETIQUETAS_ACCION[a.accion] || a.accion,
      ip: a.ip_origen || '—',
      resultado: a.exito ? 'OK' : 'FALLO',
    };
  });
  dibujarTabla(doc, [
    { titulo: 'FECHA', campo: 'fecha', ancho: anchoUtil * 0.22 },
    { titulo: 'USUARIO', campo: 'actor', ancho: anchoUtil * 0.22 },
    { titulo: 'ACCIÓN', campo: 'accion', ancho: anchoUtil * 0.30 },
    { titulo: 'IP ORIGEN', campo: 'ip', ancho: anchoUtil * 0.16 },
    { titulo: 'RESULTADO', campo: 'resultado', ancho: anchoUtil * 0.10 },
  ], filas, margenLR, anchoUtil);
}

const CONTENIDO_POR_TIPO = {
  soportes: contenidoSoportes,
  tiempos: contenidoTiempos,
  cola: contenidoCola,
  area: contenidoArea,
  ranking: contenidoRanking,
  auditoria: contenidoAuditoria,
};

/// Genera el PDF completo, tamaño CARTA (Letter), con el mismo tema
/// visual institucional que las Constancias (barra de título azul
/// marino + tablas con bordes), y lo envía directo por la respuesta
/// HTTP. El encabezado y el pie de página son imágenes de ancho
/// completo (ej. una bandera institucional) configurables aparte.
async function generarPDFReporte(tipo, data, desde, hasta, res) {
  const config = await obtenerConfigPlantilla();
  const anchoPagina = 612; // Carta (Letter) en puntos
  const margenLR = 40;
  const anchoUtil = anchoPagina - margenLR * 2;

  const bufferEncabezado = base64ToBuffer(config.encabezado_imagen_base64);
  const bufferPie = base64ToBuffer(config.pie_imagen_base64);
  const alturaImgEncabezado = bufferEncabezado ? alturaProporcional(bufferEncabezado, anchoPagina, 40, 130) : 0;
  const alturaImgPie = bufferPie ? alturaProporcional(bufferPie, anchoPagina, 30, 100) : 0;

  const ALTO_BARRA_TITULO = 26;
  const margenTop = alturaImgEncabezado + ALTO_BARRA_TITULO + 50; // +50: espacio para período/generado
  const margenBottom = alturaImgPie + 24;

  const doc = new PDFDocument({ size: 'LETTER', margins: { top: margenTop, bottom: margenBottom, left: margenLR, right: margenLR }, bufferPages: true });

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="reporte-${tipo}.pdf"`);
  doc.pipe(res);

  function dibujarEncabezadoCompleto() {
    if (bufferEncabezado) doc.image(bufferEncabezado, 0, 0, { width: anchoPagina, height: alturaImgEncabezado });
    doc.rect(margenLR, alturaImgEncabezado, anchoUtil, ALTO_BARRA_TITULO).fill(COLOR_INSTITUCIONAL);
    doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(12)
       .text(config.texto_encabezado || 'SISSTe', margenLR, alturaImgEncabezado + 7, { width: anchoUtil, align: 'center' });
  }
  dibujarEncabezadoCompleto();
  doc.on('pageAdded', dibujarEncabezadoCompleto);

  // Título del reporte, período y fecha de generación — solo en la
  // primera página, dentro del espacio reservado en margenTop.
  let cursorTitulo = alturaImgEncabezado + ALTO_BARRA_TITULO + 10;
  doc.fontSize(15).font('Helvetica-Bold').fillColor('#0f172a').text(TITULOS[tipo] || 'Reporte', margenLR, cursorTitulo, { width: anchoUtil });
  cursorTitulo += 20;
  if (desde && hasta) {
    doc.fontSize(9).font('Helvetica').fillColor('#64748b').text(`Período: ${desde} al ${hasta}`, margenLR, cursorTitulo);
    cursorTitulo += 13;
  }
  doc.fontSize(9).fillColor('#64748b').text(`Generado el: ${new Date().toLocaleString('es-VE', { timeZone: 'America/Caracas' })}`, margenLR, cursorTitulo);

  doc.x = margenLR;
  doc.y = margenTop;

  const funcionContenido = CONTENIDO_POR_TIPO[tipo];
  if (funcionContenido) funcionContenido(doc, data, margenLR, anchoUtil);

  // --- Pie de página en todas las páginas ---
  const range = doc.bufferedPageRange();
  for (let i = range.start; i < range.start + range.count; i++) {
    doc.switchToPage(i);
    const margenInferiorOriginal = doc.page.margins.bottom;
    doc.page.margins.bottom = 0;

    if (bufferPie) {
      doc.image(bufferPie, 0, doc.page.height - alturaImgPie, { width: anchoPagina, height: alturaImgPie });
    }
    doc.fontSize(8).fillColor('#94a3b8')
       .text(config.texto_pie || '', margenLR, doc.page.height - alturaImgPie - 16, { width: 350, align: 'left' })
       .text(`Página ${i + 1} de ${range.count}`, anchoPagina - 195, doc.page.height - alturaImgPie - 16, { width: 155, align: 'right' });

    doc.page.margins.bottom = margenInferiorOriginal;
  }

  doc.end();
}

module.exports = { generarPDFReporte };
