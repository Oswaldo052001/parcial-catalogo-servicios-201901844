'use strict';
// Interfaz web sin framework. Solo muestra datos y llama a la API;
// los permisos reales se validan en el servidor (ocultar botones aquí es solo comodidad).

const $ = (sel, raiz = document) => raiz.querySelector(sel);
const vista = $('#vista');
let USUARIO = null;
const esAdmin = () => USUARIO && USUARIO.rol === 'administrador';

// Todo texto que viene de la base o del Excel se escapa antes de pintarlo.
function esc(v) {
  if (v === null || v === undefined) return '';
  return String(v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
const sinDato = (v) => (v === null || v === undefined || v === '' ? '<span class="muted">sin dato</span>' : esc(v));

async function api(metodo, url, cuerpo) {
  const res = await fetch(`/api${url}`, {
    method: metodo,
    headers: cuerpo !== undefined ? { 'Content-Type': 'application/json' } : {},
    body: cuerpo !== undefined ? JSON.stringify(cuerpo) : undefined,
    credentials: 'same-origin',
  });
  const datos = await res.json().catch(() => ({}));
  if (res.status === 401 && url !== '/auth/login') { mostrarLogin(); throw new Error(datos.error || 'Sesión vencida'); }
  if (!res.ok) throw new Error(datos.error || `Error ${res.status}`);
  return datos;
}

function aviso(msg, error = false) {
  const a = $('#aviso');
  a.textContent = msg;
  a.className = `aviso${error ? ' error' : ''}`;
  clearTimeout(aviso.t);
  aviso.t = setTimeout(() => a.classList.add('hidden'), error ? 6000 : 3000);
}

function abrirModal(html) { $('#modal-caja').innerHTML = html; $('#modal').classList.remove('hidden'); }
function cerrarModal() { $('#modal').classList.add('hidden'); $('#modal-caja').innerHTML = ''; }
$('#modal').addEventListener('click', (e) => { if (e.target.id === 'modal' || e.target.dataset.cerrar !== undefined) cerrarModal(); });

const formDatos = (form) => Object.fromEntries(new FormData(form).entries());
const opciones = (lista, valor, vacio = '— sin dato —', etiqueta = (x) => x.etiqueta || x.nombre) =>
  `<option value="">${esc(vacio)}</option>${lista.map((x) => `<option value="${x.id}" ${String(x.id) === String(valor) ? 'selected' : ''}>${esc(etiqueta(x))}</option>`).join('')}`;
const estadoBadge = (a) => (a === true || a === 'S' ? '<span class="badge ok">Activo</span>'
  : a === 'DESCONOCIDO' ? '<span class="badge warn">Desconocido</span>' : '<span class="badge no">Inactivo</span>');

// ------------------------------------------------------------ sesión

function mostrarLogin() { USUARIO = null; $('#app').classList.add('hidden'); $('#login').classList.remove('hidden'); }

$('#form-login').addEventListener('submit', async (e) => {
  e.preventDefault();
  $('#login-error').textContent = '';
  try {
    const r = await api('POST', '/auth/login', formDatos(e.target));
    USUARIO = r.usuario;
    e.target.reset();
    iniciarApp();
  } catch (err) { $('#login-error').textContent = err.message; }
});

$('#btn-salir').addEventListener('click', async () => {
  try { await api('POST', '/auth/logout'); } catch { /* ya no hay sesión */ }
  mostrarLogin();
});

function iniciarApp() {
  $('#login').classList.add('hidden');
  $('#app').classList.remove('hidden');
  $('#sesion').textContent = `${USUARIO.nombre} · ${USUARIO.rol}`;
  if (!location.hash) location.hash = '#/tablero';
  enrutar();
}

// ------------------------------------------------------------ rutas

const RUTAS = {
  tablero: vTablero, servicios: vServicios, nivel1: vNivel1, catalogos: vCatalogos,
  organizacion: vOrganizacion, usuarios: vUsuarios, asignaciones: vAsignaciones, importaciones: vImportaciones,
};

async function enrutar() {
  if (!USUARIO) return;
  const [ruta, param] = location.hash.replace('#/', '').split('/');
  document.querySelectorAll('#menu a').forEach((a) => a.classList.toggle('activo', a.getAttribute('href') === `#/${ruta}`));
  vista.innerHTML = '<p class="muted">Cargando…</p>';
  try { await (RUTAS[ruta] || vTablero)(param); } catch (err) { vista.innerHTML = `<p class="error">${esc(err.message)}</p>`; }
}
window.addEventListener('hashchange', enrutar);

// Catálogos auxiliares (cacheados por vista)
async function auxiliares() {
  const [n1, clases, crits, tipos] = await Promise.all([
    api('GET', '/servicios-n1'), api('GET', '/catalogos/clases'), api('GET', '/catalogos/criticidades'), api('GET', '/catalogos/tipos')]);
  return { n1, clases, crits, tipos };
}

// ------------------------------------------------------------ tablero

async function vTablero() {
  const t = await api('GET', '/resumen/tablero');
  vista.innerHTML = `
    <h2>Tablero</h2>
    <div class="kpis">
      ${[['Servicios nivel 1', t.n1], ['Servicios nivel 2', t.n2], ['N2 activos', t.n2_activos], ['N2 en revisión', t.n2_revision],
        ['N2 con responsable', t.n2_asignados], ['Secciones', t.secciones], ['Usuarios', t.usuarios], ['Usuarios activos', t.usuarios_activos]]
        .map(([k, v]) => `<div class="card kpi"><div class="muted">${k}</div><div class="num">${v}</div></div>`).join('')}
    </div>
    <div class="card"><h3>Servicios de nivel 2 por nivel 1</h3>
      <table><tr><th>Código</th><th>Servicio nivel 1</th><th>Servicios N2</th></tr>
      ${t.por_n1.map((r) => `<tr class="click" data-n1="${r.id}"><td>${esc(r.codigo)}</td><td>${esc(r.nombre)}</td><td>${r.servicios}</td></tr>`).join('')}
      </table></div>`;
  vista.querySelectorAll('[data-n1]').forEach((tr) => tr.addEventListener('click', () => {
    Object.keys(filtrosServicio).forEach((k) => { filtrosServicio[k] = k === 'pagina' ? 1 : ''; });
    filtrosServicio.n1_id = tr.dataset.n1;
    location.hash = '#/servicios';
  }));
}

// ------------------------------------------------------------ servicios nivel 2

const filtrosServicio = { q: '', n1_id: '', activo: '', clase_id: '', criticidad_id: '', tipo_id: '', revision: '', sin_responsable: '', pagina: 1 };

async function vServicios() {
  const aux = await auxiliares();
  vista.innerHTML = `
    <h2>Servicios de nivel 2</h2>
    <form id="f-filtros" class="filtros card">
      <label>Buscar (código o nombre)<input name="q" value="${esc(filtrosServicio.q)}" placeholder="SE.06 o Aplicaciones"></label>
      <label>Nivel 1<select name="n1_id">${opciones(aux.n1, filtrosServicio.n1_id, 'Todos', (x) => `${x.codigo} ${x.nombre}`)}</select></label>
      <label>Estado<select name="activo"><option value="">Todos</option>${['S', 'N', 'DESCONOCIDO'].map((v) => `<option ${filtrosServicio.activo === v ? 'selected' : ''}>${v}</option>`).join('')}</select></label>
      <label>Clase<select name="clase_id">${opciones(aux.clases, filtrosServicio.clase_id, 'Todas')}<option value="sin_dato" ${filtrosServicio.clase_id === 'sin_dato' ? 'selected' : ''}>(sin dato)</option></select></label>
      <label>Criticidad<select name="criticidad_id">${opciones(aux.crits, filtrosServicio.criticidad_id, 'Todas')}<option value="sin_dato" ${filtrosServicio.criticidad_id === 'sin_dato' ? 'selected' : ''}>(sin dato)</option></select></label>
      <label>Tipo<select name="tipo_id">${opciones(aux.tipos, filtrosServicio.tipo_id, 'Todos')}<option value="sin_dato" ${filtrosServicio.tipo_id === 'sin_dato' ? 'selected' : ''}>(sin dato)</option></select></label>
      <label>Revisión<select name="revision"><option value="">Todos</option><option value="true" ${filtrosServicio.revision === 'true' ? 'selected' : ''}>Requiere revisión</option></select></label>
      <label>Responsable<select name="sin_responsable"><option value="">Todos</option><option value="true" ${filtrosServicio.sin_responsable === 'true' ? 'selected' : ''}>Sin asignar</option></select></label>
      <button type="submit">Filtrar</button>
      <button type="button" class="secundario" id="limpiar">Limpiar</button>
      ${esAdmin() ? '<button type="button" id="nuevo">+ Nuevo servicio</button>' : ''}
    </form>
    <div id="tabla"></div>`;
  const form = $('#f-filtros');
  form.addEventListener('submit', (e) => { e.preventDefault(); Object.assign(filtrosServicio, formDatos(form), { pagina: 1 }); cargarServicios(aux); });
  $('#limpiar').addEventListener('click', () => { Object.keys(filtrosServicio).forEach((k) => { filtrosServicio[k] = k === 'pagina' ? 1 : ''; }); vServicios(); });
  if (esAdmin()) $('#nuevo').addEventListener('click', () => formServicio(null, aux));
  cargarServicios(aux);
}

async function cargarServicios(aux) {
  const qs = new URLSearchParams(Object.entries({ ...filtrosServicio, tam: 15 }).filter(([, v]) => v !== '' && v !== null)).toString();
  const r = await api('GET', `/servicios?${qs}`);
  $('#tabla').innerHTML = `
    <div class="barra"><span>${r.total} servicio(s) · página ${r.pagina} de ${Math.max(r.paginas, 1)}</span>
      <button class="secundario chico" id="ant" ${r.pagina <= 1 ? 'disabled' : ''}>‹ Anterior</button>
      <button class="secundario chico" id="sig" ${r.pagina >= r.paginas ? 'disabled' : ''}>Siguiente ›</button></div>
    <table><tr><th>Código</th><th>Nombre</th><th>Nivel 1</th><th>Estado</th><th>Clase</th><th>Criticidad</th><th>Tipo</th><th>Sección responsable</th><th></th></tr>
    ${r.datos.map((s) => `<tr class="click" data-id="${s.id}">
      <td>${esc(s.codigo)}</td><td>${esc(s.nombre)}</td><td>${esc(s.n1_codigo)}</td><td>${estadoBadge(s.activo)}</td>
      <td>${sinDato(s.clase)}</td><td>${sinDato(s.criticidad)}</td><td>${sinDato(s.tipo)}</td>
      <td>${s.seccion_responsable ? esc(s.seccion_responsable) : '<span class="muted">sin asignar</span>'}${s.usuario_responsable ? `<br><span class="muted">${esc(s.usuario_responsable)}</span>` : ''}</td>
      <td>${s.requiere_revision ? '<span class="badge warn">revisión</span>' : ''}</td></tr>`).join('') || '<tr><td colspan="9" class="muted">Sin resultados</td></tr>'}
    </table>`;
  $('#ant').addEventListener('click', () => { filtrosServicio.pagina--; cargarServicios(aux); });
  $('#sig').addEventListener('click', () => { filtrosServicio.pagina++; cargarServicios(aux); });
  $('#tabla').querySelectorAll('tr[data-id]').forEach((tr) => tr.addEventListener('click', () => fichaServicio(tr.dataset.id, aux)));
}

async function fichaServicio(id, aux) {
  const s = await api('GET', `/servicios/${id}`);
  const umbral = (v) => (v === null ? '<span class="muted">sin dato</span>' : esc(v));
  abrirModal(`
    <h2>${esc(s.codigo)} · ${esc(s.nombre)}</h2>
    <dl class="ficha">
      <dt>Nivel 1</dt><dd>${esc(s.n1_codigo)} — ${esc(s.n1_nombre)} ${s.n1_activo ? '' : '<span class="badge no">N1 inactivo</span>'}</dd>
      <dt>Código original / normalizado</dt><dd>${esc(s.codigo)} / ${esc(s.codigo_normalizado)}</dd>
      <dt>Activo (columna ACTIVO)</dt><dd>${estadoBadge(s.activo)} <span class="muted">${esc(s.activo)}</span></dd>
      <dt>Clase de servicio</dt><dd>${sinDato(s.clase)}</dd>
      <dt>Criticidad</dt><dd>${sinDato(s.criticidad)}</dd>
      <dt>Tipo de servicio</dt><dd>${sinDato(s.tipo)}${s.tipo_origen && s.tipo_origen !== s.tipo ? ` <span class="muted">(valor original: ${esc(s.tipo_origen)})</span>` : ''}</dd>
      <dt>Descripción</dt><dd>${sinDato(s.descripcion)}</dd>
      <dt>Métrica</dt><dd>${sinDato(s.metrica)}</dd>
      <dt>Mínimo / Máximo</dt><dd>${umbral(s.minimo)} / ${umbral(s.maximo)}</dd>
      <dt>Requiere revisión</dt><dd>${s.requiere_revision ? '<span class="badge warn">Sí</span>' : 'No'}</dd>
      <dt>Sección responsable</dt><dd>${sinDato(s.seccion_responsable_ruta)} ${s.seccion_responsable_id && !s.seccion_responsable_activa ? '<span class="badge no">inactiva</span>' : ''}</dd>
      <dt>Usuario responsable</dt><dd>${s.usuario_responsable ? `${esc(s.usuario_responsable)} (${esc(s.usuario_responsable_username)})` : '<span class="muted">sin asignar</span>'} ${s.usuario_responsable_id && !s.usuario_responsable_activo ? '<span class="badge no">inactivo</span>' : ''}</dd>
      <dt>Origen</dt><dd>${esc(s.origen_hoja)} ${esc(s.origen_rango)}</dd>
    </dl>
    ${s.traza && s.traza.transformaciones && s.traza.transformaciones.length ? `<h3>Transformaciones al importar</h3><pre>${esc(JSON.stringify(s.traza.transformaciones, null, 2))}</pre>` : ''}
    ${s.observaciones.length ? `<h3>Observaciones de la última importación</h3><ul>${s.observaciones.map((o) => `<li><b>${esc(o.tipo)}</b>: ${esc(o.mensaje)}</li>`).join('')}</ul>` : ''}
    <div class="barra">
      ${esAdmin() ? `<button id="m-editar">Editar</button><button id="m-asignar">Asignar responsable</button>
        ${s.activo === 'N' ? '<button id="m-activar" class="secundario">Activar</button>' : '<button id="m-desactivar" class="peligro">Desactivar</button>'}` : ''}
      <button class="secundario" data-cerrar>Cerrar</button>
    </div>`);
  if (!esAdmin()) return;
  $('#m-editar').addEventListener('click', () => formServicio(s, aux));
  $('#m-asignar').addEventListener('click', () => formResponsable(s, aux));
  const cambiar = async (accion) => {
    try { await api('POST', `/servicios/${s.id}/${accion}`, {}); aviso('Estado actualizado'); fichaServicio(s.id, aux); cargarServicios(aux); } catch (err) { aviso(err.message, true); }
  };
  if ($('#m-activar')) $('#m-activar').addEventListener('click', () => cambiar('activar'));
  if ($('#m-desactivar')) $('#m-desactivar').addEventListener('click', () => cambiar('desactivar'));
}

function formServicio(s, aux) {
  const x = s || { activo: 'S' };
  abrirModal(`
    <h2>${s ? `Editar ${esc(s.codigo)}` : 'Nuevo servicio de nivel 2'}</h2>
    <form id="f-servicio" class="grid2">
      <label>Código${s ? `<input value="${esc(s.codigo)}" disabled>` : '<input name="codigo" required placeholder="SE.13.01">'}</label>
      <label>Servicio nivel 1<select name="n1_id" required>${opciones(aux.n1.filter((n) => n.activo || n.id === x.n1_id), x.n1_id, 'Seleccione…', (n) => `${n.codigo} ${n.nombre}`)}</select></label>
      <label class="full">Nombre<input name="nombre" required value="${esc(x.nombre)}"></label>
      <label>Activo<select name="activo">${['S', 'N', 'DESCONOCIDO'].map((v) => `<option ${x.activo === v ? 'selected' : ''}>${v}</option>`).join('')}</select></label>
      <label>Clase<select name="clase_id">${opciones(aux.clases.filter((c) => c.activo || c.id === x.clase_id), x.clase_id)}</select></label>
      <label>Criticidad<select name="criticidad_id">${opciones(aux.crits.filter((c) => c.activo || c.id === x.criticidad_id), x.criticidad_id)}</select></label>
      <label>Tipo<select name="tipo_id">${opciones(aux.tipos.filter((c) => c.activo || c.id === x.tipo_id), x.tipo_id)}</select></label>
      <label class="full">Descripción<textarea name="descripcion">${esc(x.descripcion)}</textarea></label>
      <label class="full">Métrica<input name="metrica" value="${esc(x.metrica)}"></label>
      <label>Mínimo<input name="minimo" type="number" step="any" value="${x.minimo ?? ''}"></label>
      <label>Máximo<input name="maximo" type="number" step="any" value="${x.maximo ?? ''}"></label>
      <p class="error full" id="f-error"></p>
      <div class="barra full"><button type="submit">Guardar</button><button type="button" class="secundario" data-cerrar>Cancelar</button></div>
    </form>`);
  $('#f-servicio').addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      const datos = formDatos(e.target);
      const r = s ? await api('PUT', `/servicios/${s.id}`, datos) : await api('POST', '/servicios', datos);
      aviso('Servicio guardado');
      cargarServicios(aux);
      fichaServicio(r.id, aux);
    } catch (err) { $('#f-error').textContent = err.message; }
  });
}

