/**
 * admin-configuracion.js
 * Vista maestro-detalle estilo WhatsApp Web: lista de secciones a la
 * izquierda, detalle/CRUD de la sección elegida a la derecha.
 * Versión: reconstruida, incluye archivado en papelera de las
 * imágenes de encabezado/pie al ser sustituidas.
 */

const SECCIONES = [
    { id: 'categorias', icono: 'bi-tags', titulo: 'Categorías', subtitulo: 'Razones de solicitud y sub-opciones' },
    { id: 'areas', icono: 'bi-building', titulo: 'Áreas / Departamentos', subtitulo: 'Lista de áreas de la organización' },
    { id: 'cargos', icono: 'bi-briefcase', titulo: 'Cargos', subtitulo: 'Lista de cargos disponibles' },
    { id: 'pisos', icono: 'bi-building-fill', titulo: 'Pisos', subtitulo: 'Lista de pisos del edificio' },
    { id: 'roles', icono: 'bi-person-badge', titulo: 'Roles', subtitulo: 'Roles del sistema y permisos' },
    { id: 'carga-masiva', icono: 'bi-file-earmark-spreadsheet', titulo: 'Carga Masiva', subtitulo: 'Crear o eliminar usuarios desde Excel' },
    { id: 'plantilla-reportes', icono: 'bi-file-earmark-pdf', titulo: 'Plantilla de Reportes', subtitulo: 'Encabezado y pie de página en PDF' },
    { id: 'plantilla-constancias', icono: 'bi-file-earmark-medical', titulo: 'Plantilla de Constancias', subtitulo: 'Encabezado y pie de página de la Constancia' },
    { id: 'papelera', icono: 'bi-trash3', titulo: 'Papelera', subtitulo: 'Elementos eliminados' },
];

document.addEventListener('DOMContentLoaded', () => {
    if (typeof verificarSesion === 'function') verificarSesion();
    pintarSidebar();
});

function pintarSidebar() {
    const sidebar = document.getElementById('configSidebar');
    SECCIONES.forEach((sec) => {
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
        item.addEventListener('click', () => seleccionarSeccion(sec.id));
        sidebar.appendChild(item);
    });
}

function seleccionarSeccion(id) {
    document.querySelectorAll('.config-item').forEach((el) => el.classList.remove('activo'));
    document.getElementById(`sidebar-${id}`).classList.add('activo');

    const renderers = {
        categorias: renderCategorias,
        areas: () => renderListaSimple('/api/admin/areas', 'Área'),
        cargos: () => renderListaSimple('/api/admin/cargos', 'Cargo'),
        pisos: () => renderListaSimple('/api/admin/pisos', 'Piso'),
        roles: renderRoles,
        'carga-masiva': renderCargaMasiva,
        'plantilla-reportes': renderPlantillaReportes,
        'plantilla-constancias': renderPlantillaConstancias,
        papelera: renderPapelera,
    };
    renderers[id]();
}

function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str ?? '';
    return div.innerHTML;
}

const ETIQUETAS_TIPO_CONSTANCIA = {
    mant_correctivo: 'Mant. Correctivo',
    ofimatica: 'Ofimática',
    carpeta_compartida: 'Carp. Compartida',
    mant_preventivo: 'Mant. Preventivo',
    impresora: 'Impresora',
    otros: 'Otros',
};
function etiquetaTipoConstancia(clave) {
    return ETIQUETAS_TIPO_CONSTANCIA[clave] || clave;
}

/* =====================================================================
   SECCIÓN: Categorías / Subcategorías
   ===================================================================== */
async function renderCategorias() {
    const detalle = document.getElementById('configDetalle');
    detalle.innerHTML = `
        <h3 class="text-white mb-4"><i class="bi bi-tags me-2"></i>Categorías</h3>
        <div class="row">
            <div class="col-lg-4 mb-4">
                <div class="card p-3">
                    <h5 class="text-white mb-3">Nueva Categoría</h5>
                    <form id="formNuevaCategoria">
                        <input type="text" id="nombreCategoria" class="form-control admin-form-input mb-2" placeholder="Ej. Telefonía" required>
                        <label class="form-label small text-white-50 mb-1">Casilla en la Constancia de Soporte (opcional)</label>
                        <select id="tipoConstanciaCategoria" class="form-select admin-form-input mb-2">
                            <option value="">Ninguna</option>
                            <option value="mant_correctivo">Mant. Correctivo</option>
                            <option value="ofimatica">Ofimática</option>
                            <option value="carpeta_compartida">Carp. Compartida</option>
                            <option value="mant_preventivo">Mant. Preventivo</option>
                            <option value="impresora">Impresora</option>
                            <option value="otros">Otros</option>
                        </select>
                        <button type="submit" class="btn btn-primary w-100 fw-bold">AGREGAR</button>
                    </form>
                </div>
            </div>
            <div class="col-lg-8 mb-4">
                <div id="listaCategoriasAdminCfg"></div>
            </div>
        </div>

        <div class="modal fade" id="modalNuevaSubCfg" tabindex="-1">
            <div class="modal-dialog modal-dialog-centered">
                <div class="modal-content bg-dark text-white border-info">
                    <div class="modal-header border-secondary">
                        <h5 class="modal-title text-info">Nueva Sub-opción</h5>
                        <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal"></button>
                    </div>
                    <form id="formNuevaSubCfg">
                        <div class="modal-body">
                            <input type="hidden" id="subCategoriaIdPadreCfg">
                            <input type="text" id="nombreSubCfg" class="form-control admin-form-input mb-3" placeholder="Nombre" required>
                            <div class="form-check">
                                <input class="form-check-input" type="checkbox" id="permiteTextoLibreSubCfg">
                                <label class="form-check-label small" for="permiteTextoLibreSubCfg">Permitir texto libre (ej. "Otro")</label>
                            </div>
                        </div>
                        <div class="modal-footer border-secondary">
                            <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cancelar</button>
                            <button type="submit" class="btn btn-info fw-bold px-4">GUARDAR</button>
                        </div>
                    </form>
                </div>
            </div>
        </div>
    `;

    document.getElementById('formNuevaCategoria').addEventListener('submit', crearCategoriaCfg);
    document.getElementById('formNuevaSubCfg').addEventListener('submit', crearSubcategoriaCfg);
    cargarCategoriasAdminCfg();
}

