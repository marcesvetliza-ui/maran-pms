# Cierre completo del diagnóstico y evaluación repetible

Base: `1a62c192e3fbd3ae96b7607bc11d3cf0a39b788a`.
Rama: `fix/assistant-complete-validation`.

## Problema y alcance

El asistente podía recibir un rechazo semántico válido y devolver
`closure_budget` antes de pedir su corrección. El contador de auditorías no
demostraba aprobación. Un test incluso esperaba ese corte tras el rechazo.

Este parche modifica sólo el asistente, su contrato de soporte, etiquetas,
pruebas y herramientas de evaluación. No modifica facturación, Prefactura,
permisos de operadores ni datos del hotel. No habilita servicios, migra datos,
mergea main ni despliega.

## Recorrido

1. **Investigación:** herramientas de lectura y orientación existentes. Se cierra
   antes para reservar borrador, primera auditoría, corrección y reauditoría.
2. **Borrador:** al cerrar investigación se hace un handoff real de código, no una
   síntesis del modelo ni un replay de todo el historial. Máximo 24.000 caracteres
   de lecturas, hasta 6.000 por archivo; conserva diversidad entre servidor,
   cliente, helper, bloqueo y tests. Omisiones y rangos incompletos son explícitos.
3. **Validación:** siguen formato, procedencia de citas, afirmaciones/aserciones,
   atribución y consistencia financiera. Los fallos siguen volviendo al autor
   dentro de sus límites originales.
4. **Auditoría:** conserva contexto independiente y sólo lectura; recibe el
   informe completo por `statementId`, código, mocks/aserciones, checklist y
   omisiones. Absorbe la revisión de cobertura: ya no exige una reescritura del
   autor antes de poder revisarlo.
5. **Corrección:** un rechazo válido produce un contexto acotado con todo el
   informe, evidencia y observaciones. Se exige un informe completo corregido,
   no sólo rebajar certeza o añadir una limitación.
6. **Reauditoría:** la corrección pasa nuevamente todos los validadores y una
   nueva auditoría. Sólo una aprobación válida permite publicar una conclusión.
   Dos rechazos siguen siendo un fallo explícito, no un parcial aprobado.

Se mantienen los límites de 100.000 tokens, 14 rondas, herramientas de lectura,
dos auditorías, timeout global y salidas máximas del modelo. No se cambian modelo,
credenciales ni cupo diario.

## Reserva y límites

`lifecycle.ts` centraliza costos de requests serializados, incluidos esquema y
herramientas, salidas máximas y overhead. Antes de la primera auditoría se reserva
también una corrección con las cuatro observaciones máximas permitidas y una
segunda auditoría, con margen de crecimiento. Antes de corregir se vuelve a
calcular el costo concreto; la segunda auditoría tiene su propio preflight.
También se rechaza iniciar el cierre sin rondas para corregir.

Los costos siguen siendo **estimaciones**, no un tokenizer exacto ni una garantía
del costo facturado por el proveedor. Se registra estimación versus consumo
reportado, y se comprueba el límite real después de cada solicitud. Un consumo
inesperado, crecimiento del informe o agotamiento nunca se convierte en
aprobación. Para un borrador artificialmente extenso que ya consumió 67.097
tokens, puede ser correcto detenerse **antes** de auditar si no cabe el recorrido
restante; no se promete resolver cualquier informe dentro de un límite finito.

La regresión principal ejercita un rechazo seguido de corrección y reauditoría
con respuestas simuladas. Una variante llega a **66.680 tokens acumulados tras
el primer rechazo**, pide la corrección y termina aprobada a **74.860 tokens**.
Esos números se inyectan para probar el controlador: no son mediciones del
proveedor real ni una reproducción del contenido desconocido de aquella auditoría.

## Contratos y estado

- El esquema del redactor enviado al proveedor ahora refleja los límites locales
  de strings, arrays, explicaciones y líneas positivas; tests comparan ambos.
- Se conservan `statementId`, referencias exactas reconstruidas por el servidor,
  rechazo de IDs ajenos, propiedades extra, veredictos contradictorios,
  truncamiento, JSON inválido y fallos del proveedor.
- `validationStatus=complete|incomplete` es metadato del servidor, opcional para
  leer informes históricos; el modelo no puede decidirlo.
- Un parcial neutral tiene `validationStatus=incomplete`, certeza `hipotesis` y
  estado **validation_incomplete / Validación inconclusa**. No conserva causa,
  instrucciones operativas ni preguntas del borrador rechazado. No genera un
  correo de “diagnóstico listo”.
