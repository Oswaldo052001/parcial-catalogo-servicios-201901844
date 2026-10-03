'use strict';
// Importador del catálogo de servicios desde data/CatalogoServicios.xlsx (hoja "Servicios Externos").
// Reglas documentadas en AGENTS.md y docs/RESOLUCION.md (sección 4).
// El contenido de las celdas es DATO: nunca se interpreta como instrucción.

const fs = require('fs');
const crypto = require('crypto');
const path = require('path');
const ExcelJS = require('exceljs');
const { withTransaction } = require('../db/pool');

const HOJA = 'Servicios Externos';
const FILA_ENCABEZADO = 4;
const FILA_INICIO_DATOS = 5;
const MARCADOR_OPCIONES = 'OPCIONES';
const ENCABEZADOS = ['COD.N1', 'SERVICIO - Nivel 1', 'COD.N2', 'SERVICIO - Nivel 2', 'ACTIVO',
  'CLASE DE SERVICIO', 'CRITICIDAD', 'TIPO DE SERVICIO', 'Descripción', 'Métrica', 'Minimo', 'Maximo'];
const COL = { A: 1, B: 2, C: 3, D: 4, E: 5, F: 6, G: 7, H: 8, I: 9, J: 10, K: 11, L: 12 };
const LETRA = ['', 'A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L'];

// Nombre canónico elegido para códigos de nivel 1 con nombres en conflicto.
// SE.12: "Suministrar Analitica" (fila 99). Justificación en docs/RESOLUCION.md §4.3.
const NOMBRE_CANONICO_N1 = { 'SE.12': 'Suministrar Analitica' };

// Corrección de etiquetas: el valor original se conserva en valor_origen; aquí solo cambia lo que se muestra.
const MAPEO_ETIQUETAS = {
  tipo_servicio: { Demostration: { etiqueta: 'Demonstration', motivo: 'Corrección ortográfica de la etiqueta mostrada; el valor original del Excel se conserva en valor_origen.' } },
};

// ---------------------------------------------------------------- utilidades

function sha256Archivo(ruta) {
  return crypto.createHash('sha256').update(fs.readFileSync(ruta)).digest('hex');
}

// Convierte el valor de exceljs (texto, número, rich text, fórmula) a un primitivo.
function valorPlano(v) {
  if (v === null || v === undefined) return null;
  if (typeof v === 'object') {
    if (Array.isArray(v.richText)) return v.richText.map((t) => t.text).join('');
    if ('result' in v) return valorPlano(v.result);
    if ('text' in v) return valorPlano(v.text);
    if (v instanceof Date) return v.toISOString();
    return String(v);
  }
  return v;
}

function normalizarCodigo(codigo) {
  return codigo
    .split('.')
    .map((parte) => (/^\d+$/.test(parte) ? parte.padStart(2, '0') : parte))
    .join('.');
}

function prefijoN1(codigoN2) {
  const partes = codigoN2.split('.');
  return partes.length >= 3 ? partes.slice(0, 2).join('.') : null;
}

// ---------------------------------------------------------------- lectura del Excel

class LectorHoja {
  constructor(ws) {
    this.ws = ws;
    // Rangos combinados: { col, r1, r2, ref }
    this.merges = (ws.model.merges || []).map((ref) => {
      const m = ref.match(/^([A-Z]+)(\d+):([A-Z]+)(\d+)$/);
      const c1 = LETRA.indexOf(m[1]);
      const c2 = LETRA.indexOf(m[3]);
      return { c1, c2, r1: Number(m[2]), r2: Number(m[4]), ref };
    });
  }

  rangoEn(col, fila) {
    return this.merges.find((m) => col >= m.c1 && col <= m.c2 && fila >= m.r1 && fila <= m.r2) || null;
  }

  // Valor crudo de la celda física (sin resolver combinaciones).
  crudo(fila, col) {
    return valorPlano(this.ws.getRow(fila).getCell(col).value);
  }

  // Valor efectivo: si la celda está dentro de un rango combinado, el de la celda principal del rango.
  valor(fila, col) {
    const r = this.rangoEn(col, fila);
    if (r) return this.crudo(r.r1, r.c1);
    return this.crudo(fila, col);
  }
}

