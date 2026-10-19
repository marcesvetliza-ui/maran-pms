# Retiro de caja operativa de Eventos

Eventos deja de ofrecer caja propia. Los cobros se registran directamente en Administración o Recepción; este cambio no replica ni deriva movimientos entre áreas.

- Configuración Eventos inactiva, también al iniciar o crear configuraciones nuevas.
- Sin alertas de turno ni requisito de turno para cargar cargos del evento o mesas.
- Rechazo de apertura, toma, cierre con sucesor, creación automática y nuevos movimientos en Eventos (ambos alias).
- Historial conservado y consultable, sin cierre ficticio de turnos antiguos ni modificación de importes.
- Correcciones históricas de medio de pago permanecen en su turno original.
- Punto de venta fiscal y módulo Eventos conservados. Los pagos del módulo no generan un movimiento de caja propio ni una réplica en otra caja.

No requiere migrar saldos ni ejecutar operaciones sobre dinero histórico. La baja persistida de configuración ocurre con `initCashShifts`; la política de lectura/escritura es efectiva aunque esa inicialización no haya concluido.
