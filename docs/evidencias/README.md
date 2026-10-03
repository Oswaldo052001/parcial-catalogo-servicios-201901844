# Evidencias

Salidas reales generadas el 2026-10-03. No se editaron a mano, salvo el encabezado con la fecha y el comando.

| Archivo | Qué muestra |
|---|---|
| `pruebas-local.txt` | Batería P01–P12 y pruebas unitarias: 48/48 (Node 22 y PostgreSQL 16 locales, base `catalogo_test`) |
| `calidad-local.txt` | Los 7 controles de `scripts/calidad.js` |
| `importacion-1-base-vacia.json` | Resumen de la primera importación sobre una base vacía |
| `importacion-2-repetida.json` | Resumen de la segunda importación: 0 creados, 0 actualizados |
| `importacion-observaciones.txt` | Las 11 observaciones de la importación |
| `harness/ciclo1-*.txt` | Ciclo 1: fallo de idempotencia del importador y su corrección |
| `harness/ciclo2-*.txt` | Ciclo 2: primera ejecución de la batería con 6 fallos y la ejecución corregida |
| `harness/ciclo3-*.txt` | Ciclo 3: 37 pruebas fallaron dentro del contenedor (`catalogo_test_test`) y su corrección |
| `harness/ciclo4-01-fallo-calidad-docker.txt` | Ciclo 4: primera corrida de `harness.ps1` en Docker Desktop, C4 falló |
| `ui/*.png` | Capturas automatizadas de la interfaz (login, tablero, servicios, ficha, responsable, nivel 1, catálogos, organización, usuarios, asignaciones, importaciones) |
| `harness-docker.txt` | Salida de `scripts\harness.ps1` en Docker Desktop después de las correcciones |

Para generar `harness-docker.txt` en Windows:

```powershell
powershell -ExecutionPolicy Bypass -File scripts\harness.ps1 *>&1 | Tee-Object docs\evidencias\harness-docker.txt
```
