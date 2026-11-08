import { afterEach, expect, it, vi } from 'vitest';
import { fetchChannexRatePlans, fetchChannexRoomTypes } from '../channex/client';
const connection = { baseUrl: 'https://staging.channex.io/api/v1', apiKey: 'synthetic-test-key' };
const response = (body: unknown) => new Response(JSON.stringify(body), { status: 200 });
afterEach(() => vi.unstubAllGlobals());
it('collects every page before returning a catalog snapshot', async () => {
  const fetch = vi.fn().mockResolvedValueOnce(response({data:[{id:'one'}],meta:{page:1,total:2}}))
    .mockResolvedValueOnce(response({data:[{id:'two'}],meta:{page:2,total:2}}));
  vi.stubGlobal('fetch', fetch);
  expect(await fetchChannexRatePlans(connection, 'property')).toEqual([{id:'one'},{id:'two'}]);
  expect(fetch.mock.calls[1][0]).toContain('pagination[page]=2');
});
it.each([
  [{}, null],
  [{data:[{id:'one'}],meta:{page:1,total:2}}, {data:[],meta:{page:2,total:2}}],
  [{data:[{id:'one'}],meta:{page:1,total:2}}, {data:[{id:'one'}],meta:{page:2,total:2}}],
  [{data:[{id:'one'}],meta:{page:1,total:2}}, {data:[{id:'two'}],meta:{page:2,total:3}}],
  [{data:[],links:{next:'/unexpected'}}, null],
])('rejects malformed, truncated, repeated or changing pages', async (first, second) => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(response(first)).mockResolvedValueOnce(response(second)));
  await expect(fetchChannexRatePlans(connection, 'property')).rejects.toThrow('se conserva el catálogo anterior');
});
it('accepts a confirmed empty catalog', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response({data:[],meta:{page:1,total:0}})));
  expect(await fetchChannexRoomTypes(connection, 'property')).toEqual([]);
});
it('propagates a failed later page instead of returning a partial list', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(response({data:[{id:'one'}],meta:{page:1,total:2}}))
    .mockResolvedValueOnce(new Response('unavailable', {status:503})));
  await expect(fetchChannexRatePlans(connection, 'property')).rejects.toMatchObject({status:503});
});
