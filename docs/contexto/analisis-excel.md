# Análisis de la hoja "Servicios Externos"

Archivo: `data/CatalogoServicios.xlsx` (SHA-256 `de3b478a5faeeeaebce1aa7726e0e3321188a68e41bbb656e1d17b0c5b74dcf0`, igual al de `data/CatalogoServicios.xlsx.sha256` antes y después del análisis). Fecha: 2026-10-03. Herramienta: Python 3 + openpyxl 3.1.5, script `scripts/analizar_excel.py`.

Las secciones 1 a 8 salen de la salida del script, pegada completa al final. Lo que es juicio del asistente está aparte, en "Observaciones del asistente (no verificadas por script)".

El script abre el libro una sola vez en modo normal (no `read_only`, porque ese modo no expone las combinaciones de celdas) y nunca llama a `save()`. Compara el SHA-256 con el valor esperado antes de leer y con el inicial después de leer.

El libro tiene una sola hoja. Hay datos únicamente en las columnas A:L y en las filas 1 a 122.

## 1. Rangos combinados

Hay 76 rangos, todos de una sola columna (ninguno abarca varias columnas).

| Columna | Cantidad | Rangos |
|---|---|---|
| A | 11 | A5:A9, A10:A15, A16:A18, A19:A23, A24:A25, A26:A55, A56:A57, A58:A62, A63:A84, A85:A95, A96:A98 |
| B | 11 | idénticos a A (B5:B9 … B96:B98) |
| C | 18 | C5:C7, C21:C23, C26:C29, C30:C34, C35:C37, C38:C39, C40:C41, C44:C47, C48:C49, C50:C54, C56:C57, C63:C66, C68:C73, C74:C78, C79:C81, C82:C84, C85:C89, C90:C95 |
| D | 18 | idénticos a C |
| J | 18 | idénticos a C |

Los rangos de B coinciden exactamente con los de A, y los de D y J con los de C. Las columnas E:I y K:L no tienen combinaciones: en las filas de continuación E:H repiten el valor en cada fila.

## 2. Bloques de nivel 1 y nivel 2

Un bloque es un rango combinado de la columna de código o una fila suelta con código propio.

Nivel 1 (A:B): 13 bloques.

| Código | Filas | Tipo | Nombre |
|---|---|---|---|
| SE.01 | 5–9 | combinado | Suministrar Infraestructura |
| SE.02 | 10–15 | combinado | Administrar Infraestructura |
| SE.03 | 16–18 | combinado | Atender Soporte de Usuarios |
| SE.04 | 19–23 | combinado | Administrar Comunicaciones |
| SE.05 | 24–25 | combinado | Administrar y Respaldar Información |
| SE.06 | 26–55 | combinado | Administrar Aplicaciones |
| SE.07 | 56–57 | combinado | Administrar Servicios a Clientes |
| SE.08 | 58–62 | combinado | Administrar Accesos y Configuraciones de Usuarios |
| SE.09 | 63–84 | combinado | Aprovisionar Equipo |
| SE.10 | 85–95 | combinado | Mantener Equipos |
| SE.11 | 96–98 | combinado | Administrar Proyectos |
| SE.12 | 99 | fila suelta | Suministrar Analitica |
| SE.12 | 100 | fila suelta | Mantener Tableros de Control |

Nivel 2 (C:D): 46 bloques, 18 combinados y 28 filas sueltas.

