# Backend

Backend Python con FastAPI. Desde `backend/`, instalar dependencias con
`pip install -r requirements.txt` y ejecutar la API con:

```bash
uvicorn api.api:app --reload
```

## Datos y esquema

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
Descomprime los ZIP y solicita formato **CSV**; no se leen ZIP ni shapefiles.
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
en cada consulta. Una ruta inexistente o la ausencia de CSV reconocibles genera
HTTP 503 con una explicación, en vez de una lista vacía silenciosa.

Las consultas se ordenan cronológicamente y usan paginación (`limit`, máximo
5000, y `offset`). La API convierte cada CSV a una caché Parquet local una sola
vez y usa DuckDB para consultar fechas y páginas. La caché se guarda en
`backend/.cache/firms/` (configurable con `FIRMS_CACHE_DIR`) y se regenera para
cada archivo cuando cambia su tamaño o fecha de modificación. Agregar o quitar
CSV también actualiza las entradas consultadas. Los CSV originales no se alteran.

La primera visita inicia la preparación en segundo plano. El frontend consulta
`GET /api/v1/data/status` cada dos segundos y muestra archivos completados,
porcentaje y archivo actual. El endpoint de observaciones responde HTTP 202
mientras se prepara la caché, y una lista cuando está lista. Los errores de
preparación se muestran en pantalla. Las peticiones tienen un tiempo máximo de
30 segundos y la espera de preparación de diez minutos, con opción de reintentar.
La preparación del servidor continúa aunque se cierre la página.

Se puede preparar la caché antes de abrir la interfaz, desde `backend/`:

```bash
python -m app.catalog
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
El índice espacial se prepara por bloques en segundo plano y se conserva en
`backend/.cache/firms/map/`, invalidándose al cambiar los CSV o la geografía.
Durante esa primera preparación, el endpoint devuelve HTTP 202 con progreso.
Las consultas anteriores se cancelan al cambiar la vista o los filtros.

La serie temporal consulta
`GET /api/v1/time-series`, que cuenta **todas** las observaciones del período por
día UTC y continente, sin paginación ni muestreo. Admite `start_date`, `end_date`
y parámetros `continent` repetidos para seleccionar varias regiones.

La primera consulta de la serie prepara resúmenes diarios persistentes en
`backend/.cache/firms/daily/`. El cálculo clasifica los puntos por bloques con
los mismos polígonos del mapa y devuelve HTTP 202 con progreso mientras trabaja;
la interfaz espera a tener los totales completos. Los resúmenes se reutilizan y
se invalidan cuando cambia el CSV o el archivo de geografía. También se pueden
preparar con `python -m app.time_series`.

Los días sin registros en ningún archivo se muestran como huecos. Un cero por
región se muestra solamente en días con registros en el conjunto consultado.
El resumen incluye fechas disponibles y detecciones sin región identificada.
Los filtros de últimos 7/30/90 días usan la fecha actual; para archivos
históricos, usa Personalizado.

## Armonización de pares

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

## Geografía y rutas

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

## Pruebas

Desde `backend/`:

```bash
pip install -r requirements-dev.txt
python -m unittest discover -s tests -v
```
