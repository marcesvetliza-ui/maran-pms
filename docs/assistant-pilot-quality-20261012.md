# Prueba del piloto: calidad del diagnóstico

## Seguimiento general de símbolos y revisión del borrador

Se incorporó inspect_symbol para localizar definiciones y tests por el nombre de la función en el catálogo autorizado, aunque los archivos tengan otros nombres. Devuelve hasta tres definiciones y dos fragmentos de tests, con rangos reales de lectura y redacción de secretos. Los fragmentos son parciales; debe continuar con read_code si no contienen el cuerpo completo y buscar tests por endpoint/comportamiento si no mencionan el símbolo.

Antes de entregar una respuesta válida se solicita una revisión del borrador: comprobar requisitos centrales, seguir funciones delegadas y no sostener en el resumen lo que declara no haber inspeccionado. Esto es una revisión del modelo, no una garantía automática de corrección semántica. La evidencia sigue validándose después. Se reservan dos rondas adicionales (máximo 14); tiempo, tokens y 24 consultas de herramientas mantienen sus límites. Si no alcanza para revisar el borrador, no se guarda una propuesta sin esa revisión.

Pasaron 26 pruebas, TypeScript y empaquetado del asistente, incluidos los tres símbolos de la vista previa y un recorrido simulado borrador → lectura de definición → conclusión. Repetir la consulta «Vista previa de consumo interno» después del despliegue para verificar uso real por el modelo. No se ejecutó OpenAI en la validación local.

Mantener ambos servicios del piloto en `fix/assistant-diagnostic-format`. Esta actualización conserva la corrección de formato y no modifica producción.

## Consulta 1: descuento general

Título: Descuento general sin alterar costo por artículo

Módulo: Compras

Qué ocurrió: Quiero verificar el comportamiento existente, no reportar un error. Ejemplo ficticio: factura A con neto $1.000, IVA 21 % de $210, sin percepciones ni otros conceptos. Diez unidades del mismo artículo a $100 por unidad, en su unidad base, sin conversión. Aplico 10 % de descuento general.

Qué esperaba: Total $1.089: neto $900 e IVA $189. El costo de stock debe seguir en $100 por unidad. Al editar y guardar de nuevo, el descuento no debe aplicarse dos veces. Verificá el flujo y las aserciones existentes, sin ejecutar operaciones ni pruebas.

Pasos: Cargar importes y renglón → aplicar descuento → guardar → editar y volver a guardar.

Criterios: explicar cálculo, persistencia y restauración con citas precisas; no volver a preguntar si se espera conservar el costo; reconocer cualquier tramo que no haya inspeccionado; distinguir pruebas leídas de ejecutadas. Puede presentar propuesta lista si respondió lo principal.

## Consulta 2: reintento de producción

Título: Reintentar producción sin duplicar stock

Módulo: Producción / Inventario

Qué ocurrió: Quiero verificar qué hace el sistema cuando una producción queda pendiente por falta de materia prima. Después de reponerla, dos usuarios presionan reintentar casi al mismo tiempo sobre la misma producción pendiente.

Qué esperaba: Que el insumo se descuente una sola vez y el elaborado ingrese una sola vez; si todavía falta stock, que no se aplique un movimiento parcial. Investigá los controles del servidor y las pruebas existentes. No registres movimientos ni ejecutes pruebas.

Pasos: Producción con faltante → reposición → dos reintentos de la misma solicitud.

Criterios: seguir pendiente, reintento, transacción y movimientos; citar los controles y distinguir una aserción existente de una ejecución real; no pedir al usuario rutas del código. Si falta evidencia, declararla sin inventar una garantía.

## Control opcional de falta de información

Nueva consulta: «Veo una cantidad de stock que no coincide con la realidad». Sin identificar artículo, depósito, operación o cantidades. Debe pedir datos concretos anonimizados necesarios para investigar el caso; no afirmar que encontró una causa específica.

## Cambios

- Conclusión primero y uso de requisitos ya informados.
- Preguntas solo indispensables, sin ampliar alcance automáticamente.
- Estado pendiente basado en falta de información declarada, no en la mera existencia de preguntas.
- Etiqueta «Consultas adicionales» si las preguntas no bloquean la conclusión.
- Limitaciones breves y relevantes; separación entre descuento y conversión.
- Los tests leídos no se presentan como ejecutados.

La mejora de lenguaje se comprobará con consultas reales al modelo. Las pruebas locales verifican el estado persistido, las validaciones y el código de soporte, sin llamadas a OpenAI.

## Corrección posterior: citas de lecturas contiguas

