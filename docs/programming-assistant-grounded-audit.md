# Reserva y revisión fundada después de la evaluación real

Base: `9b67493ea6e3abdc12abf8f97e36251731650afb`.
Rama: `fix/assistant-grounded-audit`. Sólo asistente y pruebas: no cambios
en facturación, main, base operativa ni despliegues.

## Evidencia que motivó el cambio

La evaluación real del caso sintético produjo 0/3 entregas aprobadas y útiles.
La corrida 1 tuvo dos rechazos; las corridas 2/3 se detuvieron antes de auditar
a 50.141 y 51.719 tokens. El control seguro fue rechazado por una afirmación
inexistente. Una reauditoría confundió la frontera interna de `cause_1_1` con
texto truncado aunque `cause_1_2` completaba el campo.

El fixture `server/tests/fixtures/assistant-real-failures.json` conserva valores,
extractos y el SHA-256 del artefacto original. No contiene datos del hotel.
Los borradores descartados de las corridas 2/3 no estaban guardados: no se
presentan reconstrucciones inventadas de esos borradores.

## Reserva

La reserva sigue incluyendo tres solicitudes: primera auditoría + corrección
completa con hasta cuatro observaciones + nueva auditoría. Incluye máximos de
salida, esquemas, herramientas, overhead y margen de crecimiento del informe.
No se aumentan el techo de 100.000, las dos auditorías ni las 14 rondas.

El costo anterior usaba siempre caracteres/2, más del doble del consumo de
entrada observado en las solicitudes de código/español. Ahora, por caso:

- Sin mediciones se conserva esa estimación.
- Se mide `prompt_tokens / longitud serializada del request` después de cada
  respuesta. Nunca se usa `total_tokens` para calibrar entradas.
- Se conserva la mayor densidad observada, con 25% de margen, piso de
  caracteres/3 y overhead fijo. Densidades inesperadamente altas aumentan
  la reserva: no se recortan a un máximo artificial.
- Autor, auditor y preflight usan el mismo estimador. Toda respuesta sigue
  comprobando uso real y límites; si no cabe, nunca se omite la auditoría.
- El recorrido específico de conflicto de facturación ya trae lecturas de
  servidor, estados fiscales, bloqueo, cliente, mocks y aserciones. Se limita
  su exploración adicional a dos rondas antes del borrador, sin omitir los
  validadores posteriores ni impedir una corrección del informe.

La primera repetición del parche volvió a bloquear una corrida a 50.372 tokens
tras una corrección determinista; esa traza no se descarta. Su borrador exacto
está también en un fixture. Por eso se deduplican las líneas de tests ya
presentes en las citas y en otras lecturas, y la corrección utiliza IDs sobre
campos completos en lugar de reenviar citas de texto. Los mocks y aserciones
siguen disponibles una vez; una omisión por presupuesto continúa marcada.
El bloqueo de presupuesto ahora informa la reserva concreta y lo disponible.
La redacción/corrección sin consultas no envía herramientas deshabilitadas.
Su instrucción unificada conserva las mismas restricciones sin repetir el
documento de navegación ni pedir herramientas que ya no puede usar.

Sigue siendo un pronóstico con margen, no un tokenizer exacto ni una garantía
del costo del proveedor. La nueva traza guarda caracteres, consumo y ámbito
por solicitud para contrastarlo.

## Auditor

- `diagnosisStatements` conserva todos los IDs y su propiedad sobre texto exacto.
- El payload muestra cada campo/elemento completo UNA sola vez, acompañado
  de todos sus IDs. No se muestran cortes de 800 caracteres.
- El esquema de respuesta del auditor sigue siendo el mismo: IDs válidos,
  problem/correction acotados, sin propiedades extra ni quotes arbitrarias.
- La instrucción obliga a identificar una afirmación efectivamente presente,
  leer negaciones/condiciones y distinguir contradicción real de un requisito
  hipotético. Se elimina el ejemplo negativo que contaminaba el control seguro.
- No se transforma un rechazo en aprobación por una heurística. JSON inválido,
  ID ajeno, fallo de proveedor, veredicto contradictorio y segundo rechazo
  siguen cerrando en fallo.
- Los controles seguro/inseguro de la evaluación conservan sus textos y
  expectativas originales. Las pruebas simuladas verifican el protocolo;
  sólo la corrida real puede evaluar cómo los interpreta el modelo.

## Explicación y fundamentación

La orientación lee ahora también el filtro de estados que consumen capacidad
fiscal y el test de autorización pendiente. El redactor debe diferenciar:

1. Capacidad facturable consumida o reservada.
2. Autorización pendiente frente a comprobante emitido.
3. Emisión fiscal frente a cobro y movimientos de Caja.

El mensaje no certifica que otra factura terminó de emitirse. Se agrega un
control determinista para esa inferencia explícita, sin rechazar explicaciones
condicionales ni negaciones de la inferencia. La auditoría sigue revisando el
resto del texto. Las indicaciones sobre cliente deben respetar sus condiciones
de descarte y conservar la identidad de una operación existente.

## Evaluación y trazabilidad

El ejecutor registra el ámbito `control:safe`, `control:unsafe` o `run:N` en
cada solicitud. Guarda borradores sólo del caso sintético en el artefacto
ignorado, más traza de fallos y uso por corrida. Esto evita perder consumo
o texto cuando `diagnose` lanza un error. No incorpora estos textos a logs de
producción. Un error de proveedor guarda código/status, nunca su cuerpo.

```sh
npm run test:assistant
npx tsc -p services/programming-assistant/tsconfig.json --incremental false
# Checkout limpio, clave desde Secrets, modelo explícito:
ASSISTANT_EVAL_MODEL=gpt-4.1-mini npm run eval:assistant -- --run-real --runs=3
```

La evaluación real debe identificar su commit final, mostrar ambos controles,
los tres informes completos, auditorías y uso; luego se debe revisar cada
informe contra la rúbrica independientemente del veredicto del auditor.
Una revisión cualitativa de un agente IA no se debe etiquetar como aprobación
de un humano: esa aprobación requiere una persona y queda explícitamente pendiente.
