# Estado de Xenia al 23 de noviembre de 2026

Corte documental: **2026-11-23, Argentina**. Esta actualización reúne la aceptación de los PMS QA, los permisos comprobados por Marcelo y la aclaración del objetivo comercial. Las referencias se consultaron en GitHub; las acciones remotas de Railway relatadas fueron realizadas por Marcelo.

## Decisión que ordena el producto

Marcelo aclaró que necesita un sistema ofrecido a muchos hoteles de distintos dueños. El acceso de una persona a varios hoteles del mismo cliente es una posibilidad, no el objetivo que define todo el producto. El siguiente bloque pasa de una vista gerencial consolidada a **alta y administración de un cliente independiente**.

Se aprovechan catálogo, bases separadas, enlace de identidad y permisos por hotel. Sigue pendiente que un administrador de cliente gestione su personal dentro de su organización. El código actual reserva la creación de usuarios y asignación de accesos a la administración global de Xenia.

## Mapa de instalaciones y evidencia

| Componente | Destino conocido | Estado al corte |
| --- | --- | --- |
| Web comercial | `xeniapms.com` | Publicación y correo confirmados por Marcelo en los antecedentes. Sin nueva comprobación de disponibilidad en este trabajo. |
| Panel | `app.xeniapms.com`, servicio `Xenia-Control` | Funcionamiento y gestión de accesos confirmados por Marcelo. SHA servido actual no aportado al acta del 23/11. |
| PMS Aurora | `aurora.qa.xeniapms.com`, servicio `xenia-aurora-pms` | Marcelo confirmó el despliegue y el recorrido completo siguiendo la guía de la revisión `4a1f71ba`. No se recibió un JSON nuevo de salud ni un ID de deployment para verificarlo independientemente. |
| PMS Brisa | `brisa.qa.xeniapms.com`, servicio `xenia-brisa-pms` | Mismo alcance de aceptación manual; revisión candidata indicada `4a1f71ba`, SHA servido sin captura o respuesta aportada al acta nueva. |
| PMS del asistente piloto | `demo.maranpms.com.ar`, servicio `maran-pms` según guía y conversación | Chat y respuestas visibles en capturas de Marcelo. La revisión remota efectiva de PMS y asistente se debe registrar por separado. |
| Asistente normal | Servicio `charismatic-wonder`, base `assistant-db` según guía y conversación | Rama de soporte identificada; no se volvió a consultar su configuración remota. |
| Evaluador | Servicio `support-codex-evaluation` según antecedentes | Ejecutor distinto del asistente; no se inició inferencia ni una evaluación en este trabajo. |
| Maran en uso | `maranpms.com.ar` | Fuera de las modificaciones de esta entrega documental. `main` no acredita por sí mismo su versión instalada. |

Los servicios de prueba se sitúan en `observant-possibility` / `production`: ese nombre de entorno de Railway no convierte a los PMS en instalaciones operativas comerciales. Su modo es QA según la configuración y las pruebas aceptadas.

## Qué quedó aceptado por Marcelo

- Aurora y Brisa: reserva individual, check-in, consumo, cobro ficticio, checkout con saldo de cobro cero y conciliación de Caja.
- Separación visual de reservas entre ambos hoteles.
- Recepción de Aurora: acceso sólo a ese hotel y persistencia de una reserva y su edición.
- Consulta de Brisa: lectura y rechazo de las operaciones ensayadas.
- Retirada del acceso de la cuenta de consulta, bloqueo al recargar y posterior reasignación siguiendo la guía.

La [aceptación manual](evidencia/aceptacion-qa-2026-11-23.json) cita las confirmaciones de la conversación. Es aceptación del operador sobre los recorridos indicados; no incluye trazas HTTP, capturas nuevas ni una auditoría exhaustiva de todos los permisos. La validación entre organizaciones distintas y la administración delegada todavía no se ejecutaron.

## Código y comprobaciones identificados

| Línea | Referencia comprobada en GitHub | Consecuencia |
| --- | --- | --- |
| PMS QA actual de referencia | `feat/xenia-pms-operations-qa-20261123` → `4a1f71ba4085ba1cff4d89c99bcb2de0a2e5d61f`, PR 168 abierta en borrador | Referencia funcional aceptada por el operador; despliegue reportado desde la rama, sin fusionar la PR. |
| PMS QA anterior | `fix/xenia-pms-reservation-edit-20261119` → `f5005dc7d2a702198cb953b59df99b1d92cbbe53`, PR 146 abierta | Antecedente de edición de fechas y tarifas; no sustituye la etapa nueva de Caja. |
| Primera base del panel | `feat/xenia-multihotel-foundation-20261117` → `eeb7d0c3ec1a4ce4294ef3a1d7f915c40f9ffd28`, PR 119 abierta | Antecedente; la rama por sí sola no identifica el código del panel actualmente servido. |
| Asistente | `feature/xenia-support-approval-foundation` → `bc8e06b5a9042fdda3cf4fda2664527cb59c7e38` | PR 158 fusionada en esta rama; no se fusionó en la línea del PMS QA como parte de este trabajo. |
| Maran / producto principal | `main` → `111a89d4d6ce9f46097e6fd80968fb12aee3bcce` | Incluye la PR 167 de mesas. No prueba despliegue en Maran ni incorporación en los PMS QA o en el código leído por el asistente. |
| Plan previo | `plan/xenia-product-multihotel-20261116` → `f75721ef7e70b67c754a3286ee22e36d3e8bb55f` | Base de esta organización documental; conserva la prioridad del piloto y los antecedentes. |

