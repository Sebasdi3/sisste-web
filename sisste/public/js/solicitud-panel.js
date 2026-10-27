/**
 * solicitud-panel.js
 *
 * Lógica específica del formulario dinámico de solicitudes.
 * Asume que /js/app.js ya definió: verificarSesion(), cerrarSesion(),
 * y que hay una sesión activa (el backend rechaza con 401 si no).
 *
 * El historial usa DataTables (búsqueda, orden, paginación), igual
 * que la tabla de gestión técnica del dashboard del técnico.
 */

let CATEGORIAS = [];
let categoriaSeleccionada = null;
let subcategoriaSeleccionada = null;
let historialLocal = [];

document.addEventListener('DOMContentLoaded', () => {
    if (typeof verificarSesion === 'function') verificarSesion();

    cargarCategorias();
    cargarHistorialSolicitudes();

    document.getElementById('solicitudForm').addEventListener('submit', enviarSolicitud);
});

/// Trae las categorías activas y sus sub-opciones, y pinta el dropdown.
async function cargarCategorias() {
    try {
        const resp = await fetch('/api/categorias', { credentials: 'include' });
        const json = await resp.json();

        if (!json.success) throw new Error('No se pudieron cargar las categorías.');

        CATEGORIAS = json.data;
        pintarDropdownCategorias();
    } catch (err) {
        console.error('Error al cargar categorías:', err);
        document.getElementById('tipoProblema').placeholder = 'Error al cargar categorías';
        if (typeof Swal !== 'undefined') {
            Swal.fire('Error', 'No se pudieron cargar las categorías del sistema. Recarga la página.', 'error');
        }
    }
}

function pintarDropdownCategorias() {
    const lista = document.getElementById('listaCategorias');
    lista.innerHTML = '';

    CATEGORIAS.forEach((cat, index) => {
        const li = document.createElement('li');
        const subNombres = cat.subcategorias.map((s) => s.nombre).join(', ');
        li.innerHTML = `
            <a class="dropdown-item dropdown-item-custom py-2" href="#" data-categoria-id="${cat.id}">
                <strong>${escapeHtml(cat.nombre)}</strong><br>
                <small>${escapeHtml(subNombres || 'Sin sub-opciones')}</small>
            </a>
        `;
        li.querySelector('a').addEventListener('click', (e) => {
            e.preventDefault();
            seleccionarCategoria(cat.id);
        });
        lista.appendChild(li);

        if (index < CATEGORIAS.length - 1) {
            const divider = document.createElement('li');
            divider.innerHTML = '<hr class="dropdown-divider">';
            lista.appendChild(divider);
        }
    });

    document.getElementById('tipoProblema').placeholder = 'Haga clic para seleccionar...';
}

function seleccionarCategoria(categoriaId) {
    categoriaSeleccionada = CATEGORIAS.find((c) => c.id === categoriaId);
    subcategoriaSeleccionada = null;

    document.getElementById('tipoProblema').value = categoriaSeleccionada.nombre;
    ocultarTextoLibre();
    pintarSubopciones();
}

function pintarSubopciones() {
    const container = document.getElementById('subopcionesContainer');
    const lista = document.getElementById('listaSubopciones');
    lista.innerHTML = '';

    const subs = categoriaSeleccionada.subcategorias || [];
    if (subs.length === 0) {
        container.style.display = 'none';
        return;
    }

    subs.forEach((sub) => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'subopcion-btn';
        btn.textContent = sub.nombre;
        btn.dataset.subId = sub.id;
        btn.addEventListener('click', () => seleccionarSubopcion(sub, btn));
        lista.appendChild(btn);
    });

    container.style.display = 'block';
}

function seleccionarSubopcion(sub, btnElemento) {
    subcategoriaSeleccionada = sub;

    document.querySelectorAll('.subopcion-btn').forEach((b) => b.classList.remove('activa'));
    btnElemento.classList.add('activa');

    if (sub.permiteTextoLibre) {
        mostrarTextoLibre();
    } else {
        ocultarTextoLibre();
    }
}

function mostrarTextoLibre() {
    document.getElementById('detalleTextoLibreContainer').style.display = 'block';
}

function ocultarTextoLibre() {
    document.getElementById('detalleTextoLibreContainer').style.display = 'none';
    document.getElementById('detalleTextoLibre').value = '';
}