| Código | Filas | Tipo | Nombre |
|---|---|---|---|
| SE.01.01 | 5–7 | combinado | Suministrar Puntos de Red Físicos o Inalámbricos |
| SE.01.02 | 8 | suelta | Suministrar Corriente Regulada |
| SE.01.03 | 9 | suelta | Suministrar Cámaras de Seguridad |
| SE.02.01 | 10 | suelta | Administrar Servicio de Infraestructura de Redes |
| SE.02.02 | 11 | suelta | Administrar Servicio de Internet |
| SE.02.03 | 12 | suelta | Administrar Acceso Remoto VPN |
| SE.02.04 | 13 | suelta | Administrar Corriente Regulada |
| SE.02.05 | 14 | suelta | Gestionar Centros de Impresión |
| SE.02.06 | 15 | suelta | Gestionar Cámaras de Seguridad |
| SE.03.01 | 16 | suelta | Atender Soporte Usuario 1 Línea (HelpDesk) |
| SE.03.02 | 17 | suelta | Atender Soporte Usuario 2 Línea (FrontOffice) |
| SE.03.03 | 18 | suelta | Atender Soporte Usuario 3 Línea (BackOffice) |
| SE.04.01 | 19 | suelta | Administrar Correo Electrónico |
| SE.04.02 | 20 | suelta | Administrar Mensajería Instantánea |
| SE.04.03 | 21–23 | combinado | Administrar Sistema de Telefonía Fija |
| SE.05.01 | 24 | suelta | Administrar y Respaldar Información de Usuarios |
| SE.05.02 | 25 | suelta | Administrar y Respaldar Información de Aplicaciones |
| SE.06.01 | 26–29 | combinado | Administrar Aplicaciones - Área 1 |
| SE.06.02 | 30–34 | combinado | Administrar Aplicaciones - Área 2 |
| SE.06.03 | 35–37 | combinado | Administrar Aplicaciones - Área 3 |
| SE.06.04 | 38–39 | combinado | Administrar Aplicaciones - Área 4 |
| SE.06.05 | 40–41 | combinado | Administrar Aplicaciones - Área 5 |
| SE.06.06 | 43 | suelta | Administrar Aplicaciones - Área 6 |
| SE.06.07 | 44–47 | combinado | Administrar Aplicaciones - Área 7 |
| SE.06.08 | 48–49 | combinado | Administrar Aplicaciones - Área Tecnología de Información |
| SE.06.09 | 50–54 | combinado | Administrar Aplicaciones - Area 8 |
| SE.06.10 | 55 | suelta | Administrar Aplicaciones - Area 9 |
| SE.07.01 | 56–57 | combinado | Administrar Servicios a Clientes - Medios Digitales |
| SE.08.01 | 58 | suelta | Administrar Accesos y Configuraciones de Usuarios a Aplicaciones |
| SE.08.02 | 59 | suelta | Administrar Accesos y Configuraciones de Usuarios a Bases de Datos |
| SE.08.03 | 60 | suelta | Administrar Accesos y Configuraciones de Usuarios a VPN |
| SE.08.04 | 61 | suelta | Administrar Accesos y Configuraciones de Usuarios a Sistema de Telefonía |
| SE.08.05 | 62 | suelta | Administrar Accesos y Configuraciones de Usuarios a Directorio Activo |
| SE.09.01 | 63–66 | combinado | Aprovisionar Equipos de Usuario |
| SE.09.02 | 68–73 | combinado | Aprovisionar Dispositivos Periféricos |
| SE.09.03 | 74–78 | combinado | Aprovisionar Suministros |
| SE.09.04 | 79–81 | combinado | Aprovisionar Licenciamiento Básico |
| SE.09.05 | 82–84 | combinado | Aprovisionar Licenciamiento Avanzado |
| SE.10.01 | 85–89 | combinado | Mantener Equipos de Usuario |
| SE.10.02 | 90–95 | combinado | Mantener Dispositivos Periféricos |
| SE.11.01 | 96 | suelta | Administrar Propuestas |
| SE.11.02 | 97 | suelta | Administrar Proyectos |
| SE.11.03 | 98 | suelta | Administrar Presupuestos de Inversiones y Operaciones |
| SE.12.1 | 99 | suelta | Suministrar Tableros de Control |
| SE.12.2 | 100 | suelta | Suministrar Análsis de Información |
| SE.12.3 | 101 | suelta | Mantener Tableros de Control |