La [evidencia de operaciones](evidencia/operaciones-qa-2026-11-23.json) registra **121 pruebas locales** y **83 de CI**, con solapamiento. No se suman como casos diferentes. CI de Node 22 aprobó ambos servicios y sus dos imágenes; el árbol del merge virtual coincide con el candidato. Los ensayos usan PostgreSQL sintético.

El asistente conserva una validación histórica separada del 20/11: 398 pruebas en las suites enumeradas por su acta, navegador con backend simulado y cero llamadas reales de esa validación. Las capturas posteriores de conversación real son otra evidencia; no convierten ese acta en una evaluación formal de calidad de un modelo real.

## Bases, copias y recuperación

Se conservan la base central `xenia-control-db`, las bases de demostración `xenia-aurora-db` y `xenia-brisa-db`, y las operativas de prueba `xenia-aurora-pms-db` y `xenia-brisa-pms-db`. Las dos clases de base tienen funciones distintas; las bases de demostración no son una segunda base obligatoria de cada cliente futuro.

Marcelo confirmó las cinco copias el 20/11. La referencia, retención y configuración recuperable completas siguen pendientes en su [acta](evidencia/respaldos-reportados-2026-11-20.json). Existe una recuperación PITR de Aurora en `xenia-aurora-restore-db`, con comprobación manual de una reserva y sus referencias. Marcelo confirmó que el PMS mantiene la base original.

La recuperación integral con aplicación, datos completos, identidad y retorno probado permanece pausada y pendiente. No se repite la creación de las cinco copias como condición de cada avance documental ni se eliminan copias o servicios durante esta organización.

## Asistente: qué funciona y qué falta

Marcelo mostró conversación, diagnóstico con citas, respuesta cuando el código ya contempla un arreglo y rechazo de pedidos de operaciones directas. También mostró invalidación de una propuesta tras nueva información y corte por cupo. Son resultados concretos de uso del piloto.

La última captura del 23/11 mostraba US$1 diario compartido, US$0,20 consumidos, US$0,80 disponibles, 3/20 respuestas y 2/2 investigaciones. Es una observación fechada, no una consulta actual de la base ni permiso para ampliar los límites. El modelo efectivamente informado por el proveedor, sus tokens por caso y la correspondencia de las versiones publicadas no se acreditan con esa captura.

La evaluación pequeña de US$0,15 sigue **preparada, no ejecutada ni asignada por esta entrega**. `evaluation_revision_not_selected / inferenceEnabled:false` pertenece al job de evaluación; el asistente normal debe evaluarse por separado. Se conserva el guard de revisión. El texto del chat no concede permisos a herramientas ni convierte una propuesta en código aplicado.

El caso real de mesas BIS queda como seguimiento del piloto, con las incertidumbres y la revisión investigada conservadas. La presencia de una corrección en `main` exige comprobar versión y alcance antes de proponer otra; no prueba qué datos reales originaron la incidencia ni autoriza repararlos.

## Próximo trabajo y límites del estado

La [próxima entrega](PROXIMA_ENTREGA_HOTEL_INDEPENDIENTE.md) define administrador de cliente, gestión de personal acotada y alta genérica de otro hotel. Conserva las instalaciones QA aceptadas y exige pruebas entre dos clientes distintos. El [modelo](MODELO_CLIENTES_INDEPENDIENTES.md) diferencia decisión de producto, diseño propuesto y código existente.

Continúan pendientes la continuidad ante caída del panel, integración revisada de las líneas de código, perfil operativo para clientes reales, recuperación completa, fiscalidad e integraciones de cada hotel y medición de costos. La etapa QA todavía verifica el acceso central en cada API; una caída central bloquea temporalmente esas operaciones.

La prioridad del asistente antes del 30/11 permanece. La organización actual prepara el frente multicliente sin presentar su implementación como terminada ni convertir el objetivo del piloto en una fecha de entrega de toda la plataforma.

## Cronología resumida

| Fecha | Hecho o decisión y naturaleza |
| --- | --- |
| 16/11 | Plan inicial, inventario y diferencias de ramas. Hechos de relevamiento; no acreditan despliegues. |
| 17/11 | Marcelo acepta web/correo y panel con dos hoteles y perfiles. Confirmación manual. |
| 18–19/11 | Enlace a PMS QA, corrección de Brisa y edición de fechas/tarifas; PR 130, 139 y 146. Código y pruebas identificados; aceptación manual posterior. |
| 20/11 | Cinco copias y destino PITR reportados; muestra recuperada revisada. Ensayo de aplicación pausado para priorizar el asistente. |
| 21/11 | PR 158 fusionada en la rama del asistente. Hecho de GitHub; las capturas posteriores muestran uso real del chat. |
| 22–23/11 | Conversación, presupuesto y caso real de mesas mostrados por Marcelo. No constituyen una reparación ejecutada. |
| 23/11 | PR 168 y validación automatizada de estadías/Caja; Marcelo acepta ambos PMS y después roles y retirada de acceso. |
| 23/11 | Marcelo aclara y confirma el producto para clientes independientes. Se reemplaza la propuesta inmediata de consolidación gerencial por alta y administración delegada. |

El [estado anterior completo](https://github.com/marcesvetliza-ui/maran-pms/blob/f75721ef7e70b67c754a3286ee22e36d3e8bb55f/docs/xenia/ESTADO_EJECUCION.md) permanece en Git. Las evidencias fechadas anteriores se conservan sin reescribir sus resultados.
