/**
 * reportes.js
 * Vista maestro-detalle igual que admin-configuracion.js: lista de
 * tipos de reporte a la izquierda, resultado a la derecha.
 */

const SECCIONES_REPORTE = [
    { id: 'soportes', icono: 'bi-check2-circle', titulo: 'Soportes Realizados', subtitulo: 'Total, por técnico y por categoría' },
    { id: 'tiempos', icono: 'bi-stopwatch', titulo: 'Tiempos de Atención', subtitulo: 'Promedio hasta aceptar y resolver' },
    { id: 'cola', icono: 'bi-hourglass-split', titulo: 'Cola de Pendientes', subtitulo: 'Tickets abiertos y su antigüedad' },
    { id: 'area', icono: 'bi-building', titulo: 'Por Área / Departamento', subtitulo: 'Qué área genera más solicitudes' },
    { id: 'ranking', icono: 'bi-trophy', titulo: 'Ranking de Técnicos', subtitulo: 'Carga y tiempo de resolución' },
    { id: 'auditoria', icono: 'bi-shield-check', titulo: 'Auditoría', subtitulo: 'Inicios de sesión y todas las acciones (solo admin)' },
];

document.addEventListener('DOMContentLoaded', () => {
    if (typeof verificarSesion === 'function') verificarSesion();
    pintarSidebarReportes();
});

function pintarSidebarReportes() {
    const sidebar = document.getElementById('configSidebar');
    const session = JSON.parse(localStorage.getItem('sisste_session') || '{}');
    const esAdmin = session.rol === 'admin';

    // La Auditoría es solo para admin — ni siquiera se muestra la
    // opción a un técnico (el backend también la rechaza con 403, pero
    // mejor no mostrarla y que parezca un error).
    const secciones = esAdmin ? SECCIONES_REPORTE : SECCIONES_REPORTE.filter((s) => s.id !== 'auditoria');

    secciones.forEach((sec) => {
        const item = document.createElement('div');
        item.className = 'config-item';
        item.id = `sidebar-${sec.id}`;
        item.innerHTML = `
            <div class="config-item-icon"><i class="bi ${sec.icono}"></i></div>
            <div class="config-item-texto">
                <div class="config-item-titulo">${sec.titulo}</div>
                <div class="config-item-subtitulo">${sec.subtitulo}</div>
            </div>
        `;
        item.addEventListener('click', () => seleccionarReporte(sec.id));
        sidebar.appendChild(item);
    });
}

function seleccionarReporte(id) {
    document.querySelectorAll('.config-item').forEach((el) => el.classList.remove('activo'));
    document.getElementById(`sidebar-${id}`).classList.add('activo');

    const renderers = {
        soportes: renderReporteSoportes,
        tiempos: renderReporteTiempos,
        cola: renderReporteCola,
        area: renderReportePorArea,
        ranking: renderReporteRanking,
        auditoria: renderReporteAuditoria,
    };
    renderers[id]();
}

function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str ?? '';
    return div.innerHTML;
}

function formatoFecha(date) {
    return date.toISOString().split('T')[0];
}

/// Plantilla común: título + selector de fechas + contenedor de
/// resultado, reusada por los reportes que sí necesitan rango.
function plantillaConFechas(titulo, icono, tipoReporte) {
    const hoy = new Date();
    const primerDiaMes = new Date(hoy.getFullYear(), hoy.getMonth(), 1);
    const detalle = document.getElementById('configDetalle');
    detalle.innerHTML = `
        <h3 class="text-white mb-4"><i class="bi ${icono} me-2"></i>${titulo}</h3>
        <div class="card p-3 mb-4">
            <form id="formReporteFechas" class="row g-3 align-items-end">
                <div class="col-md-3">
                    <label class="form-label small fw-bold text-white">DESDE</label>
                    <input type="date" id="fechaDesde" class="form-control admin-form-input" value="${formatoFecha(primerDiaMes)}" required>
                </div>
                <div class="col-md-3">
                    <label class="form-label small fw-bold text-white">HASTA</label>
                    <input type="date" id="fechaHasta" class="form-control admin-form-input" value="${formatoFecha(hoy)}" required>
                </div>
                <div class="col-md-3">
                    <button type="submit" class="btn btn-primary w-100 fw-bold py-2">
                        <i class="bi bi-graph-up me-1"></i> GENERAR
                    </button>
                </div>
                <div class="col-md-3">
                    <button type="button" onclick="descargarReportePDF('${tipoReporte}')" class="btn btn-outline-info w-100 fw-bold py-2">
                        <i class="bi bi-file-earmark-pdf me-1"></i> DESCARGAR PDF
                    </button>
                </div>
            </form>
        </div>
        <div id="resultadoReporte"></div>
    `;
}

