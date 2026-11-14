# Backend

Backend Python con FastAPI. Desde `backend/`, instalar dependencias con
`pip install -r requirements.txt` y ejecutar la API con:

```bash
uvicorn api.api:app --reload
```

## Datos y esquema

La API lee directamente los CSV incluidos en `app/data/`:

- `MODIS_C6_1_Global_7d.csv`
- `J1_VIIRS_C2_Global_7d.csv`
- `J2_VIIRS_C2_Global_7d.csv`

Las filas MODIS se exponen con `source: MODIS`; J1 y J2 se armonizan bajo
`source: VIIRS`, conservando el identificador de satélite en `satellite`. Los
campos comunes incluyen coordenadas, fecha/hora UTC, brillo, confianza, FRP,
indicador día/noche y continente. Se aceptan rutas alternativas con las
variables `MODIS_CSV`, `VIIRS_J1_CSV` y `VIIRS_J2_CSV`.

Las consultas de observaciones se ordenan cronológicamente y usan paginación
(`limit`, máximo 5000, y `offset`). El servicio lee los archivos de forma
secuencial, por lo que no requiere cargar el conjunto completo en memoria.

## Armonización de pares

Desde `backend/`, ejecutar el script de análisis espacial y temporal:

```bash
python -m app.data.ArmMV_FRP_por_par --horas 24 --superposicion 20
```

Por defecto, lee los tres CSV de `app/data/` y guarda resultados en
`app/data/resultados_armonizacion/`. Se pueden cambiar las rutas con
`--carpeta` y `--salida`. La API expone los pares generados en
`GET /api/v1/harmonization/pairs?limit=1000&offset=0`; responde una lista vacía
hasta que se haya ejecutado el script.

El script aproxima las huellas con rectángulos alineados a los ejes locales.
Una coincidencia espacio-temporal no demuestra por sí sola que sea el mismo
incendio y los valores FRP de distintos sensores no están calibrados entre sí.

## Geografía y rutas

La clasificación continental usa los polígonos Admin 0 de Natural Earth
1:110m. Se puede indicar un GeoJSON local con `NATURAL_EARTH_GEOJSON`; sin esa
variable, el backend lee el dataset remoto al iniciar su primera consulta
geográfica.

- `GET /api/v1/health`
- `GET /api/v1/observations`
- `GET /api/v1/harmonization/pairs`
- `GET /api/v1/continents`
- Documentación interactiva: `/docs`