async function cargarCategoriasAdminCfg() {
    try {
        const resp = await fetch('/api/admin/categorias', { credentials: 'include' });
        const json = await resp.json();
        if (!json.success) throw new Error();
        pintarCategoriasAdminCfg(json.data);
    } catch (err) {
        console.error(err);
    }
}

function pintarCategoriasAdminCfg(categorias) {
    const contenedor = document.getElementById('listaCategoriasAdminCfg');
    if (!contenedor) return;
    contenedor.innerHTML = '';

    if (categorias.length === 0) {
        contenedor.innerHTML = '<p class="text-white-50">Aún no hay categorías.</p>';
        return;
    }

    categorias.forEach((cat) => {
        const card = document.createElement('div');
        card.className = 'categoria-card' + (cat.activo ? '' : ' inactiva');
        const subsHtml = (cat.subcategorias || []).map((sub) => `
            <div class="subcategoria-row${sub.activo ? '' : ' inactiva'}">
                <span>${escapeHtml(sub.nombre)} ${sub.permite_texto_libre ? '<span class="badge-texto-libre">texto libre</span>' : ''}</span>
                <div>
                    <button class="btn btn-sm btn-outline-${sub.activo ? 'warning' : 'success'} me-1" data-toggle-sub="${sub.id}" data-nuevo-activo="${!sub.activo}"><i class="bi bi-${sub.activo ? 'eye-slash' : 'eye'}"></i></button>
                    <button class="btn btn-sm btn-outline-danger" data-eliminar-sub="${sub.id}"><i class="bi bi-trash"></i></button>
                </div>
            </div>
        `).join('');

        card.innerHTML = `
            <div class="categoria-header">
                <h5 class="text-info mb-0">${escapeHtml(cat.nombre)} ${cat.tipo_constancia ? `<span class="badge-texto-libre">${etiquetaTipoConstancia(cat.tipo_constancia)}</span>` : ''}</h5>
                <div>
                    <button class="btn btn-sm btn-outline-info me-1" data-nueva-sub="${cat.id}"><i class="bi bi-plus-lg"></i> Sub-opción</button>
                    <button class="btn btn-sm btn-outline-${cat.activo ? 'warning' : 'success'} me-1" data-toggle-cat="${cat.id}" data-nuevo-activo="${!cat.activo}"><i class="bi bi-${cat.activo ? 'eye-slash' : 'eye'}"></i></button>
                    <button class="btn btn-sm btn-outline-danger" data-eliminar-cat="${cat.id}"><i class="bi bi-trash"></i></button>
                </div>
            </div>
            <div>${subsHtml || '<p class="text-white-50 small mb-0">Sin sub-opciones.</p>'}</div>
        `;
        contenedor.appendChild(card);
    });

    contenedor.querySelectorAll('[data-nueva-sub]').forEach((btn) => btn.addEventListener('click', () => abrirModalNuevaSubCfg(btn.dataset.nuevaSub)));
    contenedor.querySelectorAll('[data-toggle-cat]').forEach((btn) => btn.addEventListener('click', () => toggleCategoriaCfg(btn.dataset.toggleCat, btn.dataset.nuevoActivo === 'true')));
    contenedor.querySelectorAll('[data-eliminar-cat]').forEach((btn) => btn.addEventListener('click', () => eliminarCategoriaCfg(btn.dataset.eliminarCat)));
    contenedor.querySelectorAll('[data-toggle-sub]').forEach((btn) => btn.addEventListener('click', () => toggleSubcategoriaCfg(btn.dataset.toggleSub, btn.dataset.nuevoActivo === 'true')));
    contenedor.querySelectorAll('[data-eliminar-sub]').forEach((btn) => btn.addEventListener('click', () => eliminarSubcategoriaCfg(btn.dataset.eliminarSub)));
}

async function crearCategoriaCfg(e) {
    e.preventDefault();
    const nombre = document.getElementById('nombreCategoria').value.trim();
    const tipoConstancia = document.getElementById('tipoConstanciaCategoria').value || null;
    if (!nombre) return;
    try {
        const resp = await fetch('/api/admin/categorias', {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
            body: JSON.stringify({ nombre, tipoConstancia }),
        });
        const json = await resp.json();
        if (!json.success) throw new Error(json.message);
        document.getElementById('nombreCategoria').value = '';
        document.getElementById('tipoConstanciaCategoria').value = '';
        cargarCategoriasAdminCfg();
    } catch (err) {
        if (typeof Swal !== 'undefined') Swal.fire('Error', err.message, 'error');
    }
}

