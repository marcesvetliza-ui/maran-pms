# Disponibilidad diaria de Housekeeping

La pestaña Turnos incorpora una planificación por fecha para los usuarios activos de Housekeeping que ya pueden recibir tareas. No crea otro padrón ni modifica los roles. Los supervisores pueden consultar y editar; las mucamas no acceden a disponibilidad de sus compañeras.

Cada persona y fecha admite Trabaja, Franco o Ausente, turno opcional, horario opcional completo y observaciones de hasta 500 caracteres. Un horario de fin anterior al inicio termina al día siguiente. Para turnos cortados, los tramos se detallan en observaciones. Sin registro se muestra Sin completar: no se presume disponibilidad.

El selector de responsable consulta la fecha programada de la tarea. Muestra el estado y horario, y advierte al elegir franco o ausencia. No bloquea excepciones de supervisión ni reasigna tareas automáticamente. La planificación indica cuántas tareas ya tiene cada persona y avisa si coinciden con franco o ausencia. Un error de consulta queda visible y no se presenta como disponibilidad confirmada.

El guardado es transaccional y registra actor, fecha, valor anterior y nuevo en auditoría. La clave persona/fecha evita duplicados. No modifica tareas, habitaciones, No mover, reservas, caja ni stock. Los tipos salida, estadía y profunda ya existían y se conservan. No se incorporan listas de verificación ni consumos por limpieza.

Migración incremental y SQL: `20261021_housekeeping_staff_availability.sql`. Sin carga inicial de disponibilidades inventadas. Implementado en rama sobre la etapa 3, todavía sin integración ni despliegue.

Verificación local con datos sintéticos: esquema compartido, formularios y asignación, acceso por API, persistencia por fecha, normalización de franco y ausencia, auditoría y rechazo de horas/fechas inválidas o personal inactivo. Las pruebas PostgreSQL utilizan exclusivamente una base desechable local; no se consultó la base del hotel.
