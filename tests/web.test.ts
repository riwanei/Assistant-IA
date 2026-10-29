import test from 'node:test';
import type { TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { Storage } from '../agent/lib/storage.ts';
import { createVoiceServer } from '../agent/web-server.ts';
import type { Provider } from '../agent/lib/provider.ts';

async function setup(t: TestContext, provider: Provider) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'assistant-web-'));
  const store = new Storage(root); await store.init();
  const server = createVoiceServer(store, provider);
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address(); assert.ok(address && typeof address === 'object');
  const url = `http://127.0.0.1:${address.port}`;
  t.after(async () => {
    server.closeAllConnections();
    await new Promise<void>(resolve => server.close(() => resolve()));
    await rm(root, { recursive: true, force: true });
  });
  const post = (route: string, input: unknown, session = '', signal?: AbortSignal) => fetch(url + route, {
    method: 'POST', signal, headers: { Origin: url, 'Content-Type': 'application/json', 'X-Session': session }, body: JSON.stringify(input)
  });
  const session = (await (await post('/api/session', {})).json()).session as string;
  return { url, post, session, store };
}
test('web : interface, refus des origines externes et des requêtes sans session', async t => {
  const { url, post } = await setup(t, async () => ({ content: 'Bonjour', tokens: 0 }));
  const page = await fetch(url); assert.equal(page.status, 200);
  assert.match(page.headers.get('content-security-policy') ?? '', /frame-ancestors 'none'/);
  assert.match(await page.text(), /Activer le micro/);
  const forbidden = await fetch(url + '/api/session', { method: 'POST', headers: { Origin: 'https://evil.example', 'Content-Type': 'application/json' }, body: '{}' });
  assert.equal(forbidden.status, 403);
  assert.equal((await post('/api/chat', { prompt: 'test' })).status, 401);
  assert.equal((await fetch(url + '/.env')).status, 404);
});
test('web : conversation, historique isolé et remise à zéro', async t => {
  const counts: number[] = [];
  const { post, session } = await setup(t, async messages => { counts.push(messages.length); return { content: '<script>test</script> Bonjour', tokens: 3 }; });
  const result = await (await post('/api/chat', { prompt: 'Bonjour' }, session)).text();
  assert.match(result, /"type":"answer"/);
  await (await post('/api/chat', { prompt: 'Et ensuite ?' }, session)).text();
  const other = (await (await post('/api/session', {})).json()).session;
  await (await post('/api/chat', { prompt: 'Bonjour' }, other)).text();
  await post('/api/reset', {}, session);
  await (await post('/api/chat', { prompt: 'Bonjour' }, session)).text();
  assert.deepEqual(counts, [2, 4, 2, 2]);
  assert.equal((await post('/api/chat', { prompt: '' }, session)).status, 400);
});
test('web : mémoire écrite uniquement après approbation de la bonne session', async t => {
  const { post, session, store } = await setup(t, async messages => messages.at(-1)?.role === 'tool'
    ? { content: 'Préférence enregistrée.', tokens: 0 }
    : { content: null, tokens: 0, tool_calls: [{ id: '1', type: 'function', function: { name: 'memory_save', arguments: JSON.stringify({ name: 'voix.md', content: 'Réponds en français.' }) } }] });
  const response = await post('/api/chat', { prompt: 'Mémorise ma préférence.' }, session);
  const reader = response.body!.getReader(); const decoder = new TextDecoder(); let buffer = ''; let approved = false;
  while (true) {
    const { done, value } = await reader.read(); if (done) break;
    buffer += decoder.decode(value, { stream: true }); let newline;
    while ((newline = buffer.indexOf('\n')) !== -1) {
      const event = JSON.parse(buffer.slice(0, newline)); buffer = buffer.slice(newline + 1);
      if (event.type === 'approval') {
        assert.deepEqual(await store.list('memory'), []);
        const other = (await (await post('/api/session', {})).json()).session;
        assert.equal((await post('/api/confirm', { id: event.id, approved: true }, other)).status, 409);
        assert.equal((await post('/api/confirm', { id: event.id, approved: true }, session)).status, 200);
        approved = true;
      }
    }
  }
  assert.ok(approved); assert.match(await store.read('memory', 'voix.md'), /Réponds en français/);
});
test('web : déconnexion annule le fournisseur et libère la session', async t => {
  let notify: () => void = () => {};
  const aborted = new Promise<void>(resolve => { notify = resolve; });
  const { post, session } = await setup(t, async (_messages, signal) => new Promise((_resolve, reject) => {
    signal!.addEventListener('abort', () => { notify(); reject(new Error('Annulé')); }, { once: true });
  }));
  const controller = new AbortController();
  const response = await post('/api/chat', { prompt: 'Attends' }, session, controller.signal);
  assert.equal((await post('/api/chat', { prompt: 'Encore' }, session)).status, 409);
  controller.abort();
  await aborted;
  assert.equal((await post('/api/reset', {}, session)).status, 200);
  void response;
});
