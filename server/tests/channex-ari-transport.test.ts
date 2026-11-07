import { afterEach, describe, expect, it, vi } from 'vitest';
import { sendAri, AriTransportError } from '../channex/ariWorker';
vi.mock('../channex/credentials', () => ({ decryptChannexApiKey: () => 'synthetic-test-key' }));
const connection = { environment: 'demo', base_url: 'https://staging.channex.io/api/v1', api_key_encrypted: 'synthetic-cipher' };
const values = [{ property_id: 'property', room_type_id: 'twin', date_from: '2026-11-21', date_to: '2026-11-22', availability: 7 }];
afterEach(() => vi.unstubAllGlobals());
describe('Channex ARI transport', () => {
  it('does not accept partial success warnings even when task IDs are returned',async()=>{
    vi.stubGlobal('fetch',vi.fn(async()=>new Response(JSON.stringify({data:[{type:'task',id:'00000000-0000-4000-8000-000000000001'}],meta:{warnings:[{warning:{rates:['invalid']}}]}}),{status:200})));
    await expect(sendAri(connection,'restrictions',values)).rejects.toThrow(/advertencias de validación/);
  });
  it('sends one batched absolute payload to staging and returns provider task IDs', async () => {
    const id = '00000000-0000-4000-8000-000000000001';
    const fetcher = vi.fn(async () => new Response(JSON.stringify({ data: [{ id, type: 'task' }] }), { status: 200 })); vi.stubGlobal('fetch', fetcher);
    expect(await sendAri(connection, 'availability', values)).toEqual([id]);
    expect(fetcher).toHaveBeenCalledTimes(1);
    const [url, options] = fetcher.mock.calls[0] as any;
    expect(url).toBe('https://staging.channex.io/api/v1/availability');
    expect(JSON.parse(options.body)).toEqual({ values }); expect(options.headers['user-api-key']).toBe('synthetic-test-key');
  });
  it('serializes a merged restrictions range without adding unrelated fields', async () => {
    const rows=[{property_id:'property',rate_plan_id:'bar',date_from:'2026-12-04',date_to:'2026-12-10',stop_sell:false}];
    const fetcher=vi.fn(async()=>new Response(JSON.stringify({data:[{type:'task',id:'00000000-0000-4000-8000-000000000001'}]}),{status:200}));vi.stubGlobal('fetch',fetcher);
    await sendAri(connection,'restrictions',rows);
    const [url,options]=fetcher.mock.calls[0] as any;
    expect(url).toBe('https://staging.channex.io/api/v1/restrictions');
    expect(JSON.parse(options.body)).toEqual({values:rows});expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it('rejects production and custom hosts before transmitting credentials', async () => {
    const fetcher = vi.fn(); vi.stubGlobal('fetch', fetcher);
    await expect(sendAri({ ...connection, environment: 'real' }, 'availability', values)).rejects.toThrow('no están habilitados');
    await expect(sendAri({ ...connection, base_url: 'https://other.example/api/v1' }, 'availability', values)).rejects.toThrow('no están habilitados');
    expect(fetcher).not.toHaveBeenCalled();
  });
  it('preserves rate-limit metadata without exposing response bodies', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('sensitive provider response', { status: 429, headers: { 'Retry-After': '120' } })));
    await expect(sendAri(connection, 'availability', values)).rejects.toMatchObject({ status: 429, retryAfter: '120', message: 'Channex HTTP 429' });
  });
  it.each(['<html>proxy</html>', JSON.stringify({ data: [] })])('retries invalid success bodies instead of acknowledging the outbox', async body => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(body, { status: 200 })));
    await expect(sendAri(connection, 'availability', values)).rejects.toBeInstanceOf(AriTransportError);
  });
});
