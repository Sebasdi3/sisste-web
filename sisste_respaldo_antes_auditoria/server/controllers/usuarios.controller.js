const bcrypt = require('bcrypt');
const pool = require('../db/db.config');

const SALT_ROUNDS = 12;
const TABLA_PERFIL_CORE = { usuario: 'perfil_usuario_estandar', tecnico: 'perfil_tecnico', admin: 'perfil_admin' };
const ROLES_CORE = Object.keys(TABLA_PERFIL_CORE);

/// Un rol es "core" (usuario/tecnico/admin, con tabla de perfil fija)
/// o "personalizado" (clave de roles_personalizados, perfil genérico).
function esRolCore(rol) {
  return ROLES_CORE.includes(rol);
}

async function buscarRolPersonalizado(rol, client = pool) {
  const result = await client.query(
    'SELECT id FROM roles_personalizados WHERE clave = $1 AND activo = TRUE',
    [rol]
  );
  return result.rows[0] || null;
}

async function listar(req, res) {
  try {
    const result = await pool.query(`
      SELECT ua.id, ua.cedula, ua.rol, ua.debe_cambiar_password,
             COALESCE(pu.nombre, pt.nombre, pa.nombre, pp.nombre) AS nombre,
             COALESCE(pu.apellido, pt.apellido, pa.apellido, pp.apellido) AS apellido,
             pu.area, pu.cargo, pu.piso,
             rp.nombre_mostrar AS rol_nombre_mostrar
      FROM usuarios_auth ua
      LEFT JOIN perfil_usuario_estandar pu ON pu.usuario_id = ua.id
      LEFT JOIN perfil_tecnico pt ON pt.usuario_id = ua.id
      LEFT JOIN perfil_admin pa ON pa.usuario_id = ua.id
      LEFT JOIN perfil_personalizado pp ON pp.usuario_id = ua.id
      LEFT JOIN roles_personalizados rp ON rp.clave = ua.rol
      WHERE ua.activo = TRUE
      ORDER BY nombre ASC
    `);
    res.json({ success: true, data: result.rows });
  } catch (err) {
    console.error('Error al listar usuarios:', err);
    res.status(500).json({ success: false });
  }
}

