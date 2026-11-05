# Cierre de habitación no fiscal con Cuenta Corriente

Recepción puede elegir **Cierre de habitación (no fiscal)** y **Cuenta Corriente**,
con un huésped, empresa o agencia como titular. Al hacer check-out aparece un aviso
con el importe y el titular; confirmar registra la deuda para cobrar después.
Cancelar el aviso no emite, no traslada deuda y no hace check-out.

La operación reutiliza el cierre y la liquidación CC recuperable: comprobante sin
CAE, pago de liquidación en el folio, cargo en la cuenta corriente elegida y un
movimiento informativo de Caja. No crea un ingreso de dinero. La reserva puede
salir cuando su saldo operativo quedó cubierto por esa liquidación; la deuda
continúa en cuenta corriente.

En grupos, se permite trasladar también alojamiento, según lo solicitado por
Administración. El bloqueo anterior confundía este traslado con una cobranza.
La excepción se limita al cierre de habitación no fiscal; las facturas y los
cobros reales siguen por su circuito grupal. La liquidación CC toma el mismo
bloqueo de fila del grupo que sus pagos. Comprueba el menor saldo pendiente entre
habitación y grupo, incluyendo pagos grupales y liquidaciones directas; así no se
vuelve a convertir en deuda lo ya cubierto. La validación previa evita un nuevo
comprobante contra saldo cubierto; el ledger la repite al confirmar su transacción.
Los reintentos del mismo comprobante recuperan el pago existente antes de validar
capacidad, sin duplicar folio, cargo ni movimiento informativo.

Si un intento anterior conserva FB u otro tipo fiscal, usar **Corregir datos del
intento** antes de elegir el cierre no fiscal. No se transforma automáticamente
un intento guardado. No se modifican datos históricos de las reservas reportadas.

## Verificación

- Interfaz/shared: 60 pruebas aprobadas, incluido aviso, cancelar, confirmar,
  titular/importe, ausencia de POST adicional a payments y check-out.
- Servidor: 29 pruebas aprobadas, incluidas restricciones de medios no fiscales,
  continuidad del circuito fiscal grupal y liquidación CC.
- PostgreSQL local de pruebas: 10 pruebas aprobadas de cierre/CC/ledger.
  El flujo nuevo usa el emisor y las rutas reales, configurado en homologación;
  cierre sin CAE, alojamiento y cochera, repetición del mismo intento, un cargo CC,
  un pago, un movimiento informativo y check-out con habitación sucia.
- Validación final del cierre: 2 pruebas PostgreSQL aprobadas, incluida concurrencia
  contra pagos del grupo y rechazo antes de emitir un segundo comprobante.
- TypeScript, compilación y comprobación de formato sobre cada rama destino.

Las pruebas se ejecutan con datos ficticios; no usan la base de datos del hotel
ni crean comprobantes fiscales externos.