async function formResponsable(s, aux) {
  const secciones = await api('GET', '/org/seccion?activo=true');
  abrirModal(`
    <h2>Responsable de ${esc(s.codigo)}</h2>
    <form id="f-resp" class="grid2">
      <label class="full">Sección responsable<select name="seccion_id">${opciones(secciones, s.seccion_responsable_id, '— sin asignar —', (x) => x.ruta)}</select></label>
      <label class="full">Usuario responsable (opcional, de esa sección)<select name="usuario_id"></select></label>
      <p class="error full" id="f-error"></p>
      <div class="barra full"><button type="submit">Guardar</button><button type="button" class="secundario" data-cerrar>Cancelar</button></div>
    </form>`);
  const selSec = $('#f-resp [name=seccion_id]');
  const selUsu = $('#f-resp [name=usuario_id]');
  const cargarUsuarios = async () => {
    if (!selSec.value) { selUsu.innerHTML = '<option value="">— sin usuario —</option>'; return; }
    const r = await api('GET', `/usuarios?seccion_id=${selSec.value}&activo=true&tam=100`);
    selUsu.innerHTML = opciones(r.datos, s.usuario_responsable_id, '— sin usuario —', (u) => `${u.nombre} (${u.puesto})`);
  };
  selSec.addEventListener('change', cargarUsuarios);
  await cargarUsuarios();
  $('#f-resp').addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      await api('PUT', `/servicios/${s.id}/responsable`, formDatos(e.target));
      aviso('Responsable asignado');
      fichaServicio(s.id, aux);
      cargarServicios(aux);
    } catch (err) { $('#f-error').textContent = err.message; }
  });
}

