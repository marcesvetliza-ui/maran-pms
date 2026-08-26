# Pruebas de integración PostgreSQL

Las pruebas que ejercitan bloqueos de filas y claves foráneas necesitan una base PostgreSQL real. Usá solamente una base de **desarrollo o pruebas aislada**; nunca apuntes `DATABASE_URL` a producción.

## Preparación

1. Configurá `DATABASE_URL` con la conexión de desarrollo/pruebas.
2. Aplicá las migraciones iniciando la aplicación una vez (`npm run dev`) o mediante el proceso de migración habitual del entorno.
3. Ejecutá:

   ```bash
   npm run test:postgres
   ```

El comando falla de inmediato si falta `DATABASE_URL`. La suite también verifica que estén presentes las columnas y claves foráneas requeridas por las imputaciones de Cuenta Corriente.

## Validación habitual

`npm test` ejecuta esta suite automáticamente cuando `DATABASE_URL` está configurada. Si no lo está, informa explícitamente que las pruebas PostgreSQL se omitieron y muestra el comando que debe ejecutarse en un entorno con base migrada.

La prueba crea identificadores únicos y elimina todos los registros de prueba al terminar, pero eso no reemplaza el aislamiento de la base de pruebas.