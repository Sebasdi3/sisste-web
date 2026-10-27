/**app.js
 * SISSTe - Lógica Global del Frontend
 * Versión: 5.2.0 (agrega el checkbox "usar la cédula como contraseña"
 * en el modal de editar usuario, combinable con "forzar cambio de
 * contraseña")
 */

let ticketsLocales = [];
let usuariosLocales = []; 

document.addEventListener('DOMContentLoaded', () => {
    verificarSesion();
    
    const loginForm = document.getElementById('loginForm');
    if (loginForm) loginForm.addEventListener('submit', manejarLogin);

    // Nota: el envío del formulario de "Nueva Solicitud" ya no lo
    // maneja este archivo — lo maneja solicitud-panel.js en exclusiva,
    // porque ese formulario ahora es dinámico (categoría/sub-opción
    // desde el backend). Tener dos listeners en el mismo <form>
    // causaba doble envío.

    // Nota: el historial de "Mis Solicitudes Recientes" en
    // solicitud-panel.html ya NO lo pinta este archivo — lo maneja
    // solicitud-panel.js en exclusiva (misma razón que el envío del
    // formulario: dos scripts pintando la misma tabla causaba una
    // carrera donde a veces se veía la versión vieja con folios
    // antiguos y texto "General").

    if (document.getElementById('tablaGestionTecnica')) {
        cargarTicketsTecnico();
        actualizarContadoresDashboard();
        setInterval(actualizarContadoresDashboard, 120000);
    }

    if (document.getElementById('tablaGestionUsuarios')) {
        cargarUsuariosAdmin();
        const formNuevoUsuario = document.getElementById('formNuevoUsuario');
        if (formNuevoUsuario) {
            formNuevoUsuario.addEventListener('submit', manejarCrearUsuario);
        }

        const checkPasswordPredeterminada = document.getElementById('passwordPredeterminada');
        if (checkPasswordPredeterminada) {
            checkPasswordPredeterminada.addEventListener('change', (e) => {
                const campoPassword = document.getElementById('password');
                if (!campoPassword) return;
                campoPassword.disabled = e.target.checked;
                campoPassword.required = !e.target.checked;
                if (e.target.checked) campoPassword.value = '';
            });
        }
        
        const formEditarUsuario = document.getElementById('formEditarUsuario');
        if (formEditarUsuario) {
            formEditarUsuario.addEventListener('submit', manejarActualizarUsuario);
        }

        // "Usar la cédula del usuario como contraseña" (modal de
        // edición): mientras está marcado, el campo de contraseña
        // manual se deshabilita y se limpia — igual patrón que el
        // checkbox equivalente del formulario de alta. El valor real
        // (la cédula) se toma de editCedulaActual al enviar el
        // formulario, no de este campo.
        const checkEditPasswordPredeterminada = document.getElementById('edit_password_predeterminada');
        if (checkEditPasswordPredeterminada) {
            checkEditPasswordPredeterminada.addEventListener('change', (e) => {
                const campoPass = document.getElementById('edit_pass');
                if (!campoPass) return;
                campoPass.disabled = e.target.checked;
                if (e.target.checked) campoPass.value = '';
            });
        }
    }
});

// ================================================= 
// 1. GESTIÓN DE SESIÓN PERSISTENTE
// ================================================= 

function verificarSesion() {
    if (window.isLoggingOut) return;

    const sessionData = localStorage.getItem('sisste_session');
    const session = sessionData ? JSON.parse(sessionData) : null;
    const path = window.location.pathname;
    
    // Si NO hay sesión y NO estamos en login, redirigir a login
    if (!session) {
        if (!path.endsWith('login.html') && path !== '/') {
            window.location.replace('/login.html');
        }
        return;
    }

    // Validar expiración (8 horas)
    const ahora = new Date().getTime();
    const ochoHoras = 8 * 60 * 60 * 1000;
    if (session.loginTime && (ahora - session.loginTime > ochoHoras)) {
        window.cerrarSesion();
        return;
    }

    const elNombre = document.getElementById('nombreUsuarioNavbar');
    if (elNombre && session.nombre) elNombre.textContent = session.nombre;

    // LÓGICA ANTI-BUCLE: Solo redirigir si el usuario está en la raíz o login
    const enPaginaAcceso = path.endsWith('login.html') || path === '/' || path.endsWith('index.html');
    
    if (enPaginaAcceso && session.rol) {
        let destino = 'solicitud-panel.html';
        const rol = session.rol.toLowerCase();
        
        if (rol === 'tecnico') destino = 'dashboard-tecnico.html';
        else if (rol === 'admin') destino = 'admin-users.html';

        // Solo ejecutar redirección si NO estamos ya en el destino
        if (!path.includes(destino)) {
            window.location.replace(destino);
        }
    }
}

