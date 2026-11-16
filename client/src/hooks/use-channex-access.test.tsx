import { act, cleanup, render } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, expect, it, vi } from 'vitest';
import { useChannexAccess } from './use-channex-access';

afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals(); });
function Consumer({ poll = false }: { poll?: boolean }) { useChannexAccess({ poll }); return null; }
async function advance(ms: number) { await act(async () => { await vi.advanceTimersByTimeAsync(ms); }); }

it('shares access checks across panels while only the sidebar refreshes them periodically', async () => {
  vi.useFakeTimers();
  const fetch = vi.fn(async (_url: RequestInfo | URL, _options?: RequestInit) => new Response(JSON.stringify({ entry: true, config: true })));
  vi.stubGlobal('fetch', fetch);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  function View({ sidebar = true, extra = false }) {
    return <QueryClientProvider client={client}>
      {sidebar && <Consumer key="sidebar" poll />}
      <Consumer key="page" /><Consumer key="panel" />{extra && <Consumer key="new-panel" />}
    </QueryClientProvider>;
  }
  const view = render(<View />); await advance(10);
  expect(fetch).toHaveBeenCalledTimes(1);
  await advance(10_000); view.rerender(<View extra />); await advance(10);
  expect(fetch).toHaveBeenCalledTimes(1);
  await advance(20_000); expect(fetch).toHaveBeenCalledTimes(1);
  await advance(30_000); expect(fetch).toHaveBeenCalledTimes(2);
  view.rerender(<View sidebar={false} extra />); await advance(180_000);
  expect(fetch).toHaveBeenCalledTimes(2);
  expect(fetch.mock.calls.every(([url]) => url === '/api/channex/access')).toBe(true);
  client.clear();
});
