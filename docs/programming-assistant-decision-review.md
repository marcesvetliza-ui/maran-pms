# Revisión fundada y respuesta operativa breve

Base del parche: `7dd993bab98b4604d0656269b55ab6cbeccc0b11`.
Rama de trabajo: `fix/assistant-evidence-review`.

## Alcance

Sólo asistente, corpus sintético, pruebas y documentación. No se cambia
facturación, clientes operativos, esquema, base de datos ni despliegues.
No se ejecuta otra tanda pagada antes de revisar este parche.

## Cambio

La revisión deja de depender únicamente de las citas elegidas por el autor.
Para la navegación existente de conflicto de facturación de reservas, se
prepara evidencia de cuatro decisiones, localizada en el código de la revisión:

1. Comparación por importe y estados que consumen/reservan capacidad.
2. Condiciones del helper de descarte.
3. Ramas de identidad y presentación del error en Prefactura.
4. Orden de emisión y pagos guardados.

Cada decisión contiene una pregunta de contraste y referencias a lecturas
reales, no un veredicto precalculado. Los anclajes ausentes y los cortes quedan
marcados. El contexto identifica también las pantallas efectivamente leídas.
Autor, cierre, corrección y auditor usan esas mismas preguntas de contraste.

En la auditoría, ese código comparte el presupuesto de evidencia de 16.000
caracteres con las citas del autor. Las líneas que ya están en el paquete no se
repiten en las citas; se marca `duplicatesInDecisionBrief`. Las lecturas
incompletas o citas omitidas siguen declaradas como tales. Esto prioriza los
caminos de decisión sin subir el techo de tokens ni omitir la reserva de
corrección y reauditoría.

La instrucción orienta una respuesta corta: conclusión, explicación y hasta tres
pasos. Para preguntar al operador debe faltar un dato operativo indispensable
para la conclusión principal y no estar disponible en el caso, la pantalla o
el repositorio. Las comprobaciones futuras no bloquean esa conclusión.

El auditor contrasta sujeto, alcance, condiciones y resultado, y busca también
una interpretación válida antes de rechazar. No exige explicar el algoritmo
de descarte cuando el consejo se limita prudentemente a consultar estados.
No se agregan expresiones prohibidas a los validadores deterministas.

Se conservan esquema estricto, propiedad de `statementId`, cierre seguro,
controles seguro/inseguro, presupuesto y segunda auditoría tras corrección.
Ningún rechazo se convierte silenciosamente en aprobación.

## Corpus conservado y controles positivos

`server/tests/fixtures/assistant-real-reports-7dd993b.json` conserva completos
los tres informes del último lote, sin reescribir sus respuestas. Incluye el
hash SHA-256 del artefacto original y su revisión. Una prueba fija además el hash
del conjunto ordenado de informes.

`server/tests/fixtures/assistant-review-cases.ts` agrega expectativas explícitas
para los tres informes y cinco ejemplos que deben aceptarse:

- Consejo operativo breve sin descripción innecesaria del descarte.
- Descarte condicionado completo, identidad nueva tras confirmación y
  conservación del intento ante incertidumbre.
- Capacidad parcial válida y negación de una garantía de factura única.
- Resultado de una única emisión acotado al fixture leído, no universal.
- Pregunta operativa indispensable cuando se pide determinar un doble cobro real.

Los controles originales seguro/inseguro no se modifican.

### Adjudicación de `real-run-1`

El informe original se conserva íntegro. La expectativa anterior de rechazo se
apoyaba en una descripción incompleta de las condiciones del descarte, no en
una afirmación falsa inequívoca. Se clasifica como **revisión cualitativa**:
`expected.approved=null`, fuera de la puntuación obligatoria de aprobación o
rechazo. Esto no lo convierte en un ejemplo positivo ni anula un rechazo real.

Contraste realizado sobre el código de esta rama, sin modificarlo:

