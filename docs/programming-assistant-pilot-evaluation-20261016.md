# Primera iteración de evaluación del piloto — 16/10/2026

Seguimiento del cierre con corrección y reauditoría:
[recorrido completo y evaluación real repetible](programming-assistant-complete-validation.md).
Este documento conserva los resultados históricos de aquella iteración.

Alcance: Xenia/demo, rama `fix/assistant-diagnostic-format`. No incorporar a main.
El asistente conserva únicamente herramientas de lectura de código: no ejecuta
pruebas ni operaciones y no recibe acceso a la base del hotel.

## Cambios

- Compactar lecturas que se solapan, conservando la primera copia de cada línea,
  las líneas nuevas, rangos y protocolo de herramientas. No borrar evidencia única.
- Antes de gastar el último presupuesto de revisión, conservar el borrador que ya
  pasó validación de esquema y referencias, marcado **Revisión parcial** y
  `falta_informacion`. No presentar esa salida como propuesta definitiva; no
  conservar una reparación de datos propuesta en un borrador sin revisión final.
- Si una revisión posterior alcanza el límite de tokens, rondas o longitud,
  recuperar ese borrador. Sin borrador validado, conservar el error explícito.
  Errores de autenticación, red o citas inválidas no se ocultan como éxitos.
- Registrar contadores de investigaciones completadas (tokens, consultas, número
  de archivos y certeza), sin texto del caso, lecturas, datos personales ni claves.

Esto no garantiza que toda consulta termine ni aumenta el límite de 100000
 tokens. Las lecturas de orientación aún pueden ser grandes; si no existe un
borrador válido, la investigación puede fallar. No se añade acceso a operaciones.

## Batería de casos sintéticos

Las consultas y rúbrica están en
`services/programming-assistant/evaluation-cases.ts`:

1. Ingrediente en cajas sin equivalencia: transporte y presentación del error.
2. Cambio de habitación con superposición: rechazo, conservación y fechas contiguas.
3. Dos operadores facturando un cargo: protección y explicación del 409.
4. NC y refacturación: facturar pendiente no significa cobrar nuevamente.

Los resultados esperados son criterios de evaluación, **no evidencia que se
inyecta al modelo ni conclusiones prefijadas**. Cada ejecución usa la revisión
exacta del código del piloto. No se presuponen cambios que existen sólo en main.

## Evaluación en demo

Crear un caso por consulta sintética. Agregar a cada una: “Sólo inspección de
código; no ejecutar operaciones ni pruebas”. Mantener iguales los textos en
comparaciones posteriores. No cargar datos personales o comprobantes reales.

Registrar por caso: revisión, modelo, duración, tokens, consultas, conclusión,
citas, requisitos pendientes y si terminó completo/parcial/fallido. Revisar:

- Que la conclusión responda a lo pedido y cada cita respalde su afirmación.
- Que distinga test leído de test ejecutado, función pura de integración y
  coincidencia de código de reproducción del problema.
- Que no afirme ausencia de pruebas sin buscarlas ni recomiende reimplementar
  comportamientos correctos.
- Que no recomiende cobros duplicados, devoluciones implícitas por una NC,
  acciones operativas ni cambios sin revisión humana.
- Que el parcial conserve avance e indique qué revisión falta, sin pedir al
  usuario que adivine nombres de archivos.

Las pruebas automáticas con modelo simulado verifican protocolo, conservación y
navegación. **No validan la calidad del modelo real ni ejecutan los casos del hotel.**
La evaluación real requiere solicitar esos cuatro diagnósticos en el demo.

## Publicación

PMS y servicio `programming-assistant` deben usar el mismo commit completo; el
servicio rechaza revisiones distintas. Publicar ambos desde la rama piloto y
comprobar `/health` del asistente y el estado del gateway antes de evaluar.
No cambiar la base, claves ni habilitar herramientas de escritura para esta
iteración. No se hicieron solicitudes pagadas a OpenAI desde estas pruebas.

