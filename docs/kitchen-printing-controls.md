# Controles de impresión de comandas

Configuración → Impresión de comandas. Sólo administradores; GET/PUT
`/api/kitchen-printing/settings` validan autenticación y rol en servidor.
Se persiste una configuración conjunta `kitchen_printing_controls_v1` en
system_settings, con Restaurant y SPA–Justo independientes. Ausencia o
configuración inválida deshabilita ambos. El editor genérico no puede cambiar
ni borrar esta clave. Los cambios registran operador e historial de auditoría.

Esta entrega es la configuración, no un conector de impresión. No crea trabajos,
no imprime ni contacta las IP. Los botones de prueba permanecen deshabilitados
y la pantalla explica la instalación local pendiente.

Requisitos para integrar el futuro conector Windows:

- Consultar estos controles en servidor al crear y despachar trabajos.
- No crear trabajos cuando el origen esté deshabilitado. Nunca recuperar
  retrospectivamente comandas de períodos deshabilitados al activar.
- Al desactivar, detener también los pendientes aún no enviados y no reactivarlos
  automáticamente. Un trabajo que ya llegó a la impresora no se puede retirar.
- Comida/postres a fría 190.168.0.186 y caliente 190.168.0.187; bebidas/cafetería
  excluidas. Barra Justo 190.168.0.253. Máscara confirmada /16.
- Prueba explícita por impresora con PRUEBA — NO PREPARAR; trabajo persistente,
  identidad estable y reimpresión COPIA si la entrega es incierta.

Validación de esta entrega: dos pruebas de configuración segura, TypeScript y
compilación de producción. No se probaron impresoras reales.
