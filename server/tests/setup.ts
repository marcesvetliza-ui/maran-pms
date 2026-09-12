import { initAppEnv, resetAppEnvForTests } from "../app-env";

/**
 * Fail-closed por defecto: cada archivo de test arranca con APP_ENV=test
 * (bloqueado — ver server/external-comms-policy.ts), no con production.
 * Si un test omite mockear fetch/Nodemailer/un cliente externo, la llamada
 * real queda bloqueada igual, en vez de escaparse a la red por un mock
 * faltante.
 *
 * Los tests que necesitan ejercitar el comportamiento de production (con
 * fetch/Nodemailer/el cliente externo correspondiente completamente
 * mockeados) lo simulan explícitamente en su propio beforeEach/it con
 * resetAppEnvForTests() + initAppEnv({ APP_ENV: "production", NODE_ENV:
 * "production" }), y lo revierten en su afterEach — ver
 * server/tests/arca-credit-note-recovery.test.ts,
 * server/tests/arca-comms-block.test.ts,
 * server/tests/email-service-comms-block.test.ts,
 * server/tests/backup-comms-block.test.ts,
 * server/tests/email-test-route-comms-block.test.ts y
 * server/tests/mara-comms-block.test.ts como ejemplos. Vitest aísla el
 * grafo de módulos por archivo de test, así que ese cambio explícito no se
 * filtra a otros archivos.
 */
resetAppEnvForTests();
initAppEnv({ APP_ENV: "test", NODE_ENV: "test" });