async function manejarLogin(e) {
    e.preventDefault();
    const cedula = document.getElementById('cedula').value;
    const password = document.getElementById('password').value;

    try {
        const response = await fetch('/api/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ cedula, password })
        });
        const data = await response.json();

        if (data.success) {
            data.loginTime = new Date().getTime();
            localStorage.setItem('sisste_session', JSON.stringify(data));

            if (data.debeCambiarPassword) {
                await solicitarCambioPasswordObligatorio(data.redirectUrl);
            } else {
                window.location.replace(data.redirectUrl);
            }
        } else {
            Swal.fire('Atención', data.message || 'Credenciales incorrectas', 'warning');
        }
    } catch (err) {
        Swal.fire('Error', 'Error de comunicación con el servidor', 'error');
    }
}

/// Bloquea el flujo normal hasta que el usuario establezca una
/// contraseña nueva. Se usa tras el primer login de un usuario creado
/// por carga masiva (contraseña inicial = su cédula), o cuando un
/// admin marcó "forzar cambio" al resetear la contraseña de alguien.
async function solicitarCambioPasswordObligatorio(redirectUrl) {
    let passwordNueva = null;

    while (!passwordNueva) {
        const { value: formValues } = await Swal.fire({
            title: 'Debes cambiar tu contraseña',
            html:
                '<p class="small text-start">Por seguridad, establece una contraseña personal antes de continuar.</p>' +
                '<input id="swal-pass-nueva" type="password" class="swal2-input" placeholder="Nueva contraseña">' +
                '<input id="swal-pass-confirmar" type="password" class="swal2-input" placeholder="Confirmar contraseña">',
            focusConfirm: false,
            allowOutsideClick: false,
            allowEscapeKey: false,
            showCancelButton: false,
            confirmButtonText: 'Guardar y continuar',
            preConfirm: () => {
                const nueva = document.getElementById('swal-pass-nueva').value;
                const confirmar = document.getElementById('swal-pass-confirmar').value;
                if (!nueva || nueva.length < 4) {
                    Swal.showValidationMessage('La contraseña debe tener al menos 4 caracteres.');
                    return false;
                }
                if (nueva !== confirmar) {
                    Swal.showValidationMessage('Las contraseñas no coinciden.');
                    return false;
                }
                return nueva;
            },
        });

        if (formValues) passwordNueva = formValues;
    }

    try {
        const resp = await fetch('/api/cambiar-password', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ passwordNueva }),
        });
        const json = await resp.json();
        if (!json.success) throw new Error(json.message || 'No se pudo cambiar la contraseña.');

        await Swal.fire({ icon: 'success', title: 'Contraseña actualizada', timer: 1500, showConfirmButton: false, background: '#0f172a', color: '#fff' });
        window.location.replace(redirectUrl);
    } catch (err) {
        Swal.fire('Error', err.message, 'error').then(() => solicitarCambioPasswordObligatorio(redirectUrl));
    }
}

window.cerrarSesion = async function() {
    window.isLoggingOut = true; 
    try {
        await fetch('/api/logout', { method: 'POST' });
    } catch (err) {
        console.error("Error en logout server:", err);
    } finally {
        localStorage.clear(); 
        sessionStorage.clear();
        window.location.replace('/login.html');
    }
};

// ================================================= 
// 2. GESTIÓN DE SOLICITUDES (el historial y la creación en
//    solicitud-panel.html los maneja solicitud-panel.js en exclusiva)
// ================================================= 

// ================================================= 
// 3. DASHBOARD TÉCNICO
// ================================================= 

