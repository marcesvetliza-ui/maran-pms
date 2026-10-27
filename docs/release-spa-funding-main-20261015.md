# Integración de Folio/SPA en main — 15/10/2026

Autorización posterior del usuario: “Cuando termines también subilo al main”.
Esta entrega incorpora el código preparado y verificado; **no habilita el nuevo
circuito fiscal ni acredita homologación ARCA**. Esta autorización actualiza la
restricción de merge de las entregas anteriores; sus informes conservan el estado
histórico de cada revisión.

## Alcance

Base main: `dea2f878`. Integra `feature/spa-funding-connected-ui` (`b2ce11c7`),
con el motor, correcciones R1–R5, bindings y conexión de preparación/cajas al cliente.
No incorpora la rama piloto ni cambia marcas: main conserva Maran Suites System.
Se preservan huéspedes/reservas, Revenue, permisos administrables y presupuestos.

Estado al publicar:

- `mountConfiguredOperationalSpaFunding(app)` se llama con enabled=false y
  reviewedExtensions=false. No registra endpoints ni instala tablas de financiación.
- `VITE_SPA_FUNDING_UI` no se activa. No se cambia configuración de despliegue.
- No se ejecutan scripts SQL funding, importaciones históricas ni grants automáticos.
- No se contacta ARCA, no se consultan credenciales ni se modifican datos operativos.
- La demo sintética mantiene su servidor independiente y no se monta en la aplicación.
- Los cambios compartidos de SOAP y coordinación fiscal legacy sí forman parte del
  código integrado y se verifican con las regresiones indicadas abajo.

## Ajuste de integración

Dos suites legacy conservaban respuestas SOAP sin namespaces/estructura fiscal.
Se actualizan sus fixtures a respuestas completas, parametrizadas por tipo, PV y
número. No se eliminan assertions: se mantienen las de comprobantes asociados,
condición IVA, fechas y vencimiento independiente del CAE.

## Validación del snapshot integrado

- Cliente completo: 649/649, 122 archivos.
- Servidor unitario completo: 695/695, 96 archivos.
- Financiación PostgreSQL aislada: 57/57 (28 motor, 19 rutas/bindings, 4 pool,
  4 WSAA, 2 conexión/gate y navegador).
- Regresión legacy PostgreSQL: 14/14, borradores recuperables, colisiones y
  numeración ficticia. Base local `maran_ci_local`; proveedor externo simulado.
- TypeScript completo y tsconfig.funding.json: correctos.
- Build de la aplicación: correcto.

La primera corrida de servidor detectó 8 fallos de fixtures SOAP antiguos en dos
archivos. Se corrigieron los fixtures y se repitió la suite completa: 695/695.
No se relajó el parser para aceptar respuestas fiscales incompletas.

## Siguiente etapa antes de activar

Validar proveedor WSAA/WSFE en un entorno aislado de homologación autorizado,
reglas fiscales/catálogo/PV y adopción de cuentas nuevas e historia soportada.
Configurar roles y ejecutar el recorrido conjunto con ese proveedor. Después
corresponde una habilitación controlada en Xenia; producción no se activa con este push.

El push a GitHub y el despliegue de Railway son hechos distintos. Esta entrega
verifica el primero; no afirma haber comprobado la versión activa en Railway.
