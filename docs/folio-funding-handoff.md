# Entrega a Codex: motor Folio y preparación de interfaz SPA

## Alcance y estado

- Motor y pruebas: commit `553493b`, conservado sin amend ni rebase.
- Rama de entrega: `design/folio-payment-correction`.
- Contrato: `docs/folio-funding-api.md`.
- Evidencia y limitaciones: `docs/folio-funding-verification.md`.
- Evidencia del motor: 24 pruebas PostgreSQL aisladas, sin fallos ni omisiones, y recuperación HTTP posterior a CAE simulado.
- **HABILITACIÓN OPERATIVA: BLOQUEADA.** La revisión de Codex, la preparación de la UI y el push no autorizan montar rutas, migrar datos reales, emitir, cobrar, mergear ni desplegar.
- No modificar `main`, Revenue ni producción. No incorporar al circuito operativo la pasarela, sesión permisiva ni fixtures de la demo.

Este documento distribuye responsabilidades; **no declara conectadas ni completadas las dependencias pendientes**. No se implementan en este commit documental.

## Responsabilidades sin superposición

### Codex: revisión del motor y cliente SPA

1. Revisar el snapshot del motor y sus pruebas; registrar hallazgos por separado. Una corrección de motor debe acordarse y entrar en un commit enfocado antes de modificar el contrato; no mantener dos implementaciones paralelas.
2. Preparar la UI SPA en `client/src/pages/spa.tsx` y componentes/helpers de cliente propios. Usar un adaptador cliente para los DTO del contrato: dinero en centavos, IDs de receipt/documento, previewHash y UUID estable por operación.
3. Mostrar aplicado/reservado/libre y deuda operativa por separado. Reabrir operaciones persistidas tras refresh; manejar HTTP 202 y conflictos sin crear otro UUID, factura ni cobro para resolver un error.
4. Consumir los flags del servidor y no convertir `fiscal_unknown`, `authorizing` o `authorized_pending_link` en fallo terminal. Mostrar conteo no verificable cuando sea null.
5. Preparar el cliente con fixtures sintéticos o la demo aislada. Mantener las acciones reales deshabilitadas mientras falten bindings del servidor; no inventar `documentId`, snapshots fiscales, CAE, saldos disponibles ni permisos para habilitarlas.
6. No crear pagos/Caja desde la UI ni conservar una segunda liquidación legacy. No conectar cargo a habitación, CC, retenciones o vouchers a este adaptador monetario.

**Propiedad de cambios de Codex:** interfaz SPA, adaptador HTTP/DTO de cliente, pruebas de cliente y reporte de revisión. `spa-fiscal-review.tsx` sólo si la revisión confirma que debe consumir las operaciones del mismo contrato.

**Fuera de esa propiedad:** implementar la pasarela ARCA, modificar inventario, importar historia, montar rutas operativas o cambiar unilateralmente el esquema/contrato del motor.

### Replit Agent: bindings y adaptadores operativos compartidos

Quedan asignados a Replit Agent **como pendientes bloqueados, no como trabajo iniciado**:

| Adaptador/binding | Qué debe completar | Estado y condición para desbloquear |
|---|---|---|
| `FiscalGateway` (`contracts.ts`) | Implementación operativa de `authorize`/`lookup`, con borrador y número fiscal persistidos antes de red; recuperación del mismo comprobante y correspondencia con operationId/documentId/claimHash. | **BLOQUEADO:** sólo existe la pasarela sintética. Timeout/no encontrado ambiguo nunca es rechazo terminal ni libera fondos. Requiere integración y pruebas del binding real en entorno autorizado. |
| Preparación de documento fiscal | Puente al constructor fiscal validado para persistir receptor, tipo, PV, moneda, ítems y total antes de reservar. | **BLOQUEADO:** no existe una ruta operativa de preparación conectada al motor. No aceptar un snapshot arbitrario del navegador ni crear documentos dummy para habilitar la UI. |
| Adopción/importación histórica | Importador verificado para `SqlFundingAdapter.adoptScope`, con documentos, aplicaciones y evidencia por IDs en el mismo `PoolClient` y commit. | **BLOQUEADO:** no hay importador operativo de historia real. Ambigüedad o plan incompleto deben impedir la adopción; no inferir vínculos por importes. |
| `FirstSpaClose` / `TransactionBoundInventoryClosure` | Conectar el cierre/stock SPA real al `PoolClient` recibido; preservar idempotencia y rollback con pagos, Caja y folio. | **BLOQUEADO:** sólo se verificó un callback transaccional sintético. Prohibido usar pool global, transacción independiente o callback no-op en operación real. |
| `SqlFundingAdapter` de reserva y SPA | Validar los mappings de las tablas operativas, medios, turnos, vínculos y primera clausura contra el entorno de integración autorizado. | **IMPLEMENTADO / VALIDACIÓN REAL BLOQUEADA:** no reescribirlo en el cliente ni crear otro finalizador. |
| Sesión/permisos y montaje | Resolver `Actor` desde sesión real, mapear permisos, montar `mountPaymentFunding` antes de legacy y verificar el fence de todos los escritores operativos relevantes. | **BLOQUEADO:** el módulo no está montado. La sesión permisiva de demo no es un binding operativo. |

El único finalizador continúa siendo `PaymentFundingService.finalize` con la rama correspondiente de `SqlFundingAdapter.finalize`. **Codex no debe implementar otro finalizador SPA**, y Replit Agent no editará en paralelo el cliente SPA durante su preparación por Codex.

## Contrato de coordinación

- Los DTO, códigos de conflicto y firmas compartidas se consideran base de integración; cualquier cambio se acuerda antes de que otro trabajo dependa de él.
- Durante la revisión de Codex no se continúa modificando el motor en paralelo sin coordinar el alcance.
- Cada parte trabaja en su propia rama derivada de esta entrega; no reescribe historia ni hace force-push sobre la entrega o `main`.
- Correcciones derivadas de la revisión van en commits separados; las pruebas deben identificar el snapshot efectivamente probado. Las 24 pruebas acreditan el motor aislado, no un binding real añadido después.
- La integración conjunta sólo se prepara después de acordar los hallazgos y validar las dependencias reales. No existe autorización de merge ni despliegue en esta entrega.

## Lista de bloqueo para una futura habilitación

- [ ] Revisión del motor y resolución acordada de hallazgos.
- [ ] Pasarela fiscal operativa persistente y recuperación sin segunda emisión.
- [ ] Preparación fiscal validada del documento, sin valores inventados del cliente.
- [ ] Importación/adopción histórica completa por identidades autorizadas.
- [ ] Callback de cierre/stock real ligado a la misma transacción.
- [ ] Autenticación, permisos y fence completos con rutas operativas reales.
- [ ] UI SPA conectada a la proyección nueva, sin segundo cobro ni fallback legacy.
- [ ] Pruebas de integración del conjunto sobre el snapshot final.
- [ ] Autorización posterior y explícita para habilitar, mergear o desplegar.

**Todas estas casillas permanecen pendientes.** La existencia del commit, de una UI preparada o de pruebas sintéticas verdes no las cierra automáticamente.
