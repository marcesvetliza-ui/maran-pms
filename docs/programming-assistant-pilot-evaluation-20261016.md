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