Un rechazo de evidencia apareció en la nueva consulta. Sin los logs del caso no se identifica su rango concreto. La revisión encontró dos defectos reproducibles: citas que abarcan lecturas contiguas se rechazaban al exigir una única lectura, y una corrección tardía no podía usar herramientas para completar evidencia. Se validan ahora todas las líneas de la unión de lecturas, sin admitir huecos; la corrección puede volver a leer dentro de los límites existentes de consultas, tiempo y rondas. No se aceptan ni se recortan silenciosamente citas inventadas.

Pasaron 20 pruebas del soporte, incluidas lecturas desordenadas/contiguas, solapamientos, huecos, líneas fuera de rango y recuperación al final de la investigación. TypeScript y empaquetado del asistente aprobados. La consulta real debe reintentarse después de que PMS y asistente estén activos en la misma revisión.

## Consulta en módulo «otro»

El texto nuevo no incluye «compra» o «proveedor», por lo que no activaba las lecturas iniciales de Compras. Se agregó detección de factura + descuento + stock/artículo/unitario, sin asumir una conclusión comercial. Se probó el texto recibido, un descuento de reserva que no debe activar Compras y una producción pendiente sin módulo seleccionado. Los fragmentos iniciales se explicitan como lecturas válidas con sus rangos. Pasaron 23 pruebas, TypeScript y empaquetado del servicio. La navegación corregida no garantiza por sí sola la calidad de la respuesta real; se vuelve a comprobar después del despliegue.

## Seguimiento de funciones y pruebas integradas

Se agregaron lecturas del cuerpo de registerProductionRun, del contexto de transacción y de las pruebas integradas con Promise.all. Compras incluye puntos concretos de restauración en el formulario y aplicación en endpoints. Las búsquedas localizan líneas actuales; no se guardan números de línea fijos. Los fragmentos siguen sujetos a catálogo, redacción y validación de rangos. El modelo debe continuar si un fragmento no cubre todo el cuerpo, no inferir rollback de comentarios ni recomendar tests ya presentes. Pasaron 23 pruebas, TypeScript y empaquetado del asistente.

Consulta adicional: **Vista previa de consumo interno**. Qué ocurrió: «Antes de registrar un consumo interno, cargo una receta que usa 500 gramos de un insumo cuya unidad de stock es kg y elijo tres porciones. Quiero verificar qué hace esa vista previa; todavía no confirmo el consumo». Qué esperaba: «Que calcule 1,5 kg sin descontar stock ni crear movimientos. Si una unidad no tiene equivalencia, debe avisar y no tratarla como si fuera kg. Revisá el endpoint, las funciones llamadas y las pruebas existentes, sin ejecutar operaciones ni pruebas». Elegir módulo Inventario. Verificar que distinga vista previa de consumo confirmado y cite la conversión y las aserciones pertinentes sin afirmar que las ejecutó.

## Presupuesto y cierre de investigación

La captura posterior muestra agotamiento de investigación, sin identificar si fue por consultas, rondas o tokens. Se reserva una fase de cierre desde la ronda 12; después de cerrar no se reabren herramientas. Antes de la revisión del borrador se reservan cuatro consultas; el máximo global sigue siendo 24. Un lote excesivo recibe respuestas explícitas indicando qué consultas no se ejecutaron, en vez de abortar todo. Al acumular 50.000 tokens se cierra la búsqueda para reservar espacio a la conclusión/revisión, manteniendo el límite duro de 100.000. Las consultas idénticas remiten al resultado previo del historial sin retransmitir contenido. La validación de formato y citas sigue siendo obligatoria; no se fabrica una propuesta si no pasa.

Pasaron 28 pruebas, TypeScript y empaquetado: incluye lote de 28 herramientas limitado a 20 lecturas, cierre por tokens, revisión de respuesta parcial y lecturas repetidas sin duplicarlas. No garantiza que el modelo complete una consulta real: repetir la vista previa, con el mismo texto, tras desplegar ambos servicios en la nueva revisión.

## Seguimiento automático de rutas del cliente

Una lectura de read_code en client/src que contiene una ruta literal /api/... adjunta ahora su contexto de servidor, sin depender de que el modelo encuentre el archivo por nombre. Se localiza la declaración de app/router, se lee el handler hasta la próxima ruta o el límite de fragmento, se leen hasta cuatro funciones importadas que aparecen llamadas en el handler y una prueba que menciona el endpoint. Máximo tres rutas por investigación, con fragmentos acotados; no se ejecutan llamadas HTTP ni código. Las rutas dinámicas, alias de routers no reconocidos y dependencias indirectas requieren las herramientas habituales. Los rangos anexados son lecturas reales y se validan igual que las demás citas.

Pasaron 30 pruebas, TypeScript y empaquetado, incluida la ruta real de vista previa y una investigación simulada donde leer el cliente entrega evidencia del servidor. La respuesta real sigue pendiente. Se debe repetir el mismo caso, sin reformularlo.
