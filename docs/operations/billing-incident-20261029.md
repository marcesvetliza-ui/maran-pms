# Diagnóstico acotado de facturación, 29/10/2026

Estado: preparado y probado localmente; no ejecutado en Railway.

Habitaciones 205 y 1005. Las últimas peticiones observadas fallaron en FECompUltimoAutorizado, antes de reservar numeración. No se ha establecido el estado de los intentos anteriores que devolvieron conflicto de unicidad.

## Ejecución propuesta

```sh
node dist/diagnose-billing-incident.mjs --rooms 205,1005 --date 2026-10-29 --expect-project 538cff63-57db-4ec8-bee2-515a86bd9431 --expect-environment fda7f455-8e45-40ab-94d8-8b9a8104ce43
```

La herramienta se incluye en el paquete, pero no se ejecuta con el inicio normal del PMS. Una ejecución temporal de predespliegue requiere cambiar la configuración de Railway y restaurarla después; el valor observado de preDeployCommand era null. No se ha modificado esa configuración.

Lee reservas, facturas y pagos exclusivamente mediante transacciones BEGIN READ ONLY con límites de cinco segundos por consulta y un segundo por bloqueo. No imprime nombres, documentos ni credenciales. Consulta solamente FECompUltimoAutorizado y FECompConsultar en homologación usando el ticket WSAA ya almacenado y vigente. No renueva credenciales, emite facturas, registra cobros, modifica contadores ni elimina borradores. Rechaza proyecto/ambiente incorrectos y no consulta el servicio fiscal de producción.

El resultado no autoriza por sí solo a conciliar: una consulta fiscal positiva confirma existencia del número, no identidad completa del destinatario, importe e intención original. Antes de cualquier recuperación debe verificarse esa identidad y conservarse la operación original del navegador.

Validación: siete pruebas unitarias de límites, rollback ante errores, tickets vencidos/incorrectos, entorno fiscal y ocultamiento de secretos; TypeScript completo y compilación de producción correctos. No se ha probado contra la base operativa ni ARCA real.