## Seguimiento de utilidad

Debajo de cada diagnóstico se muestran “Resolvió mi consulta” y “Sigue el
problema”. La elección se guarda con el identificador de ese diagnóstico y
fecha, y queda en el seguimiento. No cierra el caso ni solicita un análisis al
modelo. Se puede agregar un mensaje con los detalles pendientes y después
solicitar explícitamente otra investigación.

Cada resultado nuevo tiene un ID propio. Una evaluación enviada desde una
pantalla desactualizada recibe conflicto, en vez de asociarse a otra respuesta.
Los diagnósticos anteriores a este cambio usan su revisión como ID de legado;
al generar el próximo diagnóstico reciben un ID único. Los reintentos con el
mismo requestId no duplican la evaluación y no pueden cambiar su contenido.
El propietario se obtiene de la sesión del PMS, no del cuerpo de la solicitud.

Se guarda en el JSON del caso en la base separada del asistente; no requiere
migraciones del PMS ni acceso a datos del hotel. El diagnóstico de estado
“Falta información” admite evaluación de utilidad sin presentarlo como cerrado.
La evaluación es informativa; el límite de investigaciones sólo cuenta analyze.

Verificación local: pruebas de interfaz para ambas respuestas y pérdida de
respuesta HTTP; pruebas PostgreSQL de persistencia, propietarios, concurrencia,
reintentos, conflictos y diagnósticos desactualizados; pruebas del gateway de
sesión y validación estricta. No se usó OpenAI real.

## Ajuste tras el primer diagnóstico real de equivalencias

El resultado de la revisión `38e0788d` terminó, pero atribuyó la ausencia de
configuración a `convertInventoryQuantity` y preguntó por una pantalla existente.
El transporte del error y el uso propuesto de `parseApiError` sí coincidían con
el código de esa revisión. No se considera un caso aprobado.

La revisión final ahora recibe los fragmentos reales citados, con límite conjunto
de 16000 caracteres, además del borrador. La consigna de revisión se envía como
instrucción de sistema separada: comprobar afirmación frente a cita, localizar la
instrucción que origina el mensaje y eliminar preguntas que el repositorio puede
resolver. Una lectura recortada u omitida se marca como tal, sin simular una
revisión completa. No se agrega una llamada adicional al modelo ni se eleva el
presupuesto existente.

Para el flujo de error de recetas, la orientación incluye las definiciones de
`unitFactor`, `inventoryUnitFactor`, `convertInventoryQuantity`, el componente
`InventoryUnitConversions` y su uso real en la pantalla. Son lecturas del código,
no conclusiones prefijadas ni permisos de ejecutar operaciones.

Las pruebas automáticas comprueban que el revisor recibe esas lecturas, preserva
rangos válidos y respeta el límite. **No demuestran que el modelo real corregirá
siempre una atribución equivocada.** Hay que repetir la consulta después de
confirmar que PMS y asistente ejecutan esta nueva revisión, y comparar:

- La ausencia de equivalencia se atribuye a `inventoryUnitFactor`, llamada por
  `unitFactor`; la multiplicación/validación numérica se distingue de esa búsqueda.
- La propuesta muestra el detalle con el parser existente.
- No se pregunta si existe una pantalla de equivalencias ni por políticas que
  pueden encontrarse en el código.
- Las citas respaldan exactamente lo afirmado y no se declara ejecución de tests.

Este ajuste modifica el investigador del piloto, **no corrige el toast de
Inventario ni cambia la operatoria del hotel**.

## Comprobación explícita de la atribución repetida

El segundo diagnóstico real (`7d43f813`) volvió a atribuir el error a
`convertInventoryQuantity`. Las instrucciones y la revisión del propio modelo
no bastaron. Se incorpora por eso un control de regresión acotado al error de
equivalencia faltante de este módulo:

