# Clasificación acordada — 8 octubre 2026

La preparación physical-catalog-20261008 se ejecuta una sola vez al iniciar la aplicación, incluso cuando ya se aplicó la preparación del 7/10.

Incluye las ocho áreas: Restaurante, Housekeeping, SPA, Administración, Mantenimiento, Eventos, Comunicación y Depósito General. Depósito General reutiliza la clave general para conservar referencias y códigos; contiene Almacén → Varios. Hotel permanece disponible para interpretar registros históricos, pero no para crear nuevas clasificaciones.

La estructura física proviene de shared/inventoryTaxonomy.ts. Reutiliza coincidencias por área, nivel, padre y nombre normalizado; no fusiona registros ambiguos. Las clasificaciones anteriores fuera de la estructura acordada pasan a inactivas y desaparecen de las opciones de carga. Se conservan sus identificadores y las referencias de artículos anteriores. No se modifica ningún saldo, costo, compra, receta, tratamiento ni movimiento. No se trasladan artículos por inferencias sobre sus nombres. El catálogo de platos y tratamientos sigue separado.

Todo se aplica en una transacción y bajo el bloqueo del catálogo. Un fallo revierte tanto la estructura como el marcador. Los cambios manuales posteriores no se eliminan al reiniciar, porque el marcador impide repetir la preparación.

La planilla del usuario se revisará antes de importar. La carga real y el retiro de saldos, artículos o pendientes de prueba son operaciones separadas; esta preparación no realiza ese reinicio.
