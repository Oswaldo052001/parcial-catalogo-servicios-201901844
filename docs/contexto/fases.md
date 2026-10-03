# Contexto entregado al asistente en cada fase

| Fase | Documentos entregados | Por qué esos y no otros |
|---|---|---|
| 1. Análisis del Excel | `AGENTS.md` v1, `docs/contexto/enunciado.md`, `data/CatalogoServicios.xlsx` | Hacía falta el enunciado completo para validar 12/46 y los seis casos de la sección 3.4. Todavía no había código. |
| 2. Modelo de datos | `AGENTS.md` v2, secciones 3.2–3.3 del enunciado, `analisis-excel.md`, migraciones | Solo los requisitos del modelo, para que la revisión no se desviara a la interfaz o a Docker. |
| 3. Importador | Reglas del importador en `AGENTS.md` v2, `analisis-excel.md`, sección 3.4 | Para la verificación independiente (prompt 04) **no** se dio el código del importador, para no heredar sus supuestos. |
| 4. Autenticación y API | Sección "Stack" de `AGENTS.md`, sección 3.1, archivos de autenticación | Revisión de seguridad acotada a los archivos que deciden el acceso. |
| 5. Pruebas y Docker | `AGENTS.md` v3 (con los comandos del harness), secciones 5–6, Dockerfile, compose, scripts y `tests/` | La revisión debía simular un clon limpio y necesitaba todo lo que participa en el arranque. |

En todas las fases se entregó `AGENTS.md`, que lleva la regla de datos no confiables y los límites de operación.