- Lee `server/inventoryUnits.ts` desde el catálogo autorizado y localiza la
  función exportada que contiene la instrucción directa `throw` con ese mensaje.
  Los nombres de la función propietaria y de las otras funciones se obtienen
  del código actual; no se fija como respuesta un nombre de función.
- Comprueba atribuciones explícitas en resumen, causa y explicación de cada cita.
  Distingue negaciones y explicaciones correctas de multiplicación numérica.
- Si encuentra una atribución incompatible, devuelve al modelo la instrucción
  real y la función propietaria para corregir el diagnóstico. Cambiar sólo la
  certeza a hipótesis no habilita una afirmación que ya se detectó equivocada.
- Tras dos correcciones fallidas rechaza el informe por evidencia no verificable.
  Un borrador con esa contradicción no se guarda como avance verificado ni se
  convierte en diagnóstico parcial al alcanzar un límite.

El control no ejecuta el código y **no es un verificador semántico general**:
abarca este patrón, este módulo y atribuciones explícitas reconocibles. Si el
módulo cambia de estructura o el mensaje usa otra construcción, no se infiere un
origen. Conserva las validaciones generales de citas y revisión humana. No
promete detectar todas las paráfrasis ni otros tipos de afirmación equivocada.

Regresiones automatizadas: textos de los diagnósticos recibidos, atribución
errónea en evidencia, certeza rebajada sin corregir, distinciones válidas,
funciones renombradas en código sintético, modelo simulado que insiste (rechazo)
y modelo simulado que corrige (entrega tras revisión). La calidad del modelo real
requiere otra evaluación después del despliegue. No se modificó Inventario.

## Controles tras evaluar el cambio de habitación

El informe de `9d460891` citó `server/routes.ts:559–584` como el PATCH de reservas,
pero esas líneas pertenecían a otro recorrido. Además afirmó pruebas unitarias de
`checkOverbooking` sin citar aserciones de ese método. El test leído de fechas
contiguas prueba `isRoomAvailableForInterval`, no la persistencia ni el PATCH.

Se incorporan dos comprobaciones acotadas antes de aceptar el borrador:

- Cuando una explicación de evidencia afirma explícitamente ser un endpoint con
  método HTTP, se compara su rango con el registro literal `app/router` que lo
  contiene en ese archivo. Se verifica método, ruta y que no cruce otra ruta.
  Puede citarse el interior del handler sin incluir la línea de registro. Si el
  endpoint no está escrito en esa explicación, sólo se infiere cuando el informe
  menciona uno único, evitando adivinar entre varios recorridos.
- Las afirmaciones explícitas de pruebas para una función identificada requieren
  una cita de test operativo con una aserción directa sobre esa función. Se
  excluyen las pruebas del propio investigador. Una aserción sobre otra función
  no demuestra el método de almacenamiento ni una integración HTTP.

El modelo recibe el conflicto y debe corregir el informe completo. Dos intentos
fallidos causan rechazo por evidencia; bajar la certeza no permite conservar la
contradicción. Los límites de consultas, tokens y rondas se mantienen. No se
modificó el funcionamiento de reservas ni se ejecutaron operaciones del hotel.

Límites: registros de ruta reconocibles como literales `app/router`; no se intenta
resolver montajes dinámicos. La comprobación de tests reconoce nombres explícitos
y aserciones directas `expect/assert`, no toda forma de prueba (por ejemplo,
aserciones sobre variables intermedias). Si una prueba usa otra forma, el informe
puede explicar lo que contiene sin atribuir una cobertura no demostrada. No se
verifica automáticamente toda afirmación en lenguaje natural ni se demuestra
inexistencia de pruebas. Sigue siendo necesaria la evaluación del modelo real.

La orientación del cambio de habitación también pide distinguir texto fijo del
catch frente al detalle del servidor, cierre por éxito frente a error y explicar
las comparaciones de fechas. Estos puntos requieren revisión de la respuesta;
no se presentan como garantías de un verificador semántico general.

## Presentación del alcance y las aserciones realmente citadas

