import {sql,type SQL} from 'drizzle-orm';

/** Explicit timestamps: system_settings.updated_at is NOT NULL without a
 * database default. Save both supplied options atomically in one statement. */
export async function saveBackupConfig(executor:{execute(query:SQL):Promise<unknown>},config:{enabled?:unknown;email?:unknown},actor:string|null){
  const rows:SQL[]=[];
  if(typeof config.enabled==='boolean')rows.push(sql`(${'backup_auto_enabled'},${config.enabled?'true':'false'},now(),${actor})`);
  if(typeof config.email==='string')rows.push(sql`(${'backup_email'},${config.email},now(),${actor})`);
  if(!rows.length)return;
  await executor.execute(sql`
    INSERT INTO system_settings (key,value,updated_at,updated_by)
    VALUES ${sql.join(rows,sql`, `)}
    ON CONFLICT (key) DO UPDATE SET
      value=EXCLUDED.value,
      updated_at=EXCLUDED.updated_at,
      updated_by=EXCLUDED.updated_by
  `);
}
