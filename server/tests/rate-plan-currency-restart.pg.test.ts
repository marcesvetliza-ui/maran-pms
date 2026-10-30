import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
const url = process.env.DATABASE_URL || '';
const allowed = url === 'postgresql://postgres@127.0.0.1:55448/channex_inbound_test'
  || (process.env.CI === 'true' && /^postgres(?:ql)?:\/\/[^@]*@(?:localhost|127\.0\.0\.1):5432\/maran_test$/.test(url));
const suite = allowed ? describe : describe.skip;
suite('rate plan currencies survive actual startup migrations', () => {
  let pool: typeof import('../db').pool;
  const type = randomUUID();
  const rows = ['USD', 'EUR', 'ARS', '', '   '].map(currency => ({ id: randomUUID(), currency }));
  beforeAll(async () => {
    pool = (await import('../db')).pool;
    await pool.query('INSERT INTO room_types(id,code,name) VALUES($1,$2,$3)', [type, type, type]);
    for (const row of rows) await pool.query('INSERT INTO rate_plans(id,name,room_type_id,base_rate,currency) VALUES($1,$2,$3,100,$4)', [row.id, `Currency restart ${row.currency}`, type, row.currency]);
  });
  afterAll(async () => {
    if (pool) {
      await pool.query('DELETE FROM rate_plans WHERE id=ANY($1::varchar[])', [rows.map(row => row.id)]);
      await pool.query('DELETE FROM room_types WHERE id=$1', [type]);
      await pool.end();
    }
  });
  it('preserves declared currencies and amounts over two restarts, defaulting only blank values', async () => {
    const { runMigrations } = await import('../migrate');
    for (let restart = 0; restart < 2; restart++) {
      await runMigrations();
      const saved = (await pool.query('SELECT id,currency,base_rate FROM rate_plans WHERE id=ANY($1::varchar[])', [rows.map(row => row.id)])).rows;
      for (const row of rows) expect(saved.find(plan => plan.id === row.id)).toMatchObject({ currency: row.currency.trim() || 'ARS', base_rate: '100.00' });
    }
  }, 120_000);
});