Tras el informe de `ad1ee123`, el diagnóstico central de disponibilidad fue útil,
pero aún faltaban las aserciones y delimitar la pantalla. Se incorporan mejoras
comunes a los diagnósticos nuevos, sin modificar el circuito de reservas:

- El servidor agrega a las evidencias de tests hasta tres fragmentos que contienen
  aserciones reales de sus líneas citadas, con números de línea. Usa sólo rangos
  ya validados; descarta fragmentos que pudieran venir del modelo y los reconstruye
  desde el catálogo autorizado. No ejecuta los tests ni infiere resultados.
- Los fragmentos están limitados a 2500 caracteres cada uno y 10000 en total, y se
  marcan parciales cuando corresponde. La extracción reconoce patrones comunes de
  `expect/assert`; no es un parser completo y puede no extraer otras formas. La
  ausencia de un fragmento no demuestra ausencia de pruebas ni su ejecución.
- Se muestran dentro de “Evidencia consultada” → “Aserciones leídas — sin ejecutar”.
  La salida del modelo no necesita repetir esos bloques, evitando más gasto de
  tokens. Los diagnósticos históricos sin fragmentos se siguen mostrando.
- La interfaz muestra las pantallas reconocidas por los archivos de producción
  citados. Por ejemplo, `planning-reservation-detail.tsx` corresponde a Planning,
  no demuestra el editor de Reservas. Los helpers o tests no se etiquetan como
  pantallas completas. La revisión recibe ese alcance y el informe conserva una
  limitación explícita sobre otras pantallas y sobre validación integral de UI.

La pantalla citada identifica evidencia parcial, no cobertura completa. Estas
mejoras no garantizan por sí mismas que toda explicación del modelo sea correcta
ni que exista una prueba integrada para conservar la reserva original. Continúa
pendiente evaluar los casos de concurrencia en facturación y NC/refacturación,
y después los mismos problemas narrados en lenguaje cotidiano con poco detalle.

## Ajuste del caso de facturación concurrente

El primer informe de `1fcd892d` identificó el rechazo de saldo, pero no cubrió
cobros ni pantalla y propuso una prueba concurrente ya existente. Para consultas
cotidianas de Recepción/Facturación con dos personas, sesiones o saldo insuficiente:

- Se orienta hacia el mensaje real de validación, el bloqueo y su implementación,
  el orden de emisión/pagos del helper de Prefactura y el catch de la pantalla.
  No se precargan por defecto recorridos de SPA o grupos para justificar un caso
  de reserva. Las consultas específicamente clasificadas en esos módulos no
  reciben esta orientación de Recepción.
- Se localiza el archivo de concurrencia del catálogo, leyendo tanto sus mocks
  como el bloque `Promise.all` y sus aserciones de estados y cantidad de emisiones.
  Esto es descubrimiento de evidencia, no una conclusión de que el caso del
  usuario tuvo ese resultado.
- La revisión final recibe una lista de cobertura (factura, cobro, interfaz,
  pruebas existentes, qué puede comprobar el operador). También recibe lecturas
  de tests ya consultados aunque no estén citados en el borrador, con límite
  conjunto de 8000 caracteres y marca de lectura parcial cuando corresponde.

El revisor debe distinguir prueba HTTP con persistencia/emisor simulados de
PostgreSQL o ARCA reales. Un 409 no demuestra cuántos cobros existen en el caso
concreto; el asistente no tiene acceso a Caja ni a documentos operativos. Debe
explicar ese límite y proponer consultar comprobantes y movimientos antes de
repetir una operación. `paymentId` no se supone informado por el usuario ni se
presenta como la única protección contra duplicados.

Las pruebas locales verifican descubrimiento del test existente, sus mocks,
aserciones, helper de pagos y catch; conservación de esa evidencia para la
revisión y exclusión de la orientación de Recepción para un caso SPA. No se hizo
una consulta a OpenAI ni se probó una operación financiera real. Estos cambios
mejoran navegación/cobertura; no son un verificador determinista de toda conclusión
ni garantizan que el modelo vaya a responder correctamente sin nueva evaluación.