/// Descarga el PDF del reporte activo, usando el rango de fechas que
/// esté seleccionado en el formulario (si el reporte no usa fechas,
/// como "cola", se descarga sin ese parámetro).
function descargarReportePDF(tipo) {
    const desdeInput = document.getElementById('fechaDesde');
    const hastaInput = document.getElementById('fechaHasta');
    let url = `/api/reportes/pdf/${tipo}`;
    if (desdeInput && hastaInput) {
        url += `?desde=${desdeInput.value}&hasta=${hastaInput.value}`;
    }
    window.open(url, '_blank');
}

/* =====================================================================
   1. Soportes Realizados
   ===================================================================== */
function renderReporteSoportes() {
    plantillaConFechas('Soportes Realizados', 'bi-check2-circle', 'soportes');
    document.getElementById('formReporteFechas').addEventListener('submit', async (e) => {
        e.preventDefault();
        const desde = document.getElementById('fechaDesde').value;
        const hasta = document.getElementById('fechaHasta').value;
        const resultado = document.getElementById('resultadoReporte');
        try {
            const resp = await fetch(`/api/reportes/soportes?desde=${desde}&hasta=${hasta}`, { credentials: 'include' });
            const data = await resp.json();
            if (!data.success) throw new Error(data.message);

            resultado.innerHTML = `
                <div class="row">
                    <div class="col-lg-4 mb-3"><div class="card reporte-total"><div class="numero">${data.total}</div><div class="etiqueta">Soportes Realizados</div></div></div>
                    <div class="col-lg-4 mb-3"><div class="card p-3"><h6 class="text-info mb-2">Por Técnico</h6>${pintarFilas(data.porTecnico, 'tecnico', 'cantidad')}</div></div>
                    <div class="col-lg-4 mb-3"><div class="card p-3"><h6 class="text-info mb-2">Por Categoría</h6>${pintarFilas(data.porCategoria, 'categoria', 'cantidad')}</div></div>
                </div>
            `;
        } catch (err) {
            resultado.innerHTML = `<div class="alert alert-danger">${err.message || 'Error al generar el reporte.'}</div>`;
        }
    });
    document.getElementById('formReporteFechas').dispatchEvent(new Event('submit'));
}

/* =====================================================================
   2. Tiempos de Atención
   ===================================================================== */
function renderReporteTiempos() {
    plantillaConFechas('Tiempos de Atención', 'bi-stopwatch', 'tiempos');
    document.getElementById('formReporteFechas').addEventListener('submit', async (e) => {
        e.preventDefault();
        const desde = document.getElementById('fechaDesde').value;
        const hasta = document.getElementById('fechaHasta').value;
        const resultado = document.getElementById('resultadoReporte');
        try {
            const resp = await fetch(`/api/reportes/tiempos?desde=${desde}&hasta=${hasta}`, { credentials: 'include' });
            const data = await resp.json();
            if (!data.success) throw new Error(data.message);

            resultado.innerHTML = `
                <div class="row">
                    <div class="col-lg-3 mb-3"><div class="card reporte-total"><div class="numero">${data.totalTickets}</div><div class="etiqueta">Tickets creados</div></div></div>
                    <div class="col-lg-3 mb-3"><div class="card reporte-total"><div class="numero">${data.totalAceptados}</div><div class="etiqueta">Aceptados</div></div></div>
                    <div class="col-lg-3 mb-3"><div class="card reporte-total"><div class="numero">${data.horasPromedioAceptar ?? '—'}</div><div class="etiqueta">Horas prom. hasta aceptar</div></div></div>
                    <div class="col-lg-3 mb-3"><div class="card reporte-total"><div class="numero">${data.horasPromedioResolver ?? '—'}</div><div class="etiqueta">Horas prom. hasta resolver</div></div></div>
                </div>
                <p class="text-white-50 small mt-2">"Horas promedio" se calcula solo sobre los tickets que ya llegaron a ese paso (aceptados o resueltos) dentro del rango elegido.</p>
            `;
        } catch (err) {
            resultado.innerHTML = `<div class="alert alert-danger">${err.message || 'Error al generar el reporte.'}</div>`;
        }
    });
    document.getElementById('formReporteFechas').dispatchEvent(new Event('submit'));
}

