'use strict';
// Prepara una base de pruebas limpia (catalogo_test): la borra y la crea de nuevo, aplica migraciones,
// importa el Excel original y carga datos de prueba controlados. La base de evaluación no se toca.
const { Client } = require('pg');
const { urlPruebas, verificarSegura } = require('./db-test');

module.exports = async () => {
  const url = urlPruebas();
  const nombre = verificarSegura(url);
  const admin = new URL(url);
  admin.pathname = '/postgres';
  const c = new Client({ connectionString: admin.toString() });
  await c.connect();
  await c.query(`SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1 AND pid <> pg_backend_pid()`, [nombre]);
  await c.query(`DROP DATABASE IF EXISTS "${nombre}"`);
  await c.query(`CREATE DATABASE "${nombre}"`);
  await c.end();

  process.env.DATABASE_URL = url;
  const { migrate } = require('../src/db/migrate');
  const { importarExcel } = require('../src/services/importador');
  const cuentas = require('../scripts/crear-cuentas');
  const demo = require('../scripts/seed-demo');
  const { closePool } = require('../src/db/pool');
  await migrate({ log: () => {} });
  await importarExcel({ ruta: 'data/CatalogoServicios.xlsx' });
  await cuentas.main({ env: require('./datos-prueba').CUENTAS_ENV });
  await demo.main();
  await closePool();
};
