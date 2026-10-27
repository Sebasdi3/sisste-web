/**
 * combobox-busqueda.js
 *
 * Widget reusable: input de texto + lista desplegable filtrada
 * mientras el usuario escribe (autocompletado). Al hacer click en el
 * input se muestran todas las opciones de una vez; al escribir, se
 * filtran por coincidencia de texto. Clic en una opción la selecciona.
 *
 * Uso:
 *   initComboboxBusqueda({
 *     inputId: 'oficina',
 *     apiPath: '/api/admin/oficinas',
 *     placeholder: 'Buscar oficina...'
 *   });
 *
 * El propio <input> guarda el valor final (el nombre de texto elegido),
 * igual que ya hacen los <select> de Área/Cargo/Piso — así no hace
 * falta cambiar cómo el resto del código (app.js) lee el valor.
 */
function initComboboxBusqueda({ inputId, apiPath, placeholder }) {
    const input = document.getElementById(inputId);
    if (!input) return;

    input.setAttribute('autocomplete', 'off');
    if (placeholder) input.placeholder = placeholder;

    // Contenedor del dropdown, insertado justo después del input.
    const dropdown = document.createElement('div');
    dropdown.className = 'combobox-dropdown';
    dropdown.style.cssText = `
        display: none;
        position: absolute;
        z-index: 1050;
        background-color: #0f172a;
        border: 1px solid rgba(255,255,255,0.2);
        border-radius: 8px;
        max-height: 220px;
        overflow-y: auto;
        width: 100%;
        box-shadow: 0 8px 20px rgba(0,0,0,0.4);
    `;
    // El input necesita un contenedor con position:relative para que
    // el dropdown se posicione justo debajo.
    const wrapper = document.createElement('div');
    wrapper.style.position = 'relative';
    input.parentNode.insertBefore(wrapper, input);
    wrapper.appendChild(input);
    wrapper.appendChild(dropdown);

    let opciones = [];

    async function cargarOpciones() {
        try {
            const resp = await fetch(apiPath, { credentials: 'include' });
            const json = await resp.json();
            opciones = (json.data || []).filter((item) => item.activo);
        } catch (err) {
            console.error(`Error al cargar opciones de ${apiPath}:`, err);
            opciones = [];
        }
    }

    function pintarDropdown(filtro = '') {
        const filtroLower = filtro.trim().toLowerCase();
        const filtradas = filtroLower
            ? opciones.filter((o) => o.nombre.toLowerCase().includes(filtroLower))
            : opciones;

        if (filtradas.length === 0) {
            dropdown.innerHTML = '<div class="combobox-item text-white-50 small p-2">Sin resultados. Puedes escribir un nombre nuevo.</div>';
        } else {
            dropdown.innerHTML = filtradas.map((o) => `
                <div class="combobox-item" data-valor="${o.nombre.replace(/"/g, '&quot;')}"
                     style="padding: 8px 12px; cursor: pointer; color: #ffffff; font-size: 0.9rem;">
                    ${o.nombre}
                </div>
            `).join('');

            dropdown.querySelectorAll('.combobox-item').forEach((el) => {
                el.addEventListener('mouseenter', () => { el.style.backgroundColor = 'rgba(56,189,248,0.15)'; });
                el.addEventListener('mouseleave', () => { el.style.backgroundColor = 'transparent'; });
                el.addEventListener('mousedown', (e) => {
                    e.preventDefault(); // evita que el input pierda foco antes del click
                    input.value = el.dataset.valor;
                    dropdown.style.display = 'none';
                    input.dispatchEvent(new Event('change'));
                });
            });
        }
        dropdown.style.display = 'block';
    }

    input.addEventListener('focus', async () => {
        if (opciones.length === 0) await cargarOpciones();
        pintarDropdown(input.value);
    });

    input.addEventListener('input', () => {
        pintarDropdown(input.value);
    });

    document.addEventListener('click', (e) => {
        if (!wrapper.contains(e.target)) {
            dropdown.style.display = 'none';
        }
    });

    // Precarga en segundo plano para que el primer click no tenga demora.
    cargarOpciones();
}
