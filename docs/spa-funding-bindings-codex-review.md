# Revisión independiente de bindings SPA

Snapshot revisado: `feature/spa-funding-bindings`, `d282872` (incluye `1906925`).
Revisión sin cambios de motor, cliente SPA, flags, main ni despliegues.

## Resultado

**No habilitar todavía.** Se repitieron las 106 pruebas entregadas y pasaron.
Además se reprodujeron dos problemas que esas pruebas no cubren. Los
reproductores documentan el comportamiento defectuoso; sus dos resultados verdes
NO significan que los problemas estén corregidos.

### R3 — P1: recuperación SOAP no interpreta FECompConsultar ResultGet

Ubicación: `server/billing/wsfevClient.ts:173` y `:118`, consumido por
`server/billing/funding/operational/arcaTransport.ts:36`.

La consulta reutiliza el parser de FECAESolicitar: busca CAE / CAEFchVto.
El resultado de consulta usa ResultGet / CodAutorizacion / FchVto (con
EmisionTipo=CAE). El fixture de las pruebas existentes usa CAE / CAEFchVto,
por lo que no revela la diferencia.

Reproducción: respuesta SOAP local HTTP 200 con ResultGet, Resultado=A,
CodAutorizacion de 14 dígitos, FchVto y todos los datos económicos/de receptor
esperados. `feCompConsultar` lanza “ARCA no devolvió un estado verificable”.
No se contactó ARCA ni se usaron certificados para esta prueba.

Impacto: después de una autorización remota y caída local, el gateway captura
la excepción y conserva outcome=unknown. Retiene los fondos (correcto para
seguridad), pero no puede completar la recuperación con esta respuesta.
El problema del parser es anterior a estos bindings; el binding nuevo depende de él.

Corrección requerida:

- Parsear por separado el resultado de consulta y de autorización, respetando
  namespaces/estructura, EmisionTipo y la identidad consultada.
- Verificar importe, receptor, moneda y fecha sobre el ResultGet correspondiente.
- No inventar vencimiento cuando falta: el parser compartido hoy usa fecha actual
  + 10 días como fallback. En recuperación fiscal debe exigirse evidencia válida.
- Agregar fixtures fieles de consulta autorizada, inexistente, desconocida,
  datos discrepantes y campos faltantes. Luego repetir recuperación post-CAE.

### R4 — P1: agotamiento del pool por conexión retenida para la serie fiscal

Ubicación: `server/billing/invoiceService.ts:342–355`, con nuevo préstamo interno
por `getNextInvoiceNumberFromAfip` -> `db.execute` en `:287`.

El wrapper retiene una conexión del pool para pg_advisory_lock mientras
`emitirFacturaUnlocked` usa el mismo pool a través de db/WSAA/insert de borrador.
Con emisores concurrentes pueden ocuparse todas las conexiones externas y quedar
pendientes las consultas necesarias para terminar y liberar esos préstamos.
También los callers que esperan la misma serie consumen conexiones.

Reproducción determinista: pool PostgreSQL real de máximo 2 conexiones, dos
llamadas reales a emitirFactura en series distintas, transporte/WSAA sintéticos.
Una barrera lleva ambas al db.execute interno con los préstamos externos
retenidos. Al menos una falla con “timeout exceeded when trying to connect”.
No se emiten comprobantes ni se crean facturas en el reproductor.
El pool de la aplicación está configurado con max=10 y timeout de 10 segundos:
la reproducción usa 2 y 250 ms para demostrar la misma dependencia sin saturarlo.

El wrapper se ejecuta para facturas fiscales aunque el montaje funding permanezca
desactivado. Por eso no alcanza con mantener false el flag del nuevo módulo para
excluir esta regresión si se incorporase esa implementación.

Corrección requerida:

- Rediseñar la coordinación de serie para que no dependa de pedir otra conexión
  al mismo pool saturado mientras conserva todos sus préstamos externos.
- Conservar exclusión entre emisores legacy/funding y recuperación del número
  ya reclamado. No eliminar simplemente el bloqueo ni aumentar max como arreglo.
- Probar capacidad concurrente acotada, misma serie y series distintas, además
  del circuito legacy con el montaje nuevo desactivado.

## Evidencia ejecutada por Codex

Base local `folio_funding_synthetic`, socket Unix, sin DATABASE_URL operativo:

- Motor node:test: 28/28.
- Rutas/fence SPA + adaptador cliente HTTP/PG + bindings: 18/18.
- Regresión permisos/borrador/consulta fiscal: 38/38.
- Cliente SPA: 22/22.
- Reproductores independientes nuevos: 2/2, confirman R3 y R4 presentes.

Repetir los reproductores:

```sh
npx vitest run --config vitest.funding-review.config.ts
```

Archivo `server/tests/funding-bindings-review.isolated.pg.test.ts`.
La suite utiliza sólo la base sintética por socket; todas las respuestas externas
están sustituidas. No es una prueba de homologación fiscal.

## Contrato y habilitación

Las extensiones prepare-document y collection-shifts siguen bloqueadas. No se
modificaron DTO ni el cliente para consumirlas durante esta revisión. Su forma
aditiva es compatible con el cliente preparado, pero no se aprueba habilitarlas
hasta corregir R3/R4 y validar la integración completa.

Continúan pendientes: homologación WSAA/WSFE autorizada, reglas fiscales del
catálogo, revisión de todos los escritores, integración de UI y evidencia
histórica compleja. El importador actual rechaza esos casos explícitamente;
no se considera un defecto que no los importe silenciosamente.
