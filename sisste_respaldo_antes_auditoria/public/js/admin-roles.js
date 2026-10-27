/**
 * admin-roles.js
 */
document.addEventListener('DOMContentLoaded', () => {
    if (typeof verificarSesion === 'function') verificarSesion();

    pintarRolesCore();
    cargarRolesPersonalizados();

    document.getElementById('formNuevoRol').addEventListener('submit', crearRol);
});

async function pintarRolesCore() {
    const contenedor = document.getElementById('listaRolesCore');
    try {
        const resp = await fetch('/api/admin/roles/core', { credentials: 'include' });
        const json = await resp.json();
        contenedor.innerHTML = (json.data || []).map((r) => `
            <div class="rol-row">
                <span>${escapeHtml(r.nombre_mostrar)} <span class="clave">(${escapeHtml(r.clave)})</span></span>
                <div>
                    <button class="btn btn-sm btn-outline-info me-1" onclick="editarNombreRolCore('${r.clave}', '${r.nombre_mostrar.replace(/'/g, "\\'")}')"><i class="bi bi-pencil"></i></button>
                    <span class="rol-core-badge">Sistema</span>
                </div>
            </div>
        `).join('');
    } catch (err) {
        console.error('Error al cargar roles core:', err);
    }
}

async function editarNombreRolCore(clave, nombreActual) {
    if (typeof Swal === 'undefined') return;
    const { value: nuevoNombre } = await Swal.fire({
        title: 'Editar nombre visible',
        input: 'text',
        inputValue: nombreActual,
        inputLabel: `Clave interna "${clave}" (no se puede cambiar)`,
        showCancelButton: true,
        confirmButtonText: 'Guardar',
        cancelButtonText: 'Cancelar',
        inputValidator: (value) => (!value || !value.trim()) ? 'El nombre no puede estar vacío.' : undefined,
    });
    if (!nuevoNombre) return;

    try {
        const resp = await fetch(`/api/admin/roles/core/${clave}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ nombreMostrar: nuevoNombre.trim() }),
        });
        const json = await resp.json();
        if (!json.success) throw new Error(json.message || 'No se pudo actualizar.');
        pintarRolesCore();
    } catch (err) {
        Swal.fire('Error', err.message, 'error');
    }
}

async function cargarRolesPersonalizados() {
    try {
        const resp = await fetch('/api/admin/roles', { credentials: 'include' });
        const json = await resp.json();
        if (!json.success) throw new Error();
        pintarRolesPersonalizados(json.data);
    } catch (err) {
        console.error('Error al cargar roles:', err);
    }
}

function pintarRolesPersonalizados(roles) {
    const contenedor = document.getElementById('listaRolesPersonalizados');
    contenedor.innerHTML = '';

    if (roles.length === 0) {
        contenedor.innerHTML = '<p class="text-white-50 small">Aún no hay roles personalizados.</p>';
        return;
    }

    roles.forEach((rol) => {
        const permisos = (rol.permisos || []).join(', ') || 'ninguno';
        const row = document.createElement('div');
        row.className = 'rol-row' + (rol.activo ? '' : ' inactivo');
        row.innerHTML = `
            <div>
                <div>${escapeHtml(rol.nombre_mostrar)} <span class="clave">(${escapeHtml(rol.clave)})</span></div>
                <div class="small text-white-50">Permisos: ${escapeHtml(permisos)}</div>
            </div>
            <div>
                <button class="btn btn-sm btn-outline-${rol.activo ? 'warning' : 'success'} me-1"
                    onclick="toggleRol(${rol.id}, ${!rol.activo})">
                    <i class="bi bi-${rol.activo ? 'eye-slash' : 'eye'}"></i>
                </button>
                <button class="btn btn-sm btn-outline-danger" onclick="eliminarRol(${rol.id})">
                    <i class="bi bi-trash"></i>
                </button>
            </div>
        `;
        contenedor.appendChild(row);
    });
}

async function crearRol(e) {
    e.preventDefault();

    const nombreMostrar = document.getElementById('nombreMostrar').value.trim();
    const clave = document.getElementById('clave').value.trim();
    const permisos = [];
    if (document.getElementById('permVerSolicitudes').checked) permisos.push('ver_solicitudes');
    if (document.getElementById('permGestionarTickets').checked) permisos.push('gestionar_tickets');
    if (document.getElementById('permVerDashboard').checked) permisos.push('ver_dashboard');

    if (!nombreMostrar || !clave) return;

    try {
        const resp = await fetch('/api/admin/roles', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ clave, nombreMostrar, permisos }),
        });
        const json = await resp.json();
        if (!json.success) throw new Error(json.message || 'No se pudo crear el rol.');

        document.getElementById('formNuevoRol').reset();
        cargarRolesPersonalizados();
    } catch (err) {
        if (typeof Swal !== 'undefined') Swal.fire('Error', err.message, 'error');
    }
}

async function toggleRol(id, nuevoActivo) {
    try {
        await fetch(`/api/admin/roles/${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ activo: nuevoActivo }),
        });
        cargarRolesPersonalizados();
    } catch (err) {
        console.error(err);
    }
}

async function eliminarRol(id) {
    if (typeof Swal !== 'undefined') {
        const result = await Swal.fire({
            title: '¿Eliminar rol?',
            text: 'Se moverá a la papelera. Si hay usuarios con este rol, no se podrá eliminar.',
            icon: 'warning',
            showCancelButton: true,
            confirmButtonText: 'Eliminar',
            cancelButtonText: 'Cancelar',
        });
        if (!result.isConfirmed) return;
    }

    try {
        const resp = await fetch(`/api/admin/roles/${id}`, { method: 'DELETE', credentials: 'include' });
        const json = await resp.json();
        if (!json.success) throw new Error(json.message || 'No se pudo eliminar.');
        cargarRolesPersonalizados();
    } catch (err) {
        if (typeof Swal !== 'undefined') Swal.fire('Error', err.message, 'error');
    }
}

function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str ?? '';
    return div.innerHTML;
}