async function toggleCategoriaCfg(id, nuevoActivo) {
    await fetch(`/api/admin/categorias/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify({ activo: nuevoActivo }) });
    cargarCategoriasAdminCfg();
}

async function eliminarCategoriaCfg(id) {
    if (typeof Swal !== 'undefined') {
        const r = await Swal.fire({ title: '¿Eliminar categoría?', text: 'También se eliminan sus sub-opciones.', icon: 'warning', showCancelButton: true });
        if (!r.isConfirmed) return;
    }
    await fetch(`/api/admin/categorias/${id}`, { method: 'DELETE', credentials: 'include' });
    cargarCategoriasAdminCfg();
}

function abrirModalNuevaSubCfg(categoriaId) {
    document.getElementById('subCategoriaIdPadreCfg').value = categoriaId;
    document.getElementById('nombreSubCfg').value = '';
    document.getElementById('permiteTextoLibreSubCfg').checked = false;
    new bootstrap.Modal(document.getElementById('modalNuevaSubCfg')).show();
}

async function crearSubcategoriaCfg(e) {
    e.preventDefault();
    const categoriaId = document.getElementById('subCategoriaIdPadreCfg').value;
    const nombre = document.getElementById('nombreSubCfg').value.trim();
    const permiteTextoLibre = document.getElementById('permiteTextoLibreSubCfg').checked;
    if (!nombre) return;
    try {
        const resp = await fetch('/api/admin/subcategorias', {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
            body: JSON.stringify({ categoriaId, nombre, permiteTextoLibre }),
        });
        const json = await resp.json();
        if (!json.success) throw new Error(json.message);
        bootstrap.Modal.getInstance(document.getElementById('modalNuevaSubCfg')).hide();
        cargarCategoriasAdminCfg();
    } catch (err) {
        if (typeof Swal !== 'undefined') Swal.fire('Error', err.message, 'error');
    }
}

async function toggleSubcategoriaCfg(id, nuevoActivo) {
    await fetch(`/api/admin/subcategorias/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify({ activo: nuevoActivo }) });
    cargarCategoriasAdminCfg();
}

async function eliminarSubcategoriaCfg(id) {
    if (typeof Swal !== 'undefined') {
        const r = await Swal.fire({ title: '¿Eliminar sub-opción?', icon: 'warning', showCancelButton: true });
        if (!r.isConfirmed) return;
    }
    await fetch(`/api/admin/subcategorias/${id}`, { method: 'DELETE', credentials: 'include' });
    cargarCategoriasAdminCfg();
}

/* =====================================================================
   SECCIÓN: Listas simples (Áreas / Cargos / Pisos)
   ===================================================================== */
async function renderListaSimple(apiPath, etiqueta) {
    const detalle = document.getElementById('configDetalle');
    detalle.innerHTML = `
        <h3 class="text-white mb-4"><i class="bi bi-list-ul me-2"></i>${etiqueta}s</h3>
        <div class="row">
            <div class="col-lg-4 mb-4">
                <div class="card p-3">
                    <h5 class="text-white mb-3">Nuevo/a ${etiqueta}</h5>
                    <form id="formNuevoItemLista">
                        <input type="text" id="nombreItemLista" class="form-control admin-form-input mb-2" placeholder="Nombre" required>
                        <button type="submit" class="btn btn-primary w-100 fw-bold">AGREGAR</button>
                    </form>
                </div>
            </div>
            <div class="col-lg-8 mb-4">
                <div class="card p-3"><div id="listaItemsSimple"></div></div>
            </div>
        </div>
    `;

    document.getElementById('formNuevoItemLista').addEventListener('submit', async (e) => {
        e.preventDefault();
        const nombre = document.getElementById('nombreItemLista').value.trim();
        if (!nombre) return;
        try {
            const resp = await fetch(apiPath, { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify({ nombre }) });
            const json = await resp.json();
            if (!json.success) throw new Error(json.message);
            document.getElementById('nombreItemLista').value = '';
            cargarListaSimple(apiPath);
        } catch (err) {
            if (typeof Swal !== 'undefined') Swal.fire('Error', err.message, 'error');
        }
    });

    cargarListaSimple(apiPath);
}