// ------------------------------------------------------------ nivel 1

async function vNivel1() {
  const lista = await api('GET', '/servicios-n1');
  vista.innerHTML = `
    <h2>Servicios de nivel 1</h2>
    ${esAdmin() ? '<div class="barra"><button id="nuevo">+ Nuevo nivel 1</button></div>' : ''}
    <table><tr><th>Código</th><th>Nombre</th><th>Estado</th><th>N2 (activos)</th><th>Nombres en el Excel</th><th></th></tr>
    ${lista.map((n) => `<tr><td>${esc(n.codigo)}</td><td>${esc(n.nombre)} ${n.requiere_revision ? '<span class="badge warn">revisión</span>' : ''}</td>
      <td>${estadoBadge(n.activo)}</td><td>${n.servicios} (${n.servicios_activos})</td>
      <td>${n.nombres_origen.length > 1 ? n.nombres_origen.map((o) => `fila ${o.fila}: ${esc(o.nombre)}`).join('<br>') : '<span class="muted">—</span>'}</td>
      <td>${esAdmin() ? `<button class="chico secundario" data-editar="${n.id}">Editar</button>
        <button class="chico ${n.activo ? 'peligro' : 'secundario'}" data-estado="${n.id}" data-activo="${n.activo}">${n.activo ? 'Desactivar' : 'Activar'}</button>` : ''}</td></tr>`).join('')}
    </table>`;
  if (!esAdmin()) return;
  const form = (n) => {
    abrirModal(`<h2>${n ? `Editar ${esc(n.codigo)}` : 'Nuevo servicio de nivel 1'}</h2>
      <form id="f-n1" class="grid2">
        <label>Código${n ? `<input value="${esc(n.codigo)}" disabled>` : '<input name="codigo" required>'}</label>
        <label>Nombre<input name="nombre" required value="${esc(n ? n.nombre : '')}"></label>
        <p class="error full" id="f-error"></p>
        <div class="barra full"><button type="submit">Guardar</button><button type="button" class="secundario" data-cerrar>Cancelar</button></div></form>`);
    $('#f-n1').addEventListener('submit', async (e) => {
      e.preventDefault();
      try { n ? await api('PUT', `/servicios-n1/${n.id}`, formDatos(e.target)) : await api('POST', '/servicios-n1', formDatos(e.target)); cerrarModal(); aviso('Guardado'); vNivel1(); } catch (err) { $('#f-error').textContent = err.message; }
    });
  };
  $('#nuevo').addEventListener('click', () => form(null));
  vista.querySelectorAll('[data-editar]').forEach((b) => b.addEventListener('click', () => form(lista.find((n) => String(n.id) === b.dataset.editar))));
  vista.querySelectorAll('[data-estado]').forEach((b) => b.addEventListener('click', async () => {
    const activo = b.dataset.activo === 'true';
    try {
      if (!activo) await api('POST', `/servicios-n1/${b.dataset.estado}/activar`, {});
      else {
        try { await api('POST', `/servicios-n1/${b.dataset.estado}/desactivar`, {}); } catch (err) {
          if (!confirm(`${err.message}\n\n¿Desactivar también sus servicios de nivel 2?`)) return;
          const r = await api('POST', `/servicios-n1/${b.dataset.estado}/desactivar`, { cascada: true });
          aviso(`Desactivados: ${r.servicios_n2_desactivados.join(', ') || 'ninguno'}`);
        }
      }
      vNivel1();
    } catch (err) { aviso(err.message, true); }
  }));
}

