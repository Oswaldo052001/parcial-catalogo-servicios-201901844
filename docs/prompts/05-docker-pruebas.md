# Prompt 05: Docker, reproducibilidad y cobertura de pruebas
**Herramienta:** Claude (Cowork), sesión con el modelo configurado `claude-opus-5-5`. El agente principal redactó el prompt y lo envió a un sub-agente (tipo *general-purpose*, mismo modelo) con acceso al repositorio en el espacio de trabajo de la sesión.
**Fecha de uso:** 2026-10-03 (hora de Guatemala).

## Objetivo

Revisar que un clon limpio en Windows (Docker Desktop + PowerShell) o Linux levante con `docker compose up --build -d` y que P01–P12 estén automatizados.

## Contexto suministrado y por qué

`AGENTS.md`, secciones 5 y 6 del enunciado, Dockerfile, compose, `.dockerignore`, `.gitattributes`, `.env.example`, `package.json`, scripts de arranque, harness y P12, y la carpeta `tests/`. Se avisó que en el entorno de la sesión Docker Hub estaba bloqueado, así que la revisión era estática.

## Prompt utilizado

Texto exacto enviado (incluye instrucciones, restricciones, salida esperada y criterio de aceptación):

```text
Trabajas en /home/claude/repo. Contexto que debes leer: AGENTS.md, docs/contexto/enunciado.md (secciones 5 y 6), Dockerfile, compose.yaml, .dockerignore, .gitattributes, .env.example, package.json, scripts/iniciar.js, scripts/harness.sh, scripts/harness.ps1, scripts/p12-persistencia.sh, scripts/p12-persistencia.ps1 y la carpeta tests/.

Objetivo: revisar que el catedrático pueda clonar el repositorio en Windows (Docker Desktop + PowerShell) o Linux, ejecutar `docker compose up --build -d` y correr las pruebas P01–P12, sin instalar nada más.

Contexto adicional: en este entorno el registro de Docker Hub está bloqueado, así que NO puedes construir imágenes; la revisión es estática (puedes usar `docker compose config` y `sh -n`).

Instrucciones:
1. Recorre mentalmente un clon limpio: qué archivos entran a la imagen, qué variables hacen falta, en qué orden arrancan los servicios, qué pasa si no existe .env, qué pasa en el segundo arranque (idempotencia) y tras `docker compose down` sin -v.
2. Busca problemas típicos de Windows: fines de línea CRLF en archivos que se ejecutan en Linux, comillas en PowerShell 5.1, rutas.
3. Verifica que las pruebas no puedan tocar la base de evaluación y que cada escenario P01–P12 tenga al menos una prueba automatizada (indica archivo y nombre del test).
4. Revisa que no se publique el puerto de PostgreSQL ni haya secretos reales.

Restricciones: no modifiques archivos. No ejecutes `docker compose up` ni comandos que borren volúmenes.

Salida esperada: tabla P01–P12 → archivo/test; lista de problemas con severidad (bloqueante / importante / menor) y corrección concreta. Máximo 400 palabras.

Criterio de aceptación: cada problema bloqueante o importante indica el archivo y la línea, y explica en qué paso del clon limpio fallaría.
```

## Resultado

**Resultado.** Ningún problema bloqueante. Se armó la tabla P01–P12 → archivo y test, que se reutiliza en `docs/RESOLUCION.md`.

**Hallazgos y decisión.**
1. (importante) Sin `.env`, las cuentas de evaluación no se creaban: **corregido**, `compose.yaml` usa los mismos valores de demostración de `.env.example` como valores por defecto.
2. (importante) El script P12 insertaba una empresa en la base de evaluación: **corregido**, ahora la marca va en `catalogo_test` y además se comparan los conteos de la base de evaluación antes y después del reinicio.
3. Faltaba el README: se escribió en la fase de documentación.
4. `harness.ps1` invocaba `powershell` por nombre: **corregido**, ahora llama al script directamente.
5. Acentos en los `.ps1` sin BOM: **corregido** dejando los `.ps1` solo en ASCII.
6. `AUTO_SETUP` reimportaba y restablecía cuentas en cada arranque: **corregido**, la carga inicial solo corre con la base vacía, así un reinicio no revierte cambios (verificado: una empresa desactivada sigue desactivada tras reiniciar).

## Criterio de aceptación: decisión

Aceptado con las correcciones. Falta la prueba real de construcción en Docker Desktop, que hace el autor (ver docs/evidencias/).