// Recorta espacios. Devuelve { valor, original, recortado }.
function texto(v) {
  if (v === null || v === undefined) return { valor: null, original: null, recortado: false };
  const s = String(v);
  const t = s.trim();
  return { valor: t === '' ? null : t, original: s, recortado: t !== s && t !== '' };
}

function numero(v) {
  if (v === null || v === undefined || v === '') return { valor: null, invalido: false };
  if (typeof v === 'number') return { valor: v, invalido: false };
  const n = Number(String(v).replace(',', '.').trim());
  return Number.isFinite(n) ? { valor: n, invalido: false } : { valor: null, invalido: true };
}

// Analiza el libro y devuelve una estructura sin tocar la base de datos.
async function analizarLibro(ruta) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(ruta);
  const ws = wb.getWorksheet(HOJA);
  if (!ws) throw new Error(`No existe la hoja "${HOJA}" en ${ruta}`);
  const hoja = new LectorHoja(ws);
  const obs = [];
  const observar = (o) => obs.push({ hoja: HOJA, severidad: 'ADVERTENCIA', detalle: {}, ...o });

  // 1. Encabezados
  const encontrados = ENCABEZADOS.map((_, i) => texto(hoja.crudo(FILA_ENCABEZADO, i + 1)).valor);
  ENCABEZADOS.forEach((esperado, i) => {
    if (encontrados[i] !== esperado) {
      throw new Error(`Encabezado inesperado en ${LETRA[i + 1]}${FILA_ENCABEZADO}: "${encontrados[i]}" (se esperaba "${esperado}")`);
    }
  });

  // 2. Zona de datos y zona de opciones
  const ultimaFila = ws.rowCount;
  let filaMarcador = null;
  for (let f = FILA_INICIO_DATOS; f <= ultimaFila && !filaMarcador; f++) {
    for (let c = COL.E; c <= COL.H; c++) {
      if (texto(hoja.crudo(f, c)).valor === MARCADOR_OPCIONES) { filaMarcador = f; break; }
    }
  }
  const finDatos = filaMarcador ? filaMarcador - 1 : ultimaFila;

  const opciones = { activo: [], clase: [], criticidad: [], tipo: [] };
  if (filaMarcador) {
    const destino = { [COL.E]: 'activo', [COL.F]: 'clase', [COL.G]: 'criticidad', [COL.H]: 'tipo' };
    for (let f = filaMarcador + 1; f <= ultimaFila; f++) {
      for (const c of [COL.E, COL.F, COL.G, COL.H]) {
        const t = texto(hoja.crudo(f, c));
        if (t.valor) opciones[destino[c]].push({ valor: t.valor, fila: f, celda: `${LETRA[c]}${f}` });
      }
    }
  }

  // 3. Bloques de nivel 1 (columna A) y nivel 2 (columna C)
  function bloques(col) {
    const lista = [];
    for (let f = FILA_INICIO_DATOS; f <= finDatos; f++) {
      const r = hoja.rangoEn(col, f);
      if (r) {
        if (f === r.r1) {
          const t = texto(hoja.crudo(f, col));
          if (t.valor) lista.push({ codigo: t.valor, r1: r.r1, r2: r.r2, ref: r.ref, combinado: true });
        }
        f = r.r2; // saltar filas de continuación del rango
        continue;
      }
      const t = texto(hoja.crudo(f, col));
      if (t.valor) lista.push({ codigo: t.valor, r1: f, r2: f, ref: `${LETRA[col]}${f}`, combinado: false });
    }
    return lista;
  }

  const bloquesN1 = bloques(COL.A);
  const bloquesN2 = bloques(COL.C);

  // 4. Nivel 1: agrupar por código; detectar conflictos de nombre
  const n1 = new Map();
  for (const b of bloquesN1) {
    const nombre = texto(hoja.valor(b.r1, COL.B));
    const entrada = n1.get(b.codigo) || { codigo: b.codigo, ocurrencias: [] };
    entrada.ocurrencias.push({ fila: b.r1, rango: b.combinado ? `A${b.r1}:B${b.r2}` : `A${b.r1}:B${b.r1}`, nombre: nombre.valor, r1: b.r1, r2: b.r2 });
    n1.set(b.codigo, entrada);
  }
  for (const e of n1.values()) {
    const nombres = [...new Set(e.ocurrencias.map((o) => o.nombre))];
    e.nombresOrigen = e.ocurrencias.map((o) => ({ fila: o.fila, rango: o.rango, nombre: o.nombre }));
    e.rango = e.ocurrencias.length === 1 ? e.ocurrencias[0].rango
      : `A${e.ocurrencias[0].r1}:B${e.ocurrencias[e.ocurrencias.length - 1].r2}`;
    e.requiereRevision = false;
    if (nombres.length > 1) {
      const canonico = NOMBRE_CANONICO_N1[e.codigo] || e.ocurrencias[0].nombre;
      e.nombre = canonico;
      e.requiereRevision = !NOMBRE_CANONICO_N1[e.codigo];
      observar({
        tipo: 'CONFLICTO_NOMBRE_N1', codigo: e.codigo, fila: e.ocurrencias[0].fila, rango: e.rango,
        mensaje: `El código ${e.codigo} aparece con ${nombres.length} nombres distintos (${nombres.map((n) => `"${n}"`).join(', ')}). Se usa "${canonico}" como nombre canónico y se conservan ambos en nombres_origen.`,
        detalle: { nombres_origen: e.nombresOrigen, canonico, regla: NOMBRE_CANONICO_N1[e.codigo] ? 'NOMBRE_CANONICO_DOCUMENTADO' : 'PRIMERA_OCURRENCIA' },
      });
    } else {
      e.nombre = nombres[0];
    }
    if (!e.nombre) {
      e.nombre = e.codigo;
      e.requiereRevision = true;
      observar({ tipo: 'N1_SIN_NOMBRE', codigo: e.codigo, fila: e.ocurrencias[0].fila, mensaje: `El código ${e.codigo} no tiene nombre; se usa el código como nombre provisional.` });
    }
  }

  // 5. Nivel 2: un servicio por bloque de la columna C
  const filasCubiertasN2 = new Set();
  const n2 = [];
  const recortes = [];
  for (const b of bloquesN2) {
    for (let f = b.r1; f <= b.r2; f++) filasCubiertasN2.add(f);
    const traza = { filas: [b.r1, b.r2], combinado: b.combinado, transformaciones: [] };
    const leerTexto = (col, campo) => {
      const t = texto(hoja.valor(b.r1, col));
      if (t.recortado) {
        traza.transformaciones.push({ campo, regla: 'ESPACIOS_RECORTADOS', original: t.original, resultado: t.valor });
        recortes.push({ codigo: b.codigo, fila: b.r1, celda: `${LETRA[col]}${b.r1}`, original: t.original });
      }
      return t.valor;
    };

    const nombre = leerTexto(COL.D, 'nombre');
    const activoTxt = leerTexto(COL.E, 'activo');
    const clase = leerTexto(COL.F, 'clase');
    const criticidad = leerTexto(COL.G, 'criticidad');
    const tipo = leerTexto(COL.H, 'tipo');
    const descripcion = leerTexto(COL.I, 'descripcion');
    const metrica = leerTexto(COL.J, 'metrica');
    const min = numero(hoja.valor(b.r1, COL.K));
    const max = numero(hoja.valor(b.r1, COL.L));
    if (min.invalido || max.invalido) {
      observar({ tipo: 'VALOR_NO_NUMERICO', codigo: b.codigo, fila: b.r1, mensaje: `Mínimo o máximo no numérico en ${b.codigo}; se deja sin dato.` });
    }

    // Filas de continuación: deben repetir E:L de la fila principal. Si difieren, gana la principal.
    for (let f = b.r1 + 1; f <= b.r2; f++) {
      for (const col of [COL.E, COL.F, COL.G, COL.H, COL.I, COL.K, COL.L]) {
        if (hoja.rangoEn(col, f)) continue; // combinada con la principal: mismo valor por definición
        const principal = texto(hoja.valor(b.r1, col)).valor;
        const otro = texto(hoja.valor(f, col)).valor;
        if (otro !== null && String(otro) !== String(principal)) {
          observar({
            tipo: 'CONFLICTO_ATRIBUTO', codigo: b.codigo, fila: f, rango: `${LETRA[col]}${f}`,
            mensaje: `La fila de continuación ${f} de ${b.codigo} tiene "${otro}" en ${LETRA[col]} y la fila principal ${b.r1} tiene "${principal}". Se conserva el valor de la fila principal.`,
            detalle: { principal, continuacion: otro, regla: 'GANA_FILA_PRINCIPAL' },
          });
        }
      }
    }

    // ACTIVO: S/N; vacío o desconocido -> DESCONOCIDO (no se inventa)
    let activo = 'DESCONOCIDO';
    if (activoTxt === 'S' || activoTxt === 'N') activo = activoTxt;
    else if (activoTxt !== null) {
      traza.transformaciones.push({ campo: 'activo', regla: 'VALOR_NO_RECONOCIDO', original: activoTxt, resultado: 'DESCONOCIDO' });
      observar({ tipo: 'VALOR_NO_RECONOCIDO', codigo: b.codigo, fila: b.r1, rango: `E${b.r1}`, mensaje: `ACTIVO="${activoTxt}" no es S ni N; se guarda como DESCONOCIDO.` });
    }

    // Nivel 1 al que pertenece: celda A efectiva; si no hay, por prefijo del código
    let codigoN1 = texto(hoja.valor(b.r1, COL.A)).valor;
    if (!codigoN1) {
      codigoN1 = prefijoN1(b.codigo);
      traza.transformaciones.push({ campo: 'n1', regla: 'N1_POR_PREFIJO', resultado: codigoN1 });
      observar({
        tipo: 'N1_POR_PREFIJO', codigo: b.codigo, fila: b.r1, rango: `A${b.r1}`,
        mensaje: `La fila ${b.r1} (${b.codigo}) no tiene código de nivel 1 en la columna A ni pertenece a un rango combinado; se vincula a ${codigoN1} por el prefijo de su código.`,
      });
    } else if (prefijoN1(b.codigo) && prefijoN1(b.codigo) !== codigoN1) {
      observar({ tipo: 'PREFIJO_DISTINTO', codigo: b.codigo, fila: b.r1, mensaje: `El código ${b.codigo} no comienza con su nivel 1 ${codigoN1}; se respeta la columna A.` });
    }

    const codigoNorm = normalizarCodigo(b.codigo);
    if (codigoNorm !== b.codigo) {
      traza.transformaciones.push({ campo: 'codigo', regla: 'CODIGO_NORMALIZADO', original: b.codigo, resultado: codigoNorm, nota: 'Solo se usa para ordenar; el código vigente es el original.' });
      observar({
        tipo: 'CODIGO_NORMALIZADO', severidad: 'INFO', codigo: b.codigo, fila: b.r1, rango: `C${b.r1}`,
        mensaje: `El código ${b.codigo} no sigue el formato SE.NN.NN. Se conserva como texto y se guarda ${codigoNorm} en codigo_normalizado para ordenar.`,
        detalle: { original: b.codigo, normalizado: codigoNorm },
      });
    }

    const faltantes = [];
    if (activo === 'DESCONOCIDO') faltantes.push('ACTIVO');
    if (!clase) faltantes.push('CLASE DE SERVICIO');
    if (!criticidad) faltantes.push('CRITICIDAD');
    if (!tipo) faltantes.push('TIPO DE SERVICIO');
    if (!metrica) faltantes.push('Métrica');
    if (faltantes.length) {
      observar({
        tipo: 'ATRIBUTOS_INCOMPLETOS', codigo: b.codigo, fila: b.r1, rango: `C${b.r1}:L${b.r2}`,
        mensaje: `${b.codigo} no trae ${faltantes.join(', ')}. Se importa con esos campos sin dato (activo=DESCONOCIDO) y marcado para revisión.`,
        detalle: { faltantes },
      });
    }

    n2.push({
      codigo: b.codigo, codigoNorm, codigoN1, nombre: nombre || b.codigo, activo,
      clase, criticidad, tipo, descripcion, metrica, minimo: min.valor, maximo: max.valor,
      requiereRevision: faltantes.length > 0,
      rango: b.combinado ? `C${b.r1}:L${b.r2}` : `C${b.r1}:L${b.r1}`,
      traza,
    });
  }

  for (const r of recortes) {
    observar({ tipo: 'ESPACIOS_RECORTADOS', severidad: 'INFO', codigo: r.codigo, fila: r.fila, rango: r.celda, mensaje: `Se recortaron espacios al inicio o final de ${r.celda}; el texto original queda en la traza.`, detalle: { original: r.original } });
  }

  // 6. Filas con datos que no pertenecen a ningún servicio de nivel 2
  let filasVacias = 0;
  let filasContinuacion = 0;
  const omitidas = [];
  for (let f = FILA_INICIO_DATOS; f <= finDatos; f++) {
    if (filasCubiertasN2.has(f)) {
      if (!bloquesN2.some((b) => b.r1 === f)) filasContinuacion++;
      continue;
    }
    const valores = {};
    for (let c = COL.A; c <= COL.L; c++) {
      const v = texto(hoja.crudo(f, c)).valor;
      if (v !== null) valores[LETRA[c]] = v;
    }
    if (Object.keys(valores).length === 0) { filasVacias++; continue; }
    omitidas.push(f);
    const n1Rango = hoja.rangoEn(COL.A, f);
    observar({
      tipo: 'FILA_SIN_CODIGO', codigo: n1Rango ? texto(hoja.crudo(n1Rango.r1, COL.A)).valor : null, fila: f, rango: `A${f}:L${f}`,
      mensaje: `La fila ${f} tiene datos (${Object.keys(valores).join(', ')}) pero no tiene código de nivel 2 ni está dentro de un rango combinado de la columna C. Se omite y no se asigna a ningún servicio.`,
      detalle: { valores },
    });
  }

  return {
    hoja: HOJA, finDatos, filaMarcador, opciones, n1: [...n1.values()], n2, observaciones: obs,
    filas: {
      zona_datos: `${FILA_INICIO_DATOS}-${finDatos}`,
      leidas: finDatos - FILA_INICIO_DATOS + 1,
      principales_n2: bloquesN2.length,
      continuacion: filasContinuacion,
      omitidas: omitidas.length,
      filas_omitidas: omitidas,
      vacias: filasVacias,
      zona_opciones: filaMarcador ? `E${filaMarcador + 1}:H${ultimaFila}` : null,
    },
  };
}

