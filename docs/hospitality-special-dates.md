# Hospitalidad · Fechas especiales

Primera versión: cumpleaños de personas físicas registradas, con o sin estadía.
Usa guests.fecha_nacimiento; muestra el mes actual de Argentina por defecto,
ordena por día y permite cambiar mes y año de contacto (anterior, actual o próximo).
El 29 de febrero permanece dentro de febrero, incluso en años no bisiestos.
No crea cumpleaños para fichas sin fecha ni incluye personas jurídicas.

## Operación

- Plantilla persistida en la misma pantalla: asunto, texto, beneficio,
  condiciones/vigencia y firma. Variables en asunto/texto: {nombre}, {apellido},
  {beneficio}, {condiciones}, {firma}. Control de versión evita pisar otra edición.
- WhatsApp prepara un mensaje y un número internacional revisable. Abrir la
  aplicación o copiar texto no confirma envío. El operador puede registrar
  explícitamente que ya lo envió; se guarda mensaje, número, fecha y operador.
- Email individual o selección de hasta 250 huéspedes. Se crea una vista previa
  con destinatarios y texto personalizado; sólo confirmarla crea la cola. La
  vista vence a los 30 minutos y sólo su autor puede confirmarla. El primer
  mensaje aparece desplegado para revisión. Cambiar la plantilla después no
  modifica el texto ya mostrado en una vista previa.
- Se muestran resultados individuales, incluyendo fallos parciales. Se utiliza
  el Resend/SMTP y el interruptor global existentes. Nunca se arma un correo con
  todos los destinatarios visibles. El HTML escapa el texto del operador/huésped.
- Exclusiones con motivo, operador e historial. Se revisan al preparar, confirmar
  y antes de enviar. Una exclusión de otro registro con el mismo correo también
  se respeta. Los envíos que ya comenzaron no pueden retirarse.

## Duplicados y resultados inciertos

La campaña es cumpleaños/año. Un contacto confirmado o un envío en cola, en curso,
aceptado o incierto bloquea otro envío para el huésped. El correo se normaliza y
se deduplica dentro de cada selección y en base por año, incluso entre fichas
con correo compartido. La confirmación repetida de una vista no duplica trabajo.

La cola se procesa desde el servicio PMS, con reclamo transaccional, bloqueo
entre instancias y un inicio de envío por segundo como máximo. Revalida los
permisos y estado activo del operador. No hay una campaña mensual automática:
sólo se procesan lotes confirmados expresamente desde la interfaz.

“Enviado al proveedor” significa aceptación, no entrega ni lectura. Un rechazo
confirmado permite otra preparación/revisión y conserva el historial. Un corte
incierto queda para revisión, sin reintento automático. Un proceso interrumpido
durante el envío pasa a incierto después de diez minutos. SMTP no ofrece
idempotencia del proveedor; por eso nunca se reintentan automáticamente estos
casos. No se implementa forzar reenvío de un resultado incierto en esta versión.

## Permisos y datos

Requiere sidebar:/hospitality y api:hospitality:campaigns, visible en la matriz
como “Fechas especiales: contactos, mensajes y envíos”. Valores iniciales: admin,
manager, jefe_recepcion, comercial y reception. Sigue la configuración normal
por rol; otros usuarios de Hospitalidad no reciben este acceso por defecto.

Migración aditiva: 20261024_hospitality_special_dates.sql, con los mismos DDL
aplicados mediante guardas del catálogo en el arranque normal. Tablas separadas
para plantilla, exclusiones, vistas previas, contactos/cola e historial de eventos.
No cambia reservas, facturas, cobros ni los envíos transaccionales existentes.
Los índices de cola e historial se crean con guardas y el backfill normal agrega
el permiso nuevo una sola vez.

## Validación

- Pruebas de interfaz, personalización y direcciones; cancelación no envía,
  WhatsApp no registra por abrirse y el correo desactivado bloquea confirmación.
- Pruebas del proveedor con fetch y SMTP simulados: aceptación, rechazo, resultado
  incierto y escape de HTML. Sin solicitudes a un proveedor real.
- PostgreSQL local desechable: mes/29 de febrero, permisos, versión de plantilla,
  duplicados, confirmaciones y trabajadores concurrentes, exclusión antes de
  enviar, cambio de dirección, resultados parciales, recuperación de interrupción,
  reintento revisado, revocación de permiso y migración repetida sin perder datos.
- Navegador Chromium con APIs ficticias en la aplicación completa: pestaña,
  listado, mensaje personalizado, vista previa y cancelación sin encolar envíos.

Comandos: npm run check; npm run build; npx vitest run
client/src/components/hospitality-special-dates.test.tsx shared/hospitalitySpecialDates.test.ts;
prueba server birthday-email-service.test.ts; prueba PostgreSQL
hospitality-special-dates.pg.test.ts con ALLOW_DESTRUCTIVE_PG_TESTS=true y una base
local de pruebas. Nunca usar la base operativa para esas pruebas.
