# Evidencia y claridad del investigador de Xenia — 2026-11-10

El caso de Consumo Interno localizó correctamente el catch que ocultaba el error,
pero el informe no citaba el origen de la equivalencia que atribuía al servidor.
El límite orientativo de tres citas tampoco cubría bien toda la cadena.

El investigador ahora debe recorrer las dependencias necesarias para sostener la
causa, sin investigar persistencia por rutina. Puede seleccionar hasta cinco
citas breves; debe distinguir generación de un error, propagación HTTP y
presentación. Si sólo comprobó la pérdida del detalle en la pantalla, puede
concluir eso sin afirmar la causa del incidente histórico. El revisor recibe la
misma distinción y exige respaldo del origen de mensajes o estados atribuidos a
una validación. Estas instrucciones orientan al modelo; no constituyen un
verificador semántico determinista.

La respuesta solicita un resumen cotidiano de una o dos frases y reserva los
detalles técnicos para causa y evidencia. Las pruebas propuestas deben indicar
acciones, resultados observables y efectos que se deben conservar, diferenciando
la preparación de ingredientes en pantalla de un movimiento persistido de stock.

Una lectura exacta repetida en la misma investigación devuelve una referencia al
resultado anterior en vez de reenviar su código. Rangos nuevos se leen normalmente;
no se comparte la caché entre casos, no se cachean fallos y la auditoría vuelve a
leer las citas desde CodeSource. Se conservan los límites de turnos, tokens,
herramientas y contexto, la contabilidad de consumo y la revisión independiente.
No se afirma una reducción medida de tokens del modelo real.

Validación: 37 pruebas del investigador y transporte correctas, TypeScript del
servicio correcto y bundle del servicio correcto. Se ajustó la prueba de límite
de contexto para que use cinco rangos distintos: repetir el mismo rango ya no
hace crecer artificialmente el historial con el mismo código.

La suite ampliada terminó con 273 pruebas correctas y 11 fallidas (284 en total).
Encontró 11 fallos en decision-brief, navigation,
grounded-audit e invoice-conflict. Se reprodujeron los mismos 11 fallos en un
worktree limpio de la base a55615b0 (29 pruebas correctas / 11 fallidas en esos
cuatro archivos), sin este cambio. No se presentan como validada toda la suite
ni toda la calidad del asistente. Requieren un seguimiento de los localizadores,
ventanas de evidencia y fixtures tras cambios previos del PMS.

Los proveedores usados son simulados: comprueban el protocolo, la conservación
de evidencia y el aislamiento, no la calidad del razonamiento del modelo real.
Falta solicitar una investigación nueva en el piloto y evaluar su respuesta.
No se modifican informes históricos, Consumo Interno, datos, credenciales,
modelos, facturación ni habilitaciones del servicio.