// ---------------------------------------------------------------- escritura en la base

async function asegurarCatalogo(client, tabla, valores, conOrden) {
  const ids = new Map();
  let creados = 0;
  for (let i = 0; i < valores.length; i++) {
    const valor = valores[i];
    const mapeo = (MAPEO_ETIQUETAS[tabla] || {})[valor];
    const etiqueta = mapeo ? mapeo.etiqueta : valor;
    const sql = conOrden
      ? `INSERT INTO ${tabla} (valor_origen, etiqueta, orden) VALUES ($1, $2, $3) ON CONFLICT (valor_origen) DO NOTHING RETURNING id`
      : `INSERT INTO ${tabla} (valor_origen, etiqueta) VALUES ($1, $2) ON CONFLICT (valor_origen) DO NOTHING RETURNING id`;
    const res = await client.query(sql, conOrden ? [valor, etiqueta, i + 1] : [valor, etiqueta]);
    if (res.rowCount) creados++;
    if (mapeo) {
      await client.query(
        `INSERT INTO mapeo_etiqueta (catalogo, valor_origen, etiqueta, motivo) VALUES ($1,$2,$3,$4)
         ON CONFLICT (catalogo, valor_origen) DO NOTHING`, [tabla, valor, mapeo.etiqueta, mapeo.motivo]);
    }
  }
  const { rows } = await client.query(`SELECT id, valor_origen FROM ${tabla}`);
  rows.forEach((r) => ids.set(r.valor_origen, r.id));
  return { ids, creados };
}