/* =====================================================================
   3. Cola de Pendientes (sin rango de fechas — es una foto del momento)
   ===================================================================== */
async function renderReporteCola() {
    const detalle = document.getElementById('configDetalle');
    detalle.innerHTML = `
        <h3 class="text-white mb-4"><i class="bi bi-hourglass-split me-2"></i>Cola de Pendientes</h3>
        <button type="button" onclick="descargarReportePDF('cola')" class="btn btn-outline-info fw-bold py-2 px-4 mb-3">
            <i class="bi bi-file-earmark-pdf me-1"></i> DESCARGAR PDF
        </button>
        <div id="resultadoReporte">Cargando...</div>
    `;

    try {
        const resp = await fetch('/api/reportes/cola-pendientes', { credentials: 'include' });
        const data = await resp.json();
        if (!data.success) throw new Error(data.message);

        const filasAntiguos = data.masAntiguos.map((t) => `
            <div class="fila-reporte">
                <span>#${escapeHtml(t.seguimiento)} — ${escapeHtml(t.categoria_nombre)}</span>
                <span class="cantidad">${t.dias_abierto} día(s)</span>
            </div>
        `).join('') || '<p class="text-white-50 small">Sin tickets pendientes.</p>';

        document.getElementById('resultadoReporte').innerHTML = `
            <div class="row mb-3">
                <div class="col-lg-3 mb-2"><div class="bucket-card"><div class="numero text-success">${data.buckets.hoy}</div><div class="etiqueta">0-1 día</div></div></div>
                <div class="col-lg-3 mb-2"><div class="bucket-card"><div class="numero text-info">${data.buckets.unoATres}</div><div class="etiqueta">1-3 días</div></div></div>
                <div class="col-lg-3 mb-2"><div class="bucket-card"><div class="numero text-warning">${data.buckets.tresASiete}</div><div class="etiqueta">3-7 días</div></div></div>
                <div class="col-lg-3 mb-2"><div class="bucket-card"><div class="numero text-danger">${data.buckets.masDeSiete}</div><div class="etiqueta">+7 días</div></div></div>
            </div>
            <div class="card p-3">
                <h6 class="text-info mb-2">Los 10 más antiguos (Total pendientes: ${data.total})</h6>
                ${filasAntiguos}
            </div>
        `;
    } catch (err) {
        document.getElementById('resultadoReporte').innerHTML = `<div class="alert alert-danger">${err.message || 'Error al generar el reporte.'}</div>`;
    }
}

/* =====================================================================
   4. Por Área / Departamento
   ===================================================================== */
function renderReportePorArea() {
    plantillaConFechas('Por Área / Departamento', 'bi-building', 'area');
    document.getElementById('formReporteFechas').addEventListener('submit', async (e) => {
        e.preventDefault();
        const desde = document.getElementById('fechaDesde').value;
        const hasta = document.getElementById('fechaHasta').value;
        const resultado = document.getElementById('resultadoReporte');
        try {
            const resp = await fetch(`/api/reportes/por-area?desde=${desde}&hasta=${hasta}`, { credentials: 'include' });
            const data = await resp.json();
            if (!data.success) throw new Error(data.message);

            resultado.innerHTML = `<div class="card p-3">${pintarFilas(data.porArea, 'area', 'cantidad')}</div>`;
        } catch (err) {
            resultado.innerHTML = `<div class="alert alert-danger">${err.message || 'Error al generar el reporte.'}</div>`;
        }
    });
    document.getElementById('formReporteFechas').dispatchEvent(new Event('submit'));
}

/* =====================================================================
   5. Ranking de Técnicos
   ===================================================================== */
