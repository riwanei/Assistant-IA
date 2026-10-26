import { readFile } from 'node:fs/promises';
import { Storage } from './lib/storage.ts';
import { execute } from './tools/index.ts';
import type { Confirm } from './tools/index.ts';
import type { Provider, Message } from './lib/provider.ts';
export async function runAgent(options: { prompt: string; store: Storage; provider: Provider; confirm?: Confirm; signal?: AbortSignal; trace?: (event: string) => void; history?: Message[] }) {
  const instructions = await readFile(new URL('./instructions.md', import.meta.url), 'utf8');
  const messages: Message[] = [{ role: 'system', content: instructions }, ...(options.history ?? []), { role: 'user', content: options.prompt }];
  let tokens = 0;
  for (let step = 0; step < 10; step++) {
    options.signal?.throwIfAborted();
    if (JSON.stringify(messages).length > 180_000) throw new Error('Contexte trop long. Utilisez /nouveau et une demande plus ciblée.');
    options.trace?.(`Réflexion ${step + 1}/10`);
    const reply = await options.provider(messages, options.signal);
    options.signal?.throwIfAborted();
    tokens += reply.tokens;
    messages.push({ role: 'assistant', content: reply.content, ...(reply.tool_calls?.length ? { tool_calls: reply.tool_calls } : {}) });
    if (!reply.tool_calls?.length) return { text: reply.content || '(Réponse vide)', tokens, history: messages.slice(1) };
    for (const call of reply.tool_calls) {
      options.signal?.throwIfAborted();
      options.trace?.(`Outil : ${call.function.name}`);
      let result;
      try { result = await execute(options.store, call.function.name, JSON.parse(call.function.arguments), options.confirm); }
      catch (error) { result = { error: error instanceof Error ? error.message : 'Erreur outil' }; }
      messages.push({ role: 'tool', tool_call_id: call.id, content: JSON.stringify(result) });
      options.trace?.(`Résultat : ${JSON.stringify(result).slice(0, 350)}`);
    }
  }
  throw new Error('Limite de 10 appels au modèle atteinte. Les fichiers déjà créés sont conservés.');
}