window.cargarTicketsTecnico = async function() {
    try {
        const response = await fetch(`/api/solicitudes?limite=1000&_=${new Date().getTime()}`);
        const result = await response.json();
        ticketsLocales = (result.data || []).sort((a, b) => new Date(b.fecha_creacion) - new Date(a.fecha_creacion));
        const tableBody = document.getElementById('tablaTecnicoBody');
        if (!tableBody) return;
        if ($.fn.DataTable.isDataTable('#tablaGestionTecnica')) $('#tablaGestionTecnica').DataTable().destroy();

        tableBody.innerHTML = ticketsLocales.map(t => {
            const status = getEstadoInfo(t.estado);
            const asunto = [t.categoria_nombre, t.subcategoria_nombre].filter(Boolean).join(' - ') || 'General';
            const fechaHora = t.fecha_creacion
                ? `${new Date(t.fecha_creacion).toLocaleDateString('es-VE')} ${new Date(t.fecha_creacion).toLocaleTimeString('es-VE', { hour: '2-digit', minute: '2-digit' })}`
                : 'N/A';
            return `
                <tr>
                    <td class="fw-bold text-info">#${t.seguimiento}</td>
                    <td class="small">${fechaHora}</td>
                    <td class="small">${t.solicitante_nombre || 'Usuario'}${t.solicitante_apellido ? ' ' + t.solicitante_apellido : ''}</td>
                    <td class="small">${t.solicitante_piso || 'S/N'} - ${t.solicitante_area || 'Sin Area'}</td>
                    <td>${asunto}</td>
                    <td><span class="badge ${status.class}">${status.text}</span></td>
                    <td class="small text-secondary">${t.tecnico_nombre || 'Pendiente'}</td>
                    <td class="text-end">
                        <button class="btn btn-sm btn-info text-dark fw-bold" onclick="abrirModalAccion('${t.seguimiento}')">GESTIONAR</button>
                        ${t.estado === 'atendida' ? `<a class="btn btn-sm btn-outline-success ms-1" href="/api/constancias/${t.seguimiento}/pdf" target="_blank" title="Descargar Constancia"><i class="bi bi-file-earmark-pdf"></i></a>` : ''}
                    </td>
                </tr>`;
        }).join('');

        $('#tablaGestionTecnica').DataTable({
            "destroy": true, "ordering": false,
            "language": { "url": "https://cdn.datatables.net/plug-ins/1.13.6/i18n/es-ES.json" },
            "dom": '<"row mb-3"<"col-md-6"l><"col-md-6"f>>rt<"row mt-3"<"col-md-5"i><"col-md-7"p>>'
        });
    } catch (err) { console.error("Error técnico:", err); }
};

window.abrirModalAccion = function(idSeguimiento) {
    const t = ticketsLocales.find(ticket => String(ticket.seguimiento) === String(idSeguimiento));
    if (!t) return;
    const folioSintetico = t.seguimiento;

    const esNuevo = (t.estado === 'en_espera' || t.estado === 'pendiente');
    const estaEnProceso = (t.estado === 'en_proceso');

    const asunto = [t.categoria_nombre, t.subcategoria_nombre].filter(Boolean).join(' - ') || 'General';
    const nombreCompleto = `${t.solicitante_nombre || ''}${t.solicitante_apellido ? ' ' + t.solicitante_apellido : ''}`.trim() || 'Usuario';
    const detalleTexto = t.detalle_texto ? `<p><strong>Detalle:</strong> ${t.detalle_texto}</p>` : '';
    const comentario = t.comentario && t.comentario.trim() ? t.comentario : 'Sin comentarios adicionales';

    Swal.fire({
        title: `<span style="color: #0dcaf0">Gestión #${folioSintetico}</span>`,
        background: '#1a1d20',
        color: '#fff',
        html: `<div class="text-start" style="font-size: 0.9rem;">
                <p><strong>Solicitante:</strong> ${nombreCompleto}</p>
                <p><strong>Ubicación:</strong> ${t.solicitante_piso || 'S/N'} - ${t.solicitante_area || 'Sin área'}</p>
                <hr style="border-color: rgba(255,255,255,0.1)">
                <p><strong>Estado:</strong> <span class="badge ${getEstadoInfo(t.estado).class}">${getEstadoInfo(t.estado).text}</span></p>
                <p><strong>Asunto:</strong> <span class="text-info">${asunto}</span></p>
                ${detalleTexto}
                <p style="background: rgba(255,255,255,0.05); padding: 8px; border-radius: 4px;">
                    <i>"${comentario}"</i>
                </p>
               </div>`,
        showCancelButton: true,
        showConfirmButton: esNuevo,
        showDenyButton: estaEnProceso,
        confirmButtonText: '<i class="bi bi-check-circle"></i> Aceptar Solicitud',
        denyButtonText: '<i class="bi bi-flag-fill"></i> Finalizar Tarea',
        cancelButtonText: 'Cerrar',
        confirmButtonColor: '#0dcaf0',
        denyButtonColor: '#198754'
    }).then((result) => {
        const session = JSON.parse(localStorage.getItem('sisste_session'));
        if (result.isConfirmed) {
            procesarAccionTicket(t.seguimiento, 'aceptar', session.userId);
        } else if (result.isDenied) {
            // Finalizar ahora abre el modal de Constancia de Soporte
            // Técnico (diagnóstico, recomendaciones, equipos), en vez
            // de finalizar directo sin pedir esos datos.
            if (typeof abrirModalFinalizarConstancia === 'function') {
                abrirModalFinalizarConstancia(t.seguimiento);
            } else {
                console.error('finalizar-constancia.js no está cargado en esta página.');
            }
        }
    });
};

