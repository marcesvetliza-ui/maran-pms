# Despliegue de Channex en Xenia

Destino identificado por las capturas del usuario, 30/10/2026:

- Proyecto Railway: `observant-possibility`.
- Ambiente Railway: `production` (es el nombre del ambiente de Xenia; no identifica el hotel Maran).
- Servicio PMS: `maran-pms`.
- Dominio de prueba: `demo.maranpms.com.ar`.
- Repositorio: `marcesvetliza-ui/maran-pms`.
- Rama anterior: `fix/assistant-diagnostic-format`.
- Rama preparada: `feature/xenia-channex-staging`.

La rama preparada integra el piloto y el asistente existentes con la integración Channex y `main` hasta `bd57ec5c`. Conserva los bloqueos del piloto para ARCA, correos, backups por correo y MARA. Channex tiene sus propias guardas staging, alcance y habilitaciones explícitas; esta preparación no activa envíos ni recepción.

## Publicación en Railway

1. En el proyecto indicado, servicio `maran-pms`, abrir **Settings → Source → Branch connected to production** y seleccionar `feature/xenia-channex-staging`.
2. Si está desplegado el servicio separado `programming-assistant`, seleccionar la misma rama allí. Conservar sus directorios, Dockerfile y variables existentes. El PMS y el asistente deben terminar en el mismo commit; no quitar esa comprobación ni habilitar investigaciones con revisiones diferentes.
3. Aplicar los cambios de rama y comprobar los despliegues de ambos servicios. Confirmar estado exitoso, commit completo coincidente y que el dominio de prueba responda. No cambiar la rama de ningún servicio del proyecto operativo Maran.
4. Confirmar en Xenia el indicador de ambiente piloto y comprobar acceso a Soporte del sistema, Channex y el folio. Verificar únicamente lecturas; no generar cobros, facturas fiscales, correos ni operaciones reales para esta comprobación.
5. Mantener los workers Channex desactivados durante esta publicación. La propiedad de prueba, credencial, mapeos, cotización y webhook se configuran después, según [certificacion.md](certificacion.md).

Las capturas no muestran la conexión efectiva de la base, las variables de aislamiento o el segundo servicio del asistente. Antes de activar Channex, confirmar que Xenia usa su base independiente y `APP_ENV=pilot`; el rótulo Railway `production` no reemplaza esa variable del proceso. Los secretos se gestionan en sus pantallas protegidas, nunca se copian por chat.

## Verificación de integración local

- 909 pruebas de interfaz aprobadas.
- 1477 pruebas de servidor aprobadas, incluidas las 206 del asistente y las de Channex, permisos piloto y comunicaciones externas.
- 49 pruebas PostgreSQL de disponibilidad, recepción y bandeja de Channex aprobadas, con transporte remoto simulado.
- TypeScript, compilación del PMS y empaquetado del asistente verificados.

Estos resultados no acreditan un despliegue, una conexión remota ni la certificación. No existen task IDs de esta etapa.

## Corrección de moneda al reiniciar

Se identificó que la migración histórica `rate_plans.fix_currency_ars` reemplazaba cualquier moneda no ARS en cada arranque. Se reemplazó por el completado de valores ausentes (NULL, vacío o espacios), conservando USD, EUR y los importes existentes. La regresión ejecuta dos veces las migraciones reales sobre una base descartable y comprueba que la moneda y el precio persistan.

Las monedas que el arranque anterior ya sobrescribió no se pueden inferir del importe ni restaurar masivamente. Para los cuatro planes de certificación cuya carga original en USD confirmó el usuario, el formulario normal de Tarifas en el piloto permite la corrección explícita de ARS a USD, con aviso de que conserva los números y no aplica conversión. Los planes ARS ajenos a la certificación se conservan. Luego se revisa la preparación y se reintentan los eventos bloqueados; no se solicita otra sincronización completa.
