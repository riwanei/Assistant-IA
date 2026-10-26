import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import { Storage } from './lib/storage.ts';
import { createProvider } from './lib/provider.ts';
import type { Message } from './lib/provider.ts';
import { execute } from './tools/index.ts';
import { runAgent } from './agent.ts';
const store = new Storage();
await store.init();
const rl = createInterface({ input: stdin, output: stdout });
const safe = (s: string) => s.replace(/[\u0000-\u0008\u000b-\u001f\u007f-\u009f]/g, '');
console.log(`${process.env.ASSISTANT_NAME || 'MON_ASSISTANT'} — assistant d'étude de Riwane`);
console.log('Modèle : ' + (process.env.ASSISTANT_MODEL || 'qwen3:4b'));
console.log('/aide · /documents · /memoire · /nouveau · /quitter. Ctrl+C : arrêter.');
let closed = false;
rl.on('close', () => { closed = true; });
let history: Message[] = [];
let active: AbortController | undefined;
rl.on('SIGINT', () => { if (active) { active.abort(); console.log('\nArrêt demandé.'); } else rl.close(); });
try {
  while (!closed) {
    const prompt = (await rl.question('\nVous > ')).trim();
    if (!prompt) continue;
    if (prompt === '/quitter') break;
    if (prompt === '/aide') { console.log('Déposez des .md/.txt dans workspace/inbox. Demandez une fiche sourcée, un quiz ou une recherche. /nouveau efface le contexte en mémoire vive. Les préférences approuvées restent dans workspace/memory ; modifiez/supprimez ces fichiers pour les gérer.'); continue; }
    if (prompt === '/nouveau') { history = []; console.log('Nouvelle conversation.'); continue; }
    if (prompt === '/documents' || prompt === '/memoire') {
      console.log(safe(JSON.stringify(await execute(store, prompt === '/documents' ? 'documents_list' : 'memory_read', prompt === '/documents' ? { area: 'inbox' } : { query: '' }), null, 2))); continue;
    }
    active = new AbortController();
    try {
      const result = await runAgent({ prompt, store, provider: createProvider(), history, signal: active.signal,
        trace: event => console.log(safe(`[${event}]`)),
        confirm: async (name, content) => {
          console.log(safe(`\nMémoire proposée : ${name}\n${content}`));
          const answer = await rl.question('Enregistrer cette préférence ? [oui/non] ', { signal: active!.signal });
          return answer.trim().toLowerCase() === 'oui';
        }
      });
      history = result.history;
      console.log(safe(`\n${result.text}\n[Jetons rapportés par le fournisseur : ${result.tokens}]`));
    } catch (error) {
      console.error(active.signal.aborted ? 'Mission interrompue. Les fichiers créés restent disponibles.' : safe(error instanceof Error ? error.message : 'Erreur inconnue.'));
    } finally { active = undefined; }
  }
} catch (error) {
  if (!closed) throw error;
} finally { rl.close(); }