// Comparación estable: PostgreSQL reordena las claves de un JSONB (por longitud y luego
// alfabéticamente), así que se comparan los objetos con las claves ordenadas.
function canonico(v) {
  if (Array.isArray(v)) return v.map(canonico);
  if (v && typeof v === 'object') {
    return Object.keys(v).sort().reduce((acc, k) => ({ ...acc, [k]: canonico(v[k]) }), {});
  }
  return v === undefined ? null : v;
}

function igual(a, b) {
  return JSON.stringify(canonico(a)) === JSON.stringify(canonico(b));
}

async function importarExcel({ ruta, usuarioId = null, origen = 'comando' } = {}) {
  const archivo = ruta || require('../config').excelPath;
  const rutaAbs = path.resolve(archivo);
  if (!fs.existsSync(rutaAbs)) throw new Error(`No se encontró el archivo ${archivo}`);
  const hashAntes = sha256Archivo(rutaAbs);
  const datos = await analizarLibro(rutaAbs);
  const hashDespues = sha256Archivo(rutaAbs);
  if (hashAntes !== hashDespues) throw new Error('El archivo cambió durante la lectura; se cancela la importación.');

  return withTransaction(async (client) => {
    // Un solo importador a la vez
    await client.query('SELECT pg_advisory_xact_lock(4612)');
    const { rows: [imp] } = await client.query(
      'INSERT INTO importacion (archivo, sha256, hoja, ejecutada_por, origen) VALUES ($1,$2,$3,$4,$5) RETURNING id',
      [path.basename(archivo), hashAntes, datos.hoja, usuarioId, origen]);

    const obs = [...datos.observaciones];
    const cuenta = { n1: { creados: 0, actualizados: 0, sin_cambios: 0 }, n2: { creados: 0, actualizados: 0, sin_cambios: 0 } };

    // Catálogos a partir de la zona de opciones
    const clases = await asegurarCatalogo(client, 'clase_servicio', datos.opciones.clase.map((o) => o.valor), false);
    const crits = await asegurarCatalogo(client, 'criticidad', datos.opciones.criticidad.map((o) => o.valor), true);
    const tipos = await asegurarCatalogo(client, 'tipo_servicio', datos.opciones.tipo.map((o) => o.valor), false);

    // Nivel 1
    const idsN1 = new Map();
    for (const e of datos.n1) {
      const valores = {
        nombre: e.nombre, codigo_normalizado: normalizarCodigo(e.codigo), requiere_revision: e.requiereRevision,
        nombres_origen: e.nombresOrigen, origen_hoja: datos.hoja, origen_rango: e.rango,
      };
      const { rows: [actual] } = await client.query(
        'SELECT id, nombre, codigo_normalizado, requiere_revision, nombres_origen, origen_hoja, origen_rango FROM servicio_n1 WHERE codigo = $1', [e.codigo]);
      if (!actual) {
        const { rows: [n] } = await client.query(
          `INSERT INTO servicio_n1 (codigo, codigo_normalizado, nombre, requiere_revision, nombres_origen, origen_hoja, origen_rango)
           VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
          [e.codigo, valores.codigo_normalizado, valores.nombre, valores.requiere_revision, JSON.stringify(valores.nombres_origen), valores.origen_hoja, valores.origen_rango]);
        idsN1.set(e.codigo, n.id);
        cuenta.n1.creados++;
      } else {
        idsN1.set(e.codigo, actual.id);
        const { id, ...prev } = actual;
        if (igual(prev, valores)) cuenta.n1.sin_cambios++;
        else {
          await client.query(
            `UPDATE servicio_n1 SET nombre=$2, codigo_normalizado=$3, requiere_revision=$4, nombres_origen=$5, origen_hoja=$6, origen_rango=$7, actualizado_en=now() WHERE id=$1`,
            [id, valores.nombre, valores.codigo_normalizado, valores.requiere_revision, JSON.stringify(valores.nombres_origen), valores.origen_hoja, valores.origen_rango]);
          cuenta.n1.actualizados++;
        }
      }
    }

    // Nivel 2 (no toca responsables: son datos propios de la aplicación)
    const idCatalogo = (mapa, valor, campo, s) => {
      if (valor === null) return null;
      if (mapa.ids.has(valor)) return mapa.ids.get(valor);
      obs.push({ hoja: datos.hoja, tipo: 'VALOR_FUERA_DE_CATALOGO', severidad: 'ADVERTENCIA', codigo: s.codigo, fila: s.traza.filas[0],
        mensaje: `${campo}="${valor}" de ${s.codigo} no está en la lista de opciones; se deja sin dato y el servicio queda para revisión.`, detalle: { valor } });
      s.requiereRevision = true;
      return null;
    };
    for (const s of datos.n2) {
      const n1Id = idsN1.get(s.codigoN1);
      if (!n1Id) {
        obs.push({ hoja: datos.hoja, tipo: 'N1_INEXISTENTE', severidad: 'ERROR', codigo: s.codigo, fila: s.traza.filas[0],
          mensaje: `No existe el nivel 1 ${s.codigoN1} para ${s.codigo}; el servicio se omite.`, detalle: {} });
        continue;
      }
      const valores = {
        n1_id: n1Id, codigo_normalizado: s.codigoNorm, nombre: s.nombre, activo: s.activo,
        clase_id: idCatalogo(clases, s.clase, 'CLASE DE SERVICIO', s),
        criticidad_id: idCatalogo(crits, s.criticidad, 'CRITICIDAD', s),
        tipo_id: idCatalogo(tipos, s.tipo, 'TIPO DE SERVICIO', s),
        descripcion: s.descripcion, metrica: s.metrica, minimo: s.minimo, maximo: s.maximo,
        requiere_revision: s.requiereRevision, origen_hoja: datos.hoja, origen_rango: s.rango, traza: s.traza,
      };
      const cols = Object.keys(valores);
      const { rows: [actual] } = await client.query(`SELECT id, ${cols.join(', ')} FROM servicio_n2 WHERE codigo = $1`, [s.codigo]);
      const params = cols.map((c) => (c === 'traza' ? JSON.stringify(valores[c]) : valores[c]));
      if (!actual) {
        await client.query(
          `INSERT INTO servicio_n2 (codigo, ${cols.join(', ')}) VALUES ($1, ${cols.map((_, i) => `$${i + 2}`).join(', ')})`,
          [s.codigo, ...params]);
        cuenta.n2.creados++;
      } else {
        const { id, ...prev } = actual;
        if (igual(prev, valores)) cuenta.n2.sin_cambios++;
        else {
          await client.query(
            `UPDATE servicio_n2 SET ${cols.map((c, i) => `${c} = $${i + 2}`).join(', ')}, actualizado_en = now() WHERE id = $1`,
            [id, ...params]);
          cuenta.n2.actualizados++;
        }
      }
    }

    for (const o of obs) {
      await client.query(
        `INSERT INTO observacion_importacion (importacion_id, tipo, severidad, hoja, fila, rango, codigo, mensaje, detalle)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        [imp.id, o.tipo, o.severidad, o.hoja, o.fila || null, o.rango || null, o.codigo || null, o.mensaje, JSON.stringify(o.detalle || {})]);
    }

    const { rows: [tot] } = await client.query(
      'SELECT (SELECT count(*) FROM servicio_n1)::int AS n1, (SELECT count(*) FROM servicio_n2)::int AS n2');
    const n1Archivo = datos.n1.length;
    const n2Archivo = new Set(datos.n2.map((s) => s.codigo)).size;
    const porTipo = obs.reduce((acc, o) => ({ ...acc, [o.tipo]: (acc[o.tipo] || 0) + 1 }), {});
    const resumen = {
      importacion_id: imp.id,
      archivo: path.basename(archivo),
      sha256: hashAntes,
      hoja: datos.hoja,
      filas: datos.filas,
      catalogos_creados: { clase_servicio: clases.creados, criticidad: crits.creados, tipo_servicio: tipos.creados },
      nivel1: cuenta.n1,
      nivel2: cuenta.n2,
      creados: cuenta.n1.creados + cuenta.n2.creados,
      actualizados: cuenta.n1.actualizados + cuenta.n2.actualizados,
      sin_cambios: cuenta.n1.sin_cambios + cuenta.n2.sin_cambios,
      omitidos: datos.filas.omitidas,
      observados: obs.length,
      observaciones_por_tipo: porTipo,
      controles: {
        n1_en_archivo: n1Archivo, n2_en_archivo: n2Archivo,
        esperado_n1: 12, esperado_n2: 46,
        ok: n1Archivo === 12 && n2Archivo === 46,
      },
      totales_en_base: tot,
    };
    await client.query('UPDATE importacion SET finalizada_en = now(), resumen = $2 WHERE id = $1', [imp.id, JSON.stringify(resumen)]);
    return resumen;
  });
}

module.exports = { importarExcel, analizarLibro, normalizarCodigo, prefijoN1, NOMBRE_CANONICO_N1 };