/// Crea el usuario de autenticación + su fila de perfil según el rol
/// (core → tabla fija; personalizado → perfil_personalizado genérico).
async function crear(req, res) {
  const { nombre, apellido, cedula, password, area, cargo, piso, rol, debeCambiarPassword } = req.body;
  if (req.auditoria) req.auditoria.accion = 'crear_usuario';

  if (!rol || !nombre || !apellido || !cedula || !password) {
    return res.status(400).json({ success: false, message: 'Nombre, apellido, cédula, contraseña y rol son requeridos.' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    let rolPersonalizado = null;
    if (!esRolCore(rol)) {
      rolPersonalizado = await buscarRolPersonalizado(rol, client);
      if (!rolPersonalizado) {
        await client.query('ROLLBACK');
        return res.status(400).json({ success: false, message: 'Rol inválido o inactivo.' });
      }
    }

    const hash = await bcrypt.hash(password, SALT_ROUNDS);
    const authResult = await client.query(
      'INSERT INTO usuarios_auth (cedula, password_hash, rol, debe_cambiar_password) VALUES ($1, $2, $3, $4) RETURNING id',
      [cedula, hash, rol, debeCambiarPassword === true]
    );
    const usuarioId = authResult.rows[0].id;

    if (rol === 'usuario') {
      await client.query(
        `INSERT INTO perfil_usuario_estandar (usuario_id, nombre, apellido, piso, area, cargo)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [usuarioId, nombre, apellido, piso || null, area || null, cargo || null]
      );
    } else if (esRolCore(rol)) {
      await client.query(
        `INSERT INTO ${TABLA_PERFIL_CORE[rol]} (usuario_id, nombre, apellido) VALUES ($1, $2, $3)`,
        [usuarioId, nombre, apellido]
      );
    } else {
      await client.query(
        `INSERT INTO perfil_personalizado (usuario_id, rol_personalizado_id, nombre, apellido)
         VALUES ($1, $2, $3, $4)`,
        [usuarioId, rolPersonalizado.id, nombre, apellido]
      );
    }

    await client.query('COMMIT');
    if (req.auditoria) req.auditoria.detalle = { usuarioCreadoId: usuarioId, cedula, rol };
    res.json({ success: true, data: { id: usuarioId } });
  } catch (err) {
    await client.query('ROLLBACK');
    if (err.code === '23505') {
      return res.status(409).json({ success: false, message: 'Ya existe un usuario con esa cédula.' });
    }
    console.error('Error al crear usuario:', err);
    res.status(500).json({ success: false, error: err.message });
  } finally {
    client.release();
  }
}

/// Actualiza datos de perfil y, opcionalmente, la contraseña. NO
/// cambia el rol — para eso está cambiarRol(), porque implica mover
/// la fila de perfil entre tablas distintas.
async function actualizar(req, res) {
  const { id } = req.params;
  const { password, area, cargo, piso, nombre, apellido, debeCambiarPassword } = req.body;
  if (req.auditoria) { req.auditoria.accion = 'actualizar_usuario'; req.auditoria.detalle = { usuarioId: id, seCambioPassword: !!(password && password.trim()) }; }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const authResult = await client.query('SELECT rol FROM usuarios_auth WHERE id = $1', [id]);
    if (authResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ success: false, message: 'Usuario no encontrado.' });
    }
    const { rol } = authResult.rows[0];

    // Solo tocamos la bandera de "debe cambiar contraseña" cuando
    // realmente se está reseteando la contraseña en esta operación
    // (si no se envía password nueva, el checkbox no tiene efecto).
    if (password && password.trim() !== '') {
      const hash = await bcrypt.hash(password, SALT_ROUNDS);
      await client.query(
        'UPDATE usuarios_auth SET password_hash = $1, debe_cambiar_password = $2 WHERE id = $3',
        [hash, debeCambiarPassword === true, id]
      );
    }

    if (rol === 'usuario') {
      await client.query(
        `UPDATE perfil_usuario_estandar SET
           nombre = COALESCE($1, nombre), apellido = COALESCE($2, apellido),
           area = COALESCE($3, area), cargo = COALESCE($4, cargo),
           piso = COALESCE($5, piso)
         WHERE usuario_id = $6`,
        [nombre, apellido, area, cargo, piso, id]
      );
    } else if (esRolCore(rol)) {
      await client.query(
        `UPDATE ${TABLA_PERFIL_CORE[rol]} SET
           nombre = COALESCE($1, nombre), apellido = COALESCE($2, apellido)
         WHERE usuario_id = $3`,
        [nombre, apellido, id]
      );
    } else {
      await client.query(
        `UPDATE perfil_personalizado SET
           nombre = COALESCE($1, nombre), apellido = COALESCE($2, apellido)
         WHERE usuario_id = $3`,
        [nombre, apellido, id]
      );
    }

    await client.query('COMMIT');
    res.json({ success: true });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Error al actualizar usuario:', err);
    res.status(500).json({ success: false });
  } finally {
    client.release();
  }
}

/// Cambia el ROL de un usuario existente. Como cada rol tiene su
/// propia tabla de perfil, esto significa: leer nombre/apellido de la
/// tabla actual, borrar esa fila, y crear la fila equivalente en la
/// tabla del rol nuevo. Los campos específicos de "usuario" (área,
/// cargo, piso) se pierden si se cambia HACIA otro rol (no aplican
/// ahí) y quedan vacíos si se cambia DESDE otro rol HACIA "usuario"
/// (se pueden completar después con un editar normal).
async function cambiarRol(req, res) {
  const { id } = req.params;
  const { nuevoRol } = req.body;
  if (req.auditoria) req.auditoria.accion = 'cambiar_rol';

  if (!nuevoRol) {
    return res.status(400).json({ success: false, message: 'El nuevo rol es requerido.' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const authResult = await client.query('SELECT rol FROM usuarios_auth WHERE id = $1', [id]);
    if (authResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ success: false, message: 'Usuario no encontrado.' });
    }
    const rolActual = authResult.rows[0].rol;

    if (rolActual === nuevoRol) {
      await client.query('ROLLBACK');
      return res.json({ success: true, message: 'El usuario ya tenía ese rol.' });
    }

    let rolPersonalizadoDestino = null;
    if (!esRolCore(nuevoRol)) {
      rolPersonalizadoDestino = await buscarRolPersonalizado(nuevoRol, client);
      if (!rolPersonalizadoDestino) {
        await client.query('ROLLBACK');
        return res.status(400).json({ success: false, message: 'Rol destino inválido o inactivo.' });
      }
    }

    // 1. Leer nombre/apellido de la tabla de perfil actual.
    const tablaOrigen = esRolCore(rolActual) ? TABLA_PERFIL_CORE[rolActual] : 'perfil_personalizado';
    const perfilActual = await client.query(
      `SELECT nombre, apellido FROM ${tablaOrigen} WHERE usuario_id = $1`,
      [id]
    );
    if (perfilActual.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(500).json({ success: false, message: 'No se encontró el perfil actual del usuario.' });
    }
    const { nombre, apellido } = perfilActual.rows[0];

    // 2. Borrar la fila de perfil vieja.
    await client.query(`DELETE FROM ${tablaOrigen} WHERE usuario_id = $1`, [id]);

    // 3. Crear la fila de perfil nueva.
    if (nuevoRol === 'usuario') {
      await client.query(
        `INSERT INTO perfil_usuario_estandar (usuario_id, nombre, apellido) VALUES ($1, $2, $3)`,
        [id, nombre, apellido]
      );
    } else if (esRolCore(nuevoRol)) {
      await client.query(
        `INSERT INTO ${TABLA_PERFIL_CORE[nuevoRol]} (usuario_id, nombre, apellido) VALUES ($1, $2, $3)`,
        [id, nombre, apellido]
      );
    } else {
      await client.query(
        `INSERT INTO perfil_personalizado (usuario_id, rol_personalizado_id, nombre, apellido) VALUES ($1, $2, $3, $4)`,
        [id, rolPersonalizadoDestino.id, nombre, apellido]
      );
    }

    // 4. Actualizar el rol en la tabla de autenticación.
    await client.query('UPDATE usuarios_auth SET rol = $1 WHERE id = $2', [nuevoRol, id]);

    await client.query('COMMIT');
    if (req.auditoria) req.auditoria.detalle = { usuarioId: id, rolAnterior: rolActual, rolNuevo: nuevoRol };
    res.json({ success: true });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Error al cambiar rol:', err);
    res.status(500).json({ success: false, error: err.message });
  } finally {
    client.release();
  }
}

/// Baja lógica (no borra el historial de solicitudes asociado).
async function eliminar(req, res) {
  if (req.auditoria) { req.auditoria.accion = 'eliminar_usuario'; req.auditoria.detalle = { usuarioId: req.params.id }; }
  try {
    await pool.query('UPDATE usuarios_auth SET activo = FALSE WHERE id = $1', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    console.error('Error al eliminar usuario:', err);
    res.status(500).json({ success: false });
  }
}

/// POST /api/admin/users/carga-masiva
/// Body: { filas: [{ nombre, apellido, cedula, area, cargo, piso, rol }, ...] }
/// La contraseña inicial siempre es la cédula, y siempre se marca
/// debe_cambiar_password = TRUE (se lo piden en el primer login).
/// Procesa fila por fila: si una falla (ej. cédula duplicada), se
/// reporta pero no detiene el resto.
async function cargaMasiva(req, res) {
  const { filas } = req.body;
  if (req.auditoria) req.auditoria.accion = 'carga_masiva_usuarios';

  if (!Array.isArray(filas) || filas.length === 0) {
    return res.status(400).json({ success: false, message: 'No se recibieron filas para procesar.' });
  }

  const resultados = { creados: 0, errores: [] };

  for (const [index, fila] of filas.entries()) {
    const nombre = (fila.nombre || '').toString().trim();
    const apellido = (fila.apellido || '').toString().trim();
    const cedula = (fila.cedula || '').toString().trim();
    const rol = (fila.rol || 'usuario').toString().trim().toLowerCase();
    const area = (fila.area || '').toString().trim() || null;
    const cargo = (fila.cargo || '').toString().trim() || null;
    const piso = (fila.piso || '').toString().trim() || null;

    if (!nombre || !apellido || !cedula) {
      resultados.errores.push({ fila: index + 1, cedula, motivo: 'Faltan nombre, apellido o cédula.' });
      continue;
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      let rolPersonalizado = null;
      if (!esRolCore(rol)) {
        rolPersonalizado = await buscarRolPersonalizado(rol, client);
        if (!rolPersonalizado) {
          throw new Error(`Rol "${rol}" inválido o inactivo.`);
        }
      }

      const hash = await bcrypt.hash(cedula, SALT_ROUNDS); // contraseña inicial = cédula
      const authResult = await client.query(
        'INSERT INTO usuarios_auth (cedula, password_hash, rol, debe_cambiar_password) VALUES ($1, $2, $3, TRUE) RETURNING id',
        [cedula, hash, rol]
      );
      const usuarioId = authResult.rows[0].id;

      if (rol === 'usuario') {
        await client.query(
          `INSERT INTO perfil_usuario_estandar (usuario_id, nombre, apellido, piso, area, cargo)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [usuarioId, nombre, apellido, piso, area, cargo]
        );
      } else if (esRolCore(rol)) {
        await client.query(
          `INSERT INTO ${TABLA_PERFIL_CORE[rol]} (usuario_id, nombre, apellido) VALUES ($1, $2, $3)`,
          [usuarioId, nombre, apellido]
        );
      } else {
        await client.query(
          `INSERT INTO perfil_personalizado (usuario_id, rol_personalizado_id, nombre, apellido)
           VALUES ($1, $2, $3, $4)`,
          [usuarioId, rolPersonalizado.id, nombre, apellido]
        );
      }

      await client.query('COMMIT');
      resultados.creados++;
    } catch (err) {
      await client.query('ROLLBACK');
      const motivo = err.code === '23505' ? 'Cédula duplicada (ya existe).' : err.message;
      resultados.errores.push({ fila: index + 1, cedula, motivo });
    } finally {
      client.release();
    }
  }

  if (req.auditoria) req.auditoria.detalle = { creados: resultados.creados, errores: resultados.errores.length, totalFilas: filas.length };
  res.json({ success: true, ...resultados });
}

/// POST /api/admin/users/eliminacion-masiva
/// Body: { cedulas: ["12345678", "87654321", ...] }
/// Baja lógica (igual que eliminar() individual) por cada cédula.
async function eliminacionMasiva(req, res) {
  const { cedulas } = req.body;
  if (req.auditoria) req.auditoria.accion = 'eliminacion_masiva_usuarios';

  if (!Array.isArray(cedulas) || cedulas.length === 0) {
    return res.status(400).json({ success: false, message: 'No se recibieron cédulas para procesar.' });
  }

  const resultados = { eliminados: 0, noEncontrados: [] };

  for (const cedulaRaw of cedulas) {
    const cedula = (cedulaRaw || '').toString().trim();
    if (!cedula) continue;

    const result = await pool.query(
      'UPDATE usuarios_auth SET activo = FALSE WHERE cedula = $1 AND activo = TRUE RETURNING id',
      [cedula]
    );
    if (result.rows.length > 0) {
      resultados.eliminados++;
    } else {
      resultados.noEncontrados.push(cedula);
    }
  }

  if (req.auditoria) req.auditoria.detalle = { eliminados: resultados.eliminados, noEncontrados: resultados.noEncontrados.length };
  res.json({ success: true, ...resultados });
}

module.exports = { listar, crear, actualizar, cambiarRol, eliminar, cargaMasiva, eliminacionMasiva };
