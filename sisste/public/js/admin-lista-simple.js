/**
 * admin-lista-simple.js
 *
 * Módulo genérico reusado por admin-areas.html, admin-cargos.html y
 * admin-pisos.html — evita triplicar el mismo CRUD casi idéntico.
 * Cada página solo define window.LISTA_SIMPLE_CONFIG antes de este
 * script:
 *   { apiPath: '/api/admin/areas', etiqueta: 'Área' }
 */
document.addEventListener('DOMContentLoaded', () => {
    if (typeof verificarSesion === 'function') verificarSesion();

    const cfg = window.LISTA_SIMPLE_CONFIG;
    if (!cfg) {
        console.error('LISTA_SIMPLE_CONFIG no está definido.');
        return;
    }

    document.getElementById('tituloLista').textContent = `Gestión de ${cfg.etiqueta}s`;
    document.getElementById('tituloNuevo').textContent = `Nuevo/a ${cfg.etiqueta}`;
    document.getElementById('nombreItem').placeholder = `Ej. ${cfg.ejemplo || cfg.etiqueta}`;

    cargarLista(cfg);

    document.getElementById('formNuevoItem').addEventListener('submit', (e) => crearItem(e, cfg));
});

async function cargarLista(cfg) {
    try {
        const resp = await fetch(cfg.apiPath, { credentials: 'include' });
        const json = await resp.json();
        if (!json.success) throw new Error();
        pintarLista(json.data, cfg);
    } catch (err) {
        console.error('Error al cargar lista:', err);
    }
}

function pintarLista(items, cfg) {
    const contenedor = document.getElementById('listaItems');
    contenedor.innerHTML = '';

    if (items.length === 0) {
        contenedor.innerHTML = `<p class="text-white-50">Aún no hay ${cfg.etiqueta.toLowerCase()}s registrados.</p>`;
        return;
    }

    items.forEach((item) => {
        const row = document.createElement('div');
        row.className = 'item-row' + (item.activo ? '' : ' inactivo');
        row.innerHTML = `
            <span>${escapeHtml(item.nombre)}</span>
            <div>
                <button class="btn btn-sm btn-outline-${item.activo ? 'warning' : 'success'} me-1"
                    onclick="toggleItem(${item.id}, ${!item.activo}, '${cfg.apiPath}')">
                    <i class="bi bi-${item.activo ? 'eye-slash' : 'eye'}"></i>
                </button>
                <button class="btn btn-sm btn-outline-danger" onclick="eliminarItem(${item.id}, '${cfg.apiPath}')">
                    <i class="bi bi-trash"></i>
                </button>
            </div>
        `;
        contenedor.appendChild(row);
    });
}

async function crearItem(e, cfg) {
    e.preventDefault();
    const nombre = document.getElementById('nombreItem').value.trim();
    if (!nombre) return;

    try {
        const resp = await fetch(cfg.apiPath, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ nombre }),
        });
        const json = await resp.json();
        if (!json.success) throw new Error(json.message || 'No se pudo crear.');

        document.getElementById('nombreItem').value = '';
        cargarLista(cfg);
    } catch (err) {
        if (typeof Swal !== 'undefined') Swal.fire('Error', err.message, 'error');
    }
}

async function toggleItem(id, nuevoActivo, apiPath) {
    try {
        await fetch(`${apiPath}/${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ activo: nuevoActivo }),
        });
        cargarLista(window.LISTA_SIMPLE_CONFIG);
    } catch (err) {
        console.error(err);
    }
}

async function eliminarItem(id, apiPath) {
    if (typeof Swal !== 'undefined') {
        const result = await Swal.fire({
            title: '¿Eliminar?',
            text: 'Se moverá a la papelera, puedes restaurarlo después.',
            icon: 'warning',
            showCancelButton: true,
            confirmButtonText: 'Eliminar',
            cancelButtonText: 'Cancelar',
        });
        if (!result.isConfirmed) return;
    }

    try {
        await fetch(`${apiPath}/${id}`, { method: 'DELETE', credentials: 'include' });
        cargarLista(window.LISTA_SIMPLE_CONFIG);
    } catch (err) {
        console.error(err);
    }
}

function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str ?? '';
    return div.innerHTML;
}
