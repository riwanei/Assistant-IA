import { createServer } from 'node:http';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { Storage } from './lib/storage.ts';
import { createProvider } from './lib/provider.ts';
import type { Provider, Message } from './lib/provider.ts';
import { runAgent } from './agent.ts';

type Session = { history: Message[]; touched: number; active?: AbortController;
  approval?: { id: string; resolve: (approved: boolean) => void } };
async function body(req: IncomingMessage) {
  if (req.headers['content-type']?.split(';')[0] !== 'application/json') throw new Error('JSON requis.');
  const chunks: Buffer[] = []; let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 32_000) throw new Error('Demande trop longue.');
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown;
}
function json(res: ServerResponse, status: number, value: unknown) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(value));
}
export function createVoiceServer(store: Storage, provider: Provider = createProvider()) {
  const sessions = new Map<string, Session>();
  const files: Record<string, [string, string]> = {
    '/': ['index.html', 'text/html'], '/app.js': ['app.js', 'text/javascript'], '/style.css': ['style.css', 'text/css']
  };
  const server = createServer(async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
    const address = server.address();
    if (!address || typeof address === 'string') return json(res, 503, { error: 'Serveur indisponible.' });
    const hosts = [`127.0.0.1:${address.port}`, `localhost:${address.port}`];
    if (!hosts.includes(req.headers.host ?? '')) return json(res, 403, { error: 'Hôte refusé.' });
    if (req.method === 'POST' && req.headers.origin !== `http://${req.headers.host}`) return json(res, 403, { error: 'Origine refusée.' });
    try {
      const route = req.url ?? '/';
      if (req.method === 'GET' && Object.hasOwn(files, route)) {
        const [file, type] = files[route];
        const content = await readFile(new URL(`../web/${file}`, import.meta.url));
        res.writeHead(200, { 'Content-Type': `${type}; charset=utf-8` }); res.end(content); return;
      }
      if (req.method !== 'POST') return json(res, 404, { error: 'Route inconnue.' });
      const input = await body(req);
      if (route === '/api/session') {
        for (const [id, session] of sessions) if (!session.active && Date.now() - session.touched > 30 * 60_000) sessions.delete(id);
        if (sessions.size >= 32) return json(res, 429, { error: 'Trop de sessions. Fermez les anciens onglets et réessayez plus tard.' });
        const id = randomUUID(); sessions.set(id, { history: [], touched: Date.now() });
        return json(res, 200, { session: id, name: process.env.ASSISTANT_NAME || 'MON_ASSISTANT', model: process.env.ASSISTANT_MODEL || 'qwen3:4b' });
      }
      const session = sessions.get(String(req.headers['x-session'] ?? ''));
      if (!session) return json(res, 401, { error: 'Session expirée : rechargez la page.' });
      session.touched = Date.now();
      if (route === '/api/confirm') {
        const data = z.strictObject({ id: z.string(), approved: z.boolean() }).parse(input);
        if (!session.approval || session.approval.id !== data.id) return json(res, 409, { error: 'Demande expirée.' });
        session.approval.resolve(data.approved); return json(res, 200, { ok: true });
      }
      if (route === '/api/reset') {
        if (session.active) return json(res, 409, { error: 'Arrêtez la mission avant de recommencer.' });
        session.history = []; return json(res, 200, { ok: true });
      }
      if (route !== '/api/chat') return json(res, 404, { error: 'Route inconnue.' });
      const { prompt } = z.strictObject({ prompt: z.string().trim().min(1).max(8000) }).parse(input);
      if (session.active) return json(res, 409, { error: 'Une mission est déjà en cours.' });
      const controller = new AbortController(); session.active = controller;
      res.writeHead(200, { 'Content-Type': 'application/x-ndjson; charset=utf-8' }); res.flushHeaders();
      const emit = (event: unknown) => { if (!res.destroyed) res.write(JSON.stringify(event) + '\n'); };
      res.on('close', () => { if (!res.writableEnded) controller.abort(); });
      try {
        const result = await runAgent({ prompt, store, provider, history: session.history, signal: controller.signal,
          trace: text => emit({ type: 'trace', text }),
          confirm: (name, content) => new Promise<boolean>(resolve => {
            const id = randomUUID();
            const done = (approved: boolean) => {
              clearTimeout(timer); controller.signal.removeEventListener('abort', abort);
              session.approval = undefined; resolve(approved);
            };
            const abort = () => done(false);
            const timer = setTimeout(() => done(false), 120_000);
            session.approval = { id, resolve: done };
            controller.signal.addEventListener('abort', abort, { once: true });
            if (controller.signal.aborted) return done(false);
            emit({ type: 'approval', id, name, content });
          })
        });
        if (!controller.signal.aborted) { session.history = result.history; emit({ type: 'answer', text: result.text, tokens: result.tokens }); }
      } catch (error) {
        emit({ type: 'error', text: controller.signal.aborted ? 'Mission arrêtée.' : error instanceof Error ? error.message : 'Erreur inconnue.' });
      } finally {
        session.approval?.resolve(false); session.active = undefined; session.touched = Date.now(); res.end();
      }
    } catch (error) {
      if (!res.headersSent) json(res, 400, { error: error instanceof z.ZodError ? 'Demande invalide.' : error instanceof Error ? error.message : 'Erreur inconnue.' });
      else res.end();
    }
  });
  server.on('close', () => { for (const session of sessions.values()) session.active?.abort(); });
  return server;
}