async function cargarListaSimple(apiPath) {
    try {
        const resp = await fetch(apiPath, { credentials: 'include' });
        const json = await resp.json();
        const contenedor = document.getElementById('listaItemsSimple');
        if (!contenedor) return;
        contenedor.innerHTML = '';

        if ((json.data || []).length === 0) {
            contenedor.innerHTML = '<p class="text-white-50">Aún no hay elementos.</p>';
            return;
        }

        json.data.forEach((item) => {
            const row = document.createElement('div');
            row.className = 'item-row' + (item.activo ? '' : ' inactivo');
            row.innerHTML = `
                <span>${escapeHtml(item.nombre)}</span>
                <div>
                    <button class="btn btn-sm btn-outline-${item.activo ? 'warning' : 'success'} me-1"><i class="bi bi-${item.activo ? 'eye-slash' : 'eye'}"></i></button>
                    <button class="btn btn-sm btn-outline-danger"><i class="bi bi-trash"></i></button>
                </div>
            `;
            const [btnToggle, btnDelete] = row.querySelectorAll('button');
            btnToggle.addEventListener('click', async () => {
                await fetch(`${apiPath}/${item.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify({ activo: !item.activo }) });
                cargarListaSimple(apiPath);
            });
            btnDelete.addEventListener('click', async () => {
                if (typeof Swal !== 'undefined') {
                    const r = await Swal.fire({ title: '¿Eliminar?', text: 'Se moverá a la papelera.', icon: 'warning', showCancelButton: true });
                    if (!r.isConfirmed) return;
                }
                await fetch(`${apiPath}/${item.id}`, { method: 'DELETE', credentials: 'include' });
                cargarListaSimple(apiPath);
            });
            contenedor.appendChild(row);
        });
    } catch (err) {
        console.error(err);
    }
}

/* =====================================================================
   SECCIÓN: Roles
   ===================================================================== */
async function renderRoles() {
    const detalle = document.getElementById('configDetalle');
    detalle.innerHTML = `
        <h3 class="text-white mb-4"><i class="bi bi-person-badge me-2"></i>Roles</h3>
        <div class="row">
            <div class="col-lg-4 mb-4">
                <div class="card p-3">
                    <h5 class="text-white mb-3">Nuevo Rol</h5>
                    <form id="formNuevoRol">
                        <input type="text" id="nombreMostrarRol" class="form-control admin-form-input mb-2" placeholder="Nombre a mostrar (ej. Supervisor)" required>
                        <input type="text" id="claveRol" class="form-control admin-form-input mb-2" placeholder="Clave interna (ej. supervisor)" required>
                        <label class="text-white small d-block mb-1">Permisos:</label>
                        <div class="form-check"><input class="form-check-input" type="checkbox" value="ver_solicitudes" id="permVerSolicitudes"><label class="form-check-label small" for="permVerSolicitudes">Ver solicitudes (como Usuario)</label></div>
                        <div class="form-check"><input class="form-check-input" type="checkbox" value="gestionar_tickets" id="permGestionarTickets"><label class="form-check-label small" for="permGestionarTickets">Gestionar tickets (como Técnico)</label></div>
                        <div class="form-check mb-3"><input class="form-check-input" type="checkbox" value="ver_dashboard" id="permVerDashboard"><label class="form-check-label small" for="permVerDashboard">Ver dashboard técnico</label></div>
                        <small class="text-white-50 d-block mb-3">No hay opción de permisos de administrador: si necesitas acceso total, crea el usuario directamente con el rol "Administrador" del sistema.</small>
                        <button type="submit" class="btn btn-primary w-100 fw-bold">CREAR ROL</button>
                    </form>
                </div>
            </div>
            <div class="col-lg-8 mb-4">
                <div class="card p-3">
                    <p class="text-white-50 small">Los roles del sistema no se pueden eliminar ni cambiar de clave interna, pero sí puedes editar su nombre visible.</p>
                    <div id="listaRolesCore" class="mb-3"></div>
                    <hr class="border-secondary opacity-25">
                    <h6 class="text-info">Roles Personalizados</h6>
                    <div id="listaRolesPersonalizados"></div>
                </div>
            </div>
        </div>
    `;

    cargarRolesCore();

    document.getElementById('formNuevoRol').addEventListener('submit', async (e) => {
        e.preventDefault();
        const nombreMostrar = document.getElementById('nombreMostrarRol').value.trim();
        const clave = document.getElementById('claveRol').value.trim();
        const permisos = [];
        if (document.getElementById('permVerSolicitudes').checked) permisos.push('ver_solicitudes');
        if (document.getElementById('permGestionarTickets').checked) permisos.push('gestionar_tickets');
        if (document.getElementById('permVerDashboard').checked) permisos.push('ver_dashboard');
        if (!nombreMostrar || !clave) return;
        try {
            const resp = await fetch('/api/admin/roles', { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify({ clave, nombreMostrar, permisos }) });
            const json = await resp.json();
            if (!json.success) throw new Error(json.message);
            document.getElementById('formNuevoRol').reset();
            cargarRolesPersonalizados();
        } catch (err) {
            if (typeof Swal !== 'undefined') Swal.fire('Error', err.message, 'error');
        }
    });
}

async function cargarRolesCore() {
    try {
        const resp = await fetch('/api/admin/roles/core', { credentials: 'include' });
        const json = await resp.json();
        const contenedor = document.getElementById('listaRolesCore');
        if (!contenedor) return;
        contenedor.innerHTML = '';

        (json.data || []).forEach((rol) => {
            const row = document.createElement('div');
            row.className = 'item-row';
            row.innerHTML = `
                <div>
                    <span id="nombreRolCore-${rol.clave}">${escapeHtml(rol.nombre_mostrar)}</span>
                    <span class="rol-core-badge ms-2">Sistema (${rol.clave})</span>
                </div>
                <button class="btn btn-sm btn-outline-info"><i class="bi bi-pencil"></i> Editar nombre</button>
            `;
            row.querySelector('button').addEventListener('click', () => editarNombreRolCore(rol.clave, rol.nombre_mostrar));
            contenedor.appendChild(row);
        });
    } catch (err) {
        console.error('Error al cargar roles core:', err);
    }
    cargarRolesPersonalizados();
}

async function editarNombreRolCore(clave, nombreActual) {
    if (typeof Swal === 'undefined') return;
    const { value: nuevoNombre } = await Swal.fire({
        title: `Editar nombre visible`,
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
        cargarRolesCore();
    } catch (err) {
        Swal.fire('Error', err.message, 'error');
    }
}

async function cargarRolesPersonalizados() {
    try {
        const resp = await fetch('/api/admin/roles', { credentials: 'include' });
        const json = await resp.json();
        const contenedor = document.getElementById('listaRolesPersonalizados');
        if (!contenedor) return;
        contenedor.innerHTML = '';

        if ((json.data || []).length === 0) {
            contenedor.innerHTML = '<p class="text-white-50 small">Aún no hay roles personalizados.</p>';
            return;
        }

        json.data.forEach((rol) => {
            const permisos = (rol.permisos || []).join(', ') || 'ninguno';
            const row = document.createElement('div');
            row.className = 'item-row' + (rol.activo ? '' : ' inactivo');
            row.innerHTML = `
                <div>
                    <div>${escapeHtml(rol.nombre_mostrar)}</div>
                    <div class="small text-white-50">Permisos: ${escapeHtml(permisos)}</div>
                </div>
                <div>
                    <button class="btn btn-sm btn-outline-${rol.activo ? 'warning' : 'success'} me-1"><i class="bi bi-${rol.activo ? 'eye-slash' : 'eye'}"></i></button>
                    <button class="btn btn-sm btn-outline-danger"><i class="bi bi-trash"></i></button>
                </div>
            `;
            const [btnToggle, btnDelete] = row.querySelectorAll('button');
            btnToggle.addEventListener('click', async () => {
                await fetch(`/api/admin/roles/${rol.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify({ activo: !rol.activo }) });
                cargarRolesPersonalizados();
            });
            btnDelete.addEventListener('click', async () => {
                if (typeof Swal !== 'undefined') {
                    const r = await Swal.fire({ title: '¿Eliminar rol?', text: 'Se moverá a la papelera.', icon: 'warning', showCancelButton: true });
                    if (!r.isConfirmed) return;
                }
                try {
                    const resp = await fetch(`/api/admin/roles/${rol.id}`, { method: 'DELETE', credentials: 'include' });
                    const json2 = await resp.json();
                    if (!json2.success) throw new Error(json2.message);
                    cargarRolesPersonalizados();
                } catch (err) {
                    if (typeof Swal !== 'undefined') Swal.fire('Error', err.message, 'error');
                }
            });
            contenedor.appendChild(row);
        });
    } catch (err) {
        console.error(err);
    }
}