## Coherencia financiera de conclusión y consejo al operador

El informe de `7ffb3537` reconocía no disponer de registros reales, pero luego
indicaba interpretar que “no existe doble cobro”, describía una “emisión real”
en una prueba simulada y sugería reintentar ante duda. Se añaden comprobaciones
explícitas de esas formas de afirmación/recomendación antes de aceptar el borrador:

- Una afirmación categórica no atribuida al código/test sobre ausencia de doble
  cobro o doble factura no queda respaldada por la lectura de un 409. Debe
  distinguirse protección implementada de resultado del incidente concreto.
- Una prueba leída/simulada no debe presentarse como emisión fiscal real.
- Una recomendación de reintentar o reemitir por duda, anomalía o estado incierto
  se devuelve para corrección si no distingue consulta de estado y recuperación
  de la misma operación frente a otra emisión. Mencionar sólo `operationId` no
  demuestra que se conserve la identidad de la operación.

El control comprueba resumen, causa, propuesta y explicaciones de evidencia,
conservando negaciones y explicaciones con alcance de código/test. El revisor
recibe el conflicto y debe corregir todo el informe; cambiar sólo la certeza no
lo elude. Tras dos correcciones fallidas no se publica esa respuesta como válida
ni como borrador verificado. Se mantiene el límite global de rondas/tokens.

Son reglas de lenguaje acotadas para los errores observados, **no un verificador
semántico universal**: no detectan todas las paráfrasis ni demuestran coherencia
de cualquier texto posible. El asistente sigue sin acceso a registros reales.
La recomendación correcta ante incertidumbre es consultar documentos/movimientos
y, si existe una operación pendiente, recuperar esa misma operación sin crear otra.
Las pruebas cubren los textos recibidos, negaciones, recuperación explícita,
consejos no financieros y modelos simulados que insisten o corrigen. No implican
emisión real, consulta a Caja ni evaluación de OpenAI real.

## 17/10 — Revisión semántica separada del informe completo

El resultado real de `0fa16375` conservó la contradicción con otra redacción:
“no se ha duplicado la facturación ni el cobro”. No se amplía esa lista de frases
como solución principal. Se incorpora una solicitud separada al modelo configurado,
con contexto propio de revisor, después de las validaciones y revisión de cobertura:

- Recibe el caso, el diagnóstico completo, código citado y lecturas de pruebas.
  No recibe el historial de razonamiento del redactor ni herramientas, acceso a
  la base o capacidad de ejecutar operaciones. Usa el mismo modelo configurado;
  contexto separado no significa un segundo proveedor ni garantía de independencia
  estadística.
- Devuelve un veredicto estructurado. Cada rechazo debe señalar campo, cita textual
  exacta de ese campo, problema y corrección. El servidor comprueba el formato,
  presencia de la cita y coherencia del veredicto: aprobar con observaciones o
  rechazar sin observaciones es inválido. No acepta citas inventadas del informe.
- Un rechazo vuelve al redactor para corregir todo el diagnóstico. La corrección
  también necesita otra aprobación. Tras dos auditorías rechazadas se informa un
  fallo de coherencia y no se publica una conclusión válida.
- Se revisa la consistencia entre resumen, propuesta, evidencia y limitaciones:
  hechos operativos desconocidos frente a protección del código, simulación frente
  a emisión real y recuperación de operación frente a otra emisión por duda.

La auditoría añade una solicitud normal por diagnóstico, como máximo dos cuando
hay corrección. Sus tokens se suman al mismo presupuesto de 100000; no se aumenta
ese límite ni el cupo diario de investigaciones. Se reserva cierre antes y se
estima conservadoramente el costo antes de solicitar la auditoría. No hay nuevas
variables, modelos, credenciales, migraciones ni herramientas de escritura.

