[English](#english) | [Español](#español)

# Backend

## English

Python backend with FastAPI. From `backend/`, install dependencies with
`pip install -r requirements.txt` and run the API with:

```bash
uvicorn api.api:app --reload
```

Before accepting requests, the API checks the four FIRMS requests in
`app/downloads.py`, downloads and extracts any missing ones into `app/data/`,
and prepares the Parquet catalog, map index, and daily totals. The root
`npm run dev` command first runs `python -m app.prepare` and only starts the API
and Vite once all those stages finish successfully. Download or preparation
errors prevent the frontend from starting; run the command again after fixing
the problem. The first startup can take several minutes; progress by stage,
file, and percentage appears in the console. Later startups reuse caches that
are still valid.

**FIRMS warning:** the files were generated on **2026-11-14**; links expire after
**45 days, on 2026-12-29**. The **latest historical record date is 2025-11-16**.
Warnings are logged at the start and end of preparation, including failures,
and when the API shuts down. ZIP files were chosen because the API's limit on
days per query would have required too many requests. The links are in the
[main README](../README.md#automatic-firms-data-downloads).
After expiration, complete local data remains usable; to replace missing data,
request new CSV packages and update `app/downloads.py`, or restore the original
files locally.

Downloaded CSV files are ignored by Git and do not require Git LFS. Validation
checks the `archive` and `nrt` CSV files and `Readme.txt` for each request; it
accepts headers without records and replaces LFS pointers. Downloads are
streamed in chunks, and each ZIP is validated and temporarily extracted before
its files are installed. About 4.7 GB is needed for the CSV files, plus extra
space for the package being processed. Complete datasets are reused without
network access.

### Console language

Python commands detect the system language and support English and Spanish,
with English as the fallback. Locale environment variables are respected;
`NSAC_LANGUAGE=en` or `NSAC_LANGUAGE=es` overrides detection. Messages, CLI help,
and table headings displayed in the terminal are translated. CSV schemas,
file names, and command-line option names remain unchanged.

### Data and schema

The API and harmonization script discover CSV files recursively in `app/data/`.
You can copy individual files or extracted download folders from
[NASA FIRMS](https://firms.modaps.eosdis.nasa.gov/download/Readme.txt) there,
without changing the code or renaming files:

```text
app/data/
  DL_FIRE_M-C61_848778/
    fire_archive_M-C61_848778.csv
    fire_nrt_M-C61_848778.csv
    Readme.txt
  DL_FIRE_J1V-C2_848779/
    fire_archive_J1V-C2_848779.csv
    fire_nrt_J1V-C2_848779.csv
  DL_FIRE_J2V-C2_848780/...
  DL_FIRE_SV-C2_848781/...
```

MODIS C6.1 (Terra/Aqua) and VIIRS C2 (NOAA-20, NOAA-21, and S-NPP) are supported.
CSV files are also recognized by their `instrument`/`satellite` columns, so old
names and renamed files continue to work. Empty files with a FIRMS header are
valid and contribute zero detections. Readme files, auxiliary files, and
analysis output are skipped. For additional data, extract ZIP files and request
**CSV** format; queries do not read ZIP files or shapefiles. The four configured
ZIP files are extracted automatically during startup.
LANDSAT is outside the scope of MODIS–VIIRS harmonization.

Each product's `archive` and `nrt` files are combined. The fields `source`,
`satellite`, `product`, `version`, `data_kind`, and `file_name` are preserved,
along with WGS84 coordinates, UTC date/time, brightness, confidence, FRP,
day/night, and continent. Identifiers combine the path and row number and are
the same in the API and CLI. Each file is included only once even when input
paths overlap. Separate downloads containing repeated observations are not
deduplicated by coordinates; select non-overlapping inputs to avoid counting
them twice.

To choose another folder or combine files and folders:

```bash
FIRMS_DATA_DIR=/path/to/data uvicorn api.api:app --reload
# On Linux/macOS, separate multiple inputs with ':' (on Windows, with ';').
FIRMS_PATHS=/path/to/modis.csv:/path/to/viirs_downloads uvicorn api.api:app --reload
```

`FIRMS_PATHS` takes precedence. For compatibility, `MODIS_CSV`, `VIIRS_J1_CSV`,
`VIIRS_J2_CSV`, and `VIIRS_SNPP_CSV` also accept files or folders. If any of these
variables is configured, only the specified paths are used; otherwise,
`FIRMS_DATA_DIR` or `app/data/` is used. Files are rediscovered on each query.
`FIRMS_DATA_DIR` also changes the destination of the four automatic downloads.
`FIRMS_PATHS` and the compatibility variables select explicit inputs: they are
validated at startup and do not download the historical requests. With these
custom inputs, a missing path or the absence of recognizable CSV files prevents
the API from starting. If data is removed after startup, queries return HTTP 503
with an explanation instead of silently returning an empty list.

Queries are sorted chronologically and use pagination (`limit`, up to 5000,
and `offset`). The API converts each CSV file to a local Parquet cache once and
uses DuckDB to query dates and pages. The cache is stored in
`backend/.cache/firms/` (configurable with `FIRMS_CACHE_DIR`) and regenerated for
each file when its size or modification time changes. Adding or removing CSV
files also updates the queried inputs. Original CSV files are not modified.

Initial preparation finishes during startup, before opening the frontend or
accepting API requests. The catalog, map, and daily totals are already prepared
on the first visit. If CSV files are added or modified while the server is
running, preparation continues in the background: endpoints return HTTP 202
with completed files, percentage, and the current file until the cache is
ready. The frontend retries every two seconds and displays preparation errors.
Requests have a 30-second timeout, and the web interface waits up to ten minutes
for preparation; these limits do not apply to preparation before Vite starts.

To download and prepare all caches without starting servers, run from `backend/`:

```bash
python -m app.prepare
```

The world map queries `GET /api/v1/map` with the visible area's bounds (`west`,
`south`, `east`, `north`) and `zoom` level. Each query considers **all**
observations in the period and groups them into spatial cells: the global view
shows a small number of groups, and zooming in subdivides the cells to reveal
more hotspots automatically. Panning also updates the map, without manual
pagination. Viewports crossing the antimeridian are expressed with `west > east`.

Each group reports the full count, MODIS/VIIRS counts, detection interval, and
maximum FRP. Visible-area counts are independent of the period total. Inclusive
dates and repeated `continent` parameters are supported; without a continent
filter, ocean points and points without a region are included. The spatial
index is prepared in chunks during startup and stored in
`backend/.cache/firms/map/`; it is invalidated when CSV files or geography change.
If invalidated while the API is running, the endpoint returns HTTP 202 with
progress. Previous requests are canceled when the view or filters change.

The time series queries `GET /api/v1/time-series`, which counts **all**
observations in the period by UTC day and continent, without pagination or
sampling. It accepts `start_date`, `end_date`, and repeated `continent`
parameters to select multiple regions.

Persistent daily summaries are prepared during startup in
`backend/.cache/firms/daily/`. The calculation classifies points in chunks using
the same polygons as the map. Summaries are reused and invalidated when the CSV
or geography file changes. If recalculation is needed while the API is running,
it returns HTTP 202 with progress, and the interface waits for complete totals.
They can also be prepared with `python -m app.time_series`.

Days without records in any file appear as gaps. A zero for a region is shown
only on days with records in the queried dataset. The summary includes
available dates and detections without an identified region. The last 7/30/90
days filters use the current date; use Custom for historical files.

### Pair harmonization

From `backend/`, run:

```bash
python -m app.data.ArmMV_FRP_por_par --horas 24 --superposicion 20
# One or more folders and/or files:
python -m app.data.ArmMV_FRP_por_par \
  --entrada app/data/DL_FIRE_M-C61_848778 app/data/DL_FIRE_SV-C2_848781 \
  --desde 2025-11-16 --hasta 2025-11-16 \
  --salida app/data/resultados_armonizacion
```

Without `--entrada`/`--carpeta`, it uses the same input configuration as the API.
`--carpeta` remains available and searches recursively. Valid observations from
MODIS and at least one VIIRS platform are required; not all satellites are
needed. `--desde` and `--hasta` are inclusive and filter in chunks before the
spatial index is built. The analysis keeps the selected period in memory:
process bounded periods for global downloads spanning several GB.

The default output is `app/data/resultados_armonizacion/` (or the
`resultados_armonizacion` subfolder of `--carpeta`). The API reads pairs from
`FIRMS_DATA_DIR/resultados_armonizacion/`, or
`app/data/resultados_armonizacion/` if that variable is unset.
`GET /api/v1/harmonization/pairs` returns an empty list until the script is run
and its output is saved there.

The script approximates footprints with rectangles aligned to local axes.
A spatial and temporal match does not by itself prove that observations refer
to the same fire, and FRP values from different sensors are not calibrated
against each other.

### Geography and routes

Continent classification uses Natural Earth 1:110m Admin 0 polygons bundled in
`app/resources/`. Classification works without network access. Use
`NATURAL_EARTH_GEOJSON` to specify another local GeoJSON file.

- `GET /api/v1/health`
- `GET /api/v1/data/status`
- `GET /api/v1/observations`
- `GET /api/v1/map`
- `GET /api/v1/time-series`
- `GET /api/v1/harmonization/pairs`
- `GET /api/v1/continents`
- Interactive documentation: `/docs`

### Tests

From `backend/`:

```bash
pip install -r requirements-dev.txt
python -m unittest discover -s tests -v
```

---

## Español

Backend Python con FastAPI. Desde `backend/`, instalar dependencias con
`pip install -r requirements.txt` y ejecutar la API con:

```bash
uvicorn api.api:app --reload
```

Antes de aceptar peticiones, la API comprueba los cuatro pedidos FIRMS de
`app/downloads.py`, descarga y descomprime los que falten en `app/data/`, y
prepara el catálogo Parquet, el índice del mapa y los totales diarios. El comando
raíz `npm run dev` ejecuta primero `python -m app.prepare` y sólo inicia la API y
Vite cuando todas esas etapas terminan correctamente. Los errores de descarga o
preparación impiden iniciar el frontend; vuelve a ejecutar el comando después de
corregir el problema. El primer arranque puede tardar varios minutos; el progreso
por etapa, archivo y porcentaje se muestra en consola. Los siguientes arranques
reutilizan las cachés que sigan vigentes.

**Advertencia FIRMS:** los archivos fueron generados el **2026-11-14**; los enlaces
expiran a los **45 días, el 2026-12-29**. La **fecha máxima histórica de los
registros es 2025-11-16**. Se advierte en los logs al inicio y al final de la
preparación, incluso ante fallos, y al apagar la API. Se eligieron ZIP porque el
límite de días por consulta de la API habría requerido demasiadas solicitudes.
Los enlaces están en el [README principal](../README.md#descarga-automática-de-datos-firms).
Si vencen, los datos locales completos siguen siendo utilizables; para reponer
datos faltantes hay que solicitar nuevos pedidos CSV y actualizar
`app/downloads.py`, o restaurar los archivos originales localmente.

Los CSV descargados se ignoran en Git y no requieren Git LFS. La validación
comprueba los CSV `archive` y `nrt` de cada uno de estos pedidos y su `Readme.txt`;
acepta encabezados sin registros y reemplaza punteros LFS. La descarga se hace
por bloques y el ZIP se valida y extrae temporalmente antes de instalar los
archivos. Se necesitan unos 4,7 GB para los CSV y espacio adicional para el
paquete en curso. Los conjuntos completos se reutilizan sin red.

### Idioma de consola

Los comandos Python detectan el idioma del sistema y admiten inglés y español,
con inglés como alternativa para otros idiomas. Se respetan las variables de
idioma del entorno; `NSAC_LANGUAGE=en` o `NSAC_LANGUAGE=es` permite elegirlo
explícitamente. Se traducen los mensajes, la ayuda de comandos y los encabezados
de tablas mostradas en la terminal. Se conservan los esquemas CSV, los nombres
de archivos y los nombres de opciones de los comandos.

### Datos y esquema

La API y el script de armonización descubren CSV recursivamente en `app/data/`.
Se pueden copiar allí archivos sueltos o carpetas descomprimidas de descargas
[NASA FIRMS](https://firms.modaps.eosdis.nasa.gov/download/Readme.txt), sin
cambiar el código ni renombrar los archivos:

```text
app/data/
  DL_FIRE_M-C61_848778/
    fire_archive_M-C61_848778.csv
    fire_nrt_M-C61_848778.csv
    Readme.txt
  DL_FIRE_J1V-C2_848779/
    fire_archive_J1V-C2_848779.csv
    fire_nrt_J1V-C2_848779.csv
  DL_FIRE_J2V-C2_848780/...
  DL_FIRE_SV-C2_848781/...
```

Se admiten MODIS C6.1 (Terra/Aqua) y VIIRS C2 (NOAA-20, NOAA-21 y S-NPP).
Los CSV también se reconocen por sus columnas `instrument`/`satellite`, de modo
que los nombres antiguos y los archivos renombrados siguen funcionando. Los
archivos vacíos con encabezado de FIRMS son válidos y aportan cero detecciones.
Se omiten Readme, archivos auxiliares y resultados generados por el análisis.
Para datos adicionales, descomprime los ZIP y solicita formato **CSV**; las
consultas no leen ZIP ni shapefiles. Los cuatro ZIP configurados se descomprimen
automáticamente durante el arranque.
LANDSAT queda fuera de la armonización MODIS–VIIRS.

Los archivos `archive` y `nrt` de cada producto se combinan. Se conservan
`source`, `satellite`, `product`, `version`, `data_kind` y `file_name`, además de
coordenadas WGS84, fecha/hora UTC, brillo, confianza, FRP, día/noche y continente.
Los identificadores combinan ruta y número de fila y son iguales en API y CLI.
Cada archivo se incorpora una sola vez aunque se indiquen rutas superpuestas.
Descargas distintas con observaciones repetidas no se deduplican por coordenadas;
para evitar contarlas dos veces, selecciona entradas que no se solapen.

Para elegir otra carpeta o mezclar archivos y carpetas:

```bash
FIRMS_DATA_DIR=/ruta/datos uvicorn api.api:app --reload
# En Linux/macOS, separar varias entradas con ':' (en Windows, con ';').
FIRMS_PATHS=/ruta/modis.csv:/ruta/descargas_viirs uvicorn api.api:app --reload
```

`FIRMS_PATHS` tiene prioridad. Por compatibilidad se admiten también `MODIS_CSV`,
`VIIRS_J1_CSV`, `VIIRS_J2_CSV` y `VIIRS_SNPP_CSV`, con archivos o carpetas. Si se
configura alguna de estas variables, se utilizan solamente las rutas indicadas;
si no, se usa `FIRMS_DATA_DIR` o `app/data/`. Los archivos se descubren de nuevo
en cada consulta. `FIRMS_DATA_DIR` también cambia el destino de las cuatro
descargas automáticas. `FIRMS_PATHS` y las variables de compatibilidad seleccionan
entradas explícitas: se validan al arrancar y no descargan los pedidos históricos.
Con estas entradas personalizadas, una ruta inexistente o la ausencia de CSV
reconocibles impide arrancar la API. Si se quitan datos después del arranque,
las consultas responden
HTTP 503 con una explicación, en vez de una lista vacía silenciosa.

Las consultas se ordenan cronológicamente y usan paginación (`limit`, máximo
5000, y `offset`). La API convierte cada CSV a una caché Parquet local una sola
vez y usa DuckDB para consultar fechas y páginas. La caché se guarda en
`backend/.cache/firms/` (configurable con `FIRMS_CACHE_DIR`) y se regenera para
cada archivo cuando cambia su tamaño o fecha de modificación. Agregar o quitar
CSV también actualiza las entradas consultadas. Los CSV originales no se alteran.

La preparación inicial se completa durante el arranque, antes de abrir el
frontend o aceptar peticiones en la API. La primera visita ya encuentra el
catálogo, el mapa y los totales diarios preparados. Si se agregan o modifican
CSV con el servidor en marcha, se mantiene la preparación en segundo plano:
los endpoints devuelven HTTP 202 con archivos completados, porcentaje y archivo
actual hasta que la caché esté lista. El frontend reintenta cada dos segundos y
muestra los errores de preparación. Las peticiones tienen un tiempo máximo de
30 segundos y la espera de preparación en la web de diez minutos; esos límites
no se aplican a la preparación previa al inicio de Vite.

Para descargar y preparar todas las cachés sin iniciar servidores, desde `backend/`:

```bash
python -m app.prepare
```

El planisferio consulta `GET /api/v1/map` con los límites del área visible
(`west`, `south`, `east`, `north`) y el nivel de `zoom`. Cada consulta considera
**todas** las observaciones del período y las agrupa en celdas espaciales:
la vista global muestra pocos grupos y, al acercar el mapa, las celdas se
subdividen para desplegar más focos automáticamente. También se actualiza al
desplazar el mapa, sin paginación manual. Las ventanas que cruzan el
antimeridiano se expresan con `west > east`.

Cada grupo informa el conteo completo, las cantidades MODIS/VIIRS, el intervalo
de detección y la FRP máxima. Los conteos del área visible son independientes del
total del período. Se admiten fechas inclusivas y parámetros `continent`
repetidos; sin filtro continental se incluyen puntos oceánicos y sin región.
El índice espacial se prepara por bloques durante el arranque y se conserva en
`backend/.cache/firms/map/`, invalidándose al cambiar los CSV o la geografía.
Si se invalida con la API en marcha, el endpoint devuelve HTTP 202 con progreso.
Las consultas anteriores se cancelan al cambiar la vista o los filtros.

La serie temporal consulta
`GET /api/v1/time-series`, que cuenta **todas** las observaciones del período por
día UTC y continente, sin paginación ni muestreo. Admite `start_date`, `end_date`
y parámetros `continent` repetidos para seleccionar varias regiones.

Durante el arranque se preparan resúmenes diarios persistentes en
`backend/.cache/firms/daily/`. El cálculo clasifica los puntos por bloques con
los mismos polígonos del mapa. Los resúmenes se reutilizan y se invalidan cuando
cambia el CSV o el archivo de geografía. Si hay que recalcularlos con la API en
marcha, se devuelve HTTP 202 con progreso y la interfaz espera a tener los
totales completos. También se pueden preparar con `python -m app.time_series`.

Los días sin registros en ningún archivo se muestran como huecos. Un cero por
región se muestra solamente en días con registros en el conjunto consultado.
El resumen incluye fechas disponibles y detecciones sin región identificada.
Los filtros de últimos 7/30/90 días usan la fecha actual; para archivos
históricos, usa Personalizado.

### Armonización de pares

Desde `backend/`, ejecutar:

```bash
python -m app.data.ArmMV_FRP_por_par --horas 24 --superposicion 20
# Una o varias carpetas y/o archivos:
python -m app.data.ArmMV_FRP_por_par \
  --entrada app/data/DL_FIRE_M-C61_848778 app/data/DL_FIRE_SV-C2_848781 \
  --desde 2025-11-16 --hasta 2025-11-16 \
  --salida app/data/resultados_armonizacion
```

Sin `--entrada`/`--carpeta`, usa la misma configuración de entradas que la API.
`--carpeta` sigue disponible y busca recursivamente. Se necesitan observaciones
válidas de MODIS y al menos una plataforma VIIRS; no se requieren todos los
satélites. `--desde` y `--hasta` son inclusivos y filtran en bloques antes de
construir el índice espacial. El análisis mantiene el período seleccionado en
memoria: para descargas globales de varios GB, procesa períodos acotados.

La salida predeterminada es `app/data/resultados_armonizacion/` (o la subcarpeta
`resultados_armonizacion` de `--carpeta`). La API lee los pares de
`FIRMS_DATA_DIR/resultados_armonizacion/`, o `app/data/resultados_armonizacion/`
si esa variable no está definida. `GET /api/v1/harmonization/pairs` devuelve
una lista vacía hasta que se ejecute el script y se guarde allí su salida.

El script aproxima las huellas con rectángulos alineados a los ejes locales.
Una coincidencia espacio-temporal no demuestra por sí sola que sea el mismo
incendio y los valores FRP de distintos sensores no están calibrados entre sí.

### Geografía y rutas

La clasificación continental usa los polígonos Admin 0 de Natural Earth
1:110m incluidos en `app/resources/`. La clasificación funciona sin red.
Se puede indicar otro GeoJSON local con `NATURAL_EARTH_GEOJSON`.

- `GET /api/v1/health`
- `GET /api/v1/data/status`
- `GET /api/v1/observations`
- `GET /api/v1/map`
- `GET /api/v1/time-series`
- `GET /api/v1/harmonization/pairs`
- `GET /api/v1/continents`
- Documentación interactiva: `/docs`

### Pruebas

Desde `backend/`:

```bash
pip install -r requirements-dev.txt
python -m unittest discover -s tests -v
```
