# Navegación de teclado — Maran / Xenia PMS

## Alcance y estado

Trabajo de navegación de formularios, sin cambios de reglas comerciales,
permisos, cálculos, validaciones financieras ni migraciones. Las pruebas nuevas
usan componentes reales con datos ficticios y respuestas HTTP simuladas. No se
realizan cobros, emisiones fiscales ni modificaciones de reservas del hotel.

**No se declara verificado todo el PMS por compartir un componente.** El
inventario estático y las pruebas de integración son evidencias distintas.
Las pantallas sin prueba de integración figuran expresamente como pendientes.

Para regenerar el inventario completo por archivo:

```sh
node scripts/audit-keyboard.mjs
node scripts/audit-keyboard.mjs --json
```

Incluye campos, Select, Command, Popover, diálogos, manejadores de teclado y
atributos de foco. No agrega elementos enfocables a celdas informativas.

Inventario al cierre: **92 archivos con controles**, de los cuales 62 son
pantallas, con 363 usos JSX de Select, 9 de Command y 236 raíces de ventanas
Dialog/AlertDialog/Sheet/Drawer. Son ocurrencias de código, no circuitos
independientes ni flujos declarados verificados.

## Problemas reproducidos y causas

| Componente / pantalla | Cómo reproducir | Causa | Corrección |
|---|---|---|---|
| Select de Radix en formularios, incluyendo Inventario | Abrir lista, resaltar otra unidad con flechas, pulsar TAB o Shift+TAB | Radix impide TAB dentro de la lista; la implementación local no contenía la variante citada | Cerrar sin confirmar y resolver el control vecino al desmontar, dentro del modal si existe |
| Select dentro de Dialog | Abrir lista, navegar y pulsar Escape | Versiones distintas de las capas internas de Radix mantenían registros de diálogos/foco independientes; el diálogo padre podía cerrarse | Unificar DismissableLayer, FocusScope, FocusGuards y EscapeKeydown mediante overrides del lockfile |
| Popover + Command de artículos / entidades | Buscar y pulsar TAB con lista abierta | La lista y su FocusScope desvían el recorrido hacia el disparador o sus controles internos | Navegación local únicamente desde Command; calendarios conservan su recorrido propio |
| Compras, selector de proveedor en ambos layouts | Buscar proveedor e intentar confirmar por teclado | Opciones div con selección sólo en mousedown; cierre por temporizador de blur | Opciones button; flechas, Enter, Escape y salida local con TAB; alta rápida accesible por click/teclado |
| Recetas y elaboraciones, selector de ingredientes | Abrir buscador y navegar opciones con teclado | Selección sólo por mousedown; Escape desmontaba el input enfocado | Opciones button y comportamiento local reutilizable; restauración de foco al cerrar |
| Búsqueda de clientes | Buscar, salir antes de responder la petición; intentar flechas/Enter | Respuesta tardía reabría resultados; lista sin navegación de opciones | Combobox accesible, selección explícita, preservación del texto al salir, descarte de respuestas obsoletas |
| Transferencia de Inventario, renglones | Agregar o eliminar la fila que contiene el foco | El control enfocado aparece/desaparece sin destino definido | Enfocar el artículo de la fila nueva o de una fila sobreviviente, sin alterar cantidades |
| Diálogos controlados sin DialogTrigger | Abrir desde un botón externo y cerrar | El cierre no dispone de un Trigger de Radix al que retornar | Registrar el abridor y restaurarlo sólo si sigue conectado, respetando destinos explícitos |

Las pruebas iniciales de Select reprodujeron fallos antes de la corrección.
No se desactivaron las trampas de foco ni se simularon los componentes Radix
en esas pruebas. Unificar las dependencias corrigió el cierre de padre con Escape.

## Archivos y decisiones

- `components/ui/select.tsx`: comportamiento centralizado, controlado y no
  controlado; handlers personalizados ejecutados primero. Mantiene Select sin
  Portal por la compatibilidad táctil existente con iPad/Safari.
- `components/ui/keyboard-select.tsx`: exportación compatible de la misma
  implementación; no una segunda copia que pueda divergir.
- `lib/popup-tab-navigation.ts`: sólo TAB sin Ctrl/Alt/Meta; salta controles
  deshabilitados, ocultos, inertes y detalles cerrados. No hay listener global
  de TAB ni se introducen tabIndex positivos. La lista abierta no confirma
  opciones resaltadas. Foco y scroll se aplican al control vecino.
- `components/ui/popover.tsx`: salida sólo desde buscadores Command, conserva
  portales en el diálogo y eventos del consumidor.