/* =====================================================================
   SECCIÓN: Carga Masiva
   ===================================================================== */
function renderCargaMasiva() {
    const detalle = document.getElementById('configDetalle');
    detalle.innerHTML = `
        <h3 class="text-white mb-4"><i class="bi bi-file-earmark-spreadsheet me-2"></i>Carga Masiva de Usuarios</h3>
        <div class="row">
            <div class="col-lg-6 mb-4">
                <div class="card p-3">
                    <h5 class="text-white mb-2"><i class="bi bi-person-plus me-2"></i>Crear usuarios</h5>
                    <p class="text-white-50 small">
                        Archivo Excel (.xlsx) o CSV con las columnas:
                        <code>nombre, apellido, cedula, area, cargo, piso, rol</code>
                        (rol es opcional, "usuario" por defecto). La contraseña inicial de cada usuario
                        nuevo será <strong>su propia cédula</strong>, y el sistema le pedirá cambiarla
                        la primera vez que inicie sesión.
                    </p>
                    <input type="file" id="archivoCargaUsuarios" accept=".xlsx,.xls,.csv" class="form-control admin-form-input mb-2">
                    <div id="previewCargaUsuarios" class="small text-white-50 mb-2"></div>
                    <button id="btnConfirmarCarga" class="btn btn-primary w-100 fw-bold" disabled>
                        <i class="bi bi-upload me-1"></i> CONFIRMAR Y CREAR
                    </button>
                    <div id="resultadoCargaUsuarios" class="mt-3"></div>
                </div>
            </div>
            <div class="col-lg-6 mb-4">
                <div class="card p-3">
                    <h5 class="text-white mb-2"><i class="bi bi-person-x me-2"></i>Eliminar usuarios</h5>
                    <p class="text-white-50 small">
                        Archivo Excel (.xlsx) o CSV con una columna <code>cedula</code> listando a
                        los usuarios a eliminar (baja lógica, igual que eliminar uno por uno).
                    </p>
                    <input type="file" id="archivoEliminacionUsuarios" accept=".xlsx,.xls,.csv" class="form-control admin-form-input mb-2">
                    <div id="previewEliminacionUsuarios" class="small text-white-50 mb-2"></div>
                    <button id="btnConfirmarEliminacion" class="btn btn-danger w-100 fw-bold" disabled>
                        <i class="bi bi-trash me-1"></i> CONFIRMAR ELIMINACIÓN
                    </button>
                    <div id="resultadoEliminacionUsuarios" class="mt-3"></div>
                </div>
            </div>
        </div>
    `;

    let filasParaCrear = [];
    let cedulasParaEliminar = [];

    document.getElementById('archivoCargaUsuarios').addEventListener('change', async (e) => {
        const archivo = e.target.files[0];
        const preview = document.getElementById('previewCargaUsuarios');
        const btn = document.getElementById('btnConfirmarCarga');
        filasParaCrear = [];
        btn.disabled = true;
        document.getElementById('resultadoCargaUsuarios').innerHTML = '';

        if (!archivo) { preview.textContent = ''; return; }

        try {
            const filas = await leerExcelComoFilas(archivo);
            filasParaCrear = filas.map((f) => ({
                nombre: f.nombre || f.Nombre || '',
                apellido: f.apellido || f.Apellido || '',
                cedula: f.cedula || f.Cedula || f['Cédula'] || '',
                area: f.area || f.Area || f['Área'] || '',
                cargo: f.cargo || f.Cargo || '',
                piso: f.piso || f.Piso || '',
                rol: f.rol || f.Rol || 'usuario',
            })).filter((f) => f.nombre && f.apellido && f.cedula);

            preview.innerHTML = `<i class="bi bi-check-circle text-success me-1"></i>${filasParaCrear.length} usuario(s) listos para crear.`;
            btn.disabled = filasParaCrear.length === 0;
        } catch (err) {
            preview.innerHTML = `<i class="bi bi-x-circle text-danger me-1"></i>Error al leer el archivo: ${err.message}`;
        }
    });

    document.getElementById('btnConfirmarCarga').addEventListener('click', async () => {
        if (filasParaCrear.length === 0) return;
        const btn = document.getElementById('btnConfirmarCarga');
        btn.disabled = true;
        btn.textContent = 'Procesando...';

        try {
            const resp = await fetch('/api/admin/users/carga-masiva', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({ filas: filasParaCrear }),
            });
            const json = await resp.json();

            const errores = (json.errores || []).map((e) => `Fila ${e.fila} (${escapeHtml(e.cedula)}): ${escapeHtml(e.motivo)}`).join('<br>');
            document.getElementById('resultadoCargaUsuarios').innerHTML = `
                <div class="alert alert-success">✅ ${json.creados} usuario(s) creados correctamente.</div>
                ${errores ? `<div class="alert alert-warning small">${json.errores.length} con error:<br>${errores}</div>` : ''}
            `;
        } catch (err) {
            document.getElementById('resultadoCargaUsuarios').innerHTML = `<div class="alert alert-danger">Error al procesar la carga masiva.</div>`;
        } finally {
            btn.disabled = false;
            btn.innerHTML = '<i class="bi bi-upload me-1"></i> CONFIRMAR Y CREAR';
        }
    });

    document.getElementById('archivoEliminacionUsuarios').addEventListener('change', async (e) => {
        const archivo = e.target.files[0];
        const preview = document.getElementById('previewEliminacionUsuarios');
        const btn = document.getElementById('btnConfirmarEliminacion');
        cedulasParaEliminar = [];
        btn.disabled = true;
        document.getElementById('resultadoEliminacionUsuarios').innerHTML = '';

        if (!archivo) { preview.textContent = ''; return; }

        try {
            const filas = await leerExcelComoFilas(archivo);
            cedulasParaEliminar = filas
                .map((f) => (f.cedula || f.Cedula || f['Cédula'] || '').toString().trim())
                .filter(Boolean);

            preview.innerHTML = `<i class="bi bi-check-circle text-warning me-1"></i>${cedulasParaEliminar.length} cédula(s) listas para eliminar.`;
            btn.disabled = cedulasParaEliminar.length === 0;
        } catch (err) {
            preview.innerHTML = `<i class="bi bi-x-circle text-danger me-1"></i>Error al leer el archivo: ${err.message}`;
        }
    });

    document.getElementById('btnConfirmarEliminacion').addEventListener('click', async () => {
        if (cedulasParaEliminar.length === 0) return;

        if (typeof Swal !== 'undefined') {
            const r = await Swal.fire({
                title: `¿Eliminar ${cedulasParaEliminar.length} usuario(s)?`,
                text: 'Esta es una baja lógica — se pueden reactivar manualmente si hace falta.',
                icon: 'warning',
                showCancelButton: true,
                confirmButtonText: 'Sí, eliminar',
                cancelButtonText: 'Cancelar',
            });
            if (!r.isConfirmed) return;
        }

        const btn = document.getElementById('btnConfirmarEliminacion');
        btn.disabled = true;
        btn.textContent = 'Procesando...';

        try {
            const resp = await fetch('/api/admin/users/eliminacion-masiva', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({ cedulas: cedulasParaEliminar }),
            });
            const json = await resp.json();

            const noEncontrados = (json.noEncontrados || []).map(escapeHtml).join(', ');
            document.getElementById('resultadoEliminacionUsuarios').innerHTML = `
                <div class="alert alert-success">✅ ${json.eliminados} usuario(s) eliminados correctamente.</div>
                ${noEncontrados ? `<div class="alert alert-warning small">No encontrados: ${noEncontrados}</div>` : ''}
            `;
        } catch (err) {
            document.getElementById('resultadoEliminacionUsuarios').innerHTML = `<div class="alert alert-danger">Error al procesar la eliminación masiva.</div>`;
        } finally {
            btn.disabled = false;
            btn.innerHTML = '<i class="bi bi-trash me-1"></i> CONFIRMAR ELIMINACIÓN';
        }
    });
}

