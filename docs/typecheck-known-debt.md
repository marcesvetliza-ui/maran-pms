# TypeScript: chequeo de regresiones

`npm run check` se ejecuta como una validación completa y termina sin
diagnósticos.

El trabajo alineó los DTOs de Drizzle, las rutas de folios y facturación, y los
valores nulos de los formularios con el schema compartido. La implementación
de memoria histórica quedó retirada del código compilado; `IStorage` y
`DatabaseStorage`, el adaptador que utiliza la aplicación, continúan bajo
chequeo estricto.

Las nuevas incompatibilidades de tipos deben corregirse en el cambio que las
introduzca: no se deben resolver con `@ts-nocheck`, conversiones globales a
`any` ni relajando la nulabilidad del schema.