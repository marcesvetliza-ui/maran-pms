# Catálogo vigente de planes Channex

La acción Obtener catálogo reconcilia los planes por su ID remoto, dentro de cada conexión. Renombrar un ID actualiza su título; reemplazarlo retira el ID ausente y crea el nuevo sin trasladar automáticamente sus mapeos.

Los planes ausentes de una lectura completa se marcan `remote_present=false`. Conservan su identidad y vínculo local para trazabilidad, pero no aparecen en la lista de configuración, no se pueden remapear desde esa lista ni se usan para publicar tarifas o asignar nuevas reservas. Si reaparecen con el mismo ID, se restablece su vínculo previo. Las reservas existentes no se eliminan.

La lectura recorre la paginación y rechaza respuestas malformadas, repetidas, truncadas o cuyo total cambia entre páginas. La actualización se serializa por conexión y se aplica en una transacción: un fallo no retira planes. La falta de un plan remoto se comprueba contra sus IDs, nunca por el título ni por la capacidad escrita en su nombre.

Luego de desplegar, actualizar la página y usar Obtener catálogo. Si un plan viejo sigue existiendo en Channex, seguirá figurando como vigente: debe revisarse en Channex, sin borrar por coincidencia de nombres. La conexión permanece desactivada hasta completar la preparación.

Validación: pruebas de cliente con respuestas simuladas, integración PostgreSQL de sincronización (renombre, retiro, aislamiento por conexión, reaparición, catálogo vacío y fallo), exclusión de planes retirados de los valores ARI y regresiones de recepción de reservas.
