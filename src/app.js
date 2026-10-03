'use strict';
const path = require('path');
const express = require('express');
const { query } = require('./db/pool');
const { manejadorErrores } = require('./lib/errores');
const { requiereSesion, soloAdministradorModifica } = require('./middleware/auth');

function crearApp() {
  const app = express();
  app.disable('x-powered-by');
  app.use((req, res, next) => {
    res.set({
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'DENY',
      'Referrer-Policy': 'no-referrer',
      'Content-Security-Policy': "default-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:",
    });
    next();
  });
  app.use(express.json({ limit: '100kb' }));

  // Rutas públicas
  app.get('/api/salud', async (req, res) => {
    try {
      await query('SELECT 1');
      res.json({ estado: 'ok', base_de_datos: 'ok' });
    } catch {
      res.status(503).json({ estado: 'error', base_de_datos: 'sin conexión' });
    }
  });
  app.use('/api/auth', require('./routes/auth'));

  // Todo lo demás de /api exige sesión; los métodos que modifican exigen rol administrador.
  const api = express.Router();
  api.use(requiereSesion, soloAdministradorModifica);
  api.use('/org', require('./routes/organizacion'));
  api.use('/usuarios', require('./routes/usuarios'));
  api.use('/catalogos', require('./routes/catalogos').router);
  const servicios = require('./routes/servicios');
  api.use('/servicios-n1', servicios.n1);
  api.use('/servicios', servicios.n2);
  api.use('/importaciones', require('./routes/importaciones'));
  api.use('/resumen', require('./routes/resumen'));
  api.use((req, res) => res.status(404).json({ error: 'Ruta no encontrada.' }));
  app.use('/api', api);

  // Interfaz web (archivos estáticos; los datos siempre pasan por la API protegida)
  app.use(express.static(path.join(__dirname, '..', 'public')));
  app.get('*', (req, res) => res.sendFile(path.join(__dirname, '..', 'public', 'index.html')));

  app.use(manejadorErrores);
  return app;
}

module.exports = { crearApp };
