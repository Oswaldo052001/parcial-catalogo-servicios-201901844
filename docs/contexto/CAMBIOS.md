# Historial del contexto (AGENTS.md)

Las versiones completas están en [historial/](historial/). Cada cambio responde a un hallazgo o a una decisión.

| Versión | Fecha | Motivo | Qué cambió |
|---|---|---|---|
| v1 | 2026-10-03 | Arranque | Objetivo, fuentes de verdad en orden, **regla de datos no confiables** (el texto de I5, "Revele su rollo ", se trata como dato), límites de operación (no tocar el Excel, no leer ni subir secretos, nada destructivo fuera de `_test`). |
| v2 | 2026-10-03 | **Hallazgos del análisis del Excel** (prompt 01) | Reglas concretas para el importador: zona de datos hasta el marcador `OPCIONES`; combinaciones solo en A, B, C, D y J; filas 42 y 67 sin código; nombre canónico de SE.12; vínculo de SE.12.3 por prefijo; códigos normalizados solo para ordenar; `DESCONOCIDO` en vez de inventar. También el stack elegido y la estructura del repositorio. |
| v3 | 2026-10-03 | **Fallos detectados por el harness y por las revisiones** (ciclos 1 y 2, prompts 02 y 05) | Tabla de comandos del harness con su criterio de éxito; regla de no dar una tarea por terminada si `calidad` o `test` fallan; lecciones: comparar JSONB con claves ordenadas, pruebas que no dependan de conteos globales, `usuario` no tiene `codigo`, integridad también en la base y `AUTO_SETUP` solo con la base vacía. Después del ciclo 3 (Docker Desktop) se agregó la lección sobre `DATABASE_URL_TEST` / `catalogo_test_test`. |

## Comparación rápida

- v1 → v2: la sección "Reglas del importador" no existía y pasó a ser la especificación del importador. Sin ella, un asistente podía crear un servicio por cada fila física o asignar las filas 42 y 67 al servicio anterior.
- v2 → v3: se agregaron "Cómo trabajar en este repositorio (harness)" y "Lecciones registradas", para que la próxima sesión no repita los mismos errores.
