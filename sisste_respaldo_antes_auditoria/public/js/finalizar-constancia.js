/**
 * finalizar-constancia.js
 *
 * Modal de "Finalizar Solicitud" en dashboard-tecnico.html: pide
 * diagnóstico, recomendaciones y equipos atendidos, y llama al
 * endpoint que genera la Constancia de Soporte Técnico. Se abre en
 * vez de la confirmación simple que existía antes para "Finalizar
 * Tarea".
 */
let fcContadorEquipos = 0;

document.addEventListener('DOMContentLoaded', () => {
    const btnAgregar = document.getElementById('fc_btnAgregarEquipo');
    if (btnAgregar) btnAgregar.addEventListener('click', agregarFilaEquipo);

    const form = document.getElementById('formFinalizarConstancia');
    if (form) form.addEventListener('submit', enviarFinalizacionConstancia);
});

/// Abre el modal de finalización para una solicitud específica.
/// Reemplaza a la llamada directa que hacía abrirModalAccion() en
/// app.js cuando el técnico elegía "Finalizar Tarea".
window.abrirModalFinalizarConstancia = function (seguimiento) {
    document.getElementById('fc_seguimiento').value = seguimiento;
    document.getElementById('fc_diagnostico').value = '';
    document.getElementById('fc_recomendaciones').value = '';
    document.getElementById('fc_listaEquipos').innerHTML = '';
    fcContadorEquipos = 0;
    actualizarMensajeSinEquipos();

    const modal = new bootstrap.Modal(document.getElementById('modalFinalizarConstancia'));
    modal.show();
};

function agregarFilaEquipo() {
    fcContadorEquipos++;
    const id = fcContadorEquipos;
    const row = document.createElement('div');
    row.className = 'fc-equipo-row';
    row.id = `fc_equipo_${id}`;
    row.innerHTML = `
        <button type="button" class="btn btn-sm btn-outline-danger btn-quitar-equipo" onclick="quitarFilaEquipo(${id})">
            <i class="bi bi-x-lg"></i>
        </button>
        <div class="row g-2">
            <div class="col-md-4">
                <input type="text" class="form-control admin-form-input fc-tipo" placeholder="Tipo de equipo (ej. CPU)">
            </div>
            <div class="col-md-4">
                <input type="text" class="form-control admin-form-input fc-marca" placeholder="Marca">
            </div>
            <div class="col-md-4">
                <input type="text" class="form-control admin-form-input fc-modelo" placeholder="Modelo">
            </div>
            <div class="col-md-6">
                <input type="text" class="form-control admin-form-input fc-bien" placeholder="N° de Bien">
            </div>
            <div class="col-md-6">
                <input type="text" class="form-control admin-form-input fc-serial" placeholder="Serial">
            </div>
        </div>
    `;
    document.getElementById('fc_listaEquipos').appendChild(row);
    actualizarMensajeSinEquipos();
}

window.quitarFilaEquipo = function (id) {
    const row = document.getElementById(`fc_equipo_${id}`);
    if (row) row.remove();
    actualizarMensajeSinEquipos();
};

function actualizarMensajeSinEquipos() {
    const mensaje = document.getElementById('fc_sinEquipos');
    const hayFilas = document.getElementById('fc_listaEquipos').children.length > 0;
    if (mensaje) mensaje.style.display = hayFilas ? 'none' : 'block';
}

function recolectarEquipos() {
    const filas = document.querySelectorAll('#fc_listaEquipos .fc-equipo-row');
    const equipos = [];
    filas.forEach((row) => {
        const tipoEquipo = row.querySelector('.fc-tipo').value.trim();
        const marca = row.querySelector('.fc-marca').value.trim();
        const modelo = row.querySelector('.fc-modelo').value.trim();
        const numeroBien = row.querySelector('.fc-bien').value.trim();
        const serial = row.querySelector('.fc-serial').value.trim();
        // Solo se incluye la fila si tiene al menos un campo lleno.
        if (tipoEquipo || marca || modelo || numeroBien || serial) {
            equipos.push({ tipoEquipo, marca, modelo, numeroBien, serial });
        }
    });
    return equipos;
}

async function enviarFinalizacionConstancia(e) {
    e.preventDefault();

    const seguimiento = document.getElementById('fc_seguimiento').value;
    const diagnostico = document.getElementById('fc_diagnostico').value.trim();
    const recomendaciones = document.getElementById('fc_recomendaciones').value.trim();
    const equipos = recolectarEquipos();

    if (!diagnostico) {
        if (typeof Swal !== 'undefined') Swal.fire('Falta información', 'El diagnóstico es requerido.', 'warning');
        return;
    }

    const btnSubmit = e.target.querySelector('button[type="submit"]');
    btnSubmit.disabled = true;
    btnSubmit.textContent = 'Procesando...';

    try {
        const resp = await fetch(`/api/solicitudes/${seguimiento}/finalizar-con-constancia`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ diagnostico, recomendaciones, equipos }),
        });
        const json = await resp.json();
        if (!json.success) throw new Error(json.message || 'No se pudo finalizar la solicitud.');

        bootstrap.Modal.getInstance(document.getElementById('modalFinalizarConstancia')).hide();

        if (typeof Swal !== 'undefined') {
            await Swal.fire({
                icon: 'success',
                title: '¡Constancia generada!',
                html: `Documento: <strong>${json.numeroDocumento}</strong>`,
                background: '#1a1d20',
                color: '#fff',
            });
        }

        if (typeof cargarTicketsTecnico === 'function') cargarTicketsTecnico();
        if (typeof actualizarContadoresDashboard === 'function') actualizarContadoresDashboard();
    } catch (err) {
        if (typeof Swal !== 'undefined') Swal.fire('Error', err.message, 'error');
    } finally {
        btnSubmit.disabled = false;
        btnSubmit.innerHTML = '<i class="bi bi-check-circle me-1"></i> GENERAR CONSTANCIA Y FINALIZAR';
    }
}