Todo código de nivel 2 empieza con el código de nivel 1 del bloque que lo contiene, salvo SE.12.3 (fila 101), que no cae dentro de ningún bloque de nivel 1 porque A101 está vacía.

## 3. Valores de control 12 / 46: confirmados (el script termina con código 0)

| Nivel | Celdas con código | Códigos distintos | Control | Resultado |
|---|---|---|---|---|
| N1 (col. A) | 13 | 12 (SE.01 … SE.12) | 12 | Coincide |
| N2 (col. C) | 46 | 46 | 46 | Coincide |

La diferencia 13 vs 12 en nivel 1 se debe a que SE.12 aparece en dos celdas (A99 y A100). En nivel 2 no hay códigos repetidos. Todos los códigos se leen como texto (`str`). Los únicos códigos de nivel 2 fuera del patrón `SE.NN.NN` son SE.12.1, SE.12.2 y SE.12.3 (un solo dígito al final).

## 4. Caso SE.12 (filas 99 a 101)

| Fila | A | B | C | D | E:L |
|---|---|---|---|---|---|
| 99 | SE.12 | Suministrar Analitica | SE.12.1 | Suministrar Tableros de Control | todas vacías |
| 100 | SE.12 | Mantener Tableros de Control | SE.12.2 | Suministrar Análsis de Información | todas vacías |
| 101 | (vacía) | (vacía) | SE.12.3 | Mantener Tableros de Control | todas vacías |

- Ninguna de las tres filas está en un rango combinado.
- El código SE.12 tiene dos nombres de nivel 1 distintos en B99 y B100.
- El texto de B100 ("Mantener Tableros de Control") es idéntico al nombre de nivel 2 de D101.
- ACTIVO, clase, criticidad, tipo, descripción, métrica, mínimo y máximo están vacíos en las tres filas.
- Las validaciones de datos de E:H cubren solo las filas 5 a 98 (ver sección 7), así que estas filas quedan fuera de ellas.

## 5. Filas con datos en E:H sin bloque de nivel 2 ni código

Son 2 filas. En ambas A:D e I:L están vacías.

| Fila | E | F | G | H | Bloque N1 que la contiene | N2 anterior | N2 siguiente |
|---|---|---|---|---|---|---|---|
| 42 | S | RECURRENTE | Normal | Front End | SE.06 (A26:A55) | SE.06.05 (filas 40–41) | SE.06.06 (fila 43) |
| 67 | S | A DEMANDA | Normal | Front End | SE.09 (A63:A84) | SE.09.01 (filas 63–66) | SE.09.02 (fila 68) |

Son filas dentro de un bloque de nivel 1 pero fuera de cualquier combinación de C:D.

## 6. Consistencia de E:H dentro de los bloques de nivel 2

Los 18 bloques combinados tienen los mismos valores de E:H en todas sus filas; no hay conflictos. Los 28 bloques de una sola fila no aplican.

Otros datos útiles para el importador:
- En las filas de continuación de los bloques no hay valores en I:L.
- Solo dos filas tienen mínimo/máximo: fila 5 (K=1.0, L=100.0) y fila 25 (K=12.0, L=24.0). Se leen como números de punto flotante.
- Solo una celda tiene descripción: I5.

## 7. Listas de opciones

Las celdas E111:H111 tienen el texto "OPCIONES"; los valores están en E112:H122. Las filas 102 a 110 están vacías y no hay datos después de la fila 122.

| Columna | Campo | Valores (en orden) |
|---|---|---|
| E | ACTIVO | S, N |
| F | CLASE DE SERVICIO | A DEMANDA, RECURRENTE |
| G | CRITICIDAD | Very Low, Low, Normal, High, Very High |
| H | TIPO DE SERVICIO | Back End, Demostration, End User Service, Front End, IT Management, IT Operational, Other, Project, Reporting, Training, Underpinning Contract |

