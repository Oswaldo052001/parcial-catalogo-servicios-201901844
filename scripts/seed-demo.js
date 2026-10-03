'use strict';
// Datos de demostración FICTICIOS: estructura organizacional, 50 usuarios y asignaciones de responsables.
// No provienen del Excel (el archivo solo trae el catálogo de servicios). Es idempotente:
// usa los códigos como llave y no sobrescribe asignaciones que un administrador ya haya cambiado.
const crypto = require('crypto');
const { withTransaction, closePool } = require('../src/db/pool');
const { hashPassword } = require('../src/lib/password');

const EMPRESA = { codigo: 'EMP01', nombre: 'Corporación Demo, S.A.' };

// área -> departamentos -> secciones -> puestos
const ESTRUCTURA = [
  { codigo: 'TI', nombre: 'Tecnología de Información', departamentos: [
    { codigo: 'INF', nombre: 'Infraestructura', secciones: [
      { codigo: 'RED', nombre: 'Redes y Comunicaciones', puestos: [['JEF', 'Jefe de Redes'], ['ANA', 'Analista de Redes'], ['TEC', 'Técnico de Redes']] },
      { codigo: 'SRV', nombre: 'Servidores y Respaldos', puestos: [['ADM', 'Administrador de Servidores'], ['OPE', 'Operador de Respaldos']] },
    ] },
    { codigo: 'SOP', nombre: 'Soporte Técnico', secciones: [
      { codigo: 'MDA', nombre: 'Mesa de Ayuda', puestos: [['COO', 'Coordinador de Mesa de Ayuda'], ['AGE', 'Agente de Soporte']] },
      { codigo: 'CAM', nombre: 'Soporte en Campo', puestos: [['TEC', 'Técnico de Campo'], ['ALM', 'Encargado de Equipo y Suministros']] },
    ] },
    { codigo: 'DES', nombre: 'Desarrollo y Aplicaciones', secciones: [
      { codigo: 'APL', nombre: 'Aplicaciones Empresariales', puestos: [['LID', 'Líder de Aplicaciones'], ['DEV', 'Desarrollador']] },
      { codigo: 'DAT', nombre: 'Datos y Analítica', puestos: [['ANA', 'Analista de Datos']] },
    ] },
    { codigo: 'GES', nombre: 'Gestión de TI', secciones: [
      { codigo: 'PMO', nombre: 'Oficina de Proyectos', puestos: [['GER', 'Gerente de Proyectos'], ['PM', 'Administrador de Proyectos']] },
      { codigo: 'ADM', nombre: 'Administración de TI', puestos: [['EVA', 'Cuentas de evaluación'], ['SEG', 'Oficial de Accesos']] },
    ] },
  ] },
  { codigo: 'FIN', nombre: 'Finanzas', departamentos: [
    { codigo: 'CON', nombre: 'Contabilidad', secciones: [
      { codigo: 'PLA', nombre: 'Planillas', puestos: [['ANA', 'Analista de Planillas'], ['AUX', 'Auxiliar Contable']] },
    ] },
    { codigo: 'TES', nombre: 'Tesorería', secciones: [
      { codigo: 'PAG', nombre: 'Pagos', puestos: [['TES', 'Tesorero'], ['AUX', 'Auxiliar de Pagos']] },
    ] },
  ] },
  { codigo: 'RRHH', nombre: 'Recursos Humanos', departamentos: [
    { codigo: 'PER', nombre: 'Personal', secciones: [
      { codigo: 'RYS', nombre: 'Reclutamiento y Selección', puestos: [['REC', 'Reclutador'], ['ASI', 'Asistente de Personal']] },
    ] },
  ] },
  { codigo: 'COM', nombre: 'Comercial', departamentos: [
    { codigo: 'VEN', nombre: 'Ventas', secciones: [
      { codigo: 'DIG', nombre: 'Canales Digitales', puestos: [['EJE', 'Ejecutivo de Ventas'], ['CMG', 'Community Manager']] },
    ] },
  ] },
];

const NOMBRES = ['Ana', 'Luis', 'María', 'Carlos', 'Sofía', 'Jorge', 'Lucía', 'Diego', 'Valeria', 'Andrés', 'Gabriela', 'Fernando',
  'Daniela', 'Ricardo', 'Paola', 'Mario', 'Andrea', 'José', 'Claudia', 'Pablo', 'Mónica', 'Héctor', 'Karla', 'Roberto', 'Silvia'];
const APELLIDOS = ['López', 'García', 'Pérez', 'Morales', 'Hernández', 'Castillo', 'Ramírez', 'Méndez', 'Ortiz', 'Cifuentes',
  'Barrios', 'Juárez', 'Estrada', 'Aguilar', 'Rodas', 'Velásquez', 'Monzón', 'Sandoval', 'Chávez', 'Gómez'];

// Asignaciones de demostración: servicio -> sección (área/depto/sección) y, opcionalmente, el primer usuario de un puesto.
const ASIGNACIONES = [
  ['SE.01.01', 'TI/INF/RED', 'JEF'],
  ['SE.02.01', 'TI/INF/RED', 'ANA'],
  ['SE.02.02', 'TI/INF/RED', 'ANA'],
  ['SE.02.03', 'TI/INF/RED', null],
  ['SE.03.01', 'TI/SOP/MDA', 'COO'],
  ['SE.03.02', 'TI/SOP/MDA', 'AGE'],
  ['SE.03.03', 'TI/SOP/CAM', 'TEC'],
  ['SE.04.01', 'TI/INF/RED', 'TEC'],
  ['SE.05.02', 'TI/INF/SRV', 'ADM'],
  ['SE.06.08', 'TI/DES/APL', 'LID'],
  ['SE.08.01', 'TI/GES/ADM', 'SEG'],
  ['SE.09.01', 'TI/SOP/CAM', 'ALM'],
  ['SE.11.02', 'TI/GES/PMO', 'GER'],
  ['SE.12.1', 'TI/DES/DAT', 'ANA'],
];

