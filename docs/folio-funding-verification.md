# Verificación del motor Folio / SPA aislado

## Evidencia ejecutada

- TypeScript: `node node_modules/typescript/bin/tsc -p tsconfig.funding.json` (usando el binario existente del workspace), sin errores.
- JavaScript de la demo: `node --check demo/funding/app.js`.
- PostgreSQL local descartable, conectado por Unix socket; no DB operativa y sin `DATABASE_URL`.
- Suite dedicada: `bash script/test-funding-isolated.sh`.
- Una prueba HTTP específica del montaje legacy se volvió a ejecutar después de reforzar su autenticación.

## Qué comprueban las pruebas PostgreSQL

1. SPA `existing_only` mantiene los mismos pagos, Caja, folio y stock, incluyendo retry.
2. CAE persistido por el proveedor antes de una caída local: holds conservados, abort prohibido y recuperación desde otra instancia sin emitir/cobrar otra vez.
3. Fallo post-CAE después de preparar dinero nuevo: rollback de pago/Caja/folio; dos recuperaciones simultáneas producen una sola colección.
4. Resultado fiscal ambiguo con antigüedad simulada de 45 días no libera fondos.
5. Abort explícito antes de autorizar o tras rechazo terminal probado libera una vez.
6. Dos facturas simultáneas no reservan los mismos receipts.
7. Dos emisores SPA tienen un solo dueño fiscal durable.
8. Mismo UUID/contenido es replay; otro contenido es conflicto.
9. Anular cobro inexistente y restaurar cobertura deja deuda de la **reserva** por 90.000; conserva el cierre original.
10. Restauración vs reserva de los mismos 60.000: una sola gana.
11. Crédito ya reutilizado: quedan obligaciones F1=60.000/F2=30.000, sin factura ni cobro nuevo.
12. Reclasificación de turno cerrado no cambia total, conteo ni snapshot de factura.
13. Fallo al final de corrección revierte todas sus escrituras, incluyendo revisión y aplicaciones.
14. Cierre entre preview y confirmación exige revisión histórica, sin conversión silenciosa.
15. Reprocesar una NC no relibera fondos ni transforma restauración en self-reapplication JSON.
16. Trigger SQL rechaza sobreaplicación directa fuera del helper TypeScript.
17. Vínculos ambiguos o de otro scope fallan explícitamente, sin emparejar por montos.
18. Rutas HTTP cruzan middleware de sesión y permisos; rechazan suplantación del actor.
19. Dos conexiones SQL directas compitiendo por un receipt: una sola aplicación permitida.
20. Dos autorizadores simultáneos: una autorización durable y Caja inalterada.
21. Cobro nuevo no excede la deuda y turno cerrado se rechaza antes de autorizar.
22. Carrera con lock real de turno: si el cierre gana, el link post-CAE conserva fondos y no escribe Caja.
23. Ruta legacy SPA delega al único finalizador; escritor legacy de pagos no puede eludir el scope adoptado.
24. Adopción con historia fiscal requiere importación verificada y atómica; un importador vacío no crea otro saldo libre.

Los asserts verifican `efectivo = aplicado + reservado + libre` por receipt, identidades persistidas, importes y recuentos de filas, no sólo códigos HTTP.

La pasarela sintética guarda su autorización en un commit separado antes de que el motor persista el CAE: el fallo probado no es un mock que tira error antes de autorizar.

## Límites de la evidencia

- No es una prueba de ARCA real ni acredita un CAE real.
- No se corrieron migraciones ni fixtures contra datos operativos.
- No habilita por sí sola una importación de historia fiscal incompleta.
- Stock de primera clausura usa un callback transaccional de prueba con unicidad. El callback operativo deberá vincularse a las funciones de inventario usando el mismo PoolClient y verificarse en integración.
- La implementación de pasarela operativa debe persistir un borrador/número antes de autorizar y consultar ese mismo comprobante en recuperación; un timeout o ausencia ambigua no puede declarar rechazo.
- La aplicación principal y su UI actual no están conectadas. Antes de habilitar, scopes adoptados deben leer esta proyección y quedar protegidos por el fence anterior a las rutas legacy.
- La recuperación de dinero nuevo cuyo turno se cerró antes de liquidar queda bloqueada para conciliación histórica: no se abre ni se cambia de turno automáticamente.
- Una intención de cobro nuevo no se descarta por abort; requiere resolver ese dinero explícitamente.
