'use strict';
// Control de calidad del harness. No necesita base de datos. Termina con código 0 si todo pasa y 1 si algo falla.
// Uso: npm run calidad   (dentro del contenedor: docker compose exec app npm run calidad)
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execFileSync } = require('child_process');

const RAIZ = path.join(__dirname, '..');
const resultados = [];
const control = async (nombre, fn) => {
  try {
    const detalle = await fn();
    resultados.push({ nombre, ok: true, detalle });
  } catch (err) {
    resultados.push({ nombre, ok: false, detalle: err.message });
  }
};
const archivos = (dir, ext) => {
  const abs = path.join(RAIZ, dir);
  if (!fs.existsSync(abs)) return [];
  return fs.readdirSync(abs, { withFileTypes: true }).flatMap((e) => {
    const rel = path.join(dir, e.name);
    if (e.isDirectory()) return e.name === 'node_modules' ? [] : archivos(rel, ext);
    return rel.endsWith(ext) ? [rel] : [];
  });
};

(async () => {
  await control('C1 Excel original sin modificaciones (SHA-256)', () => {
    const esperado = fs.readFileSync(path.join(RAIZ, 'data/CatalogoServicios.xlsx.sha256'), 'utf8').split(/\s+/)[0];
    const real = crypto.createHash('sha256').update(fs.readFileSync(path.join(RAIZ, 'data/CatalogoServicios.xlsx'))).digest('hex');
    if (real !== esperado) throw new Error(`hash ${real} distinto del registrado ${esperado}`);
    return real.slice(0, 16);
  });

  await control('C2 Sintaxis válida en todos los .js', () => {
    const js = [...archivos('src', '.js'), ...archivos('scripts', '.js'), ...archivos('tests', '.js'), ...archivos('public', '.js')];
    for (const f of js) execFileSync(process.execPath, ['--check', path.join(RAIZ, f)], { stdio: 'pipe' });
    return `${js.length} archivos`;
  });

  await control('C3 Controles del Excel sin base de datos (12 N1 / 46 N2)', async () => {
    const { analizarLibro } = require('../src/services/importador');
    const d = await analizarLibro(path.join(RAIZ, 'data/CatalogoServicios.xlsx'));
    const n2 = new Set(d.n2.map((s) => s.codigo)).size;
    if (d.n1.length !== 12 || n2 !== 46) throw new Error(`se obtuvo ${d.n1.length}/${n2}`);
    return `12/46, filas omitidas ${d.filas.filas_omitidas.join(', ')}`;
  });

  await control('C4 Secretos fuera de Git (.env ignorado, sin .env versionado)', () => {
    const gi = fs.existsSync(path.join(RAIZ, '.gitignore')) ? fs.readFileSync(path.join(RAIZ, '.gitignore'), 'utf8') : '';
    if (!/^\.env$/m.test(gi)) throw new Error('.gitignore no excluye .env');
    try {
      const versionados = execFileSync('git', ['ls-files', '.env', '*.pem', '*.key'], { cwd: RAIZ, stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
      if (versionados) throw new Error(`archivos sensibles versionados: ${versionados}`);
      return '.env ignorado y no versionado';
    } catch (err) {
      if (err.message.startsWith('archivos sensibles')) throw err;
      return '.env ignorado (git no disponible en este entorno)';
    }
  });

  await control('C5 password_hash solo se lee en autenticación y scripts de cuentas', () => {
    const permitidos = new Set(['src/routes/auth.js', 'src/routes/usuarios.js']);
    const infractores = archivos('src/routes', '.js').filter((f) => !permitidos.has(f.replace(/\\/g, '/'))
      && /password_hash/.test(fs.readFileSync(path.join(RAIZ, f), 'utf8')));
    if (infractores.length) throw new Error(`aparece en ${infractores.join(', ')}`);
    const usuarios = fs.readFileSync(path.join(RAIZ, 'src/routes/usuarios.js'), 'utf8');
    if (/SELECT[^;]*password_hash[^;]*FROM v_usuario/i.test(usuarios)) throw new Error('usuarios.js expone el hash');
    return 'ok';
  });

  await control('C6 Migraciones numeradas y en orden', () => {
    const m = fs.readdirSync(path.join(RAIZ, 'src/db/migrations')).filter((f) => f.endsWith('.sql')).sort();
    m.forEach((f, i) => { if (!f.startsWith(String(i + 1).padStart(3, '0'))) throw new Error(`numeración rota en ${f}`); });
    return m.join(', ');
  });

  await control('C7 Sin claves de proveedores de IA en el código', () => {
    const patron = /(sk-[A-Za-z0-9]{20,}|ANTHROPIC_API_KEY|OPENAI_API_KEY)/;
    const todos = [...archivos('src', '.js'), ...archivos('scripts', '.js'), ...archivos('public', '.js')];
    const con = todos.filter((f) => patron.test(fs.readFileSync(path.join(RAIZ, f), 'utf8')) && !f.endsWith('calidad.js'));
    if (con.length) throw new Error(con.join(', '));
    return 'la aplicación no depende de servicios de IA';
  });

  for (const r of resultados) console.log(`${r.ok ? 'OK   ' : 'FALLA'} ${r.nombre} — ${r.detalle}`);
  const fallas = resultados.filter((r) => !r.ok).length;
  console.log(fallas ? `\n[calidad] ${fallas} control(es) fallaron` : '\n[calidad] todos los controles pasaron');
  process.exit(fallas ? 1 : 0);
})();