// ------------------------------------------------------------ catálogos

async function vCatalogos() {
  const [clases, crits, tipos, mapeo] = await Promise.all([
    api('GET', '/catalogos/clases'), api('GET', '/catalogos/criticidades'), api('GET', '/catalogos/tipos'), api('GET', '/catalogos/mapeo')]);
  const tabla = (titulo, cat, lista) => `
    <div class="card"><h3>${titulo}</h3>
      <table><tr><th>Valor original (Excel)</th><th>Etiqueta mostrada</th>${cat === 'criticidades' ? '<th>Orden</th>' : ''}<th>Servicios</th><th>Estado</th><th></th></tr>
      ${lista.map((c) => `<tr><td>${esc(c.valor_origen)}</td><td>${esc(c.etiqueta)}</td>${cat === 'criticidades' ? `<td>${c.orden}</td>` : ''}
        <td>${c.servicios}</td><td>${estadoBadge(c.activo)}</td>
        <td>${esAdmin() ? `<button class="chico secundario" data-cat="${cat}" data-id="${c.id}" data-etq="${esc(c.etiqueta)}">Etiqueta</button>
          <button class="chico secundario" data-cat-estado="${cat}" data-id="${c.id}" data-activo="${c.activo}">${c.activo ? 'Desactivar' : 'Activar'}</button>` : ''}</td></tr>`).join('')}
      </table>
      ${esAdmin() ? `<form class="filtros" data-nuevo="${cat}" style="margin-top:8px"><label>Nuevo valor<input name="valor_origen" required></label><button>Agregar</button></form>` : ''}
    </div>`;
  vista.innerHTML = `<h2>Catálogos controlados</h2>
    <div class="grid2">${tabla('Clases de servicio', 'clases', clases)}${tabla('Criticidades', 'criticidades', crits)}</div><br>
    ${tabla('Tipos de servicio', 'tipos', tipos)}<br>
    <div class="card"><h3>Mapeo de etiquetas corregidas</h3>
      <table><tr><th>Catálogo</th><th>Valor original</th><th>Etiqueta</th><th>Motivo</th></tr>
      ${mapeo.map((m) => `<tr><td>${esc(m.catalogo)}</td><td>${esc(m.valor_origen)}</td><td>${esc(m.etiqueta)}</td><td>${esc(m.motivo)}</td></tr>`).join('') || '<tr><td colspan="4" class="muted">Sin correcciones</td></tr>'}
      </table></div>`;
  if (!esAdmin()) return;
  vista.querySelectorAll('[data-cat]').forEach((b) => b.addEventListener('click', async () => {
    const etiqueta = prompt('Nueva etiqueta (el valor original del Excel no cambia):', b.dataset.etq);
    if (!etiqueta) return;
    try { await api('PUT', `/catalogos/${b.dataset.cat}/${b.dataset.id}`, { etiqueta }); vCatalogos(); } catch (err) { aviso(err.message, true); }
  }));
  vista.querySelectorAll('[data-cat-estado]').forEach((b) => b.addEventListener('click', async () => {
    try { await api('POST', `/catalogos/${b.dataset.catEstado}/${b.dataset.id}/${b.dataset.activo === 'true' ? 'desactivar' : 'activar'}`, {}); vCatalogos(); } catch (err) { aviso(err.message, true); }
  }));
  vista.querySelectorAll('[data-nuevo]').forEach((f) => f.addEventListener('submit', async (e) => {
    e.preventDefault();
    try { await api('POST', `/catalogos/${f.dataset.nuevo}`, formDatos(f)); vCatalogos(); } catch (err) { aviso(err.message, true); }
  }));
}

