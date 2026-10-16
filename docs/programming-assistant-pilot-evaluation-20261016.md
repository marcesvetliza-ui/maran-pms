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

Después de evaluar esta iteración, añadir seguimiento “Resolvió mi consulta” /
“Sigue el problema” sin equiparar el cierre del caso a una reparación automática.
