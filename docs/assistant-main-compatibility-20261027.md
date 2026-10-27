# Compatibilidad del asistente con main — 2026-10-27

Tras sincronizar Xenia, la revisión detectó referencias obsoletas: cambió el mensaje de falta de capacidad fiscal, el catch usa parseApiError y inventoryUnitFactor se movió de server a shared. Además inspectSymbol podía clasificar una invocación simple como definición y desplazar la implementación real.

Se actualizan los anclajes de navegación y se siguen reexportaciones explícitas usando exclusivamente el catálogo autorizado de CodeSource. No se ejecuta código del repositorio. Las pruebas de evidencia viva ubican las instrucciones por anclaje, sin conservar números de línea de otra revisión.

El informe histórico de 50.372 tokens conserva texto y referencias originales. Su prueba verifica ahora la propiedad vigente: completar con auditoría cuando alcanza el presupuesto, o devolver revisión incompleta y sin conclusión cuando no alcanza la reserva de corrección y segunda auditoría. No se eleva el límite ni se elimina esa reserva para forzar el resultado histórico sobre código distinto.

Validación: 18 archivos, 172 pruebas del asistente correctas; TypeScript del PMS y del servicio correctos; bundle del servicio correcto. Proveedores simulados: no se llamó al modelo, a la base operativa ni a servicios fiscales. No se modifican circuitos operativos del hotel.

Publicar únicamente en la rama de Xenia. La prueba real posterior debe confirmar que PMS y servicio del asistente usan la misma revisión y evaluar la utilidad de la respuesta; pasar estas pruebas no demuestra calidad semántica universal.
