# Prueba visual del informe de retenciones recibidas

Usa la página real de compras con datos ficticios y bloquea todas las escrituras.

```sh
npx vite --config scripts/received-retentions-browser/vite.config.ts
node scripts/received-retentions-browser/verify.mjs
```

Verifica 1440, 768 y 390 px, pestaña visible, filtros combinados, descargas bloqueadas hasta aplicar y paginación. Evidencia local en `generated-artifacts/received-retentions` (ignorada por Git). Los archivos PDF/Excel se prueban por separado en `server/tests/received-retention-report.test.ts`.