// ------------------------------------------------------------ organización

const ENT = [
  { id: 'empresa', titulo: 'Empresas', padre: null },
  { id: 'area', titulo: 'Áreas', padre: { id: 'empresa', fk: 'empresa_id', titulo: 'Empresa' } },
  { id: 'departamento', titulo: 'Departamentos', padre: { id: 'area', fk: 'area_id', titulo: 'Área' } },
  { id: 'seccion', titulo: 'Secciones', padre: { id: 'departamento', fk: 'departamento_id', titulo: 'Departamento' } },
  { id: 'puesto', titulo: 'Puestos', padre: { id: 'seccion', fk: 'seccion_id', titulo: 'Sección' } },
];
let entOrg = 'arbol';

async function vOrganizacion() {
  vista.innerHTML = `<h2>Estructura organizacional</h2>
    <div class="tabs"><button data-tab="arbol">Árbol</button>${ENT.map((e) => `<button data-tab="${e.id}">${e.titulo}</button>`).join('')}</div>
    <div id="org"></div>`;
  vista.querySelectorAll('[data-tab]').forEach((b) => {
    b.classList.toggle('activo', b.dataset.tab === entOrg);
    b.addEventListener('click', () => { entOrg = b.dataset.tab; vOrganizacion(); });
  });
  if (entOrg === 'arbol') return orgArbol();
  return orgEntidad(ENT.find((e) => e.id === entOrg));
}

