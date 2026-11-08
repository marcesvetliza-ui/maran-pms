# Integración de Codex para investigación de soporte

## Estado

SDK oficial `@openai/codex-sdk@0.167.0` fijado con lockfile, adaptador, protocolo de lecturas, orquestador y evaluador. Integración desactivada por defecto y preparada en la rama de desarrollo de soporte. No se ha evaluado la calidad con un modelo real, no se enviaron correos y no se cambió el servicio desplegado.

Referencias consultadas: [README oficial](https://github.com/openai/codex/tree/main/sdk/typescript), tipos incluidos en el paquete publicado y [esquema de configuración](https://github.com/openai/codex/blob/main/codex-rs/core/config.schema.json). La documentación de main puede variar; el paquete instalado y el ejecutable probado son 0.167.0.

## Funcionamiento

`SUPPORT_INVESTIGATOR=codex` selecciona el adaptador en PMS y asistente. La simulación conserva prioridad si está habilitada. PMS y servicio deben coincidir en modo y revisión. El modelo se indica explícitamente en `SUPPORT_CODEX_MODEL`; no se sustituye silenciosamente por el modelo anterior ni se presupone disponibilidad en el proyecto de API.

El SDK ejecuta la CLI. Cada caso usa un directorio temporal vacío y un thread nuevo, sin apuntar la CLI al checkout de la aplicación. La aplicación entrega búsquedas y fragmentos a través del protocolo estructurado. Se conservan las reglas de CodeSource: rutas autorizadas, rechazo de enlaces/rutas externas, redacción de credenciales y seguimiento de rangos realmente leídos.

El agente puede buscar archivos o texto, leer un rango, inspeccionar un símbolo, seguir un endpoint o pedir un dato operativo con una pregunta específica del negocio. Se conserva la pregunta junto con las respuestas del usuario, incluso cuando responde solamente «sí». No recibe herramientas de SQL, despliegue, correo ni edición. Un informe requiere citas verificables y una revisión independiente acotada. Se admite una sola reparación total de formato/evidencia/contenido; un nuevo rechazo deriva a revisión humana, sin una cadena de auditores recursivos.

En Codex se solicitan sandbox de lectura, aprobación never, búsquedas web y acceso de red de herramientas desactivados, shell_tool=false, plugins/apps/hooks y colaboración desactivados. No se heredan variables del servicio: solo se conserva PATH y el SDK inyecta la credencial de API explícita. Se anula la configuración de servidores MCP mediante un override. El stream se aborta ante un evento de comando, escritura, MCP u otra herramienta nativa inesperada.

## Comprobaciones y límites pendientes

El ejecutable respondió `codex-cli 0.167.0` sin llamar al modelo. `features list` confirmó shell_tool=false y multi_agent=false; unified_exec continuó figurando true pese al override false. No se toma ese segundo flag como prueba de ausencia de comandos: shell_tool es el control solicitado y falta validar la exposición real de herramientas y la aplicación del sandbox con una prueba controlada en el contenedor destino.

Un evento abortado es una defensa adicional, no una prueba de que una herramienta inesperada no haya empezado. Antes de habilitar casos de usuarios, verificar en el contenedor aislado que solo esté disponible el protocolo de lectura. No montar hogares de Codex, credenciales personales ni archivos operativos. El SDK puede persistir sesiones en el hogar de su usuario de sistema; definir retención y aislamiento del almacenamiento del contenedor antes de uso general. No usar las credenciales de esta conversación como autorización de API del servicio.

El SDK informa consumo pero no identifica en esta interfaz el modelo efectivo servido. Se registra `requestedModel` y `effectiveModel=null`; no se declara el modelo efectivo a partir de un default. La integración no demuestra que la calidad ya sea mejor que la del piloto.

## Habilitación de llamadas

Solo para el servicio del asistente, después de acordar presupuesto y revisar la configuración:

- `SUPPORT_INVESTIGATOR=codex` en ambos servicios.
- `SUPPORT_CODEX_MODEL`: identificador disponible en el proyecto de API; obligatorio en el asistente.
- `OPENAI_API_KEY`: credencial del proyecto de API, cargada de forma segura en el asistente.
- `SUPPORT_CODEX_PAID_ENABLED=true`: autorización operativa de llamadas en el asistente. Por defecto está apagada.
- `SUPPORT_WORKFLOW_SIMULATION_ENABLED=false` para probar el investigador real.

No activar estas opciones en Maran. Primero evaluar en un contenedor aislado del piloto. Los trabajos se vinculan al modo y modelo al encolarse: si cambia la configuración o se apaga la habilitación, el worker los detiene antes de invocar Codex, incluso después de reiniciar.

Predeterminados: máximo 12 turnos del SDK y 40.000 tokens reportados por caso, con reserva para cerrar y revisar, contexto acotado y 150 segundos. No se permiten reintentos automáticos del caso. La CLI puede realizar procesamiento interno; esos límites se comprueban antes/después de cada turno y no constituyen un límite exacto de facturación. Si el proveedor no informa el consumo final, se marca uso incompleto y no se lo presenta como costo cero.

## Evaluación preparada

Seis casos sintéticos: caja con conteo cero, mensaje de equivalencia, dato operativo ausente, extras de grupos, NC sobre voucher no fiscal y habitaciones Channex intercambiadas. Primera tanda propuesta: los tres primeros. Las expectativas privadas están en el directorio del evaluador, fuera de las raíces de lectura. La fuente de evaluación excluye material de diagnósticos y del propio asistente.

Con el árbol Git limpio y desde la raíz del repositorio:

```sh
node_modules/.bin/tsx services/programming-assistant/codex-evaluate.ts
```

Ese comando solo prepara un manifiesto local con revisión, hash de archivos y selección de casos; no crea un transporte de Codex. Para una tanda real se requiere `--execute`, habilitación pagada, modelo, clave, presupuesto explícito `SUPPORT_EVALUATION_APPROVED_USD` y tarifas revisadas `SUPPORT_EVALUATION_INPUT_USD_PER_MILLION`, `SUPPORT_EVALUATION_CACHED_USD_PER_MILLION`, `SUPPORT_EVALUATION_OUTPUT_USD_PER_MILLION`. Se reserva el costo estimado del conjunto antes de invocar; las tarifas deben corresponder al modelo elegido.

Los resultados privados se guardan en un archivo local con permisos 0600, sin claves ni respuestas crudas del proveedor. Se contrastan revisión y hash al finalizar. Un error o uso incompleto detiene la tanda, sin reintentar ni avanzar al siguiente caso. El gasto estimado no reemplaza el registro de facturación. No hay aprobación automática, ganador declarado ni publicación de cambios: Marcelo revisa las respuestas reales y sus límites.

## Siguiente etapa

Verificar modelo y costos del proyecto, autorizar una tanda pequeña, validar restricciones del runtime y ejecutar los tres casos. Comparar causa, evidencia, preguntas, solución, tiempo y costo con las respuestas anteriores. El ejecutor de parches reales y el correo con resumen se implementan después de esa validación.

Validación técnica local: 59 pruebas aprobadas (36 de investigador, decisiones, errores y pasarela; 17 de interfaz; 6 de integración PostgreSQL). Tipos del PMS y del servicio aprobados. Compilación del PMS y bundle ESM del asistente aprobados. Estas pruebas usan respuestas simuladas; no demuestran la calidad de un modelo real.
