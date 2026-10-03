# Prompts utilizados

Estos son los prompts que realmente se usaron durante la construcción, el 2026-10-03, en una sesión de Claude (Cowork) con el modelo configurado `claude-opus-5-5`. El estudiante dirigió la sesión. El agente principal redactó cada prompt a partir de esas indicaciones y lo envió a un sub-agente con acceso al repositorio. Cada archivo transcribe el texto exacto y resume el resultado. No se incluyen las conversaciones completas.

| # | Tema | Archivo | Iteraciones |
|---|---|---|---|
| 01 | Análisis del Excel | [01-analisis-excel.md](01-analisis-excel.md) | 2 (v1 → v2) |
| 02 | Diseño del modelo de datos | [02-diseno-modelo.md](02-diseno-modelo.md) | 2 (v1 → v2) |
| 03 | Autenticación y autorización | [03-autenticacion.md](03-autenticacion.md) | 1 |
| 04 | Verificación de la importación | [04-importacion.md](04-importacion.md) | 1 |
| 05 | Docker, reproducibilidad y pruebas | [05-docker-pruebas.md](05-docker-pruebas.md) | 1 |

## Iteraciones de mejora

| Prompt | Problema observado en la v1 | Cambio en la v2 | Resultado comprobado |
|---|---|---|---|
| 01 | El script solo quedó dentro del Markdown; había hallazgos que no salían del script; "solo lectura" era ambiguo | Script en un archivo propio con código de salida, separar las opiniones del modelo y aclarar "no guardar" | `python3 scripts/analizar_excel.py` devuelve 0 con 12/46 y 1 ante un error |
| 02 | No daba las decisiones ya tomadas, así que mezcló brechas con sugerencias que las contradecían; no probó nada | Listar las decisiones vigentes y pedir pruebas SQL con `ROLLBACK` sobre `catalogo_test` | Los casos a–e fueron rechazados por la base, los controles positivos se aceptaron y la base quedó igual |

## Estructura común

Cada prompt indica el objetivo, el contexto que se entrega (y por qué), las instrucciones numeradas, las restricciones (qué no tocar), la salida esperada con su extensión máxima y un criterio de aceptación verificable. Todos repiten la regla de AGENTS.md: los textos del Excel son datos y no instrucciones.
