# Próxima entrega: alta y administración de un cliente independiente

Especificación preparada el **23/11/2026**, a partir del objetivo confirmado por Marcelo. Estado: **lista para guiar implementación; funciones nuevas aún no implementadas**. La [aceptación de Aurora y Brisa](evidencia/aceptacion-qa-2026-11-23.json) se conserva como referencia del PMS QA.

## Resultado concreto

Dar de alta en QA un cliente ficticio independiente, con un hotel de nombre y configuración propios. Su administrador crea y administra personal limitado a ese cliente. El hotel usa el mismo producto y conserva su base operativa e identidad separadas. Los accesos y datos de Aurora y Brisa no se modifican para simular el resultado.

Se ensayan dos organizaciones: la del grupo de prueba existente y la nueva. Eso verifica la frontera entre clientes y admite, como caso opcional, que el primero tenga dos hoteles. No se considera suficiente cambiar el nombre o el logo de una plantilla.

## Recorrido que debe poder realizarse

1. La administración de Xenia registra el cliente y el hotel, con estado de preparación visible.
2. El operador vincula recursos exclusivos y una instalación con identidad propia. En el primer MVP los recursos de Railway pueden prepararse mediante un procedimiento guiado; no se promete contratación o creación automática de infraestructura que todavía no esté implementada.
3. Un proceso genérico y reintentable prepara la base limpia. Un fallo conserva su estado y permite reanudar la misma alta sin reciclar recursos de otro hotel.
4. Xenia asigna un administrador del cliente, sin otorgarle `platform_admin`.
5. Ese administrador entra, gestiona su personal y concede roles sólo para sus hoteles. No ve el listado global de personas ni puede asociarse establecimientos ajenos.
6. Configura las habitaciones y tarifas ficticias del nuevo hotel. Una sesión autorizada completa el recorrido de estadía/Caja ya aceptado para el producto QA.
7. Quedan registrados versión de servicios, identidad, esquema, configuración sin secretos y resultados. Se verifica que los accesos anteriores siguen funcionando.

## Paquetes y dependencias

| Tarea | Implementación prevista | Cierre requerido |
| --- | --- | --- |
| C01 | Aclarar objetivo comercial y registrar estado aceptado | Confirmación de Marcelo y documentación fechada. Completado en esta organización. |
| C02 | Membresía y administrador de cliente | Migración explícita, contratos, comprobación de ámbito en servidor y conservación de usuarios existentes. |
| C03 | Gestión delegada de personal | API y UI acotadas; no enumerar usuarios ajenos, elevar privilegios ni asignar hoteles externos. Depende de C02. |
| C04 | Alta genérica de hotel | Configuración permitida, preparación limpia e idempotente, identidad exclusiva y procedimiento de recursos. Depende del contrato de C02. |
| C05 | Validar dos clientes independientes | PostgreSQL sintético, navegador y aceptación remota del nuevo cliente, con fallos y parciales registrados. Depende de C03/C04. |
| C06 | Operar altas y versiones de forma repetible | Ficha por instalación, promoción seleccionada, recuperación y costo por hotel. Se completa antes de incorporar clientes en uso. |

Las tareas H01–H08 del tablero siguen como hitos generales; C02–C06 concretan sus partes de cliente independiente y no se cuentan dos veces como entregas distintas.

## Contratos y migración que se deben diseñar en código

- Separar administrador de plataforma y administrador de cliente. La autoridad de cliente procede de una membresía administrativa validada, no de un campo libre del formulario.
- Resolver la organización de cada hotel en el servidor y aplicar el límite a listados, altas, cambios, invitaciones y retiradas de acceso. Una identidad de instalación (`clientId`) no reemplaza al cliente comercial.
- Mantener rol y autorización del PMS coherentes con la sesión central, incluso después de cambios de permisos. Resolver explícitamente cómo un administrador de cliente accede a configuración de su hotel sin privilegios sobre otros.
- Agregar migraciones versionadas y repetibles; conservar vínculos e identidades existentes. No editar manualmente los marcadores de instalación ni reubicar datos históricos para conseguir una prueba positiva.
- Sustituir la dependencia de dos plantillas fijas por una preparación QA genérica y contratos de configuración. Mantener compatibilidad con Aurora y Brisa.
- Vincular catálogo e instalación operativa sin obligar a crear otra base de reservas de demostración para cada cliente nuevo. La transición del catálogo anterior requiere compatibilidad explícita.