function leerExcelComoFilas(archivo) {
    return new Promise((resolve, reject) => {
        if (typeof XLSX === 'undefined') {
            reject(new Error('La librería de lectura de Excel no cargó. Recarga la página.'));
            return;
        }
        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const workbook = XLSX.read(e.target.result, { type: 'binary' });
                const primeraHoja = workbook.SheetNames[0];
                const filas = XLSX.utils.sheet_to_json(workbook.Sheets[primeraHoja], { defval: '' });
                resolve(filas);
            } catch (err) {
                reject(err);
            }
        };
        reader.onerror = () => reject(new Error('No se pudo leer el archivo.'));
        reader.readAsBinaryString(archivo);
    });
}

/* =====================================================================
   SECCIÓN: Plantilla de Reportes
   ===================================================================== */
async function renderPlantillaReportes() {
    const detalle = document.getElementById('configDetalle');
    detalle.innerHTML = `
        <h3 class="text-white mb-4"><i class="bi bi-file-earmark-pdf me-2"></i>Plantilla de Reportes (PDF)</h3>
        <p class="text-white-50 small mb-4">
            El encabezado y el pie de página son imágenes que cubren el ancho completo de la hoja
            y se repiten en <strong>todos</strong> los reportes descargados en PDF. Si sustituyes una
            imagen, la anterior se guarda en la Papelera por si necesitas recuperarla.
        </p>
        <div class="row">
            <div class="col-lg-6 mb-4">
                <div class="card p-4">
                    <h5 class="text-white mb-3"><i class="bi bi-arrow-bar-up me-2"></i>Imagen de Encabezado</h5>
                    <input type="file" id="imagenEncabezado" accept="image/png,image/jpeg" class="form-control admin-form-input mb-2">
                    <div id="previewEncabezado" class="mb-2 text-center"></div>
                    <label class="form-label fw-bold text-white small mt-2">Texto que la acompaña (opcional)</label>
                    <textarea id="textoEncabezadoPlantilla" class="form-control admin-form-input" rows="2" placeholder="Ej. Nombre de la institución"></textarea>
                </div>
            </div>
            <div class="col-lg-6 mb-4">
                <div class="card p-4">
                    <h5 class="text-white mb-3"><i class="bi bi-arrow-bar-down me-2"></i>Imagen de Pie de Página</h5>
                    <input type="file" id="imagenPie" accept="image/png,image/jpeg" class="form-control admin-form-input mb-2">
                    <div id="previewPie" class="mb-2 text-center"></div>
                    <label class="form-label fw-bold text-white small mt-2">Texto que la acompaña (opcional)</label>
                    <textarea id="textoPiePlantilla" class="form-control admin-form-input" rows="2" placeholder="Ej. Datos de contacto, aviso legal"></textarea>
                </div>
            </div>
        </div>
        <button id="btnGuardarPlantilla" class="btn btn-primary fw-bold py-2 px-4"><i class="bi bi-save me-1"></i> GUARDAR PLANTILLA</button>
        <div id="resultadoPlantilla" class="mt-3"></div>
    `;

    let encabezadoBase64Nuevo = null;
    let pieBase64Nuevo = null;

    try {
        const resp = await fetch('/api/admin/plantilla-reportes', { credentials: 'include' });
        const json = await resp.json();
        if (json.success && json.data) {
            document.getElementById('textoEncabezadoPlantilla').value = json.data.texto_encabezado || '';
            document.getElementById('textoPiePlantilla').value = json.data.texto_pie || '';
            if (json.data.encabezado_imagen_base64) {
                document.getElementById('previewEncabezado').innerHTML = `<img src="${json.data.encabezado_imagen_base64}" style="max-width: 100%; max-height: 90px; background: white; padding: 4px; border-radius: 4px;">`;
            }
            if (json.data.pie_imagen_base64) {
                document.getElementById('previewPie').innerHTML = `<img src="${json.data.pie_imagen_base64}" style="max-width: 100%; max-height: 90px; background: white; padding: 4px; border-radius: 4px;">`;
            }
        }
    } catch (err) { console.error(err); }

    function manejarSeleccionImagen(inputId, previewId, onCargar) {
        document.getElementById(inputId).addEventListener('change', (e) => {
            const archivo = e.target.files[0];
            if (!archivo) return;
            const reader = new FileReader();
            reader.onload = (ev) => {
                onCargar(ev.target.result);
                document.getElementById(previewId).innerHTML = `<img src="${ev.target.result}" style="max-width: 100%; max-height: 90px; background: white; padding: 4px; border-radius: 4px;">`;
            };
            reader.readAsDataURL(archivo);
        });
    }
    manejarSeleccionImagen('imagenEncabezado', 'previewEncabezado', (b64) => { encabezadoBase64Nuevo = b64; });
    manejarSeleccionImagen('imagenPie', 'previewPie', (b64) => { pieBase64Nuevo = b64; });

    document.getElementById('btnGuardarPlantilla').addEventListener('click', async () => {
        const textoEncabezado = document.getElementById('textoEncabezadoPlantilla').value.trim();
        const textoPie = document.getElementById('textoPiePlantilla').value.trim();
        try {
            const resp = await fetch('/api/admin/plantilla-reportes', {
                method: 'PUT', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
                body: JSON.stringify({ encabezadoImagenBase64: encabezadoBase64Nuevo, pieImagenBase64: pieBase64Nuevo, textoEncabezado, textoPie }),
            });
            const json = await resp.json();
            if (!json.success) throw new Error(json.message || 'No se pudo guardar.');
            document.getElementById('resultadoPlantilla').innerHTML = `<div class="alert alert-success">✅ Plantilla guardada correctamente. La imagen anterior (si había) quedó archivada en la Papelera.</div>`;
        } catch (err) {
            document.getElementById('resultadoPlantilla').innerHTML = `<div class="alert alert-danger">${err.message}</div>`;
        }
    });
}

