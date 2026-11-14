# NSAC AMV

## Desarrollo local

Requisitos: Node.js, Python 3.10 o posterior y las dependencias del backend.

```bash
cd frontend && npm install
cd ../backend && python -m pip install -r requirements.txt
cd .. && npm run dev
```

El comando raíz inicia FastAPI en `http://127.0.0.1:8000` y Vite en
`http://localhost:5173`. Vite reenvía las solicitudes `/api` al backend. Para
detener ambos procesos, pulsa `Ctrl+C`. Si se usa otro intérprete de Python,
se puede indicar con `PYTHON=/ruta/a/python npm run dev`.

La API documenta sus rutas en `http://127.0.0.1:8000/docs`. El frontend
consulta observaciones y continentes directamente; el mapa y la serie temporal
se actualizan al aplicar filtros.