Si no queda presupuesto para completar la revisión, el parcial conserva sólo
referencias consultadas y mensajes neutros: **no conserva la conclusión, causa,
propuesta operativa ni preguntas del borrador no auditado**. Errores del proveedor
o veredictos inválidos no se convierten en aprobación. Los logs sólo agregan el
contador de auditorías; no registran informe ni comentarios completos del revisor.

Las regresiones cubren precisamente la paráfrasis que el filtro previo dejó pasar,
revisor separado sin herramientas, informe completo y evidencia en su contexto,
rechazo persistente, corrección con nueva aprobación, citas de auditor inventadas,
veredicto contradictorio, autenticación fallida y presupuesto insuficiente o
excedido. Los tests previos de navegación/formato aíslan la auditoría con un mock
explícito; las pruebas nuevas ejercitan su protocolo con respuestas de aprobación
y rechazo controladas. **No se consultó al modelo real en estas pruebas.**

La revisión semántica sigue siendo probabilística y puede equivocarse. Esto
verifica que el sistema exige y respeta su veredicto; no demuestra que el modelo
real detectará toda contradicción. Falta repetir el caso en el piloto actualizado.

### Fallo real de la auditoría: diagnóstico insuficiente del propio servicio

El intento del modelo `gpt-4.1-mini` terminó con `diagnosis_audit`, 5 rondas,
9 consultas de código y 73.879 tokens. Ese código indica respuesta inválida o
incompleta del revisor, no rechazo semántico del informe. El log anterior no
permite distinguir truncamiento, JSON, esquema, contradicción del veredicto o
cita inexistente: no se atribuye una causa concreta sin esa evidencia.

Se amplió la salida máxima del revisor de 1.600 a 3.200 tokens, contabilizada en
el preflight del presupuesto total existente. Las cuatro observaciones posibles
incluyen citas y explicaciones; el margen anterior podía truncarlas. No se
eliminan controles ni se publica una respuesta sin aprobar. El servicio registra
ahora `auditReason` con seis etiquetas permitidas, sin texto del modelo ni código
consultado. Regresiones simuladas cubren cada etiqueta y el límite de salida;
queda pendiente repetir el caso con el modelo real tras desplegar ambos servicios
en la misma revisión.

### Revisión parcial con 63.824 tokens

El siguiente intento real devolvió sólo referencias, con 12 consultas de código,
9 archivos y una auditoría intentada. No había agotado los 100.000 tokens; el
control de reserva podía detener el cierre antes del límite total. El log no
registraba cuál de las salidas parciales lo provocó; no demuestra si la auditoría
consumió tokens o sólo llegó a su preflight.

Se compactó el paso de autorrevisión: recibe caso, borrador, checklist, código
citado refrescado, tests consultados y rangos autorizados, sin volver a transmitir
el historial exploratorio completo. Conserva herramientas de sólo lectura y el
registro de procedencia en CodeSource. El costo medido del contexto anterior ya
no se usa como estimación de ese contexto nuevo. Se mantienen validadores,
auditoría separada y límite global. El log de finalización agrega `partialReason`
para diferenciar reserva de cierre, reserva de auditoría y límites efectivamente
alcanzados.

Una regresión simulada reproduce un prompt previo de 22.000 tokens y 65.000 ya
consumidos: el contexto de revisión conserva caso y evidencia, y termina con
aprobación independiente dentro del presupuesto (70.500 tokens simulados).
124 pruebas aprobadas, TypeScript y compilación del servicio correctos. Esto
verifica el protocolo y el manejo del presupuesto, no la calidad del modelo real.

### Auditoría inválida por esquema

El nuevo intento real falló con `auditReason: invalid_schema`, a los 52.913
tokens (5 rondas, 8 consultas). Se detectó una divergencia comprobable del
contrato: el esquema JSON enviado al proveedor no limitaba los strings, mientras
Zod exigía quote de 1–800 caracteres y problem/correction de 1–600. Un resultado
válido para el proveedor podía ser rechazado localmente. El log de ese intento
no identifica el campo, por lo que no se afirma que una longitud específica lo
haya provocado.

