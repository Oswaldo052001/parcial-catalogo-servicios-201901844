'use strict';
// Hash de contraseñas con scrypt (función de derivación de claves resistente a fuerza bruta).
// Formato almacenado: scrypt$N$r$p$<sal base64>$<hash base64>. Sal aleatoria de 16 bytes por contraseña.
const crypto = require('crypto');

const N = 16384; // costo CPU/memoria (2^14)
const R = 8;
const P = 1;
const KEYLEN = 64;

function derivar(password, sal, n, r, p) {
  return new Promise((resolve, reject) => {
    crypto.scrypt(password, sal, KEYLEN, { N: n, r, p, maxmem: 64 * 1024 * 1024 }, (err, key) =>
      (err ? reject(err) : resolve(key)));
  });
}

async function hashPassword(password) {
  if (typeof password !== 'string' || password.length < 8) {
    throw new Error('La contraseña debe tener al menos 8 caracteres');
  }
  const sal = crypto.randomBytes(16);
  const hash = await derivar(password, sal, N, R, P);
  return `scrypt$${N}$${R}$${P}$${sal.toString('base64')}$${hash.toString('base64')}`;
}

async function verificarPassword(password, almacenado) {
  const partes = String(almacenado || '').split('$');
  if (partes.length !== 6 || partes[0] !== 'scrypt' || typeof password !== 'string') return false;
  const [, n, r, p, salB64, hashB64] = partes;
  const esperado = Buffer.from(hashB64, 'base64');
  const obtenido = await derivar(password, Buffer.from(salB64, 'base64'), Number(n), Number(r), Number(p));
  return esperado.length === obtenido.length && crypto.timingSafeEqual(esperado, obtenido);
}

// Hash fijo para gastar el mismo tiempo cuando el usuario no existe (evita enumerar usuarios por tiempo).
let hashFicticio = null;
async function hashParaComparacionFicticia() {
  if (!hashFicticio) hashFicticio = await hashPassword(crypto.randomBytes(12).toString('hex'));
  return hashFicticio;
}

module.exports = { hashPassword, verificarPassword, hashParaComparacionFicticia };