- **Causa:** «hay un intento de descarte condicionado […] por medio de hasClaim
  […] pero no se elimina la intención si el estado no lo permite».
  `client/src/lib/prefactura-submission.ts:61-69` exige conjuntamente rechazo
  400/403/409, invoiceRequest, ausencia de invoice local, creditOperationId
  string y hasClaim=false. La frase no enumera todo, pero tampoco afirma que
  hasClaim sea la única condición ni que se descarte incondicionalmente.
  Exigir la enumeración completa sólo por su brevedad no demuestra un error
  material.
- **Identidad:** `client/src/components/PrefacturaDialog.tsx:1675-1693` cambia
  el ID tras discarded=true y conserva el intento si falla la verificación.
  A diferencia de real-run-3, real-run-1 no afirma que un descarte confirmado
  conserve la identidad. Su consejo de reintento es poco preciso, pero no
  prescribe inequívocamente una operación nueva ante un estado incierto.
- **Cobro:** «no hace cobros automáticos con la emisión» admite dos lecturas.
  `client/src/lib/prefactura-submission.ts:39-59` solicita primero la factura y
  después recorre los pagos guardados. Sería incorrecto asegurar que Prefactura
  jamás procesa pagos tras emitir; el informe no formula esa garantía explícita
  y puede estar separando emisión fiscal de cobro. Se conserva la ambigüedad
  como observación cualitativa, sin imponer una interpretación para rechazar.
- **Capacidad:** `server/billing/routes.ts:1640-1684` considera estados y
  compara importes. La referencia del informe a «misma capacidad fiscal» no
  equivale por sí sola a prohibir documentos parciales válidos.

No se identificó una contradicción material inequívoca suficiente para imponer
el rechazo. Persisten observaciones de precisión, extensión y utilidad, que
deben revisarse sin confundirlas con una falsedad demostrada. No se adjudica
aprobación semántica al informe.

El corpus mantiene ocho casos: **dos rechazos obligatorios**, **cinco aceptaciones
obligatorias** y **uno cualitativo**. El export incluye grupos separados para
evitar que el caso cualitativo se cuente como acierto, fallo o aceptación por
coerción de `null` a booleano. Los siete casos obligatorios no se relabelan.

## Qué prueban las verificaciones sin proveedor

Las pruebas verifican contenido y procedencia del paquete, caminos presentes
aunque el autor no los cite, alcance de pantalla, deduplicación y presupuesto.
Los siete casos obligatorios recorren el protocolo con proveedor simulado.
El caso cualitativo recorre por separado aprobación y rechazo simulados para
verificar que el protocolo no altera el veredicto ni impone una etiqueta.
Un caso cruza informe real rechazado, reemplazo completo breve y nueva auditoría.
La suite previa conserva los casos de presupuesto, IDs, fallo seguro y controles.

**Límite:** simular un veredicto no demuestra que el modelo vaya a emitirlo.
Las etiquetas del corpus son objetivos para la revisión, no precisión semántica
medida. Este parche no certifica corregido el comportamiento del modelo ni
reemplaza una revisión por una persona.

## Comandos

```sh
npm run test:assistant
npx tsc -p services/programming-assistant/tsconfig.json --incremental false
npx tsx script/prepare-assistant-review.ts
```

El último comando no consulta un proveedor: prepara los ocho requests y
expectativas para inspección en
`generated-artifacts/assistant-review/offline-review-corpus.json`.
No contiene credenciales ni consulta datos operativos.

Para reproducir la extracción desde el artefacto original guardado:

```sh
npx tsx script/extract-assistant-regression.ts /ruta/al/7dd993bab98b-1792349196331.json
```

Antes de autorizar otra tanda real, revisar el diff, los informes archivados,
las expectativas negativas, el caso cualitativo y los ejemplos válidos. La
clasificación se justifica contra texto y código antes de observar un veredicto
del modelo; no se cambia para mejorar una tasa de aprobación.
