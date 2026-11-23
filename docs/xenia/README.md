# Xenia para hoteles de clientes independientes

Estado ordenado al **23 de noviembre de 2026**. Responsable del producto: Marcelo. Este índice es la entrada actual a la documentación; las guías anteriores conservan su fecha y alcance.

**Objetivo confirmado:** ofrecer un mismo PMS a muchos hoteles de distintos dueños. Cada cliente administra su información, configuración y personal. Un cliente puede tener uno o varios hoteles; la consolidación de una cadena es una función opcional dentro de sus permisos.

## Por dónde seguir

1. [Estado actual y cronología](ESTADO_EJECUCION.md): qué está comprobado, qué informó Marcelo y qué sigue pendiente.
2. [Modelo de clientes independientes](MODELO_CLIENTES_INDEPENDIENTES.md): separación entre administración de Xenia, administración del cliente y operación del hotel.
3. [Próxima entrega: un cliente independiente](PROXIMA_ENTREGA_HOTEL_INDEPENDIENTE.md): alcance de implementación, dependencias y aceptación propuesta.
4. [Tablero de tareas](TABLERO_TAREAS.csv): conserva las 56 tareas anteriores y agrega seis tareas C01–C06 vinculadas a este objetivo.
5. [Plan maestro](PLAN_MAESTRO_XENIA_MARAN.md): visión completa y antecedentes; la aclaración del 23/11 guía su interpretación.

## Qué tenemos hoy

| Parte | Estado y límite |
| --- | --- |
| Web y correo de Xenia | Publicación y uso confirmados por Marcelo en los antecedentes; no se volvieron a comprobar en esta organización. |
| Xenia-Control | Catálogo, ingreso, selector y permisos por establecimiento probados. La administración de cuentas sigue siendo global. |
| Aurora y Brisa | PMS QA con datos separados. Marcelo aceptó estadías, consumos, cobros ficticios, salida y Caja, y después las pruebas de recepción, consulta y revocación. |
| Asistente piloto | Chat y respuestas mostrados por Marcelo; línea de código y servicios separados del PMS QA. La evaluación formal y la incorporación multicliente conservan pendientes propios. |
| Cliente independiente con administración delegada | Es la próxima entrega. La separación entre dos hoteles del ensayo no acredita todavía este circuito completo. |

La [aceptación del 23/11](evidencia/aceptacion-qa-2026-11-23.json) conserva las confirmaciones del operador. La [validación automatizada](evidencia/operaciones-qa-2026-11-23.json) y el [inventario fechado](evidencia/inventario-plataforma-2026-11-23.json) se registran por separado.

## Cómo queda organizado el trabajo

- **Producto:** una evolución común, con versiones instaladas identificables. Hoy hay líneas de código distintas que requieren integración revisada.
- **Clientes y hoteles:** catálogo y autorización centrales; una base operativa por hotel como criterio inicial.
- **Pruebas:** Aurora y Brisa continúan con sus identidades y conexiones actuales. Las futuras pruebas entre clientes usan un alta nueva y datos sintéticos.
- **Soporte:** el objetivo del piloto antes del 30/11 continúa en su [sprint](SPRINT_ASISTENTE_PILOTO_ANTES_DEL_30_20261120.md). Esta organización no ejecuta una tanda de modelos ni amplía su presupuesto.
- **Versiones:** las ramas de documentación no se seleccionan como fuente de un PMS. Cada publicación funcional identifica código, esquema, configuración, destino y resultados.

## Guías que siguen disponibles

- [Estadías y Caja de los PMS QA](OPERACION_ESTADIAS_Y_CAJA_QA.md).
- [Guía inicial del multihotel](GUIA_PASO_A_PASO_MULTIHOTEL_XENIA.md): procedimiento histórico de las primeras entregas.
- [Respaldos y restauración](PASO_3_RESPALDOS_Y_RESTAURACION_XENIA.md).
- [Prueba preparada del PMS sobre la copia de Aurora](PASO_3_1_PROBAR_PMS_SOBRE_COPIA_AURORA.md): pausada por decisión de Marcelo; el PMS mantiene la base original según su confirmación.
- [Matriz de diferencias](MATRIZ_DIFERENCIAS.md): inventario inicial, no equivalencia funcional aprobada.
- [Auditoría inicial del piloto](AUDITORIA_PILOTO_IA_2026-11-16.md), [dominios y home](DOMINIOS_Y_HOME_XENIA_2026-11-16.md) y [DNS en Donweb](DNS_XENIA_DONWEB_2026-11-16.md): antecedentes con su corte original.

## Cómo interpretar el estado

**Comprobado en código o CI**, **confirmado por Marcelo**, **propuesto** y **pendiente** son categorías diferentes. Un SHA de GitHub no prueba qué contenedor está sirviendo, una propuesta no es un parche aplicado y una prueba local no es una operación remota ejecutada.

Esta actualización organiza documentación y evidencia. Las funciones de administración delegada y alta genérica descritas como próximas todavía requieren código, migraciones, pruebas y publicación identificada.
