# Primera iteración de evaluación del piloto — 16/10/2026

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