- `needs_info / Falta información` queda para un diagnóstico validado cuya
  conclusión principal realmente necesita datos del usuario.
- No se reclasifican ni reparan registros históricos automáticamente.

## Telemetría

Eventos por etapa: orientación, investigación, borrador, validación, auditoría,
corrección, reauditoría y finalización. Incluyen resultado, tokens, acumulado,
estimación, duración, cantidad de observaciones y `statementId` cuestionados.
Los controles deterministas indican categoría del fallo. En errores también se
adjunta la traza; el servicio filtra enums, IDs y números finitos antes de loguear.

No se loguean prompts, código, textos del diagnóstico, observaciones completas,
datos personales ni credenciales. `calls` conserva su significado anterior de
consultas de herramientas; los eventos del modelo distinguen borrador/corrección
de auditoría/reauditoría. `semanticAudits` sigue contando intentos; el evento
correspondiente diferencia bloqueo previo, respuesta inválida, rechazo y aprobación.

## Verificación simulada y estática

```sh
npm run test:assistant
npx vitest run client/src/pages/programming-support.test.tsx --maxWorkers 1
npx tsc -p services/programming-assistant/tsconfig.json --incremental false
```

El runner de tests reemplaza el include global, excluye PG y vacía las variables
de conexión. Sólo inspección de código, fixtures y respuestas simuladas. Los
tests de navegación que aíslan auditoría siguen declarando ese mock; los tests
semánticos y de ciclo ejercitan respuestas independientes de rechazo/aprobación.

El chequeo TypeScript global del checkout encuentra una dependencia del entorno
ausente, `otplib` importada por `server/totp.ts`, ajena a este parche. No se cambió
autenticación ni se instaló esa dependencia en main para ocultarlo. El TypeScript
del servicio y su bundle se verifican por separado.

## Evaluación real — preparada, no ejecutada

Se requiere una credencial **OPENAI_API_KEY** en Secrets para el endpoint directo
`https://api.openai.com/v1`. No se sustituye automáticamente por una credencial de
otra integración. En el entorno de preparación esa clave no está configurada.
Nunca ponerla en comandos, argumentos, archivos, este documento ni resultados.

Desde un checkout limpio de esta rama:

```sh
# No usa credenciales, red ni modelo: muestra caso, SHA, rúbrica y límites.
npm run eval:assistant -- --dry-run --runs=3

# Opt-in, con consumo real del proveedor. Modelo por defecto: gpt-4.1-mini.
# Requiere OPENAI_API_KEY ya configurada de forma segura.
npm run eval:assistant -- --run-real --runs=3
```

`ASSISTANT_EVAL_MODEL` permite seleccionar un modelo explícitamente; el manifiesto
registra el solicitado y cada respuesta registra el modelo reportado.
`--runs` acepta 1–5, tres por defecto. Cada caso conserva el techo de 100.000
tokens; se agregan dos solicitudes de auditoría para controles.

El ejecutor:

- Fija la revisión mediante Git, exige checkout limpio para llamadas reales y
  verifica que no cambió durante la ejecución.
- Usa siempre el caso sintético incorporado; no consulta tickets ni el servicio
  del hotel. CodeSource lee texto; no importa ni ejecuta facturación.
- Repite el mismo caso con una instancia nueva por corrida.
- Ejecuta un control seguro y otro que afirma sin fundamento que no se duplicó
  factura/cobro. Debe aprobar el seguro y rechazar el inseguro. No fuerza un rechazo
  dentro de las corridas reales para aparentar que hubo corrección.
- Guarda reporte, costos reales, traza, modelo reportado y snapshots de auditoría
  en `generated-artifacts/assistant-evaluation/`, excluido de Git y despliegue.
  Sólo este artefacto del caso sintético conserva texto del auditor y los
  fragmentos del borrador para interpretar sus IDs; no los logs de producción.
- Retorna fallo si hay parcial, fallo de protocolo/control, cambio de código o
  ausencia de aprobación. Errores se informan mediante códigos, no cuerpos del SDK.

**Un exit 0 sólo acredita controles automáticos del protocolo. No acredita que
la respuesta sea correcta o útil.** El resultado siempre deja revisión humana
pendiente, con una rúbrica para evaluar saldo facturable versus dinero,
duplicación desconocida, comprobantes/pagos/Caja, recuperación segura, alcance
de mocks, preguntas y citas. La corrección no queda validada con el modelo real
hasta revisar esos resultados.
