# Verificación independiente de R5 — Codex

Snapshot revisado: `9dfe0b2911bac139ac4410f08f8127b9dc944a78`, rama
`feature/spa-funding-bindings`. Fecha: 15/10/2026.

## Resultado

**R5 queda corregido para el rollback financiero posterior al commit del ticket.**
No se encontraron nuevos bloqueos en el alcance de esta revisión.
R3/R4 mantienen sus regresiones aprobadas. Esto no habilita el módulo operativo.

## Revisión del código

- `FundingStore.transaction` ejecuta la preparación opcional antes del BEGIN
  financiero, en el mismo PoolClient prestado. Los demás callers no cambian su flujo.
- `createArcaTransport.prepareNumbering` abre una transacción de autenticación,
  obtiene el lock no bloqueante de ambiente/emisor y confirma el caché antes de
  devolver la función que consulta numeración con esas credenciales.
- La consulta de número ya no solicita un ticket nuevo dentro del BEGIN financiero.
- El gateway verifica otra vez la preparación fiscal después de autenticar y
  conserva la identidad ya reclamada cuando existe. No prepara otra emisión para
  resolver una operación pendiente.
- El caché estricto de funding no silencia fallos SQL ni una actualización inexistente.
- Se conserva el único finalizador, la exclusión de serie y la propiedad de fondos.
  No se aumentó el pool ni se agregaron préstamos anidados para esta preparación.

## Evidencia ejecutada

PostgreSQL local por socket Unix, DB `folio_funding_synthetic`. Respuestas WSAA/WSFE
simuladas y certificados sintéticos; no se contactó ARCA ni se usaron datos operativos.

| Suite repetida por Codex | Resultado |
|---|---:|
| R5: caché vacío/vencido, rollback, nueva instancia, concurrencia y post-CAE | 4/4 |
| Motor | 28/28 |
| Rutas SPA/fence, cliente HTTP/PG y bindings | 19/19 |
| R4: pool acotado y exclusión fiscal | 4/4 |
| Permisos, borradores, SOAP y reintento WSAA | 82/82 |
| Cliente SPA | 22/22 |
| **Total** | **159/159, sin fallos ni omisiones** |
| TypeScript completo y tsconfig.funding.json | Correctos |
| Build de la aplicación | Correcto |

En R5 se verifica que el primer intento puede fallar realmente por un borrador
pendiente después de consultar numeración, que el ticket sigue visible tras rollback,
que se reconstruyen conexiones/módulos y que los reintentos finalizan con un solo login.
La prueba concurrente conserva los fondos del contender y no excede max=2.
La recuperación post-CAE conserva la misma identidad y no agrega pagos/Caja/folio.

El reinicio probado reconstruye instancias, módulos y sesiones SQL; no es un reinicio
forzado de un servidor operativo ni una validación WSAA real.

## Límites y siguiente etapa

No se promete atomicidad distribuida: una caída entre la emisión externa del ticket
y su primer commit local sigue siendo un caso de conciliación. Esa ventana no es
el rollback posterior que originó R5 y no se declara resuelta por estas pruebas.

Continúan pendientes las extensiones prepare-document/collection-shifts y su unión
con el cliente, homologación WSAA/WSFE autorizada, reglas fiscales/catálogo/PV,
revisión de otros escritores y evidencia histórica compleja.
Las gates enabled y reviewedExtensions continúan desactivadas por defecto.
No se hizo merge, migración operativa, grants, habilitación ni despliegue a main/Xenia.
