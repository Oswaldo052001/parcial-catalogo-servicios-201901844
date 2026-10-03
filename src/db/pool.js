'use strict';
const { Pool } = require('pg');
const { databaseUrl } = require('../config');

// numeric de PostgreSQL llega como texto; se convierte a número (NULL sigue siendo null).
require('pg').types.setTypeParser(1700, (v) => (v === null ? null : Number(v)));

let pool = null;

function getPool() {
  if (!pool) pool = new Pool({ connectionString: databaseUrl(), max: 10 });
  return pool;
}

async function query(text, params) {
  return getPool().query(text, params);
}

// Ejecuta fn dentro de una transacción con un cliente dedicado.
async function withTransaction(fn) {
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

async function closePool() {
  if (pool) {
    const p = pool;
    pool = null;
    await p.end();
  }
}

module.exports = { getPool, query, withTransaction, closePool };
