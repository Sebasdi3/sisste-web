/**
 * admin-users-selects.js
 *
 * Puebla los <select> de Área/Cargo/Piso/Rol
 * en admin-users.html con datos reales del backend. No reemplaza nada
 * de app.js — solo prepara los campos antes de que el usuario
 * interactúe con el formulario.
 */
document.addEventListener('DOMContentLoaded', () => {
    poblarSelect('area', '/api/admin/areas', 'Seleccione un área...');
    poblarSelect('cargo', '/api/admin/cargos', 'Seleccione un cargo...');
    poblarSelect('piso', '/api/admin/pisos', 'Seleccione un piso...');
    poblarSelectRoles('rol');

    // Modal de edición: mismos selects, sin placeholder (se
    // pre-selecciona el valor actual del usuario).
    poblarSelect('edit_area', '/api/admin/areas');
    poblarSelect('edit_cargo', '/api/admin/cargos');
    poblarSelect('edit_piso', '/api/admin/pisos');
    poblarSelectRoles('edit_rol'); // ya editable — permite cambiar el rol del usuario
});

async function poblarSelect(selectId, apiPath, placeholder) {
    const select = document.getElementById(selectId);
    if (!select) return;

    try {
        const resp = await fetch(apiPath, { credentials: 'include' });
        const json = await resp.json();
        const activos = (json.data || []).filter((item) => item.activo);

        select.innerHTML = '';
        if (placeholder) {
            const optPlaceholder = document.createElement('option');
            optPlaceholder.value = '';
            optPlaceholder.textContent = placeholder;
            optPlaceholder.disabled = true;
            optPlaceholder.selected = true;
            select.appendChild(optPlaceholder);
        }
        activos.forEach((item) => {
            const opt = document.createElement('option');
            opt.value = item.nombre;
            opt.textContent = item.nombre;
            select.appendChild(opt);
        });
    } catch (err) {
        console.error(`Error al poblar ${selectId}:`, err);
    }
}

async function poblarSelectRoles(selectId) {
    const select = document.getElementById(selectId);
    if (!select) return;

    try {
        const resp = await fetch('/api/admin/roles/disponibles', { credentials: 'include' });
        const json = await resp.json();

        select.innerHTML = '';
        (json.data || []).forEach((rol) => {
            const opt = document.createElement('option');
            opt.value = rol.clave;
            opt.textContent = rol.nombre_mostrar;
            select.appendChild(opt);
        });
    } catch (err) {
        console.error(`Error al poblar roles en ${selectId}:`, err);
    }
}
