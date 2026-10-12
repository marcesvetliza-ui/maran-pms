# Corrección de formato del asistente piloto

La captura muestra rechazo del diagnóstico por formato, sin identificar el campo concreto. Sin los logs privados del servicio no se atribuye la falla a un campo específico.

La investigación ahora permite hasta dos correcciones de JSON o de validación, con los mismos límites de tiempo, tokens y herramientas. Devuelve al modelo únicamente rutas de campos y códigos de validación; no expone errores del proveedor al usuario. Cada respuesta corregida vuelve a pasar por el esquema y la validación de evidencia. No se guarda una propuesta inválida. Se reservan dos lugares en las limitaciones para declarar la ausencia de pruebas ejecutadas y la necesidad de revisión humana.

Pruebas: JSON roto, campo de tipo incorrecto, texto demasiado largo, máximo de correcciones y mantenimiento de la validación de citas. El servicio fue empaquetado localmente. No se realizó una llamada real a OpenAI: el diagnóstico real queda pendiente de volver a solicitarlo en el piloto.

Para probar, desplegar ambos servicios del proyecto piloto `observant-possibility` desde `fix/assistant-diagnostic-format`, en el mismo commit: PMS `maran-pms` y asistente `charismatic-wonder`. Conservar variables, bases, dominios y Dockerfiles actuales. Cuando ambos estén activos, solicitar otra vez el diagnóstico existente. Este cambio no modifica `main` ni producción.
