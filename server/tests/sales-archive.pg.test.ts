import { randomUUID } from 'node:crypto';
import { expect, it } from 'vitest';
import { Pool } from 'pg';
import { PgDialect } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { activeSalesRecord, SALES_ARCHIVE_SCHEMA_SQL } from '../salesArchive';

const allowed = process.env.DATABASE_URL === 'postgresql://postgres@127.0.0.1:55448/channex_inbound_test'
  || (process.env.CI === 'true' && /^postgres(?:ql)?:\/\/[^@]*@(?:localhost|127\.0\.0\.1):5432\/maran_test$/.test(process.env.DATABASE_URL || ''));

(allowed ? it : it.skip)('hides archived sales while preserving vouchers, numbering, source rows and future operations', async () => {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const client = await pool.connect();
  const schema = `archive_test_${randomUUID().replaceAll('-', '')}`;
  const dialect = new PgDialect();
  const execute = (query: ReturnType<typeof sql>) => {
    const compiled = dialect.sqlToQuery(query);
    return client.query(compiled.sql, compiled.params);
  };
  try {
    await client.query('BEGIN');
    await client.query(`CREATE SCHEMA "${schema}"`);
    await client.query(`SET LOCAL search_path TO "${schema}"`);
    await client.query(SALES_ARCHIVE_SCHEMA_SQL);
    await client.query(`CREATE TABLE invoices(id serial PRIMARY KEY, numero integer, amount numeric);
      CREATE TABLE vouchers(id text PRIMARY KEY, invoice_id integer REFERENCES invoices(id), balance numeric, code text);
      CREATE TABLE movements(id text PRIMARY KEY, amount numeric);
      INSERT INTO invoices(numero,amount) VALUES(96,200);
      INSERT INTO vouchers VALUES('gift',1,200,'KEEP-CODE');
      INSERT INTO movements VALUES('old',200);
      INSERT INTO sales_control_archive(kind,record_id,batch_id) VALUES('invoice','1','opening'),('account_movement','old','opening');`);
    expect((await execute(sql`SELECT * FROM invoices WHERE ${activeSalesRecord('invoice', sql`id`)}`)).rows).toHaveLength(0);
    expect((await execute(sql`SELECT coalesce(sum(amount),0)::text AS balance FROM movements WHERE ${activeSalesRecord('account_movement', sql`id`)}`)).rows[0].balance).toBe('0');
    expect((await client.query('SELECT v.*,i.numero FROM vouchers v JOIN invoices i ON i.id=v.invoice_id')).rows[0]).toMatchObject({ code:'KEEP-CODE',balance:'200',numero:96 });
    await client.query(`INSERT INTO invoices(numero,amount) VALUES(97,300); INSERT INTO movements VALUES('new',300);`);
    expect((await execute(sql`SELECT numero FROM invoices WHERE ${activeSalesRecord('invoice', sql`id`)}`)).rows).toEqual([{numero:97}]);
    expect((await execute(sql`SELECT sum(amount)::text AS balance FROM movements WHERE ${activeSalesRecord('account_movement', sql`id`)}`)).rows[0].balance).toBe('300');
    // Identical IDs in another domain must not accidentally hide an operation.
    expect((await execute(sql`SELECT 1 WHERE ${activeSalesRecord('cash_movement', sql`'old'`)}`)).rows).toHaveLength(1);
    expect((await client.query('SELECT count(*)::int AS n FROM invoices')).rows[0].n).toBe(2);
  } finally {
    await client.query('ROLLBACK');
    client.release();await pool.end();
  }
});