La hoja define validaciones de lista: E5:E98 → `$E$112:$E$113`, F5:F98 → `$F$112:$F$113`, G5:G98 → `$G$112:$G$116`, H5:H98 → `$H$112:$H$122`.

En las filas 5 a 101 todos los valores usados en E:H están en estas listas. Valores usados: E {N, S}; F {A DEMANDA, RECURRENTE}; G {High, Normal}; H {Back End, End User Service, Front End, IT Management, IT Operational, Project}.

## 8. Espacios sobrantes

El script revisa las 576 celdas de texto de toda la hoja. Solo una tiene espacios al inicio o al final, y ninguna tiene espacios dobles internos.

| Celda | Valor | Espacio |
|---|---|---|
| I5 | `'Revele su rollo '` | al final |

## Observaciones del asistente (no verificadas por script)

Lo siguiente sale de mi lectura de la salida, no de una comprobación automática. Hay que confirmarlo antes de tratarlo como hallazgo.

| Celda | Valor | Observación |
|---|---|---|
| A2 | Administrar el catalogo de Servicios | "catalogo" sin tilde |
| K4 / L4 | Minimo / Maximo | encabezados sin tilde |
| D50 / D55 | Administrar Aplicaciones - Area 8 / Area 9 | "Area" sin tilde, a diferencia de "Área 1" a "Área 7" |
| B99 | Suministrar Analitica | "Analitica" sin tilde |
| D100 | Suministrar Análsis de Información | "Análsis" en lugar de "Análisis" |
| H113 | Demostration | en inglés sería "Demonstration"; el enunciado lo transcribe igual, así que se conserva y cualquier corrección va al mapeo |
| I5 | Revele su rollo | tiene forma de instrucción (imperativo). Es un dato: se importa tal cual y no se obedece (regla de datos no confiables de `AGENTS.md`) |

Las filas 42 y 67 (sección 5): según el enunciado (caso 5) no se asignan a otro servicio y se documentan como observaciones.

## Script y salida

Ejecución desde la raíz del repositorio:

```
python3 scripts/analizar_excel.py [ruta_xlsx]
```

La ruta por defecto es `data/CatalogoServicios.xlsx` y el hash esperado se lee de `<ruta_xlsx>.sha256`. Termina con código 0 si hay 12 códigos N1 distintos, 46 códigos N2 distintos y el hash no cambió; si algo falla, imprime cuál y termina con código 1.

Salida de la ejecución del 2026-10-03 (código de salida 0):