function renderReporteRanking() {
    plantillaConFechas('Ranking de Técnicos', 'bi-trophy', 'ranking');
    document.getElementById('formReporteFechas').addEventListener('submit', async (e) => {
        e.preventDefault();
        const desde = document.getElementById('fechaDesde').value;
        const hasta = document.getElementById('fechaHasta').value;
        const resultado = document.getElementById('resultadoReporte');
        try {
            const resp = await fetch(`/api/reportes/ranking-tecnicos?desde=${desde}&hasta=${hasta}`, { credentials: 'include' });
            const data = await resp.json();
            if (!data.success) throw new Error(data.message);

            const filas = data.ranking.map((r) => `
                <div class="fila-reporte">
                    <span>${escapeHtml(r.tecnico)}</span>
                    <span>
                        <span class="text-white-50 small me-2">${r.horasPromedio ?? '—'} h prom.</span>
                        <span class="cantidad">${r.cantidad}</span>
                    </span>
                </div>
            `).join('') || '<p class="text-white-50 small">Sin datos en este período.</p>';

            resultado.innerHTML = `<div class="card p-3">${filas}</div>`;
        } catch (err) {
            resultado.innerHTML = `<div class="alert alert-danger">${err.message || 'Error al generar el reporte.'}</div>`;
        }
    });
    document.getElementById('formReporteFechas').dispatchEvent(new Event('submit'));
}

/* =====================================================================
   6. Auditoría (solo admin — si no lo es, el backend devuelve 403)
   Muestra inicios de sesión (exitosos y fallidos) y toda acción que
   modifique datos, con la IP de origen de cada una.
   ===================================================================== */
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

function renderReporteAuditoria() {
    plantillaConFechas('Auditoría del Sistema', 'bi-shield-check', 'auditoria');
    document.getElementById('formReporteFechas').addEventListener('submit', async (e) => {
        e.preventDefault();
        const desde = document.getElementById('fechaDesde').value;
        const hasta = document.getElementById('fechaHasta').value;
        const resultado = document.getElementById('resultadoReporte');
        try {
            const resp = await fetch(`/api/reportes/auditoria?desde=${desde}&hasta=${hasta}`, { credentials: 'include' });
            if (resp.status === 403) {
                resultado.innerHTML = `<div class="alert alert-warning">Este reporte es solo para administradores.</div>`;
                return;
            }
            const data = await resp.json();
            if (!data.success) throw new Error(data.message);

            const filas = data.data.map((a) => {
                // En un login fallido el "actor" suele no existir (cédula
                // inexistente) — se muestra la cédula que se intentó.
                const cedulaIntentada = a.detalle && a.detalle.cedulaIntentada;
                const actor = a.nombre_actor || (cedulaIntentada ? `Cédula ${cedulaIntentada}` : 'Desconocido');
                const fecha = new Date(a.fecha_hora).toLocaleString('es-VE');
                const accionLegible = ETIQUETAS_ACCION[a.accion] || a.accion;
                const motivo = a.detalle && a.detalle.motivo ? ` (${a.detalle.motivo})` : '';
                const badge = a.exito
                    ? '<span class="badge bg-success ms-2">OK</span>'
                    : '<span class="badge bg-danger ms-2">FALLO</span>';
                return `
                    <div class="fila-reporte" style="align-items: flex-start;">
                        <div>
                            <strong>${escapeHtml(accionLegible)}${escapeHtml(motivo)}</strong>${badge}
                            <div class="small text-white-50">${escapeHtml(actor)} — ${fecha}</div>
                        </div>
                        <div class="small text-info text-end">
                            <i class="bi bi-hdd-network me-1"></i>${escapeHtml(a.ip_origen || 'IP desconocida')}
                        </div>
                    </div>
                `;
            }).join('') || '<p class="text-white-50 small">Sin eventos registrados en este período.</p>';

            resultado.innerHTML = `<div class="card p-3">${filas}</div>`;
        } catch (err) {
            resultado.innerHTML = `<div class="alert alert-danger">${err.message || 'Error al generar el reporte.'}</div>`;
        }
    });
    document.getElementById('formReporteFechas').dispatchEvent(new Event('submit'));
}

/* =====================================================================
   Utilidad compartida
   ===================================================================== */
function pintarFilas(lista, campoTexto, campoCantidad) {
    if (!lista || lista.length === 0) return '<p class="text-white-50 small">Sin datos.</p>';
    return lista.map((r) => `
        <div class="fila-reporte">
            <span>${escapeHtml(r[campoTexto])}</span>
            <span class="cantidad">${r[campoCantidad]}</span>
        </div>
    `).join('');
}