async function procesarAccionTicket(id, accion, tecnicoId = null) {
    try {
        const response = await fetch(`/api/solicitudes/${id}/${accion}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ tecnicoId })
        });
        const res = await response.json();
        if (res.success) {
            Swal.fire({
                icon: 'success',
                title: '¡Actualizado!',
                text: accion === 'aceptar' ? 'Solicitud aceptada correctamente.' : 'Tarea finalizada con éxito.',
                background: '#1a1d20',
                color: '#fff'
            });
            cargarTicketsTecnico();
            actualizarContadoresDashboard();
        }
    } catch (e) { Swal.fire('Error', 'Error de comunicación', 'error'); }
}

window.actualizarContadoresDashboard = async function() {
    try {
        const response = await fetch('/api/stats/contadores');
        const data = await response.json();
        if (data.success) {
            const mapping = {'ticketsAsignados': data.asignados, 'ticketsCola': data.espera, 'ticketsResueltosHoy': data.hoy, 'solicitudesMes': data.mes};
            Object.keys(mapping).forEach(id => {
                const el = document.getElementById(id);
                if (el) el.innerText = mapping[id] || 0;
            });
        }
    } catch (err) {}
};

function getEstadoInfo(estado) {
    const e = estado ? estado.toLowerCase() : '';
    const map = {
        'en_espera': { text: 'EN ESPERA', class: 'bg-warning text-dark' },
        'pendiente': { text: 'EN ESPERA', class: 'bg-warning text-dark' },
        'en_proceso': { text: 'EN PROCESO', class: 'bg-info text-dark' },
        'atendida': { text: 'RESUELTO', class: 'bg-success text-white' },
        'resuelto': { text: 'RESUELTO', class: 'bg-success text-white' }
    };
    return map[e] || { text: (estado || 'DESCONOCIDO').toUpperCase(), class: 'bg-secondary' };
}

// ================================================= 
// 4. GESTIÓN DE USUARIOS (ADMIN)
// ================================================= 

async function cargarUsuariosAdmin() {
    try {
        const response = await fetch('/api/admin/users');
        const res = await response.json();
        usuariosLocales = res.data || [];
        const tableBody = document.getElementById('tablaUsuarios');
        if (!tableBody) return;

        if ($.fn.DataTable.isDataTable('#tablaGestionUsuarios')) {
            $('#tablaGestionUsuarios').DataTable().destroy();
        }

        tableBody.innerHTML = usuariosLocales.map(u => `
            <tr>
                <td>
                    <div class="fw-bold text-dark">${u.nombre}${u.apellido ? ' ' + u.apellido : ''}</div>
                    <div class="badge bg-info text-dark" style="font-size: 0.6rem;">${(u.rol_nombre_mostrar || u.rol || 'usuario').toUpperCase()}</div>
                </td>
                <td class="text-dark small">${u.cedula}</td>
                <td>
                    <div class="small text-primary fw-bold">${u.area || 'Sin Área'}</div>
                    <div class="text-dark" style="font-size: 0.75rem;">${u.cargo || 'Sin Cargo'} • Piso ${u.piso || '-'}</div>
                </td>
                <td class="text-end">
                    <button class="btn btn-sm btn-outline-info me-1 py-1" onclick="abrirModalEdicionUsuario('${u.id}')"><i class="bi bi-pencil-square"></i></button>
                    <button class="btn btn-sm btn-outline-danger py-1" onclick="eliminarUsuario('${u.id}')"><i class="bi bi-trash3"></i></button>
                </td>
            </tr>
        `).join('');

        $('#tablaGestionUsuarios').DataTable({
            "pageLength": 5,
            "lengthMenu": [[5, 10, 15, 20, -1], [5, 10, 15, 20, "Todos"]],
            "language": { "url": "https://cdn.datatables.net/plug-ins/1.13.6/i18n/es-ES.json" },
            "dom": '<"row mb-2"<"col-sm-6"l><"col-sm-6"f>>t<"row mt-2"<"col-sm-6"i><"col-sm-6"p>>'
        });

    } catch (e) { console.error("Error admin:", e); }
}

async function manejarCrearUsuario(e) {
    e.preventDefault();
    const campoApellido = document.getElementById('apellido');
    const cedula = document.getElementById('cedula').value.trim();
    const usarPasswordPredeterminada = document.getElementById('passwordPredeterminada')?.checked || false;
    const forzarCambio = document.getElementById('forzarCambioNuevoUsuario')?.checked || false;

    const datos = {
        nombre: document.getElementById('nombre').value.trim(),
        apellido: campoApellido ? campoApellido.value.trim() : '',
        cedula: cedula,
        // Si "contraseña predeterminada" está marcado, se ignora lo
        // que haya en el campo (que además queda deshabilitado) y se
        // usa la misma cédula del usuario.
        password: usarPasswordPredeterminada ? cedula : document.getElementById('password').value,
        debeCambiarPassword: forzarCambio,
        area: document.getElementById('area').value.trim(),
        piso: document.getElementById('piso').value,
        cargo: document.getElementById('cargo').value,
        rol: document.getElementById('rol').value
    };
    try {
        const response = await fetch('/api/admin/users', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(datos)
        });
        const res = await response.json();
        if (res.success) {
            Swal.fire({
                icon: 'success',
                title: '¡Éxito!',
                text: 'Usuario registrado correctamente',
                background: '#0f172a',
                color: '#fff'
            });
            document.getElementById('formNuevoUsuario').reset();
            const campoPassword = document.getElementById('password');
            if (campoPassword) { campoPassword.disabled = false; campoPassword.required = true; }
            cargarUsuariosAdmin();
        } else {
            Swal.fire('Error', res.message || 'Error al crear usuario', 'error');
        }
    } catch (err) { Swal.fire('Error', 'Fallo de conexión con el servidor', 'error'); }
}

let rolOriginalEdicion = null;
// Cédula del usuario que está abierto en el modal de edición — la usa
// manejarActualizarUsuario() cuando se marca "Usar la cédula del
// usuario como contraseña", sin depender de ningún campo visible del
// formulario (así no hay que mostrarla ni se puede alterar por error).
let editCedulaActual = null;

window.abrirModalEdicionUsuario = function(id) {
    const u = usuariosLocales.find(user => String(user.id) === String(id));
    if (!u) return;
    
    const editId = document.getElementById('edit_id');
    if (editId) {
        editId.value = u.id;
        editCedulaActual = u.cedula;
        document.getElementById('edit_area').value = u.area || '';
        document.getElementById('edit_piso').value = u.piso || '';
        document.getElementById('edit_cargo').value = u.cargo || '';

        rolOriginalEdicion = u.rol;
        const editRol = document.getElementById('edit_rol');
        if (editRol) editRol.value = u.rol || 'usuario';

        const campoPass = document.getElementById('edit_pass');
        if (campoPass) {
            campoPass.value = '';
            campoPass.type = 'password'; 
            campoPass.disabled = false;
            const icon = document.getElementById('icon_edit_pass');
            if (icon) icon.classList.replace('bi-eye-slash', 'bi-eye');
        }

        const checkForzar = document.getElementById('edit_forzar_cambio_password');
        if (checkForzar) checkForzar.checked = false;

        const checkPredeterminada = document.getElementById('edit_password_predeterminada');
        if (checkPredeterminada) checkPredeterminada.checked = false;
        
        const modalEl = document.getElementById('modalEditar');
        if (modalEl) {
            const modal = new bootstrap.Modal(modalEl);
            modal.show();
        }
    }
};

async function manejarActualizarUsuario(e) {
    e.preventDefault();
    const id = document.getElementById('edit_id').value;

    const datosEnvio = {};
    const area = document.getElementById('edit_area').value.trim();
    const piso = document.getElementById('edit_piso').value;
    const cargo = document.getElementById('edit_cargo').value.trim();

    // Si "Usar la cédula del usuario como contraseña" está marcado,
    // la contraseña final es la cédula (editCedulaActual, guardada al
    // abrir el modal), sin importar lo que haya en el campo de texto
    // (que además queda deshabilitado mientras el checkbox esté
    // marcado). Si no, se usa lo que el admin haya escrito a mano,
    // igual que antes.
    const usarCedulaPredeterminada = document.getElementById('edit_password_predeterminada')?.checked || false;
    const passManual = document.getElementById('edit_pass').value;
    const pass = usarCedulaPredeterminada ? editCedulaActual : passManual;

    const forzarCambio = document.getElementById('edit_forzar_cambio_password')?.checked || false;
    const nuevoRol = document.getElementById('edit_rol')?.value;

    if (area) datosEnvio.area = area;
    if (piso) datosEnvio.piso = piso;
    if (cargo) datosEnvio.cargo = cargo;
    if (pass) {
        datosEnvio.password = pass;
        datosEnvio.debeCambiarPassword = forzarCambio;
    }

    const cambioDeRol = nuevoRol && rolOriginalEdicion && nuevoRol !== rolOriginalEdicion;

    if (Object.keys(datosEnvio).length === 0 && !cambioDeRol) {
        Swal.fire('Sin cambios', 'No hay datos nuevos para actualizar', 'info');
        return;
    }

    try {
        // El cambio de rol es una operación aparte (mueve el perfil
        // entre tablas), se hace antes de actualizar el resto de campos.
        if (cambioDeRol) {
            const respRol = await fetch(`/api/admin/users/${id}/rol`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ nuevoRol }),
            });
            const resRol = await respRol.json();
            if (!resRol.success) throw new Error(resRol.message || 'No se pudo cambiar el rol.');
        }

        let res = { success: true };
        if (Object.keys(datosEnvio).length > 0) {
            const response = await fetch(`/api/admin/users/${id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(datosEnvio)
            });
            res = await response.json();
        }

        if (res.success) {
            const modalEl = document.getElementById('modalEditar');
            const modal = bootstrap.Modal.getInstance(modalEl);
            if (modal) modal.hide();

            Swal.fire({
                icon: 'success',
                title: 'Actualizado',
                text: 'Datos guardados correctamente',
                background: '#0f172a',
                color: '#fff'
            });
            cargarUsuariosAdmin();
        } else {
            Swal.fire('Error', res.message || 'Error al actualizar', 'error');
        }
    } catch (err) { Swal.fire('Error', err.message || 'Fallo de conexión', 'error'); }
}

