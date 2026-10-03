# Prompt 03: Autenticación y autorización
**Herramienta:** Claude (Cowork), sesión con el modelo configurado `claude-opus-5-5`. El agente principal redactó el prompt y lo envió a un sub-agente (tipo *general-purpose*, mismo modelo) con acceso al repositorio en el espacio de trabajo de la sesión.
**Fecha de uso:** 2026-10-03 (hora de Guatemala).

## Objetivo

Revisión de seguridad del inicio de sesión, las sesiones y los roles contra la sección 3.1.

## Contexto suministrado y por qué

Sección "Stack" de `AGENTS.md`, sección 3.1 del enunciado y los archivos de contraseñas, sesiones, middleware, rutas de autenticación, `app.js` y rutas de usuarios. Se permitió levantar el servidor contra la base local con las cuentas de demostración para probar con curl.

## Prompt utilizado

Texto exacto enviado (incluye instrucciones, restricciones, salida esperada y criterio de aceptación):

```text
Trabajas en /home/claude/repo. Contexto que debes leer: AGENTS.md (sección Stack), docs/contexto/enunciado.md (sección 3.1), src/lib/password.js, src/services/sesiones.js, src/middleware/auth.js, src/routes/auth.js, src/app.js y src/routes/usuarios.js.

Objetivo: revisión de seguridad de la autenticación y autorización local.

Instrucciones:
1. Verifica cada punto de la sección 3.1: hash especializado con sal, protección en servidor de todas las rutas, roles administrador/consulta, usuarios desactivados, invalidación de sesión al cerrar, ningún hash expuesto al rol consulta.
2. Busca formas de saltarse la autorización: rutas de /api que no pasen por requiereSesion, métodos HTTP que modifiquen datos sin rol administrador, respuestas que incluyan password_hash, enumeración de usuarios en el login, cookies sin HttpOnly o SameSite.
3. Puedes levantar el servidor contra la base local ya existente (DATABASE_URL=postgres://catalogo:catalogo@localhost:5432/catalogo, PORT=3999 node src/server.js) y probar con curl. Credenciales de prueba: admin / Admin#2026 y consulta / Consulta#2026. Detén el servidor al terminar.

Restricciones: no modifiques archivos del repositorio. No crees ni borres registros salvo los necesarios para probar y desactívalos después. No intentes ataques de denegación de servicio.

Salida esperada: lista de hallazgos con severidad (alta / media / baja), evidencia (archivo:línea o comando curl y respuesta) y corrección sugerida. Si un punto cumple, dilo en una línea. Máximo 400 palabras.

Criterio de aceptación: cada hallazgo de severidad media o alta incluye un comando o línea de código que lo demuestra.
```

## Resultado

**Resultado.** Sin hallazgos de severidad alta ni media. Los seis puntos de la sección 3.1 se verificaron con curl: 401 sin sesión (también con `/API/...` y `//`), 403 para el rol consulta en POST/PUT/PATCH/DELETE, sesión invalidada tras el logout y al desactivar al usuario, cookie `HttpOnly; SameSite=Strict`, ningún hash en las respuestas y el mismo mensaje y tiempo para usuario inexistente y contraseña incorrecta.

**Hallazgos bajos y decisión.**
1. Cambiar la propia contraseña no cerraba las demás sesiones: **corregido** (`src/routes/usuarios.js`).
2. Cookie sin `Secure` por defecto: **se mantiene**, porque la evaluación se hace por `http://localhost`. Se activa con `COOKIE_SECURE=true` (documentado).
3. Sin límite de intentos: **corregido**, 5 fallos por IP y usuario en 15 minutos devuelven 429 (`src/routes/auth.js`, con prueba en P01).
4. El login revela una cuenta desactivada solo si la contraseña es correcta: **se mantiene** porque no permite enumerar usuarios.
5. `clearCookie` sin repetir los atributos: **corregido**.

## Criterio de aceptación: decisión

Aceptado con las correcciones indicadas; la suite completa pasó después (48/48).
