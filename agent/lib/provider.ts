import { z } from 'zod';
import { definitions } from '../tools/index.ts';
export type Message = { role: 'system' | 'user' | 'assistant' | 'tool'; content: string | null; tool_calls?: ToolCall[]; tool_call_id?: string };
export type ToolCall = { id: string; type: 'function'; function: { name: string; arguments: string } };
const responseSchema = z.object({ choices: z.array(z.object({ message: z.object({
  content: z.string().nullable().optional(),
  tool_calls: z.array(z.object({ id: z.string(), type: z.literal('function'), function: z.object({ name: z.string(), arguments: z.string() }) })).max(10).optional()
}) })).min(1), usage: z.object({ total_tokens: z.number() }).optional() });
export type Reply = { content: string | null; tool_calls?: ToolCall[]; tokens: number };
export type Provider = (messages: Message[], signal?: AbortSignal) => Promise<Reply>;
export function createProvider(): Provider {
  const base = new URL(process.env.ASSISTANT_BASE_URL || 'http://127.0.0.1:11434/v1');
  const local = ['127.0.0.1', 'localhost', '[::1]'].includes(base.hostname);
  if (base.protocol !== 'https:' && !(local && base.protocol === 'http:')) throw new Error('HTTPS requis hors machine locale.');
  if (base.username || base.password || base.search || base.hash) throw new Error('URL API invalide.');
  const key = process.env.ASSISTANT_API_KEY;
  if (!local && !key) throw new Error('Configurez ASSISTANT_API_KEY dans .env ou les paramètres sécurisés.');
  const model = process.env.ASSISTANT_MODEL || 'qwen3:4b';
  return async (messages, signal) => {
    const timeout = AbortSignal.timeout(60_000);
    const response = await fetch(`${base.href.replace(/\/$/, '')}/chat/completions`, {
      method: 'POST', redirect: 'error',
      signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
      headers: { 'Content-Type': 'application/json', ...(key ? { Authorization: `Bearer ${key}` } : {}) },
      body: JSON.stringify({ model, messages, tools: definitions, max_tokens: 3000 })
    });
    if (!response.ok) {
      const hint = response.status === 404
        ? 'Modèle ou endpoint introuvable. Avec Ollama, lancez ollama pull ' + model + ' et vérifiez ASSISTANT_BASE_URL.'
        : 'Vérifiez accès, modèle et quota.';
      throw new Error(`Fournisseur : HTTP ${response.status}. ${hint}`);
    }
    const data = responseSchema.parse(await response.json());
    return { content: data.choices[0].message.content ?? null, tool_calls: data.choices[0].message.tool_calls, tokens: data.usage?.total_tokens ?? 0 };
  };
}
