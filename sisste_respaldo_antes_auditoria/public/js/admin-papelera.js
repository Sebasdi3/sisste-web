/**
 * admin-papelera.js
 */
document.addEventListener('DOMContentLoaded', () => {
    if (typeof verificarSesion === 'function') verificarSesion();
    cargarPapelera();
});

const NOMBRES_TIPO = {
    areas_departamento: 'Área',
    cargos: 'Cargo',
    pisos: 'Piso',
    rol_personalizado: 'Rol',
};

async function cargarPapelera() {
    try {
        const resp = await fetch('/api/admin/papelera', { credentials: 'include' });
        const json = await resp.json();
        if (!json.success) throw new Error();
        pintarPapelera(json.data);
    } catch (err) {
        console.error('Error al cargar papelera:', err);
    }
}

function pintarPapelera(items) {
    const contenedor = document.getElementById('listaPapelera');
    contenedor.innerHTML = '';

    if (items.length === 0) {
        contenedor.innerHTML = '<p class="text-white-50">La papelera está vacía.</p>';
        return;
    }

    items.forEach((item) => {
        const nombreVisible = item.datos.nombre || item.datos.nombre_mostrar || `#${item.datos.id}`;
        const tipoVisible = NOMBRES_TIPO[item.tipo_elemento] || item.tipo_elemento;
        const fecha = new Date(item.fecha_eliminacion).toLocaleString('es-VE');

        const row = document.createElement('div');
        row.className = 'papelera-row';
        row.innerHTML = `
            <div>
                <span class="tipo-badge">${escapeHtml(tipoVisible)}</span>
                <strong>${escapeHtml(nombreVisible)}</strong>
                <div class="small text-white-50">
                    Eliminado por ${escapeHtml(item.eliminado_por_nombre || 'desconocido')} el ${fecha}
                </div>
            </div>
            <div>
                <button class="btn btn-sm btn-outline-success me-1" onclick="restaurarItem(${item.id})">
                    <i class="bi bi-arrow-counterclockwise"></i> Restaurar
                </button>
                <button class="btn btn-sm btn-outline-danger" onclick="eliminarPermanente(${item.id})">
                    <i class="bi bi-trash3"></i>
                </button>
            </div>
        `;
        contenedor.appendChild(row);
    });
}

async function restaurarItem(id) {
    try {
        const resp = await fetch(`/api/admin/papelera/${id}/restaurar`, { method: 'POST', credentials: 'include' });
        const json = await resp.json();
        if (!json.success) throw new Error(json.message || 'No se pudo restaurar.');
        cargarPapelera();
        if (typeof Swal !== 'undefined') Swal.fire('Restaurado', '', 'success');
    } catch (err) {
        if (typeof Swal !== 'undefined') Swal.fire('Error', err.message, 'error');
    }
}

async function eliminarPermanente(id) {
    if (typeof Swal !== 'undefined') {
        const result = await Swal.fire({
            title: '¿Eliminar permanentemente?',
            text: 'Esta acción NO se puede deshacer.',
            icon: 'warning',
            showCancelButton: true,
            confirmButtonText: 'Eliminar para siempre',
            cancelButtonText: 'Cancelar',
        });
        if (!result.isConfirmed) return;
    }

    try {
        await fetch(`/api/admin/papelera/${id}`, { method: 'DELETE', credentials: 'include' });
        cargarPapelera();
    } catch (err) {
        console.error(err);
    }
}

function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str ?? '';
    return div.innerHTML;
}
