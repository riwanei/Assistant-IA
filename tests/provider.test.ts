import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createProvider } from '../agent/lib/provider.ts';

test('adaptateur HTTP : format Ollama, réponse et erreur HTTP', async t => {
  let status = 200;
  const server = createServer(async (req, res) => {
    assert.equal(req.url, '/v1/chat/completions');
    assert.equal(req.method, 'POST');
    let body = ''; for await (const chunk of req) body += chunk;
    const data = JSON.parse(body);
    assert.equal(data.model, 'qwen3:4b');
    assert.equal(data.tools.length, 7);
    assert.equal(data.messages[0].content, 'Bonjour');
    res.writeHead(status, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ choices: [{ message: { content: 'Bonjour Riwane !' } }], usage: { total_tokens: 12 } }));
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address(); assert.ok(address && typeof address === 'object');
  const oldUrl = process.env.ASSISTANT_BASE_URL;
  const oldModel = process.env.ASSISTANT_MODEL;
  process.env.ASSISTANT_BASE_URL = `http://127.0.0.1:${address.port}/v1`;
  process.env.ASSISTANT_MODEL = 'qwen3:4b';
  t.after(async () => {
    if (oldUrl === undefined) delete process.env.ASSISTANT_BASE_URL; else process.env.ASSISTANT_BASE_URL = oldUrl;
    if (oldModel === undefined) delete process.env.ASSISTANT_MODEL; else process.env.ASSISTANT_MODEL = oldModel;
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  });
  const provider = createProvider();
  const reply = await provider([{ role: 'user', content: 'Bonjour' }]);
  assert.equal(reply.content, 'Bonjour Riwane !'); assert.equal(reply.tokens, 12);
  status = 401;
  await assert.rejects(provider([{ role: 'user', content: 'Bonjour' }]), /HTTP 401/);
});