async function orgArbol() {
  const arbol = await api('GET', '/org/arbol');
  const li = (x, hijos, extra = '') => `<li>${x.activo ? '' : '<span class="badge no">inactivo</span> '}<b>${esc(x.codigo)}</b> ${esc(x.nombre)} ${extra}${hijos ? `<ul>${hijos}</ul>` : ''}</li>`;
  $('#org').innerHTML = `<div class="card arbol"><ul>${arbol.map((e) => li(e, e.areas.map((a) => li(a, a.departamentos.map((d) =>
    li(d, d.secciones.map((s) => li(s, s.puestos.map((p) => li(p, '', `<span class="muted">(${p.usuarios} usuario(s))</span>`)).join(''))).join(''))).join(''))).join(''))).join('')}</ul></div>`;
}

async function orgEntidad(ent) {
  const [lista, padres] = await Promise.all([api('GET', `/org/${ent.id}`), ent.padre ? api('GET', `/org/${ent.padre.id}`) : []]);
  $('#org').innerHTML = `
    ${esAdmin() ? `<div class="barra"><button id="nuevo">+ Nuevo</button></div>` : ''}
    <table><tr><th>Código</th><th>Nombre</th>${ent.padre ? `<th>${ent.padre.titulo}</th>` : ''}<th>Estado</th><th>Dependientes activos</th><th></th></tr>
    ${lista.map((x) => `<tr><td>${esc(x.codigo)}</td><td>${esc(x.nombre)}${x.ruta ? `<br><span class="muted">${esc(x.ruta)}</span>` : ''}</td>
      ${ent.padre ? `<td>${esc(x.padre_nombre)} ${x.padre_activo ? '' : '<span class="badge no">inactivo</span>'}</td>` : ''}
      <td>${estadoBadge(x.activo)}</td><td>${x.dependientes_activos}</td>
      <td>${esAdmin() ? `<button class="chico secundario" data-editar="${x.id}">Editar</button>
        <button class="chico ${x.activo ? 'peligro' : 'secundario'}" data-estado="${x.id}" data-activo="${x.activo}">${x.activo ? 'Desactivar' : 'Activar'}</button>` : ''}</td></tr>`).join('')}
    </table>`;
  if (!esAdmin()) return;
  const form = (x) => {
    abrirModal(`<h2>${x ? 'Editar' : 'Nuevo'} — ${ent.titulo}</h2>
      <form id="f-org" class="grid2">
        <label>Código<input name="codigo" required value="${esc(x ? x.codigo : '')}"></label>
        <label>Nombre<input name="nombre" required value="${esc(x ? x.nombre : '')}"></label>
        ${ent.padre ? `<label class="full">${ent.padre.titulo}<select name="${ent.padre.fk}" required>${opciones(padres.filter((p) => p.activo || (x && p.id === x[ent.padre.fk])), x ? x[ent.padre.fk] : '', 'Seleccione…', (p) => p.ruta || `${p.codigo} ${p.nombre}`)}</select></label>` : ''}
        <p class="error full" id="f-error"></p>
        <div class="barra full"><button type="submit">Guardar</button><button type="button" class="secundario" data-cerrar>Cancelar</button></div></form>`);
    $('#f-org').addEventListener('submit', async (e) => {
      e.preventDefault();
      try { x ? await api('PUT', `/org/${ent.id}/${x.id}`, formDatos(e.target)) : await api('POST', `/org/${ent.id}`, formDatos(e.target)); cerrarModal(); aviso('Guardado'); orgEntidad(ent); } catch (err) { $('#f-error').textContent = err.message; }
    });
  };
  $('#nuevo').addEventListener('click', () => form(null));
  $('#org').querySelectorAll('[data-editar]').forEach((b) => b.addEventListener('click', () => form(lista.find((x) => String(x.id) === b.dataset.editar))));
  $('#org').querySelectorAll('[data-estado]').forEach((b) => b.addEventListener('click', async () => {
    const id = b.dataset.estado;
    try {
      if (b.dataset.activo !== 'true') { await api('POST', `/org/${ent.id}/${id}/activar`, {}); aviso('Activado'); return orgEntidad(ent); }
      let r;
      try { r = await api('POST', `/org/${ent.id}/${id}/desactivar`, {}); } catch (err) {
        if (!confirm(`${err.message}\n\n¿Desactivar también TODOS sus dependientes?`)) return null;
        r = await api('POST', `/org/${ent.id}/${id}/desactivar`, { cascada: true });
      }
      const resumen = Object.entries(r.desactivados || {}).map(([k, v]) => `${k}: ${v.length}`).join(', ');
      abrirModal(`<h2>Desactivación realizada</h2><p>Registros desactivados: ${esc(resumen)}</p>
        ${r.servicios_con_responsable_inactivo && r.servicios_con_responsable_inactivo.length ? `<p>Servicios que quedaron con responsable inactivo (no se modificaron, revise su asignación):</p><ul>${r.servicios_con_responsable_inactivo.map((s) => `<li>${esc(s.codigo)} ${esc(s.nombre)}</li>`).join('')}</ul>` : ''}
        <button data-cerrar>Aceptar</button>`);
      return orgEntidad(ent);
    } catch (err) { aviso(err.message, true); return null; }
  }));
}

// ------------------------------------------------------------ usuarios

const filtrosUsuario = { q: '', rol: '', activo: '', pagina: 1 };

