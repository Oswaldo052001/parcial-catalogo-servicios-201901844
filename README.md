# Sistema de gestión del catálogo de servicios de TI

Parcial práctico de Software Avanzado (USAC, segundo semestre 2026). Es una aplicación web que importa el catálogo de `data/CatalogoServicios.xlsx`, lo mantiene en PostgreSQL, agrega la estructura organizacional (Empresa → Área → Departamento → Sección → Puesto → Usuario) y asigna responsables a los servicios. Usa autenticación local con dos roles.

| | |
|---|---|
| Estudiante | Oswaldo Antonio Choc Cuteres, carné 201901844 (entrega individual) |
| Rama de entrega | `main` |
| Etiqueta | `parcial-v2.0` |
| Documentación de la solución | [docs/RESOLUCION.md](docs/RESOLUCION.md) |

## Requisitos

- Docker Engine 24 o superior con Docker Compose v2.20 o superior (en Windows, Docker Desktop 4.x). Se usa `docker compose up --wait`.
- Git.
- No hace falta instalar Node.js ni PostgreSQL en el equipo: todo corre en contenedores.

## Levantar desde un clon limpio

```bash
git clone https://github.com/Oswaldo052001/parcial-catalogo-servicios-201901844.git
cd parcial-catalogo-servicios-201901844
cp .env.example .env            # en PowerShell: Copy-Item .env.example .env
docker compose up --build -d
```

Abrir **http://localhost:8080**. El puerto se cambia con `APP_PORT` en `.env`.

En el primer arranque, con la base vacía, el contenedor `app` hace solo estos pasos: aplica las migraciones, importa el Excel, carga los datos de demostración y crea las cuentas de evaluación. Para ver el avance:

```bash
docker compose logs -f app
```

En los arranques siguientes solo aplica las migraciones pendientes; no reimporta ni vuelve a crear las cuentas, así un reinicio no revierte cambios hechos en la aplicación.

### Cuentas de evaluación

Se definen en `.env` y son solo de demostración. Los valores de `.env.example` son:

| Rol | Usuario | Correo | Contraseña |
|---|---|---|---|
| administrador | `admin` | `admin@catalogo.local` | `Admin#2026` |
| consulta | `consulta` | `consulta@catalogo.local` | `Consulta#2026` |

Para crearlas o restablecerlas en cualquier momento (cambian la contraseña al valor de `.env` y reactivan la cuenta):

```bash
docker compose exec app npm run cuentas
```

Los 50 usuarios ficticios de la organización demo tienen contraseñas aleatorias que no se guardan; un administrador puede asignarles una desde la pantalla Usuarios.

## Comandos

Todos se ejecutan dentro del contenedor `app`:

| Acción | Comando |
|---|---|
| Migraciones | `docker compose exec app npm run migrate` |
| Importar o reimportar el Excel (no duplica) | `docker compose exec app npm run importar` |
| Datos de demostración (organización, 50 usuarios, asignaciones) | `docker compose exec app npm run seed:demo` |
| Cuentas de evaluación | `docker compose exec app npm run cuentas` |
| Controles de calidad | `docker compose exec app npm run calidad` |
| Pruebas P01–P12 | `docker compose exec app npm test` |
| Rutina completa de verificación (Linux/macOS/Git Bash) | `sh scripts/harness.sh` |
| Rutina completa de verificación (Windows PowerShell) | `powershell -ExecutionPolicy Bypass -File scripts\harness.ps1` |
| P12 con reinicio real de contenedores | `sh scripts/p12-persistencia.sh` o `powershell -ExecutionPolicy Bypass -File scripts\p12-persistencia.ps1` |

La importación también se puede lanzar desde la aplicación (menú Importaciones, rol administrador).

## Pruebas

```bash
docker compose exec app npm test
```

Las pruebas usan su propia base, **`catalogo_test`**, que se borra y se crea de nuevo en cada ejecución. Por seguridad, las pruebas no corren contra una base cuyo nombre no termine en `_test`, así que la base de evaluación (`catalogo`) nunca se toca. La tabla de escenarios y su tipo (unitaria o integración) está en [docs/RESOLUCION.md §7–8](docs/RESOLUCION.md#7-matriz-requisito--implementación--prueba--evidencia).

## Operación de Docker

| Acción | Comando | Datos |
|---|---|---|
| Ver estado | `docker compose ps` | |
| Ver logs | `docker compose logs -f app` / `docker compose logs db` | |
| Detener (apagado normal) | `docker compose down` | **se conservan** (volumen `pgdata`) |
| Volver a levantar | `docker compose up -d` | se conservan |
| Reiniciar solo la app | `docker compose restart app` | se conservan |
| **Reinicio destructivo** (borra la base y vuelve a cargar todo) | `docker compose down -v` y luego `docker compose up --build -d` | **se pierden** todos los cambios hechos en la aplicación |

PostgreSQL no publica puertos hacia el anfitrión; solo la aplicación lo alcanza por la red interna de Compose.

## Estructura

```
AGENTS.md                 contexto e instrucciones para asistentes de IA (versionado)
compose.yaml, Dockerfile, .dockerignore, .env.example, .gitattributes
data/                     CatalogoServicios.xlsx original y su SHA-256
src/                      servidor Express: app.js, routes/, services/ (importador), db/ (migraciones), lib/
public/                   interfaz web (HTML + JS sin framework)
scripts/                  importar, seed-demo, crear-cuentas, iniciar, calidad, harness, p12-persistencia, analizar_excel.py
tests/                    unit/ e integracion/ (P01–P12)
docs/RESOLUCION.md        documento de solución
docs/contexto/            enunciado, análisis del Excel, historial de AGENTS.md, contexto por fase
docs/prompts/             prompts utilizados con sus iteraciones
docs/evidencias/          salidas reales de pruebas, harness, importación y capturas de la interfaz
```

## Acceso del catedrático

El repositorio es público y el usuario `maldanap-usac` está invitado como colaborador.
