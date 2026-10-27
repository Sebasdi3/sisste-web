const pool = require('../db/db.config');

async function contadores(req, res) {
  try {
    const asignados = await pool.query("SELECT COUNT(*) FROM solicitudes_v2 WHERE estado = 'en_proceso'");
    const espera = await pool.query("SELECT COUNT(*) FROM solicitudes_v2 WHERE estado = 'en_espera'");
    const hoy = await pool.query(
      "SELECT COUNT(*) FROM solicitudes_v2 WHERE estado = 'atendida' AND fecha_actualizacion::date = CURRENT_DATE"
    );
    const mes = await pool.query(
      "SELECT COUNT(*) FROM solicitudes_v2 WHERE date_trunc('month', fecha_creacion) = date_trunc('month', CURRENT_DATE)"
    );
    res.json({
      success: true,
      asignados: parseInt(asignados.rows[0].count, 10),
      espera: parseInt(espera.rows[0].count, 10),
      hoy: parseInt(hoy.rows[0].count, 10),
      mes: parseInt(mes.rows[0].count, 10),
    });
  } catch (err) {
    console.error('Error al calcular contadores:', err);
    res.status(500).json({ success: false });
  }
}

module.exports = { contadores };