async function vUsuarios(id) {
  if (id) return detalleUsuario(id);
  vista.innerHTML = `<h2>Usuarios</h2>
    <form id="f-u" class="filtros card">
      <label>Buscar<input name="q" value="${esc(filtrosUsuario.q)}" placeholder="nombre, usuario o correo"></label>
      <label>Rol<select name="rol"><option value="">Todos</option>${['administrador', 'consulta'].map((r) => `<option ${filtrosUsuario.rol === r ? 'selected' : ''}>${r}</option>`).join('')}</select></label>
      <label>Estado<select name="activo"><option value="">Todos</option><option value="true" ${filtrosUsuario.activo === 'true' ? 'selected' : ''}>Activos</option><option value="false" ${filtrosUsuario.activo === 'false' ? 'selected' : ''}>Inactivos</option></select></label>
      <button>Filtrar</button>${esAdmin() ? '<button type="button" id="nuevo">+ Nuevo usuario</button>' : ''}
    </form><div id="tabla"></div>`;
  $('#f-u').addEventListener('submit', (e) => { e.preventDefault(); Object.assign(filtrosUsuario, formDatos(e.target), { pagina: 1 }); cargarUsuarios(); });
  if (esAdmin()) $('#nuevo').addEventListener('click', () => formUsuario(null));
  cargarUsuarios();
}

async function cargarUsuarios() {
  const qs = new URLSearchParams(Object.entries({ ...filtrosUsuario, tam: 20 }).filter(([, v]) => v !== '')).toString();
  const r = await api('GET', `/usuarios?${qs}`);
  $('#tabla').innerHTML = `
    <div class="barra"><span>${r.total} usuario(s) · página ${r.pagina} de ${Math.max(r.paginas, 1)}</span>
      <button class="secundario chico" id="ant" ${r.pagina <= 1 ? 'disabled' : ''}>‹ Anterior</button>
      <button class="secundario chico" id="sig" ${r.pagina >= r.paginas ? 'disabled' : ''}>Siguiente ›</button></div>
    <table><tr><th>Nombre</th><th>Usuario</th><th>Correo</th><th>Rol</th><th>Empresa</th><th>Puesto / sección</th><th>Estado</th><th>Servicios a cargo</th></tr>
    ${r.datos.map((u) => `<tr class="click" data-id="${u.id}"><td>${esc(u.nombre)}</td><td>${esc(u.username)}</td><td>${esc(u.email)}</td><td>${esc(u.rol)}</td>
      <td>${esc(u.empresa)}</td><td>${esc(u.puesto)}<br><span class="muted">${esc(u.seccion)}</span></td><td>${estadoBadge(u.activo)}</td><td>${u.servicios_responsable}</td></tr>`).join('')}
    </table>`;
  $('#ant').addEventListener('click', () => { filtrosUsuario.pagina--; cargarUsuarios(); });
  $('#sig').addEventListener('click', () => { filtrosUsuario.pagina++; cargarUsuarios(); });
  $('#tabla').querySelectorAll('tr[data-id]').forEach((tr) => tr.addEventListener('click', () => { location.hash = `#/usuarios/${tr.dataset.id}`; }));
}

async function detalleUsuario(id) {
  const u = await api('GET', `/usuarios/${id}`);
  vista.innerHTML = `<h2>${esc(u.nombre)}</h2>
    <div class="card"><dl class="ficha">
      <dt>Usuario</dt><dd>${esc(u.username)}</dd><dt>Correo</dt><dd>${esc(u.email)}</dd><dt>Rol</dt><dd>${esc(u.rol)}</dd>
      <dt>Estado</dt><dd>${estadoBadge(u.activo)}</dd><dt>Empresa (por jerarquía)</dt><dd>${esc(u.empresa)}</dd>
      <dt>Ubicación</dt><dd>${esc(u.ruta)}</dd></dl>
      <div class="barra"><a href="#/usuarios">‹ Volver</a>
      ${esAdmin() ? `<button id="editar">Editar</button><button id="estado" class="${u.activo ? 'peligro' : 'secundario'}">${u.activo ? 'Desactivar' : 'Activar'}</button>` : ''}</div></div>
    <h3>Servicios de los que es responsable (${u.servicios.length})</h3>
    <table><tr><th>Código</th><th>Servicio</th><th>Nivel 1</th><th>Estado</th></tr>
    ${u.servicios.map((s) => `<tr><td>${esc(s.codigo)}</td><td>${esc(s.nombre)}</td><td>${esc(s.n1_codigo)} ${esc(s.n1_nombre)}</td><td>${estadoBadge(s.activo)}</td></tr>`).join('') || '<tr><td colspan="4" class="muted">Ninguno</td></tr>'}
    </table>`;
  if (!esAdmin()) return;
  $('#editar').addEventListener('click', () => formUsuario(u));
  $('#estado').addEventListener('click', async () => {
    try { await api('POST', `/usuarios/${u.id}/${u.activo ? 'desactivar' : 'activar'}`, {}); aviso('Estado actualizado'); detalleUsuario(u.id); } catch (err) { aviso(err.message, true); }
  });
}

async function formUsuario(u) {
  const puestos = await api('GET', '/org/puesto?activo=true');
  abrirModal(`<h2>${u ? 'Editar usuario' : 'Nuevo usuario'}</h2>
    <form id="f-usr" class="grid2">
      <label>Nombre<input name="nombre" required value="${esc(u ? u.nombre : '')}"></label>
      <label>Usuario<input name="username" required value="${esc(u ? u.username : '')}"></label>
      <label>Correo<input name="email" type="email" required value="${esc(u ? u.email : '')}"></label>
      <label>Rol<select name="rol">${['consulta', 'administrador'].map((r) => `<option ${u && u.rol === r ? 'selected' : ''}>${r}</option>`).join('')}</select></label>
      <label class="full">Puesto<select name="puesto_id" required>${opciones(puestos, u ? u.puesto_id : '', 'Seleccione…', (p) => p.ruta)}</select></label>
      <label class="full">Contraseña ${u ? '(dejar vacío para no cambiarla)' : ''}<input name="password" type="password" minlength="8" ${u ? '' : 'required'} autocomplete="new-password"></label>
      <p class="error full" id="f-error"></p>
      <div class="barra full"><button type="submit">Guardar</button><button type="button" class="secundario" data-cerrar>Cancelar</button></div></form>`);
  $('#f-usr').addEventListener('submit', async (e) => {
    e.preventDefault();
    const datos = formDatos(e.target);
    if (!datos.password) delete datos.password;
    try {
      const r = u ? await api('PUT', `/usuarios/${u.id}`, datos) : await api('POST', '/usuarios', datos);
      cerrarModal(); aviso('Usuario guardado'); location.hash = `#/usuarios/${r.id}`; if (u) detalleUsuario(r.id);
    } catch (err) { $('#f-error').textContent = err.message; }
  });
}

