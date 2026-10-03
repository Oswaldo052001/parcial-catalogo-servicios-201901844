'use strict';
// Aplica en orden los archivos src/db/migrations/*.sql que aún no estén en schema_migrations.
const fs = require('fs');
const path = require('path');
const { getPool, closePool } = require('./pool');

const DIR = path.join(__dirname, 'migrations');

async function migrate({ log = console.log } = {}) {
  const pool = getPool();
  const client = await pool.connect();
  try {
    // Bloqueo para que dos procesos no migren al mismo tiempo.
    await client.query('SELECT pg_advisory_lock(20261003)');
    await client.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
      nombre VARCHAR(200) PRIMARY KEY,
      aplicada_en TIMESTAMPTZ NOT NULL DEFAULT now())`);
    const { rows } = await client.query('SELECT nombre FROM schema_migrations');
    const aplicadas = new Set(rows.map((r) => r.nombre));
    const archivos = fs.readdirSync(DIR).filter((f) => f.endsWith('.sql')).sort();
    let nuevas = 0;
    for (const archivo of archivos) {
      if (aplicadas.has(archivo)) continue;
      const sql = fs.readFileSync(path.join(DIR, archivo), 'utf8');
      await client.query('BEGIN');
      try {
        await client.query(sql);
        await client.query('INSERT INTO schema_migrations (nombre) VALUES ($1)', [archivo]);
        await client.query('COMMIT');
      } catch (err) {
        await client.query('ROLLBACK');
        throw new Error(`Falló la migración ${archivo}: ${err.message}`);
      }
      log(`[migrate] aplicada ${archivo}`);
      nuevas++;
    }
    log(`[migrate] ${nuevas} migraciones nuevas, ${archivos.length} en total`);
  } finally {
    await client.query('SELECT pg_advisory_unlock(20261003)').catch(() => {});
    client.release();
  }
}

if (require.main === module) {
  migrate()
    .then(() => closePool())
    .catch(async (err) => {
      console.error(err.message);
      await closePool();
      process.exit(1);
    });
}

module.exports = { migrate };
