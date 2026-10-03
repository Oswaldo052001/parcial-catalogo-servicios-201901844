'use strict';
// Autenticación y autorización en el servidor. La interfaz puede ocultar botones,
// pero la decisión real se toma aquí en cada solicitud.
const { usuarioDeToken, leerCookie } = require('../services/sesiones');

async function requiereSesion(req, res, next) {
  try {
    const token = leerCookie(req);
    const usuario = await usuarioDeToken(token);
    if (!usuario) return res.status(401).json({ error: 'Debe iniciar sesión.' });
    req.usuario = usuario;
    req.token = token;
    return next();
  } catch (err) {
    return next(err);
  }
}

function requiereRol(...roles) {
  return (req, res, next) => {
    if (!req.usuario || !roles.includes(req.usuario.rol)) {
      return res.status(403).json({ error: 'No tiene permisos para realizar esta operación.' });
    }
    return next();
  };
}

// Regla general de la API: leer requiere sesión; modificar requiere rol administrador.
function soloAdministradorModifica(req, res, next) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  return requiereRol('administrador')(req, res, next);
}

module.exports = { requiereSesion, requiereRol, soloAdministradorModifica };
