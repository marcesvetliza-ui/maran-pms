# Segunda entrega: conectar una instalación completa del PMS

Fecha: 17 de noviembre de 2026. Estado: revisión técnica inicial y secuencia de implementación; todavía no implementada ni desplegada.

## Resultado buscado

Desde el panel central, una persona autorizada elige Hotel Aurora y abre una instalación completa del PMS con su identidad y permisos. Se ensaya primero Alojamiento con datos ficticios. Después se incorpora Brisa y se repiten las pruebas entre ambos hoteles. Maran mantiene su servicio y su base actuales durante esta entrega.

La primera entrega ya tiene aceptación manual del propietario: dos establecimientos activos, reservas persistidas por separado y perfiles de responsable, recepción y consulta. El acta está en `evidencia/multihotel-aceptacion-2026-11-17.json`.

## Hallazgos que condicionan el enlace

Revisión de las referencias locales `main` en `2301ffb6` y `feature/xenia-channex-staging` en `0bf36df2`. Antes de implementar se deben actualizar las referencias y comprobar los cambios posteriores.

| Fuente | Hallazgo | Trabajo necesario |
| --- | --- | --- |
| `server/db.ts` | El PMS tiene un pool principal tomado de `DATABASE_URL`. | Mantener una instancia y una base operativa exclusiva por hotel en esta etapa. |
| `server/auth.ts` | Passport autentica contra `system_users`; la sesión serializa un ID local. Este archivo coincide entre las dos referencias revisadas. | Enlazar el principal central con un usuario local mediante una relación explícita y una sesión propia de la instalación. |
| `server/permissions.ts` | El PMS tiene permisos operativos que difieren entre ramas. | Revisar la equivalencia de responsable, recepción y consulta por recurso; no convertir automáticamente un perfil en administrador. |
| `client/src/hooks/use-verified-session.ts` | Existe en `main` y no está en la referencia revisada de Xenia. | Conservar la comprobación de sesión y reconexión al elegir la base común. |
| `client/src/App.tsx` y almacenamiento del navegador | Hay diferencias de sesión y valores de punto de venta, formularios y operaciones pendientes. | Separar el contexto por instalación y limpiar los datos privados al cambiar de cuenta. |
| `server/index.ts` y `server/seed.ts` | El arranque ejecuta migraciones, `seedDatabase`, `refreshRealData` y trabajadores. Hay valores de Maran en los datos iniciales. | Preparar primero un arranque de pruebas con fixtures explícitos e integraciones externas desactivadas. |
| `server/xenia-control/store.ts` | Las bases de demostración exigen un esquema dedicado `xenia_property`; el PMS usa tablas operativas propias. | No ejecutar las migraciones del PMS sobre esas bases como si los dos esquemas fueran intercambiables. |

## Secuencia de trabajo

1. **Fijar el código candidato.** Actualizar referencias, completar la matriz funcional y partir de la base estable que conserve los arreglos de Maran. Incorporar las mejoras de Xenia por módulo. Registrar la revisión exacta y sus verificaciones.
2. **Preparar el arranque de una instalación ficticia.** Revisar migraciones y datos iniciales; crear una plantilla de Aurora sin huéspedes, CUIT, comprobantes, usuarios ni credenciales reales. Revisar los trabajadores, correo y proveedores antes de iniciar el servicio. Este modo de instalación es trabajo por implementar, no una variable ya disponible.
3. **Preparar un servicio y una base operativa nuevos para Aurora.** Registrar configuración, versión, almacenamiento, sesiones y dominio. Conservar las bases de demostración actuales hasta validar la transición. Cualquier retiro posterior tendrá su propio respaldo y procedimiento.
4. **Implementar el enlace de acceso.** Registrar en el servidor la instalación que corresponde a cada establecimiento. El navegador no elige una base ni recibe sus credenciales. Usar un código de acceso efímero y de un solo uso, vinculado a usuario, establecimiento, instalación destinataria y solicitud del navegador; intercambiarlo entre servidores autenticados. El PMS crea una sesión local y aplica el mapeo de permisos revisado.
5. **Resolver vigencia y revocación.** Comprobar membresías al emitir y canjear accesos. Definir y probar la duración de la sesión local, la revocación y la continuidad ante una caída central antes de incorporar instalaciones operativas. No reutilizar la cookie del panel como cookie de todos los hoteles.
6. **Probar Aurora de extremo a extremo.** Ingreso desde el panel, identidad visible, habitaciones ficticias, planning y reservas del PMS; cierre de sesión, cuenta desactivada, permisos, acceso directo y reintentos. Un enlace que sólo abre otra página de login no completa este paso.
7. **Incorporar Brisa.** Repetir el alta limpia con su propia instalación y comprobar los dos hoteles en paralelo, incluidos IDs similares, puntos de venta, archivos, trabajos y cachés.
8. **Ensayar actualización y recuperación.** Identificar artefacto y esquema, aplicar una actualización sobre Aurora, comprobar que Brisa conserve su versión y practicar restauración en una base descartable. El resultado se registra antes de proponer incorporar Maran.

## Direcciones previstas

| Dirección | Función | Estado |
| --- | --- | --- |
| `xeniapms.com` | Web comercial | Publicada. |
| `app.xeniapms.com` | Panel central | Ingreso y pruebas manuales confirmados por el propietario. |
| `aurora.qa.xeniapms.com` | PMS completo de prueba para Aurora | Propuesta; sin servicio ni DNS creados por esta entrega. |
| `brisa.qa.xeniapms.com` | PMS completo de prueba para Brisa | Propuesta; posterior a la prueba de Aurora. |

Al crear cada servicio, obtener del alojamiento sus registros reales. En Donweb usar el nombre completo de cada registro y copiar completos los valores de verificación. Las direcciones de QA no se presentan como acceso comercial hasta pasar su aceptación.

## Condiciones de aceptación

- Elegir un establecimiento abre su PMS completo con la identidad autorizada y el establecimiento siempre visible.
- Un código consumido, vencido, de otra instalación o de una persona revocada no crea una sesión.
- Responsable, recepción y consulta conservan los permisos esperados en las API operativas, también al modificar rutas manualmente.
- Base, sesiones, archivos, cachés y trabajos corresponden a una sola instalación; las dos pestañas y los cambios de cuenta no cruzan datos.
- La preparación utiliza datos ficticios y no hace llamadas fiscales, envíos de tarifas, correos ni cobros reales.
- La actualización de un establecimiento y el ensayo de restauración tienen evidencia y no actualizan automáticamente los demás.

El siguiente paquete de código es el arranque reproducible del PMS de pruebas y el contrato de identidad. Este documento no configura por sí solo esos comportamientos ni modifica los servicios existentes.