window.eliminarUsuario = function(id) {
    Swal.fire({
        title: '¿Eliminar usuario?',
        text: "Esta acción no se puede deshacer",
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#ef4444',
        cancelButtonColor: '#3085d6',
        confirmButtonText: 'Sí, eliminar',
        cancelButtonText: 'Cancelar',
        background: '#0f172a',
        color: '#fff'
    }).then(async (result) => {
        if (result.isConfirmed) {
            try {
                const response = await fetch(`/api/admin/users/${id}`, { method: 'DELETE' });
                const res = await response.json();
                if (res.success) {
                    Swal.fire('Eliminado', 'Usuario removido del sistema', 'success');
                    cargarUsuariosAdmin();
                }
            } catch (e) { Swal.fire('Error', 'No se pudo eliminar', 'error'); }
        }
    });
};

// ================================================= 
// 5. UTILIDADES Y MODALES
// ================================================= 

window.togglePassword = function(idInput) {
    const input = document.getElementById(idInput);
    const icon = document.getElementById('icon_' + idInput);
    if (!input || !icon) return;
    
    if (input.type === "password") {
        input.type = "text";
        icon.classList.replace('bi-eye', 'bi-eye-slash');
    } else {
        input.type = "password";
        icon.classList.replace('bi-eye-slash', 'bi-eye');
    }
};

// Nota: verResumen para solicitud-panel.html ya no vive aquí — lo
// define solicitud-panel.js con la firma correcta (folio, asunto,
// comentario). Esta versión vieja (1 solo parámetro) quedó sin
// llamadores tras quitar cargarHistorialUsuario.

window.seleccionarOpcion = function(event, valor) {
    event.preventDefault(); 
    const input = document.getElementById('tipoProblema');
    if (input) {
        input.value = valor;
        const btn = event.target.closest('.dropdown').querySelector('.dropdown-toggle');
        const dropdown = bootstrap.Dropdown.getInstance(btn);
        if (dropdown) dropdown.hide();
    }
};
