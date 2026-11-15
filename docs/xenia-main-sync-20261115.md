# Sincronización funcional de Xenia con Maran — 15 de noviembre de 2026

Integra main dd83bdaaad416d91e1b3276c6b59f88c8e960d57 en la rama de Xenia feature/xenia-support-approval-foundation, partiendo de 098bbedba3a993312b98f18a7af5b5d71fc1367e. Main no se modifica.

Los conflictos funcionales de facturación, grupos, tarifas, inventario y compras se resuelven con la implementación actual de main. Se conservan el asistente piloto, sus permisos, marca Xenia, identidad de base y bloqueos de comunicaciones reales. No se copian bases, secretos ni configuraciones de integración entre hoteles.

La navegación del asistente se adapta al flujo actual de Prefactura, que guarda la factura antes de asociar los pagos. Las pruebas de evidencia duplicada usan referencias de esta revisión sin alterar los informes históricos. El catálogo de permisos incluye el acceso adicional de soporte del piloto.

El workflow de verificación de revisión de Xenia sigue ahora su rama realmente conectada en Railway. La revisión pública previa comprobada fue 098bbed, con appEnv=pilot y base sana.

Validación local: compilación de producción correcta; 45 pruebas dirigidas de permisos y decision brief y 3 de orientación de conflictos aprobadas. La suite general de servidor iniciada sin DATABASE_URL no puede validar módulos que importan la base; se interrumpe y se delega la validación PostgreSQL a los workflows de GitHub, con base aislada. No se ejecutan pruebas contra bases operativas ni proveedores reales.
