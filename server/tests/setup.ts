import { initAppEnv, resetAppEnvForTests } from "../app-env";

/**
 * La suite del servidor fue escrita, en su gran mayoría, asumiendo el
 * comportamiento de producción (sin bloqueos de comunicaciones externas por
 * ambiente — ver server/external-comms-policy.ts). Por defecto, cada archivo
 * de test arranca con APP_ENV=production simulado, para que los tests
 * existentes que mockean fetch/nodemailer a nivel de red (p. ej.
 * server/tests/arca-credit-note-recovery.test.ts) sigan ejercitando el
 * camino real del código.
 *
 * Los tests que específicamente necesitan validar el bloqueo en piloto/dev/
 * test (ver server/tests/external-comms-policy.test.ts y
 * server/tests/app-env.test.ts) reinician este estado explícitamente con
 * resetAppEnvForTests()/initAppEnv() en su propio beforeEach — Vitest aísla
 * el grafo de módulos por archivo de test, así que este valor por defecto no
 * se filtra entre archivos.
 */
resetAppEnvForTests();
initAppEnv({ APP_ENV: "production", NODE_ENV: "production" });
