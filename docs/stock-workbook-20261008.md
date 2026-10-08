# Carga de stock de prueba autorizada, 08/10/2026

Origen: stock.xlsx de stock.zip. Se conserva su SHA-256 en la carga.

- 1.073 filas de origen; 1.010 artículos físicos únicos, 1.068 saldos en cinco depósitos.
- Las cinco repeticiones dentro del mismo depósito se conservan una sola vez, sin sumar cantidades.
- Bondiola cruda: 10 unidades; Bondiola fiambre: 24 unidades, ambas en Cocina, por confirmación expresa.
- Los artículos compartidos entre depósitos tienen una única identidad. Prevalece el costo de Depósito General cuando existe una fila allí.
- Se adapta la clasificación acordada y se conserva Pastelería. Los activos de SPA no se convierten en tratamientos.

## Activación en Railway

El código publicado por sí solo no reemplaza inventario. Para ejecutar esta carga autorizada, configurar:

`INVENTORY_WORKBOOK_IMPORT=stock-workbook-20261008-v1`

Luego desplegar/reiniciar. La migración registra «Carga inicial de inventario verificada» con los recuentos. Tras verificarla puede retirarse la variable. Su identificador y hash impiden repetirla en reinicios o aplicar otro contenido bajo el mismo identificador.

Todo ocurre en una transacción que bloquea escrituras de inventario durante la carga. Una falla revierte el proceso. Antes de sustituir saldos se guarda una instantánea JSON de catálogo, ubicaciones, equivalencias, políticas, recetas, ingredientes, tomas y pendientes en `inventory_workbook_imports.snapshot`. Esto complementa, no reemplaza, el respaldo completo de la base.

Los artículos físicos anteriores se archivan, sus saldos se retiran mediante ajustes auditados y los pendientes/tomas abiertos de prueba se cancelan. No se eliminan compras, movimientos históricos, platos, tratamientos ni recetas. Las recetas existentes reciben una nota para revisar sus vínculos al catálogo archivado; deben actualizarse antes de usarlas con stock nuevo. No se reasignan ingredientes automáticamente por nombre.

Una restricción de base impide nuevos nombres físicos activos repetidos ignorando mayúsculas, tildes y puntuación; las rutas de edición/carga informan el conflicto.

## Verificación

En una base PostgreSQL aislada se prueba la planilla completa, el acuerdo entre saldo global y depósitos, la conservación de documentos/catálogos de venta y recetas, el reintento sin duplicación, el rechazo de payload distinto y la reversión ante una falla intermedia. Todas las pruebas revierten sus fixtures.

Consulta de control tras despliegue (no contiene la instantánea):

```sql
SELECT key, applied_at, result FROM inventory_workbook_imports
WHERE key = 'stock-workbook-20261008-v1';
```
