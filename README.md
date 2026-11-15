# NSAC AMV

## Desarrollo local

Requisitos: Node.js, Python 3.10 o posterior y las dependencias del backend.

```bash
cd frontend && npm install
cd ../backend && python -m pip install -r requirements.txt
cd .. && npm run dev
```

El comando raíz comprueba y descarga los datos FIRMS, convierte los CSV a Parquet,
prepara el índice del mapa y calcula los totales diarios antes de iniciar FastAPI
en `http://127.0.0.1:8000` y Vite en `http://localhost:5173`. **El frontend sólo se
inicia cuando los cuatro conjuntos y todas sus cachés están listos**; si una
descarga o preparación falla, el comando termina con error y no inicia los
servidores. La consola muestra el avance de cada etapa por archivo y porcentaje.
Cuando la API termina de arrancar, se inicia Vite y muestra el enlace al frontend
con el puerto disponible, sin borrar los mensajes anteriores. Los avisos
`WARNING` aparecen en amarillo al ejecutar la preparación en una terminal.
Esta preparación puede tardar varios minutos en el primer arranque; las cachés
se guardan en disco y se reutilizan mientras los datos no cambien. Vite reenvía las
solicitudes `/api` al backend. Para
detener ambos procesos, pulsa `Ctrl+C`. Si se usa otro intérprete de Python,
se puede indicar con `PYTHON=/ruta/a/python npm run dev`.

La API documenta sus rutas en `http://127.0.0.1:8000/docs`. El frontend
consulta observaciones y continentes directamente; el mapa y la serie temporal
se actualizan al aplicar filtros.

## Idioma del frontend

La interfaz está disponible en inglés y español. Al iniciar utiliza el primer
idioma compatible de las preferencias del sistema/navegador; si ninguno es
compatible, utiliza inglés. El botón **EN / ES** del encabezado cambia el idioma
sin perder los filtros y guarda la elección para las próximas visitas en ese
navegador. Los textos, las fechas y los números se adaptan al idioma seleccionado.

## Descarga automática de datos FIRMS

Los CSV de `backend/app/data/` se descargan directamente de NASA FIRMS y quedan
ignorados por Git. No hace falta instalar Git LFS ni ejecutar `git lfs pull`.
Los datos locales completos se reutilizan en cada arranque sin acceder a la red.
El arranque directo de la API con Uvicorn también comprueba los datos y prepara
las cachés antes de aceptar peticiones, para evitar ese trabajo en la primera
visita a la web.

Los cuatro pedidos configurados son:

- [MODIS C6.1 — 848778](https://firms.modaps.eosdis.nasa.gov/data/download/DL_FIRE_M-C61_848778.zip)
- [VIIRS NOAA-21 — 848780](https://firms.modaps.eosdis.nasa.gov/data/download/DL_FIRE_J2V-C2_848780.zip)
- [VIIRS S-NPP — 848781](https://firms.modaps.eosdis.nasa.gov/data/download/DL_FIRE_SV-C2_848781.zip)
- [VIIRS NOAA-20 — 848779](https://firms.modaps.eosdis.nasa.gov/data/download/DL_FIRE_J1V-C2_848779.zip)

**Advertencia:** estos archivos fueron generados por el servidor de FIRMS el
**2026-11-14**. Los enlaces expiran **45 días después, el 2026-12-29**. La **fecha
máxima histórica de los registros es 2025-11-16**. Esta advertencia aparece en los
logs al inicio y al final de la preparación (también si falla), y al apagar el
servidor. Se eligieron descargas ZIP porque la API limita demasiado el rango de
días por consulta y habría exigido una cantidad excesiva de solicitudes.

Se conserva la estructura y los encabezados descritos en el
[README oficial de FIRMS](https://firms.modaps.eosdis.nasa.gov/download/Readme.txt).
Cada uno de estos cuatro pedidos contiene CSV `fire_archive_...` y
`fire_nrt_...`, más `Readme.txt`, en una carpeta `DL_FIRE_...`. Ambos CSV se
comprueban; un archivo con sólo encabezado es válido, pero un puntero de Git LFS
no lo es. Los ZIP se descargan y extraen en un directorio temporal y sólo se
instalan después de validar su contenido; se eliminan los temporales al terminar.
La primera descarga requiere conexión y espacio para unos 4,7 GB de CSV, además
del ZIP y la extracción temporal del pedido en curso.

Después del vencimiento, los datos locales completos siguen funcionando. Si
faltan archivos, solicita nuevos paquetes **CSV** en FIRMS y actualiza los pedidos
de `backend/app/downloads.py`, o repón los archivos del pedido original localmente.
Consulta [la documentación del backend](backend/README.md) para usar otras rutas
de datos y preparar las cachés de consulta.

## Borrar datos locales

Con los servidores detenidos, desde la raíz del proyecto:

```bash
npm run data:clean -- --dry-run  # Ver qué archivos se borrarían
npm run data:clean             # Borrar los archivos
```

El script independiente `scripts/clean-data.mjs` elimina los archivos **CSV y ZIP**
de `backend/app/data/` y sus subcarpetas, incluidos resultados CSV de análisis.
Conserva el código Python, los `Readme.txt` y las carpetas, y no sigue enlaces
simbólicos ni junctions. También se puede ejecutar con
`node scripts/clean-data.mjs`. Siempre actúa sobre `backend/app/data/` del proyecto;
no utiliza las rutas externas configuradas con variables de entorno.

Al volver a ejecutar `npm run dev`, se descargarán nuevamente los cuatro conjuntos
FIRMS. Si los enlaces ya vencieron, será necesario actualizar los pedidos primero.

## Pruebas

```bash
npm test
cd backend
python -m pip install -r requirements-dev.txt
python -m unittest discover -s tests -v
```