Se igualaron esos límites en el esquema enviado y las instrucciones. No se
recortan ni aceptan respuestas inválidas. Los errores de esquema registran sólo
hasta cuatro rutas/códigos permitidos (por ejemplo issues.item.quote/too_big),
sin valores ni texto del modelo. Las regresiones verifican el contrato enviado,
aceptación en los límites, rechazo por exceso y sanitización del log. La batería
suma 129 pruebas aprobadas; no incluye una llamada real a OpenAI.

### Corte previo a la auditoría con 67.097 tokens

El usuario informó otro cierre parcial con 67.097 tokens, 13 consultas y cero
auditorías intentadas. El bloque pegado no incluye `partialReason`, por lo que
no prueba qué rama produjo esa salida. Sí se reprodujo el corte por reserva de
cierre usando ese consumo, las cinco referencias de la respuesta y un informe
extenso válido: el guard anterior devolvía referencias neutrales sin siquiera
intentar una auditoría que cabía en el saldo disponible.

Ahora la reserva de otra pasada del autor no impide usar el presupuesto para
revisar directamente el borrador que ya pasó procedencia, atribución, citas y
coherencia determinista. Se usa el mismo finalizador auditado que en el camino
normal. La auditoría recibe también el checklist del caso y criterios de alcance,
pruebas y preguntas operativas. No obtiene herramientas ni acceso operativo.
Su preflight conserva el límite total y puede rechazar la solicitud si no cabe.
Si rechaza el informe, la corrección se prepara con un contexto nuevo y acotado;
si no cabe esa corrección más su revisión, se conserva la salida neutral. Nunca
se publica por el solo hecho de no tener presupuesto.

Dos regresiones usan 67.097 tokens simulados y las cinco citas: aprobación termina
con 68.597 y una auditoría; rechazo conserva el informe neutral sin publicar la
recomendación. 131 pruebas aprobadas, TypeScript y bundle del servicio correctos.
No se llamó al modelo real: sigue pendiente evaluar su respuesta en el demo.

### Revisión rechazada por transcripción de citas (`quote_mismatch`)

El intento real llegó al revisor pero falló al exigir que su cita fuera una
subcadena idéntica del campo indicado (76.555 tokens, 5 rondas, 6 consultas).
El log no conserva la cita y no permite saber si hubo paráfrasis, cambio de campo
o diferencias tipográficas. La coincidencia textual era una responsabilidad
innecesaria del modelo: ya se dispone del informe original en el servidor.

El contrato interno de auditoría ahora devuelve `statementId`, elegido de un
enum generado para ese informe, más problema y corrección. El servidor fragmenta
el texto completo en orden sin omitir caracteres, mantiene límites de arrays y
propiedad de las referencias, y reconstruye `field` y `quote` desde el ID. El
modelo no puede aportar una cita alternativa ni un campo incompatible con ese
ID. No se envía una segunda copia del diagnóstico: los fragmentos constituyen
el informe completo; las referencias de evidencia conservan archivo y líneas.
La numeración es local a cada solicitud y se renueva para cada informe corregido.

La revisión semántica sigue siendo obligatoria. Referencias desconocidas,
propiedades extra o veredictos incoherentes se rechazan; no se normalizan
paráfrasis ni se aprueba por falta de formato. Continúan los mismos límites,
preflight, identidad del caso y ausencia de acceso operativo. Sin cambios en
HTTP, esquema de base, UI ni main.

132 pruebas aprobadas. Se verifican conservación Unicode y arrays, enum de IDs,
reconstrucción de citas, rechazo de referencias inexistentes y de citas forjadas,
aprobación/rechazo/corrección y reserva de presupuesto. TypeScript y bundle del
servicio correctos. No se llamó a OpenAI real; la calidad del criterio del modelo
continúa pendiente de evaluación en el demo.