/* =====================================================================
   SECCIÓN: Plantilla de Constancias
   ===================================================================== */
async function renderPlantillaConstancias() {
    const detalle = document.getElementById('configDetalle');
    detalle.innerHTML = `
        <h3 class="text-white mb-4"><i class="bi bi-file-earmark-medical me-2"></i>Plantilla de Constancias (PDF)</h3>
        <p class="text-white-50 small mb-4">
            Encabezado y pie de página de la Constancia de Soporte Técnico. Independiente de la
            plantilla de Reportes. Si sustituyes una imagen, la anterior se guarda en la Papelera.
        </p>
        <div class="row">
            <div class="col-lg-6 mb-4">
                <div class="card p-4">
                    <h5 class="text-white mb-3"><i class="bi bi-arrow-bar-up me-2"></i>Imagen de Encabezado</h5>
                    <input type="file" id="imagenEncabezadoConst" accept="image/png,image/jpeg" class="form-control admin-form-input mb-2">
                    <div id="previewEncabezadoConst" class="mb-2 text-center"></div>
                </div>
            </div>
            <div class="col-lg-6 mb-4">
                <div class="card p-4">
                    <h5 class="text-white mb-3"><i class="bi bi-arrow-bar-down me-2"></i>Imagen de Pie de Página</h5>
                    <input type="file" id="imagenPieConst" accept="image/png,image/jpeg" class="form-control admin-form-input mb-2">
                    <div id="previewPieConst" class="mb-2 text-center"></div>
                </div>
            </div>
        </div>
        <button id="btnGuardarPlantillaConst" class="btn btn-primary fw-bold py-2 px-4"><i class="bi bi-save me-1"></i> GUARDAR PLANTILLA</button>
        <div id="resultadoPlantillaConst" class="mt-3"></div>
    `;

    let encabezadoBase64Nuevo = null;
    let pieBase64Nuevo = null;

    try {
        const resp = await fetch('/api/admin/plantilla-constancias', { credentials: 'include' });
        const json = await resp.json();
        if (json.success && json.data) {
            if (json.data.encabezado_imagen_base64) {
                document.getElementById('previewEncabezadoConst').innerHTML = `<img src="${json.data.encabezado_imagen_base64}" style="max-width: 100%; max-height: 90px; background: white; padding: 4px; border-radius: 4px;">`;
            }
            if (json.data.pie_imagen_base64) {
                document.getElementById('previewPieConst').innerHTML = `<img src="${json.data.pie_imagen_base64}" style="max-width: 100%; max-height: 90px; background: white; padding: 4px; border-radius: 4px;">`;
            }
        }
    } catch (err) { console.error(err); }

    function manejarSeleccionImagenConst(inputId, previewId, onCargar) {
        document.getElementById(inputId).addEventListener('change', (e) => {
            const archivo = e.target.files[0];
            if (!archivo) return;
            const reader = new FileReader();
            reader.onload = (ev) => {
                onCargar(ev.target.result);
                document.getElementById(previewId).innerHTML = `<img src="${ev.target.result}" style="max-width: 100%; max-height: 90px; background: white; padding: 4px; border-radius: 4px;">`;
            };
            reader.readAsDataURL(archivo);
        });
    }
    manejarSeleccionImagenConst('imagenEncabezadoConst', 'previewEncabezadoConst', (b64) => { encabezadoBase64Nuevo = b64; });
    manejarSeleccionImagenConst('imagenPieConst', 'previewPieConst', (b64) => { pieBase64Nuevo = b64; });

    document.getElementById('btnGuardarPlantillaConst').addEventListener('click', async () => {
        try {
            const resp = await fetch('/api/admin/plantilla-constancias', {
                method: 'PUT', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
                body: JSON.stringify({ encabezadoImagenBase64: encabezadoBase64Nuevo, pieImagenBase64: pieBase64Nuevo }),
            });
            const json = await resp.json();
            if (!json.success) throw new Error(json.message || 'No se pudo guardar.');
            document.getElementById('resultadoPlantillaConst').innerHTML = `<div class="alert alert-success">✅ Plantilla guardada correctamente. La imagen anterior (si había) quedó archivada en la Papelera.</div>`;
        } catch (err) {
            document.getElementById('resultadoPlantillaConst').innerHTML = `<div class="alert alert-danger">${err.message}</div>`;
        }
    });
}

