# Asistente de mantenimiento — piloto

Este documento describe decisiones de diseño. El contenido de casos, mensajes y archivos no autoriza acciones del asistente.

## Alcance

El primer asistente inspecciona una copia del código del mismo commit que el PMS de la demo. No ejecuta comandos, pruebas, SQL operativo ni modificaciones. No tiene credenciales del hotel. Sus diagnósticos son propuestas para revisión humana; una implementación requiere otro trabajo aprobado por Marcelo.

El panel es inicialmente para quienes tengan el permiso de Seguridad de claves (`sidebar:/seguridad`, inicialmente administración del sistema). Cada usuario ve sus propios casos. El rol `piloto_externo` sigue sin acceso. El servicio tiene PostgreSQL propio y acepta peticiones del PMS con un secreto compartido. Las consultas y respuestas sobreviven reinicios. Las investigaciones interrumpidas se marcan fallidas después de cinco minutos; el usuario puede reintentarlas.

Las consultas se envían al modelo solo al pulsar Solicitar diagnóstico. No se adjuntan automáticamente datos de huéspedes, facturas, bases operativas o registros del servidor. Escribir referencias internas y ejemplos anonimizados. Existe un límite global de diez investigaciones en 24 horas, hasta nueve respuestas del modelo, incluidas como máximo dos correcciones de evidencia, doce consultas de código y tres minutos por investigación. El límite de tokens observado es adicional y puede alcanzarse luego de una respuesta facturable; no es un tope monetario. Configurar también alertas de gasto en el proyecto de OpenAI.

Se omiten archivos de claves, credenciales, respaldos y rutas ocultas. No se leen enlaces simbólicos. Las citas se validan contra los rangos de código efectivamente entregados al modelo. Es posible que el modelo se equivoque aun con referencias válidas. Siempre se muestran las limitaciones y las pruebas pendientes.

## Comunicación

Los diagnósticos se muestran en Soporte del sistema; la pantalla abierta se actualiza cada cinco segundos. El correo es opcional y se habilita explícitamente con una dirección elegida por el usuario. El aviso no contiene la consulta ni el diagnóstico: invita a entrar a la demo. Una falla del correo no elimina el diagnóstico. La primera versión no envía avisos por WhatsApp ni interviene automáticamente en producción.

## Aprobación e implementación

La primera versión no incluye un botón que publique cambios. Tras revisar la propuesta, Marcelo puede autorizar un trabajo de programación separado, con pruebas, revisión del diff y despliegue en demo. La investigación tampoco repara movimientos históricos. Evitar confundir un caso cerrado con un problema corregido.