// ------------------------------------------------------------ asignaciones

async function vAsignaciones() {
  const r = await api('GET', '/resumen/asignaciones');
  vista.innerHTML = `<h2>Asignación de servicios</h2>
    <p class="muted">${r.sin_asignar} servicio(s) de nivel 2 sin sección responsable. Para asignar, abra el servicio en "Servicios".</p>
    <div class="grid2">
      <div class="card"><h3>Por sección responsable</h3>
        <table><tr><th>Sección</th><th>Servicios</th></tr>
        ${r.por_seccion.map((s) => `<tr><td>${esc(s.nombre)} ${s.activo ? '' : '<span class="badge no">inactiva</span>'}<br><span class="muted">${esc(s.ruta)}</span>
          <ul>${s.detalle.map((d) => `<li>${esc(d.codigo)} ${esc(d.nombre)}${d.usuario ? ` — <i>${esc(d.usuario)}</i>` : ''}</li>`).join('')}</ul></td><td>${s.servicios}</td></tr>`).join('')}
        </table></div>
      <div class="card"><h3>Por usuario responsable</h3>
        <table><tr><th>Usuario</th><th>Sección</th><th>Servicios</th></tr>
        ${r.por_usuario.map((u) => `<tr class="click" data-id="${u.id}"><td>${esc(u.nombre)} ${u.activo ? '' : '<span class="badge no">inactivo</span>'}</td><td>${esc(u.seccion)}</td><td>${u.servicios}</td></tr>`).join('')}
        </table></div></div>`;
  vista.querySelectorAll('tr[data-id]').forEach((tr) => tr.addEventListener('click', () => { location.hash = `#/usuarios/${tr.dataset.id}`; }));
}

// ------------------------------------------------------------ importaciones

async function vImportaciones(id) {
  if (id) return detalleImportacion(id);
  const lista = await api('GET', '/importaciones');
  vista.innerHTML = `<h2>Importaciones del Excel</h2>
    ${esAdmin() ? '<div class="barra"><button id="importar">Importar de nuevo data/CatalogoServicios.xlsx</button><span class="muted">Es repetible: no duplica registros.</span></div>' : ''}
    <table><tr><th>#</th><th>Fecha</th><th>Origen</th><th>Por</th><th>Creados</th><th>Actualizados</th><th>Sin cambios</th><th>Omitidos</th><th>Observados</th><th>Control 12/46</th></tr>
    ${lista.map((i) => `<tr class="click" data-id="${i.id}"><td>${i.id}</td><td>${new Date(i.iniciada_en).toLocaleString()}</td><td>${esc(i.origen)}</td><td>${esc(i.ejecutada_por || '—')}</td>
      <td>${i.resumen.creados ?? ''}</td><td>${i.resumen.actualizados ?? ''}</td><td>${i.resumen.sin_cambios ?? ''}</td><td>${i.resumen.omitidos ?? ''}</td><td>${i.resumen.observados ?? ''}</td>
      <td>${i.resumen.controles ? (i.resumen.controles.ok ? `<span class="badge ok">${i.resumen.controles.n1_en_archivo}/${i.resumen.controles.n2_en_archivo}</span>` : '<span class="badge no">falló</span>') : ''}</td></tr>`).join('')}
    </table>`;
  vista.querySelectorAll('tr[data-id]').forEach((tr) => tr.addEventListener('click', () => { location.hash = `#/importaciones/${tr.dataset.id}`; }));
  if (esAdmin()) {
    $('#importar').addEventListener('click', async () => {
      try { const r = await api('POST', '/importaciones', {}); aviso(`Importación #${r.importacion_id}: ${r.creados} creados, ${r.actualizados} actualizados, ${r.sin_cambios} sin cambios`); vImportaciones(); } catch (err) { aviso(err.message, true); }
    });
  }
}

async function detalleImportacion(id) {
  const i = await api('GET', `/importaciones/${id}`);
  vista.innerHTML = `<h2>Importación #${i.id}</h2><a href="#/importaciones">‹ Volver</a>
    <div class="card"><h3>Resumen</h3><pre>${esc(JSON.stringify(i.resumen, null, 2))}</pre></div>
    <h3>Observaciones (${i.observaciones.length})</h3>
    <table><tr><th>Tipo</th><th>Severidad</th><th>Fila</th><th>Rango</th><th>Código</th><th>Mensaje</th></tr>
    ${i.observaciones.map((o) => `<tr><td>${esc(o.tipo)}</td><td>${esc(o.severidad)}</td><td>${o.fila ?? ''}</td><td>${esc(o.rango)}</td><td>${esc(o.codigo)}</td><td>${esc(o.mensaje)}</td></tr>`).join('')}
    </table>`;
}

// ------------------------------------------------------------ arranque

(async () => {
  try {
    const r = await api('GET', '/auth/me');
    USUARIO = r.usuario;
    iniciarApp();
  } catch { mostrarLogin(); }
})();