- `components/ui/dialog.tsx`: recuperación de foco de abridores externos.
- `components/inline-search.tsx`: solución local para buscadores propios de
  proveedores e ingredientes, sin interceptación fuera del componente.
- `components/guest-search-combobox.tsx`: relaciones label/combobox/listbox,
  flechas, Enter, Escape, salida nativa por TAB y protección frente a respuestas
  tardías; no crea clientes por TAB.
- `pages/inventory.tsx`, `purchase-invoices.tsx`, `recetas-costos.tsx`:
  integraciones específicas, sin cambiar sus operaciones de negocio.
- `index.css`: foco visible para controles y márgenes de desplazamiento.
- `package.json`, `package-lock.json`: capas de Radix compatibles. URLs de
  paquetes públicas para no romper instalaciones fuera de Replit.

## Matriz de cobertura

Leyenda: **estático** = inventario/código; **automatizado** = interacción con
componentes reales y HTTP ficticio; **navegador** = evidencia adicional registrada
al terminar la verificación. Compartir Select no equivale a cobertura integral.

| Módulo / flujo real | Revisión | Prueba específica | Estado / límite |
|---|---|---|---|
| Select compartido | Eventos, foco, estado, portales y todos sus importadores | TAB/Shift+TAB; valor; flechas/Enter; Escape; ocultos/deshabilitados; controlado/no controlado; cancelación personalizada; Ctrl+TAB; retorno de modal | Automatizado |
| Command dentro de Popover | Artículos y selectores de entidades; calendario separado | Salida en ambos sentidos; texto; Enter; Escape sin cerrar padre; TAB propio del calendario | Automatizado |
| Diálogos / ventanas anidadas | Root y Content compartidos | Cierre y retorno a trigger normal o externo; Escape del hijo conserva padre | Automatizado |
| Inventario: transferencia modal y embebida | Depósitos, artículo, cantidades, renglones | TAB sale sin elegir; no POST; agregar/quitar fila; cantidad conservada; pruebas funcionales existentes | Automatizado |
| Compras: comprobante unificado | Proveedor, alta auxiliar, estructura de carga | TAB sin elegir; flechas/Enter; no POST; pruebas existentes del layout | Automatizado |
| Compras: wizard de comprobante | Mismo buscador con integración explícita en segundo layout | Revisión estática y capa inline automatizada | Falta recorrido completo del wizard |
| Clientes / huéspedes: búsqueda compartida | Lista propia y respuesta asíncrona | TAB/Shift+TAB sin elegir; texto; Enter; Escape; respuesta tardía | Automatizado; no equivale al ABM completo |
| Recetas: platos e ingredientes | Ambos buscadores propios y Select; eventos antes sólo de mouse | Capa inline probada; inspección de integración | Falta recorrido completo de receta real |
| Elaboraciones / producción | Buscador y unidades | Inspección de integración y Select compartido | Falta prueba completa de producción |
| Inventario: artículos, depósitos, movimientos, conteos, equivalencias | Inventario de formularios y controles | Sólo cobertura del Select compartido fuera de transferencia | Pendiente integración de cada flujo |
| Reservas, alta, edición, planning, check-in/out | Componentes/páginas reales incluidos en inventario; no se altera operación | Sólo selectores y búsqueda compartidos | Pendiente recorrido por formulario y sus condicionales |
| Huéspedes, empresas, agencias y grupos | Formularios, selectores y diálogos inventariados | Sólo componentes comunes | Pendiente altas/ediciones integrales |
| Folios, consumos, pagos, CC y prefacturas | Select, diálogos y eventos locales inventariados | Sin pruebas nuevas de cobros o emisión | Pendiente integración financiera con fixtures aislados |
| Facturación / comprobantes de venta | Selectores y ventanas inventariados | Sin emisión ni anulación | Pendiente formulario completo |
| Restaurante: pedidos, cierre, división, transferencias, partes y habitación | Campos y handlers locales inventariados | Sólo componentes compartidos | Pendiente cada circuito; no se cobra ni cambia consumos |
| SPA: turnos, clientes y cobros | Campos, selectores y diálogos inventariados | Sólo componentes compartidos | Pendiente cada circuito |
| Compras: descuentos, envío, percepciones, retenciones, OP | Inventario de controles y revisión de no cambiar cálculos | Pruebas existentes del formulario, no cobertura de teclado integral | Pendiente renglones condicionales y OP |
| Caja, administración, cuentas y configuración | Formularios/diálogos incluidos en inventario | Sólo componentes comunes | Pendiente recorridos específicos |

## Seguridad y límites de validación