/* =====================================================================
   SECCIÓN: Papelera
   ===================================================================== */
const NOMBRES_TIPO_CFG = {
    areas_departamento: 'Área',
    cargos: 'Cargo',
    pisos: 'Piso',
    rol_personalizado: 'Rol',
    plantilla_reportes_encabezado: 'Imagen — Encabezado de Reportes',
    plantilla_reportes_pie: 'Imagen — Pie de Reportes',
    plantilla_constancias_encabezado: 'Imagen — Encabezado de Constancias',
    plantilla_constancias_pie: 'Imagen — Pie de Constancias',
};

// Tipos cuyo "datos" incluye una imagen, para mostrar una miniatura
// en la papelera en vez de solo texto.
const TIPOS_CON_IMAGEN = ['plantilla_reportes_encabezado', 'plantilla_reportes_pie', 'plantilla_constancias_encabezado', 'plantilla_constancias_pie'];

async function renderPapelera() {
    const detalle = document.getElementById('configDetalle');
    detalle.innerHTML = `
        <h3 class="text-white mb-4"><i class="bi bi-trash3 me-2"></i>Papelera</h3>
        <p class="text-white-50 small mb-4">Elementos eliminados o sustituidos (incluye imágenes de encabezado/pie reemplazadas). Puedes restaurarlos o eliminarlos para siempre.</p>
        <div id="listaPapeleraCfg"></div>
    `;

    try {
        const resp = await fetch('/api/admin/papelera', { credentials: 'include' });
        const json = await resp.json();
        const contenedor = document.getElementById('listaPapeleraCfg');

        if ((json.data || []).length === 0) {
            contenedor.innerHTML = '<p class="text-white-50">La papelera está vacía.</p>';
            return;
        }

        contenedor.innerHTML = '';
        json.data.forEach((item) => {
            const nombreVisible = item.datos.nombre || item.datos.nombre_mostrar || `#${item.datos.id || ''}`;
            const tipoVisible = NOMBRES_TIPO_CFG[item.tipo_elemento] || item.tipo_elemento;
            const fecha = new Date(item.fecha_eliminacion).toLocaleString('es-VE');
            const esImagen = TIPOS_CON_IMAGEN.includes(item.tipo_elemento) && item.datos.imagen_base64;

            const row = document.createElement('div');
            row.className = 'item-row';
            row.style.alignItems = 'flex-start';
            row.innerHTML = `
                <div class="d-flex align-items-start" style="gap: 12px;">
                    ${esImagen ? `<img src="${item.datos.imagen_base64}" style="max-width: 100px; max-height: 50px; background: white; padding: 2px; border-radius: 4px;">` : ''}
                    <div>
                        <span class="tipo-badge">${escapeHtml(tipoVisible)}</span>
                        <strong>${escapeHtml(nombreVisible)}</strong>
                        <div class="small text-white-50">Eliminado por ${escapeHtml(item.eliminado_por_nombre || 'desconocido')} el ${fecha}</div>
                    </div>
                </div>
                <div>
                    <button class="btn btn-sm btn-outline-success me-1"><i class="bi bi-arrow-counterclockwise"></i> Restaurar</button>
                    <button class="btn btn-sm btn-outline-danger"><i class="bi bi-trash3"></i></button>
                </div>
            `;
            const [btnRestore, btnDelete] = row.querySelectorAll('button');
            btnRestore.addEventListener('click', async () => {
                try {
                    const resp2 = await fetch(`/api/admin/papelera/${item.id}/restaurar`, { method: 'POST', credentials: 'include' });
                    const json2 = await resp2.json();
                    if (!json2.success) throw new Error(json2.message);
                    renderPapelera();
                    if (typeof Swal !== 'undefined') Swal.fire('Restaurado', '', 'success');
                } catch (err) {
                    if (typeof Swal !== 'undefined') Swal.fire('Error', err.message, 'error');
                }
            });
            btnDelete.addEventListener('click', async () => {
                if (typeof Swal !== 'undefined') {
                    const r = await Swal.fire({ title: '¿Eliminar permanentemente?', icon: 'warning', showCancelButton: true });
                    if (!r.isConfirmed) return;
                }
                await fetch(`/api/admin/papelera/${item.id}`, { method: 'DELETE', credentials: 'include' });
                renderPapelera();
            });
            contenedor.appendChild(row);
        });
    } catch (err) {
        console.error(err);
    }
}
