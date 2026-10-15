# Verificación independiente de a12f366

Rama revisada: `feature/spa-funding-bindings`, SHA `a12f3666`.
Revisión aislada, sin modificar el motor/cliente ni habilitar sus gates.

## R3 y R4: correcciones verificadas

- El parser distingue autorización de consulta; interpreta ResultGet / CodAutorizacion /
  FchVto, namespaces y coincidencia fiscal. Rechaza evidencia faltante, contradictoria,
  duplicada o de otro comprobante. Ya no inventa vencimientos.
- La emisión legacy usa el PoolClient del lock para sus escrituras y WSAA. La contención
  de una serie falla con 409. Las regresiones con pool max=2 completan emisiones en
  series distintas, conservan borradores tras fallo y liberan los locks.
- Funding utiliza el mismo cliente para lastNumber y el lock no bloqueante de serie.
- Se repitieron las 152 pruebas entregadas: 47 motor/rutas/HTTP/bindings, 4 revisión
  concurrente, 79 permisos/borradores/SOAP y 22 cliente. Todas pasaron.
- TypeScript completo, tsconfig.funding.json y build de la aplicación: correctos.

**Los hallazgos R3/R4 anteriores quedan cerrados para este snapshot y los casos probados.**
Esto no acredita homologación ARCA ni una auditoría exhaustiva de cada escritor.

## R5 — P2: rollback de numeración elimina el ticket WSAA recién emitido

Ubicaciones:

- `server/billing/funding/operational/fiscalGateway.ts:64`: consulta número dentro de la
  transacción. En :69 puede rechazar un borrador pendiente después de esa consulta.
- `server/billing/funding/operational/arcaTransport.ts:53–59`: pasa el mismo cliente
  transaccional al caché WSAA.
- `server/billing/wsaaClient.ts:94–99,198`: el ticket nuevo se guarda en esa transacción.

Cuando el caché está vacío o vencido, WSAA emite un ticket y el cliente lo guarda en
billing_config. Si después falla la asignación/preparación del número (por ejemplo,
borrador pendiente o error SQL), el rollback también borra ese ticket del caché.
La emisión externa del ticket no puede deshacerse con PostgreSQL.

En el siguiente intento no hay ticket utilizable en la base: se vuelve a pedir uno.
Si WSAA informa alreadyAuthenticated, el código actual aborta indicando que existe un
TA válido que no puede recuperar (espera hasta expiración). La recuperación fiscal
puede quedar bloqueada, aunque los fondos se conservan y no se emite otra factura.

### Reproducción independiente

`server/tests/funding-wsaa-cache-review.isolated.pg.test.ts` utiliza:

- PostgreSQL local por Unix socket, DB `folio_funding_synthetic`, schema propio temporal.
- Certificado y clave generados exclusivamente para el test, sin credenciales operativas.
- Transporte concreto createArcaTransport + getTokenAuth real. Sólo se sustituyen
  las respuestas HTTP de WSAA/WSFE y el acceso global a db.

Secuencia verificada:

1. BEGIN; lastNumber obtiene un ticket WSAA nuevo y un número sintético.
2. El ticket existe en billing_config dentro de esa transacción.
3. ROLLBACK; el ticket desaparece del caché.
4. El reintento vuelve a autenticar. El WSAA simulado conserva su ticket e informa
   alreadyAuthenticated; la llamada falla en vez de usar el ticket ya emitido.

El test pasa porque **reproduce el defecto**, no porque esté corregido. No contacta
ARCA/WSAA reales; la respuesta alreadyAuthenticated es un escenario modelado acorde
con el manejo que ya existe en el propio cliente, no una observación de producción.

Ejecutar, con la base sintética disponible:

```sh
npx vitest run --config vitest.funding-wsaa-review.config.ts
```

### Corrección requerida

Separar la durabilidad del ticket WSAA de la transacción financiera que puede
revertirse: un ticket externo emitido debe seguir recuperable aunque falle la
numeración o se reinicie el proceso. Conservar las garantías de pool acotado y
exclusión de serie obtenidas en R4. No resolverlo volviendo a pedir conexiones
anidadas al pool saturado, guardándolo sólo en memoria ni descartando el lock.

Agregar regresión de caché vacío/vencido + fallo posterior en numeración + rollback +
reintento con el mismo ticket, sin segundo login. Incluir concurrencia/reinicio y
repetir las pruebas max=2. Implementar la corrección en un commit separado.

## Estado de habilitación

No se activa el módulo: R5 requiere resolución y siguen pendientes homologación
WSAA/WSFE autorizada, reglas fiscales/catálogo, acuerdo de las extensiones de la API,
integración conjunta del cliente y revisión de historia compleja.
No se contactó ARCA, no se modificaron datos operativos, main ni Xenia.
