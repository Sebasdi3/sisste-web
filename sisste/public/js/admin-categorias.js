/**
 * admin-categorias.js
 *
 * CRUD visual de categorías/subcategorías contra /api/admin/categorias
 * y /api/admin/subcategorias. Requiere sesión con rol admin (el
 * backend rechaza con 403 si no).
 */

document.addEventListener('DOMContentLoaded', () => {
    if (typeof verificarSesion === 'function') verificarSesion();

    cargarCategoriasAdmin();

    document.getElementById('formNuevaCategoria').addEventListener('submit', crearCategoria);
    document.getElementById('formNuevaSub').addEventListener('submit', crearSubcategoria);
});

async function cargarCategoriasAdmin() {
    try {
        const resp = await fetch('/api/admin/categorias', { credentials: 'include' });
        const json = await resp.json();
        if (!json.success) throw new Error();
        pintarCategoriasAdmin(json.data);
    } catch (err) {
        console.error('Error al cargar categorías:', err);
        if (typeof Swal !== 'undefined') Swal.fire('Error', 'No se pudieron cargar las categorías.', 'error');
    }
}

function pintarCategoriasAdmin(categorias) {
    const contenedor = document.getElementById('listaCategoriasAdmin');
    contenedor.innerHTML = '';

    if (categorias.length === 0) {
        contenedor.innerHTML = '<p class="text-white-50">Aún no hay categorías. Crea la primera con el formulario de la izquierda.</p>';
        return;
    }

    categorias.forEach((cat) => {
        const card = document.createElement('div');
        card.className = 'categoria-card' + (cat.activo ? '' : ' inactiva');

        const subsHtml = (cat.subcategorias || []).map((sub) => `
            <div class="subcategoria-row${sub.activo ? '' : ' inactiva'}">
                <span>
                    ${escapeHtml(sub.nombre)}
                    ${sub.permite_texto_libre ? '<span class="badge-texto-libre">texto libre</span>' : ''}
                </span>
                <div>
                    <button class="btn btn-sm btn-outline-${sub.activo ? 'warning' : 'success'} me-1"
                        onclick="toggleSubcategoria(${sub.id}, ${!sub.activo})">
                        <i class="bi bi-${sub.activo ? 'eye-slash' : 'eye'}"></i>
                    </button>
                    <button class="btn btn-sm btn-outline-danger" onclick="eliminarSubcategoria(${sub.id})">
                        <i class="bi bi-trash"></i>
                    </button>
                </div>
            </div>
        `).join('');

        card.innerHTML = `
            <div class="categoria-header">
                <h5 class="text-info mb-0">${escapeHtml(cat.nombre)}</h5>
                <div>
                    <button class="btn btn-sm btn-outline-info me-1" onclick="abrirModalNuevaSub(${cat.id})">
                        <i class="bi bi-plus-lg"></i> Sub-opción
                    </button>
                    <button class="btn btn-sm btn-outline-${cat.activo ? 'warning' : 'success'} me-1"
                        onclick="toggleCategoria(${cat.id}, ${!cat.activo})">
                        <i class="bi bi-${cat.activo ? 'eye-slash' : 'eye'}"></i>
                    </button>
                    <button class="btn btn-sm btn-outline-danger" onclick="eliminarCategoria(${cat.id})">
                        <i class="bi bi-trash"></i>
                    </button>
                </div>
            </div>
            <div>${subsHtml || '<p class="text-white-50 small mb-0">Sin sub-opciones todavía.</p>'}</div>
        `;
        contenedor.appendChild(card);
    });
}

async function crearCategoria(e) {
    e.preventDefault();
    const nombre = document.getElementById('nombreCategoria').value.trim();
    if (!nombre) return;

    try {
        const resp = await fetch('/api/admin/categorias', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ nombre }),
        });
        const json = await resp.json();
        if (!json.success) throw new Error(json.message || 'No se pudo crear la categoría.');

        document.getElementById('nombreCategoria').value = '';
        cargarCategoriasAdmin();
    } catch (err) {
        if (typeof Swal !== 'undefined') Swal.fire('Error', err.message, 'error');
    }
}

async function toggleCategoria(id, nuevoActivo) {
    try {
        await fetch(`/api/admin/categorias/${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ activo: nuevoActivo }),
        });
        cargarCategoriasAdmin();
    } catch (err) {
        console.error(err);
    }
}

async function eliminarCategoria(id) {
    if (typeof Swal !== 'undefined') {
        const result = await Swal.fire({
            title: '¿Eliminar categoría?',
            text: 'También se eliminan todas sus sub-opciones. Esta acción no se puede deshacer.',
            icon: 'warning',
            showCancelButton: true,
            confirmButtonText: 'Eliminar',
            cancelButtonText: 'Cancelar',
        });
        if (!result.isConfirmed) return;
    }

    try {
        await fetch(`/api/admin/categorias/${id}`, { method: 'DELETE', credentials: 'include' });
        cargarCategoriasAdmin();
    } catch (err) {
        console.error(err);
    }
}

function abrirModalNuevaSub(categoriaId) {
    document.getElementById('subCategoriaIdPadre').value = categoriaId;
    document.getElementById('nombreSub').value = '';
    document.getElementById('permiteTextoLibreSub').checked = false;
    const modal = new bootstrap.Modal(document.getElementById('modalNuevaSub'));
    modal.show();
}

async function crearSubcategoria(e) {
    e.preventDefault();
    const categoriaId = document.getElementById('subCategoriaIdPadre').value;
    const nombre = document.getElementById('nombreSub').value.trim();
    const permiteTextoLibre = document.getElementById('permiteTextoLibreSub').checked;

    if (!nombre) return;

    try {
        const resp = await fetch('/api/admin/subcategorias', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ categoriaId, nombre, permiteTextoLibre }),
        });
        const json = await resp.json();
        if (!json.success) throw new Error(json.message || 'No se pudo crear la sub-opción.');

        bootstrap.Modal.getInstance(document.getElementById('modalNuevaSub')).hide();
        cargarCategoriasAdmin();
    } catch (err) {
        if (typeof Swal !== 'undefined') Swal.fire('Error', err.message, 'error');
    }
}

async function toggleSubcategoria(id, nuevoActivo) {
    try {
        await fetch(`/api/admin/subcategorias/${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ activo: nuevoActivo }),
        });
        cargarCategoriasAdmin();
    } catch (err) {
        console.error(err);
    }
}

async function eliminarSubcategoria(id) {
    if (typeof Swal !== 'undefined') {
        const result = await Swal.fire({
            title: '¿Eliminar sub-opción?',
            icon: 'warning',
            showCancelButton: true,
            confirmButtonText: 'Eliminar',
            cancelButtonText: 'Cancelar',
        });
        if (!result.isConfirmed) return;
    }

    try {
        await fetch(`/api/admin/subcategorias/${id}`, { method: 'DELETE', credentials: 'include' });
        cargarCategoriasAdmin();
    } catch (err) {
        console.error(err);
    }
}

function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str ?? '';
    return div.innerHTML;
}