- No se publican cambios, no se hacen push ni despliegues.
- Las ramas remotas se consultan sin mezclarlas con el checkout local.
  El local inicial difiere de `main` y de `feature/xenia-channex-staging`;
  Inventario/Compras/Recetas contienen diferencias ajenas sustanciales.
  No corresponde reemplazarlas completas ni inferir que el hotel ya usa
  este código. La propagación requiere aplicar únicamente los cambios
  de teclado sobre cada rama y validarlos allí.
- La página de navegador está en `scripts/keyboard-browser`, separada del
  frontend de producción. Importa los formularios reales, sustituye fetch
  por fixtures y lanza un error ante cualquier escritura.
- JSDOM no demuestra desplazamiento real ni compatibilidad física con iPad.
  Tampoco Chromium Linux demuestra por sí solo Chrome/Edge en Windows.
- No se alteran pruebas ni validaciones para obtener un aprobado.

## Resultados de validación

| Verificación | Resultado |
|---|---|
| Pruebas nuevas de teclado | 29 casos en cuatro archivos; aprobados dentro de la tanda ampliada |
| Tanda ampliada de regresión, 26 archivos | 153 aprobadas y 8 fallidas, de 161 pruebas |
| Contraste de fallos con fuente original | Los mismos 8 fallos se reprodujeron en una extracción de HEAD anterior a los cambios de teclado, con las mismas dependencias instaladas; 3 pruebas de esos dos archivos sí pasaron |
| Último ajuste: conservar visible la búsqueda de proveedor al salir | 4/4 pruebas de integración aprobadas tras el ajuste |
| TypeScript, `npm run check` | Aprobado después del último ajuste |
| Compilación, `npm run build` | Aprobada después del último ajuste |
| `git diff --check` | Sin errores de formato |
| Aplicación de desarrollo | Reiniciada una vez al terminar el código; sirve por puerto 5000 y arranca sin excepción |

Los fallos se concentran en
`PrefacturaDialog.factura-t.test.tsx` (2 casos) y
`PrefacturaDialog.retencion.test.tsx` (6 casos). Esperan peticiones o estados
de emisión/cobro que sus fixtures no alcanzan. **La tanda completa no está
verde** y no se ha alterado ningún test ni una regla financiera para aprobarla.
La comparación conserva las dependencias instaladas: demuestra la reproducción
con la fuente original, no una comparación exhaustiva de ambos árboles de
dependencias. La investigación de sus fixtures financieros queda pendiente.

La compilación conserva advertencias de tamaño de chunks y de Browserslist/
PostCSS; no se cambió la configuración de compilación para ocultarlas.
`client/src/buildTime.ts` se actualiza automáticamente al compilar.

### Navegador real: Chromium, entorno aislado

- Transferencia: abrir con Enter, resaltar con flechas, TAB hacia destino sin
  elegir origen, Shift+TAB inverso, agregar/quitar fila y conservar cantidad.
- Compras: TAB desde proveedor sin seleccionarlo, flechas/Enter para selección
  explícita, Command de artículo existente hacia cantidad sin elegir artículo.
  Tras la observación de que el texto quedaba visualmente vacío al cerrar,
  se corrigieron ambos layouts para mostrar la búsqueda pendiente, además de
  conservarla internamente; se confirmó con la prueba de integración.
- Cliente: búsqueda asíncrona, TAB hacia cantidad sin confirmar, texto conservado,
  vuelta con Shift+TAB, selección explícita y eliminación desde el botón por
  teclado con retorno al buscador.
- Nacionalidad: TAB sale del Command y conserva Argentina.
- Diálogo principal y anidado: foco visible, Escape del Select sin cerrar padre,
  ciclo de TAB/Shift+TAB y retorno a los abridores al cerrar hijo y padre.
- Vista de 390 × 844: formulario legible; el campo profundo Ret. Municipal queda
  visible al recibir foco y desplazarse la página.
- No se activó ningún guardado. El marcador de intento de escritura permaneció
  ausente. No se observaron excepciones de página.
- Se observaron avisos de consultas duplicadas para filas vacías de transferencia
  y una respuesta 404 de recurso sin identificar, que no impidió los recorridos.
- La animación de cierre produce estados DOM transitorios: las aserciones de foco
  deben esperar al desmontaje, no tomar el primer instante como estado final.
- No se probó WebKit ni un iPad físico: el ejecutor sólo expuso Chromium.

La verificación no certifica por sí sola Chrome/Edge ejecutados en Windows.
Tampoco sustituye pruebas de los circuitos completos pendientes de la matriz.

Para repetir la comprobación aislada, ejecutar:

```sh
npx vite --config scripts/keyboard-browser/vite.config.ts
```

El servidor de pruebas usa el puerto 5011 y se detuvo al finalizar; no se agregó
un servicio permanente ni se modificó el frontend productivo para exponerlo.
