'use strict';
// Punto de entrada del contenedor "app":
//  1. espera a que PostgreSQL acepte conexiones (además del healthcheck de compose),
//  2. aplica migraciones pendientes,
//  3. si AUTO_SETUP=true y la base está recién creada, importa el Excel, carga los datos de demostración
//     y crea las cuentas de evaluación (cada paso también es idempotente si se ejecuta a mano),
//  4. levanta el servidor web.
// Está en JavaScript y no en sh para evitar problemas de fin de línea CRLF al clonar en Windows.
const { query, closePool } = require('../src/db/pool');

const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

async function esperarBase(intentos = 30) {
  for (let i = 1; i <= intentos; i++) {
    try {
      await query('SELECT 1');
      return;
    } catch (err) {
      console.log(`[iniciar] base de datos no disponible (intento ${i}/${intentos}): ${err.code || err.message}`);
      await closePool();
      await esperar(2000);
    }
  }
  throw new Error('La base de datos no respondió a tiempo.');
}

(async () => {
  try {
    await esperarBase();
    await require('../src/db/migrate').migrate();
    // La carga inicial solo corre la primera vez (base sin importaciones). En reinicios posteriores
    // no se toca nada: así un reinicio no revierte cambios hechos en la aplicación (por ejemplo, desactivaciones).
    const { rows: [{ n }] } = await query('SELECT count(*)::int AS n FROM importacion');
    if (process.env.AUTO_SETUP === 'true' && n === 0) {
      try {
        const r = await require('../src/services/importador').importarExcel({});
        console.log(`[iniciar] importación #${r.importacion_id}: creados=${r.creados} actualizados=${r.actualizados} sin_cambios=${r.sin_cambios} omitidos=${r.omitidos} observados=${r.observados} control=${r.controles.ok ? 'OK 12/46' : 'FALLÓ'}`);
        const d = await require('./seed-demo').main();
        console.log(`[iniciar] datos de demostración: ${JSON.stringify(d)}`);
        const c = await require('./crear-cuentas').main({ opcional: true });
        c.forEach((x) => console.log(`[iniciar] cuenta ${x.accion}: ${x.username} (${x.rol})`));
      } catch (err) {
        console.error(`[iniciar] la carga inicial falló (${err.message}); el servidor arranca igual. Use los comandos npm run importar / seed:demo / cuentas.`);
      }
    } else if (process.env.AUTO_SETUP === 'true') {
      console.log(`[iniciar] la base ya tiene ${n} importación(es); se omite la carga inicial.`);
    }
    require('../src/server');
  } catch (err) {
    console.error(`[iniciar] ERROR: ${err.message}`);
    await closePool();
    process.exit(1);
  }
})();
