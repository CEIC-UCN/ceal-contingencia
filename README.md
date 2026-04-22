# CEAL Contingencia

Sitio operativo del CEAL de Ingenieria Civil UCN para:

- preguntas frecuentes durante contingencias
- reporte de incidencias academicas y administrativas
- comunicacion unificada para movilizacion, pleno y seguimiento

## Deploy

Pensado para Vercel.

## Formulario de incidencias

El endpoint `POST /api/ceal-incidents` funciona de dos maneras:

- local: guarda en `data/ceal/incidents.local.json`
- produccion: requiere `CEAL_REPORT_WEBHOOK_URL`

Variable opcional:

- `CEAL_REPORT_WEBHOOK_TOKEN`

Si no se configura `CEAL_REPORT_WEBHOOK_URL` en Vercel, el backend bloquea envios en produccion para evitar falsa recepcion de reportes.