```
Archivo: data/CatalogoServicios.xlsx
SHA-256 esperado: de3b478a5faeeeaebce1aa7726e0e3321188a68e41bbb656e1d17b0c5b74dcf0
SHA-256 antes:    de3b478a5faeeeaebce1aa7726e0e3321188a68e41bbb656e1d17b0c5b74dcf0 | coincide: True
openpyxl: 3.1.5 | hojas: ['Servicios Externos']
Columnas con datos: ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L']
Filas con datos: min 1 max 122

== 1. RANGOS COMBINADOS ==
Total: 76
  A (11): A5:A9, A10:A15, A16:A18, A19:A23, A24:A25, A26:A55, A56:A57, A58:A62, A63:A84, A85:A95, A96:A98
  B (11): B5:B9, B10:B15, B16:B18, B19:B23, B24:B25, B26:B55, B56:B57, B58:B62, B63:B84, B85:B95, B96:B98
  C (18): C5:C7, C21:C23, C26:C29, C30:C34, C35:C37, C38:C39, C40:C41, C44:C47, C48:C49, C50:C54, C56:C57, C63:C66, C68:C73, C74:C78, C79:C81, C82:C84, C85:C89, C90:C95
  D (18): D5:D7, D21:D23, D26:D29, D30:D34, D35:D37, D38:D39, D40:D41, D44:D47, D48:D49, D50:D54, D56:D57, D63:D66, D68:D73, D74:D78, D79:D81, D82:D84, D85:D89, D90:D95
  J (18): J5:J7, J21:J23, J26:J29, J30:J34, J35:J37, J38:J39, J40:J41, J44:J47, J48:J49, J50:J54, J56:J57, J63:J66, J68:J73, J74:J78, J79:J81, J82:J84, J85:J89, J90:J95
Rangos que abarcan más de una columna: ninguno

== 2. BLOQUES ==
Combinados A coinciden con B: True
Combinados C coinciden con D: True
Combinados J coinciden con C: True
Nivel 1 (A:B): 13 bloques, 11 combinados, 2 filas sueltas
  SE.01 | filas 5-9 | combinado | 'Suministrar Infraestructura'
  SE.02 | filas 10-15 | combinado | 'Administrar Infraestructura'
  SE.03 | filas 16-18 | combinado | 'Atender Soporte de Usuarios'
  SE.04 | filas 19-23 | combinado | 'Administrar Comunicaciones'
  SE.05 | filas 24-25 | combinado | 'Administrar y Respaldar Información'
  SE.06 | filas 26-55 | combinado | 'Administrar Aplicaciones'
  SE.07 | filas 56-57 | combinado | 'Administrar Servicios a Clientes'
  SE.08 | filas 58-62 | combinado | 'Administrar Accesos y Configuraciones de Usuarios'
  SE.09 | filas 63-84 | combinado | 'Aprovisionar Equipo'
  SE.10 | filas 85-95 | combinado | 'Mantener Equipos'
  SE.11 | filas 96-98 | combinado | 'Administrar Proyectos'
  SE.12 | filas 99-99 | fila suelta | 'Suministrar Analitica'
  SE.12 | filas 100-100 | fila suelta | 'Mantener Tableros de Control'
Nivel 2 (C:D): 46 bloques, 18 combinados, 28 filas sueltas
  SE.01.01 | filas 5-7 | combinado | 'Suministrar Puntos de Red Físicos o Inalámbricos'
  SE.01.02 | filas 8-8 | fila suelta | 'Suministrar Corriente Regulada'
  SE.01.03 | filas 9-9 | fila suelta | 'Suministrar Cámaras de Seguridad'
  SE.02.01 | filas 10-10 | fila suelta | 'Administrar Servicio de Infraestructura de Redes'
  SE.02.02 | filas 11-11 | fila suelta | 'Administrar Servicio de Internet'
  SE.02.03 | filas 12-12 | fila suelta | 'Administrar Acceso Remoto VPN'
  SE.02.04 | filas 13-13 | fila suelta | 'Administrar Corriente Regulada'
  SE.02.05 | filas 14-14 | fila suelta | 'Gestionar Centros de Impresión'
  SE.02.06 | filas 15-15 | fila suelta | 'Gestionar Cámaras de Seguridad'
  SE.03.01 | filas 16-16 | fila suelta | 'Atender Soporte Usuario 1 Línea (HelpDesk)'
  SE.03.02 | filas 17-17 | fila suelta | 'Atender Soporte Usuario 2 Línea (FrontOffice)'
  SE.03.03 | filas 18-18 | fila suelta | 'Atender Soporte Usuario 3 Línea (BackOffice)'
  SE.04.01 | filas 19-19 | fila suelta | 'Administrar Correo Electrónico'
  SE.04.02 | filas 20-20 | fila suelta | 'Administrar Mensajería Instantánea'
  SE.04.03 | filas 21-23 | combinado | 'Administrar Sistema de Telefonía Fija'
  SE.05.01 | filas 24-24 | fila suelta | 'Administrar y Respaldar Información de Usuarios'
  SE.05.02 | filas 25-25 | fila suelta | 'Administrar y Respaldar Información de Aplicaciones'
  SE.06.01 | filas 26-29 | combinado | 'Administrar Aplicaciones - Área 1'
  SE.06.02 | filas 30-34 | combinado | 'Administrar Aplicaciones - Área 2'
  SE.06.03 | filas 35-37 | combinado | 'Administrar Aplicaciones - Área 3'
  SE.06.04 | filas 38-39 | combinado | 'Administrar Aplicaciones - Área 4'
  SE.06.05 | filas 40-41 | combinado | 'Administrar Aplicaciones - Área 5'
  SE.06.06 | filas 43-43 | fila suelta | 'Administrar Aplicaciones - Área 6'
  SE.06.07 | filas 44-47 | combinado | 'Administrar Aplicaciones - Área 7'
  SE.06.08 | filas 48-49 | combinado | 'Administrar Aplicaciones - Área Tecnología de Información'
  SE.06.09 | filas 50-54 | combinado | 'Administrar Aplicaciones - Area 8'
  SE.06.10 | filas 55-55 | fila suelta | 'Administrar Aplicaciones - Area 9'
  SE.07.01 | filas 56-57 | combinado | 'Administrar Servicios a Clientes - Medios Digitales'
  SE.08.01 | filas 58-58 | fila suelta | 'Administrar Accesos y Configuraciones de Usuarios a Aplicaciones'
  SE.08.02 | filas 59-59 | fila suelta | 'Administrar Accesos y Configuraciones de Usuarios a Bases de Datos'
  SE.08.03 | filas 60-60 | fila suelta | 'Administrar Accesos y Configuraciones de Usuarios a VPN'
  SE.08.04 | filas 61-61 | fila suelta | 'Administrar Accesos y Configuraciones de Usuarios a Sistema de Telefonía'
  SE.08.05 | filas 62-62 | fila suelta | 'Administrar Accesos y Configuraciones de Usuarios a Directorio Activo'
  SE.09.01 | filas 63-66 | combinado | 'Aprovisionar Equipos de Usuario'
  SE.09.02 | filas 68-73 | combinado | 'Aprovisionar Dispositivos Periféricos'
  SE.09.03 | filas 74-78 | combinado | 'Aprovisionar Suministros'
  SE.09.04 | filas 79-81 | combinado | 'Aprovisionar Licenciamiento Básico'
  SE.09.05 | filas 82-84 | combinado | 'Aprovisionar Licenciamiento Avanzado'
  SE.10.01 | filas 85-89 | combinado | 'Mantener Equipos de Usuario'
  SE.10.02 | filas 90-95 | combinado | 'Mantener Dispositivos Periféricos'
  SE.11.01 | filas 96-96 | fila suelta | 'Administrar Propuestas'
  SE.11.02 | filas 97-97 | fila suelta | 'Administrar Proyectos'
  SE.11.03 | filas 98-98 | fila suelta | 'Administrar Presupuestos de Inversiones y Operaciones'
  SE.12.1 | filas 99-99 | fila suelta | 'Suministrar Tableros de Control'
  SE.12.2 | filas 100-100 | fila suelta | 'Suministrar Análsis de Información'
  SE.12.3 | filas 101-101 | fila suelta | 'Mantener Tableros de Control'
N2 sin bloque N1 que lo contenga o con prefijo distinto:
  SE.12.3 (fila 101): N1 del bloque = None

== 3. CONTROLES DE CONTEO ==
N1: celdas con código 13 | distintos 12 | control 12 -> OK
   ['SE.01', 'SE.02', 'SE.03', 'SE.04', 'SE.05', 'SE.06', 'SE.07', 'SE.08', 'SE.09', 'SE.10', 'SE.11', 'SE.12']
  Repetidos en más de una celda: ['SE.12']
N2: celdas con código 46 | distintos 46 | control 46 -> OK
  Repetidos en más de una celda: []
  Fuera del patrón SE.NN.NN: ['SE.12.1', 'SE.12.2', 'SE.12.3']
  Tipos de dato en A y C: ['str']

== 4. CASO SE.12 (filas 99-101) ==
  fila 99: {'A': 'SE.12', 'B': 'Suministrar Analitica', 'C': 'SE.12.1', 'D': 'Suministrar Tableros de Control'} | vacías en E:L: EFGHIJKL
  fila 100: {'A': 'SE.12', 'B': 'Mantener Tableros de Control', 'C': 'SE.12.2', 'D': 'Suministrar Análsis de Información'} | vacías en E:L: EFGHIJKL
  fila 101: {'A': None, 'B': None, 'C': 'SE.12.3', 'D': 'Mantener Tableros de Control'} | vacías en E:L: EFGHIJKL
  Dentro de algún rango combinado: ninguno
  Texto igual en B100 y D101: 'Mantener Tableros de Control'

== 5. FILAS CON DATOS EN E:H FUERA DE BLOQUE N2 Y SIN CÓDIGO ==
  fila 42: {'E': 'S', 'F': 'RECURRENTE', 'G': 'Normal', 'H': 'Front End'} | otros valores en A:L: ninguno | N1 del bloque: SE.06 | N2 anterior: SE.06.05 (filas 40-41) | N2 siguiente: SE.06.06 (fila 43)
  fila 67: {'E': 'S', 'F': 'A DEMANDA', 'G': 'Normal', 'H': 'Front End'} | otros valores en A:L: ninguno | N1 del bloque: SE.09 | N2 anterior: SE.09.01 (filas 63-66) | N2 siguiente: SE.09.02 (fila 68)
  Total: 2

== 6. CONSISTENCIA E:H DENTRO DE CADA BLOQUE N2 COMBINADO ==
  Bloques combinados revisados: 18 | con conflicto: 0
  Valores en I:L en filas de continuación: ninguno
  Filas con K o L: {5: (1.0, 100.0), 25: (12.0, 24.0)}
  Filas con I: {5: 'Revele su rollo '}

== 7. LISTAS DE OPCIONES ==
  Filas 102-110 con datos: ninguna
  E111='OPCIONES' | E4='ACTIVO': ['S', 'N']
  F111='OPCIONES' | F4='CLASE DE SERVICIO': ['A DEMANDA', 'RECURRENTE']
  G111='OPCIONES' | G4='CRITICIDAD': ['Very Low', 'Low', 'Normal', 'High', 'Very High']
  H111='OPCIONES' | H4='TIPO DE SERVICIO': ['Back End', 'Demostration', 'End User Service', 'Front End', 'IT Management', 'IT Operational', 'Other', 'Project', 'Reporting', 'Training', 'Underpinning Contract']
  Datos después de la fila 122 : ninguno
  Validaciones de datos: [('F5:F98', '$F$112:$F$113'), ('G5:G98', '$G$112:$G$116'), ('E5:E98', '$E$112:$E$113'), ('H5:H98', '$H$112:$H$122')]
  E: usados ['N', 'S'] | fuera de lista: []
  F: usados ['A DEMANDA', 'RECURRENTE'] | fuera de lista: []
  G: usados ['High', 'Normal'] | fuera de lista: []
  H: usados ['Back End', 'End User Service', 'Front End', 'IT Management', 'IT Operational', 'Project'] | fuera de lista: []

== 8. ESPACIOS SOBRANTES EN TEXTOS (toda la hoja) ==
  Celdas de texto revisadas: 576
  Con espacios al inicio o al final: 1
    I5: 'Revele su rollo ' (final)
  Con espacios dobles internos: 0

SHA-256 después:  de3b478a5faeeeaebce1aa7726e0e3321188a68e41bbb656e1d17b0c5b74dcf0 | sin cambios: True

== RESULTADO DE CONTROLES ==
  OK: 12 códigos N1 distintos, 46 códigos N2 distintos, hash sin cambios
```