const slug = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

// Busca la unidad por su código dentro del padre; solo la crea si no existe (no reactiva ni modifica existentes).
async function upsert(client, tabla, fk, padreId, codigo, nombre) {
  const filtro = fk ? `${fk} = $1 AND codigo = $2` : 'codigo = $1';
  const params = fk ? [padreId, codigo] : [codigo];
  const { rows: [existe] } = await client.query(`SELECT id FROM ${tabla} WHERE ${filtro}`, params);
  if (existe) return { id: existe.id, creado: false };
  const cols = fk ? `${fk}, codigo, nombre` : 'codigo, nombre';
  const vals = fk ? [padreId, codigo, nombre] : [codigo, nombre];
  const { rows: [r] } = await client.query(
    `INSERT INTO ${tabla} (${cols}) VALUES (${vals.map((_, i) => `$${i + 1}`).join(',')}) RETURNING id`, vals);
  return { id: r.id, creado: true };
}

async function main() {
  const stats = { unidades_creadas: 0, usuarios_creados: 0, asignaciones_creadas: 0, asignaciones_existentes: 0, asignaciones_omitidas: [] };
  await withTransaction(async (client) => {
    const empresa = await upsert(client, 'empresa', null, null, EMPRESA.codigo, EMPRESA.nombre);
    stats.unidades_creadas += empresa.creado ? 1 : 0;
    const puestos = []; // { id, ruta, codigo, nombre }
    const secciones = new Map(); // 'TI/INF/RED' -> id
    for (const a of ESTRUCTURA) {
      const area = await upsert(client, 'area', 'empresa_id', empresa.id, a.codigo, a.nombre);
      stats.unidades_creadas += area.creado ? 1 : 0;
      for (const d of a.departamentos) {
        const dep = await upsert(client, 'departamento', 'area_id', area.id, d.codigo, d.nombre);
        stats.unidades_creadas += dep.creado ? 1 : 0;
        for (const s of d.secciones) {
          const sec = await upsert(client, 'seccion', 'departamento_id', dep.id, s.codigo, s.nombre);
          stats.unidades_creadas += sec.creado ? 1 : 0;
          const ruta = `${a.codigo}/${d.codigo}/${s.codigo}`;
          secciones.set(ruta, sec.id);
          for (const [pc, pn] of s.puestos) {
            const pue = await upsert(client, 'puesto', 'seccion_id', sec.id, pc, pn);
            stats.unidades_creadas += pue.creado ? 1 : 0;
            if (pc !== 'EVA') puestos.push({ id: pue.id, ruta, codigo: pc });
          }
        }
      }
    }

    // 50 usuarios ficticios repartidos entre los puestos (rol consulta).
    // Su contraseña es aleatoria y no se guarda en ningún lado: no pueden iniciar sesión hasta que
    // un administrador les asigne una. Las cuentas para evaluar se crean con scripts/crear-cuentas.js.
    for (let i = 0; i < 50; i++) {
      const nombre = `${NOMBRES[i % NOMBRES.length]} ${APELLIDOS[(i * 7) % APELLIDOS.length]}`;
      const username = `${slug(nombre.split(' ')[0])[0]}${slug(nombre.split(' ')[1])}${String(i + 1).padStart(2, '0')}`;
      const { rows: [existe] } = await client.query('SELECT id FROM usuario WHERE lower(username) = $1', [username]);
      if (existe) continue;
      const puesto = puestos[i % puestos.length];
      await client.query(
        `INSERT INTO usuario (puesto_id, nombre, username, email, password_hash, rol) VALUES ($1,$2,$3,$4,$5,'consulta')`,
        [puesto.id, nombre, username, `${username}@demo.local`, await hashPassword(crypto.randomBytes(18).toString('base64url'))]);
      stats.usuarios_creados++;
    }

    // Asignaciones (solo si el servicio existe y aún no tiene responsable)
    for (const [codigo, ruta, puestoCodigo] of ASIGNACIONES) {
      const { rows: [srv] } = await client.query('SELECT id, seccion_responsable_id FROM servicio_n2 WHERE codigo = $1', [codigo]);
      if (!srv) { stats.asignaciones_omitidas.push(`${codigo} (no importado aún)`); continue; }
      if (srv.seccion_responsable_id) { stats.asignaciones_existentes++; continue; }
      const seccionId = secciones.get(ruta);
      let usuarioId = null;
      if (puestoCodigo) {
        const { rows: [u] } = await client.query(
          `SELECT u.id FROM usuario u JOIN puesto p ON p.id = u.puesto_id
            WHERE p.seccion_id = $1 AND p.codigo = $2 AND u.activo ORDER BY u.id LIMIT 1`, [seccionId, puestoCodigo]);
        usuarioId = u ? u.id : null;
      }
      await client.query('UPDATE servicio_n2 SET seccion_responsable_id = $2, usuario_responsable_id = $3 WHERE id = $1', [srv.id, seccionId, usuarioId]);
      stats.asignaciones_creadas++;
    }
  });
  return stats;
}

if (require.main === module) {
  main()
    .then((s) => console.log('[seed-demo] OK', JSON.stringify(s)))
    .catch((err) => { console.error('[seed-demo] ERROR', err.message); process.exitCode = 1; })
    .finally(() => closePool());
}

module.exports = { main };
