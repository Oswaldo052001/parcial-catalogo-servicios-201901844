'use strict';
// Crea o restablece las cuentas de evaluación (una por rol) a partir de variables de entorno.
// Las credenciales NO están en el código: se configuran en el archivo .env local (ver .env.example).
// Es repetible: si la cuenta ya existe, restablece contraseña, rol y estado activo.
const { withTransaction, closePool } = require('../src/db/pool');
const { hashPassword } = require('../src/lib/password');

const CUENTAS = [
  { rol: 'administrador', usuario: 'ADMIN_USUARIO', correo: 'ADMIN_CORREO', password: 'ADMIN_PASSWORD', nombre: 'Administrador de evaluación' },
  { rol: 'consulta', usuario: 'CONSULTA_USUARIO', correo: 'CONSULTA_CORREO', password: 'CONSULTA_PASSWORD', nombre: 'Usuario de consulta de evaluación' },
];

// Puesto donde se ubican las cuentas: EMP01 / TI / GES / ADM / EVA. Se crea si no existe.
async function puestoEvaluacion(client) {
  // Cada nivel se crea si falta y se activa antes de crear el siguiente (la base no permite hijos activos bajo padres inactivos).
  const nivel = async (sql, params, tabla) => {
    const id = (await client.query(sql, params)).rows[0].id;
    await client.query(`UPDATE ${tabla} SET activo = TRUE WHERE id = $1 AND NOT activo`, [id]);
    return id;
  };
  const emp = await nivel(`INSERT INTO empresa (codigo, nombre) VALUES ('EMP01','Corporación Demo, S.A.')
                           ON CONFLICT (codigo) DO UPDATE SET codigo = EXCLUDED.codigo RETURNING id`, [], 'empresa');
  const area = await nivel(`INSERT INTO area (empresa_id, codigo, nombre) VALUES ($1,'TI','Tecnología de Información')
                            ON CONFLICT (empresa_id, codigo) DO UPDATE SET codigo = EXCLUDED.codigo RETURNING id`, [emp], 'area');
  const dep = await nivel(`INSERT INTO departamento (area_id, codigo, nombre) VALUES ($1,'GES','Gestión de TI')
                           ON CONFLICT (area_id, codigo) DO UPDATE SET codigo = EXCLUDED.codigo RETURNING id`, [area], 'departamento');
  const sec = await nivel(`INSERT INTO seccion (departamento_id, codigo, nombre) VALUES ($1,'ADM','Administración de TI')
                           ON CONFLICT (departamento_id, codigo) DO UPDATE SET codigo = EXCLUDED.codigo RETURNING id`, [dep], 'seccion');
  return nivel(`INSERT INTO puesto (seccion_id, codigo, nombre) VALUES ($1,'EVA','Cuentas de evaluación')
                ON CONFLICT (seccion_id, codigo) DO UPDATE SET codigo = EXCLUDED.codigo RETURNING id`, [sec], 'puesto');
}

async function main({ env = process.env, opcional = false } = {}) {
  const faltan = CUENTAS.flatMap((c) => [c.usuario, c.correo, c.password]).filter((k) => !env[k]);
  if (faltan.length) {
    const msg = `Faltan variables: ${faltan.join(', ')}. Copie .env.example a .env y complételas.`;
    if (opcional) { console.warn(`[cuentas] OMITIDO: ${msg}`); return []; }
    throw new Error(msg);
  }
  const resultado = [];
  await withTransaction(async (client) => {
    const puestoId = await puestoEvaluacion(client);
    for (const c of CUENTAS) {
      const hash = await hashPassword(env[c.password]);
      const { rows: [r] } = await client.query(
        `INSERT INTO usuario (puesto_id, nombre, username, email, password_hash, rol, activo)
         VALUES ($1,$2,$3,lower($4),$5,$6,TRUE)
         ON CONFLICT (lower(username)) DO UPDATE
           SET password_hash = EXCLUDED.password_hash, rol = EXCLUDED.rol, activo = TRUE, email = EXCLUDED.email
         RETURNING id, username, rol, (xmax = 0) AS creado`,
        [puestoId, c.nombre, env[c.usuario], env[c.correo], hash, c.rol]);
      resultado.push({ username: r.username, rol: r.rol, accion: r.creado ? 'creada' : 'restablecida' });
    }
  });
  return resultado;
}

if (require.main === module) {
  main({ opcional: process.argv.includes('--opcional') })
    .then((r) => r.forEach((c) => console.log(`[cuentas] ${c.accion}: ${c.username} (${c.rol})`)))
    .catch((err) => { console.error(`[cuentas] ERROR: ${err.message}`); process.exitCode = 1; })
    .finally(() => closePool());
}

module.exports = { main };
