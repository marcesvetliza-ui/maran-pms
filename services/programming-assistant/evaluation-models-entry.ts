import { main } from './evaluation-models';
main().catch(() => {
  // Provider errors may include request details. Keep secrets out of Railway logs.
  console.error('No se pudo completar la comprobación aislada. Revisar configuración, acceso y permisos de la clave.');
  process.exitCode=1;
});
