# Planilla diaria Housekeeping

Reporte independiente en Reportes → Planilla diaria Housekeeping. La planilla de Recepción no se modifica.

Permite elegir fecha, actualizar e imprimir en A4 horizontal. Muestra salidas y entradas por habitación, huésped principal, camaje, pax, fechas, early check-in y late check-out con los horarios cargados, estado operativo y observaciones relevantes. «Sale / entra» destaca cuando una habitación tiene dos reservas distintas saliendo y entrando ese día.

Incluye salidas checked_in/checked_out y entradas confirmed/web_checkin/checked_in, para conservar las operaciones del día aunque ya se hayan completado. Excluye reservas canceladas, no-shows y habitaciones virtuales. El estado distingue operaciones pendientes y realizadas.

Observaciones: preferencias activas de huésped y acompañantes vinculados, notas no resueltas de esa reserva y preparación especial vinculada a su habitación actual. Solo categorías habitación, amenities y servicio visibles para all/housekeeping; no notas internas o de alimentación, notas generales de reserva ni observaciones restringidas a otra área. No se infiere relevancia del texto libre: se respeta la categoría y visibilidad configurada. Una preparación movida no se atribuye a otra habitación.

El endpoint usa una proyección operativa explícita, no carga balances ni devuelve importes, teléfonos, documentos o notas administrativas. Tiene control de autenticación y permiso sidebar:/housekeeping-daily-report, editable desde permisos por rol. El nuevo permiso se incorpora con el sembrado existente de recursos nuevos, sin cambiar permisos ya configurados.

Validación: prueba PostgreSQL con entradas/salidas, rotación, virtuales/canceladas, horarios, notas de acompañantes, visibilidad, preparación y ausencia de datos financieros; fecha imposible rechazada. Prueba HTTP de 401/403/400 y catálogo de permisos (29 pruebas aprobadas junto a las existentes). Prueba de pantalla, fecha e impresión. TypeScript y compilación aprobados.

Tras desplegar, revisar una fecha con salidas y entradas, comparar camaje/pax con Recepción y una preferencia visible para HSK; comprobar vista de impresión. Las pruebas locales usan datos sintéticos y no consultan la base de producción.
