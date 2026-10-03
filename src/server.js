'use strict';
const { crearApp } = require('./app');
const config = require('./config');
const { closePool } = require('./db/pool');

const server = crearApp().listen(config.port, () => {
  console.log(`[servidor] escuchando en el puerto ${config.port}`);
});

async function apagar(senal) {
  console.log(`[servidor] ${senal} recibido, cerrando...`);
  server.close(async () => {
    await closePool();
    process.exit(0);
  });
}
process.on('SIGTERM', () => apagar('SIGTERM'));
process.on('SIGINT', () => apagar('SIGINT'));