async function enviarSolicitud(e) {
    e.preventDefault();

    if (!categoriaSeleccionada) {
        if (typeof Swal !== 'undefined') Swal.fire('Falta información', 'Selecciona una categoría.', 'warning');
        return;
    }
    const subs = categoriaSeleccionada.subcategorias || [];
    if (subs.length > 0 && !subcategoriaSeleccionada) {
        if (typeof Swal !== 'undefined') Swal.fire('Falta información', 'Selecciona una sub-opción.', 'warning');
        return;
    }
    if (subcategoriaSeleccionada && subcategoriaSeleccionada.permiteTextoLibre) {
        const texto = document.getElementById('detalleTextoLibre').value.trim();
        if (!texto) {
            if (typeof Swal !== 'undefined') Swal.fire('Falta información', 'Especifica el detalle.', 'warning');
            return;
        }
    }

    const payload = {
        categoriaId: categoriaSeleccionada.id,
        subcategoriaId: subcategoriaSeleccionada ? subcategoriaSeleccionada.id : null,
        detalleTexto: subcategoriaSeleccionada && subcategoriaSeleccionada.permiteTextoLibre
            ? document.getElementById('detalleTextoLibre').value.trim()
            : null,
        comentario: document.getElementById('comentario').value.trim(),
    };

    const btn = document.getElementById('btnEnviarSolicitud');
    btn.disabled = true;
    btn.textContent = 'Enviando...';

    try {
        const resp = await fetch('/api/solicitudes', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify(payload),
        });
        const json = await resp.json();

        if (!json.success) throw new Error(json.message || 'No se pudo enviar la solicitud.');

        document.getElementById('folioSeguimiento').textContent = json.seguimiento;
        const modal = new bootstrap.Modal(document.getElementById('modalExito'));
        modal.show();

        document.getElementById('solicitudForm').reset();
        categoriaSeleccionada = null;
        subcategoriaSeleccionada = null;
        document.getElementById('subopcionesContainer').style.display = 'none';
        ocultarTextoLibre();

        cargarHistorialSolicitudes();
    } catch (err) {
        console.error('Error al enviar solicitud:', err);
        if (typeof Swal !== 'undefined') {
            Swal.fire('Error', err.message || 'No se pudo enviar la solicitud. Intenta de nuevo.', 'error');
        }
    } finally {
        btn.disabled = false;
        btn.textContent = 'ENVIAR SOLICITUD';
    }
}

/// Carga el historial y lo pinta con DataTables (búsqueda, orden y
/// paginación), igual que la tabla de gestión técnica del dashboard.
async function cargarHistorialSolicitudes() {
    try {
        const resp = await fetch('/api/solicitudes', { credentials: 'include' });
        const json = await resp.json();
        if (!json.success) return;

        historialLocal = json.data || [];

        const tbody = document.getElementById('historialBody');
        if (!tbody) return;

        if ($.fn.DataTable.isDataTable('#tablaSolicitudes')) {
            $('#tablaSolicitudes').DataTable().destroy();
        }

        tbody.innerHTML = historialLocal.map((s) => {
            const asunto = [s.categoria_nombre, s.subcategoria_nombre].filter(Boolean).join(' - ') || 'Sin categoría';
            const botonConstancia = s.estado === 'atendida'
                ? `<a class="btn btn-sm btn-outline-success" href="/api/constancias/${s.seguimiento}/pdf" target="_blank" title="Descargar Constancia">
                       <i class="bi bi-file-earmark-pdf"></i>
                   </a>`
                : '';
            return `
                <tr>
                    <td>${escapeHtml(s.seguimiento)}</td>
                    <td>${escapeHtml(asunto)}</td>
                    <td>${badgeEstado(s.estado)}</td>
                    <td class="text-end">
                        <button class="btn btn-sm btn-outline-info me-1" onclick="verResumen('${s.seguimiento}', '${escapeHtml(asunto)}', '${escapeHtml(s.comentario || s.detalle_texto || '')}')">
                            <i class="bi bi-eye"></i>
                        </button>
                        ${botonConstancia}
                    </td>
                </tr>
            `;
        }).join('');

        $('#tablaSolicitudes').DataTable({
            "pageLength": 5,
            "lengthMenu": [[5, 10, 15, 20, -1], [5, 10, 15, 20, "Todos"]],
            "ordering": false,
            "language": { "url": "https://cdn.datatables.net/plug-ins/1.13.6/i18n/es-ES.json" },
            "dom": '<"row mb-2"<"col-sm-6"l><"col-sm-6"f>>t<"row mt-2"<"col-sm-6"i><"col-sm-6"p>>'
        });
    } catch (err) {
        console.error('Error al cargar historial:', err);
    }
}

function badgeEstado(estado) {
    const map = {
        en_espera: '<span class="badge bg-warning text-dark">En espera</span>',
        en_proceso: '<span class="badge bg-info text-dark">En proceso</span>',
        atendida: '<span class="badge bg-success">Atendida</span>',
    };
    return map[estado] || estado;
}

function verResumen(folio, asunto, comentario) {
    document.getElementById('resumenFolio').textContent = '#' + folio;
    document.getElementById('resumenAsunto').textContent = asunto;
    document.getElementById('resumenComentario').textContent = comentario || 'Sin comentario adicional.';
    const modal = new bootstrap.Modal(document.getElementById('modalResumen'));
    modal.show();
}

function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str ?? '';
    return div.innerHTML;
}
