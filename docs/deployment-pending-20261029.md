# Integración pendiente — 29 de octubre de 2026

Base: main d1239fe5. Se integran cinco cambios revisados:

- f0cc2216: finalizar callbacks del Toaster antes del cierre de jsdom.
- ea38f3e4: catálogo configurable de camajes en Habitaciones, Planning y Housekeeping.
- da36dab1: validar la respuesta de numeración ARCA antes de reservar/empezar otro número.
- 5adb4ba5: opciones de recursos de circuitos SPA en orden alfabético.
- 851198ce: configuración administrativa de impresión de cocina, deshabilitada por defecto.

Verificaciones conjuntas: 841 pruebas de cliente (156 archivos), 73 de servidor en memoria, TypeScript y compilación cliente/servidor aprobados. No se ejecutaron pruebas PostgreSQL ni llamadas reales a ARCA o impresoras.

No se incorporan cambios locales ajenos de otros árboles ni cambios del asistente piloto. La investigación del menú Emitir Comprobante sigue sin una causa confirmada y no se presenta como resuelta.

El parche de numeración no recupera por sí mismo las operaciones que ya colisionaron. Requieren verificar su identidad fiscal y estado real antes de reutilizar, conciliar o reemplazar nada. Este despliegue no incluye correcciones de datos operativos.

La pantalla de impresión únicamente configura los controles: todavía falta el conector real y no se despachan trabajos ni se habilita impresión en cocina.