## Pruebas propuestas — todavía no ejecutadas

| Caso | Resultado esperado |
| --- | --- |
| Administrador del cliente B lista personal/hoteles | Sólo ve el ámbito B; no obtiene personas o datos del cliente A. |
| B envía IDs de A o campos de privilegios | El servidor rechaza; no hay cambios, enumeración ni escalamiento. |
| B crea personal y cambia un rol propio | El cambio persiste y tiene actor/ámbito; revocación y cambios afectan sesiones abiertas. |
| Alta nueva repetida o concurrente | Una instalación y una identidad; no duplica ni reutiliza una base de otro hotel. |
| Preparación falla y se reintenta | Conserva diagnóstico y recursos vinculados; reanuda sin borrar datos anteriores. |
| Dominio, secreto o conexión de otra instalación | El arranque o intercambio de acceso se rechaza sin operar la base ajena. |
| Dos clientes, dos sesiones, cachés y formularios | Ninguna respuesta tardía, borrador o reintento se aplica al hotel o actor equivocados. |
| Actualización de Aurora/Brisa existentes | Conserva reservas, pagos, secuencias, permisos revocados e identidades. |
| Regresión del circuito QA | Reserva, ingreso, consumo, pago, salida y Caja mantienen sus invariantes e idempotencia. |

La integración usa clústeres PostgreSQL sintéticos y proveedores simulados. La aceptación remota se registra después con el código realmente servido y las confirmaciones de Marcelo. No se convierte esta tabla en resultados aprobados.

## Base y publicación del trabajo futuro

La referencia funcional de PMS QA al corte es `4a1f71ba4085ba1cff4d89c99bcb2de0a2e5d61f`. La implementación debe partir de una rama aislada, consultar las referencias remotas actualizadas y revisar las diferencias necesarias con `main` y con el asistente. La rama documental conserva historia del plan y no es una base de despliegue del PMS.

Preparar primero el cambio y sus resultados. La ficha de publicación debe identificar servicios destinatarios y conservar los valores privados en Railway. El desarrollo local, una PR o la creación de una rama no implican que el producto esté instalado en un hotel.

## Orden de trabajo y condiciones pendientes

Se conserva el objetivo del asistente piloto antes del 30/11, con evaluación de utilidad y gasto dentro de su autorización. La corrección del rumbo multicliente se documenta ahora y C02–C04 constituyen el siguiente bloque de producto. No se fija una fecha de disponibilidad comercial de todo Xenia a partir de la fecha del piloto.

Para recursos nuevos y despliegues de Xenia, Marcelo opera Railway o se debe disponer de una conexión autorizada a ese proyecto. El entorno actual sólo tiene una credencial del proyecto Maran, que no se usa para Xenia. Los dominios, servicios y bases existentes no requieren cambios por esta documentación.

Antes de clientes en uso siguen pendientes disponibilidad ante caída central, recuperación integral, compatibilidad de versiones y perfil operativo de módulos/fiscalidad/integraciones. El ensayo completo de restauración permanece en su guía y no vuelve a bloquear la evaluación aislada del asistente.

## Criterio de entrega

Se entrega un diff real, pruebas ejecutadas con registros, guía operativa y versión publicable identificada. La aceptación final del nuevo cliente requiere entrar con su administrador y su personal, comprobar operación e aislamiento y conservar el resultado. Un diseño aprobado o un botón de alta no cierran esta entrega por sí solos.
