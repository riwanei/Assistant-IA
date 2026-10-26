import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile, symlink, rm } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { Storage } from '../agent/lib/storage.ts';
import { execute } from '../agent/tools/index.ts';
import { runAgent } from '../agent/agent.ts';
import type { Provider, ToolCall } from '../agent/lib/provider.ts';
async function fixture(t: { after: (fn: () => Promise<void>) => void }) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'assistant-test-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const store = new Storage(root); await store.init();
  await writeFile(path.join(root, 'inbox/cours.md'), '# Réseau\nLe DNS associe des noms aux adresses.\n');
  return store;
}
test('lecture numérotée et recherche sourcée', async t => {
  const s = await fixture(t);
  assert.deepEqual(await execute(s, 'documents_list', { area: 'inbox' }), ['cours.md']);
  assert.match(JSON.stringify(await execute(s, 'document_read', { area: 'inbox', name: 'cours.md' })), /2: Le DNS/);
  assert.deepEqual(await execute(s, 'document_search', { query: 'dns' }), [{ name: 'cours.md', line: 2, text: 'Le DNS associe des noms aux adresses.' }]);
});
test('création vérifiée et refus des écrasements', async t => {
  const s = await fixture(t);
  assert.equal((await execute(s, 'report_create', { name: 'fiche.md', content: 'DNS [cours.md:2]' }) as { verified: boolean }).verified, true);
  await assert.rejects(execute(s, 'report_create', { name: 'fiche.md', content: 'écrasé' }));
  assert.equal(await s.read('outbox', 'fiche.md'), 'DNS [cours.md:2]');
});
test('refus chemins absolus, traversée et zone invalide', async t => {
  const s = await fixture(t);
  for (const name of ['../cours.md', '/etc/passwd', 'a/b.md', 'a\\b.md']) await assert.rejects(s.read('inbox', name));
  await assert.rejects(execute(s, 'document_read', { area: 'memory', name: 'cours.md' }));
});
test('refus liens symboliques fichier et dossier', async t => {
  const s = await fixture(t);
  await symlink(path.join(s.root, 'inbox/cours.md'), path.join(s.root, 'outbox/lien.md'));
  await assert.rejects(s.read('outbox', 'lien.md'));
  await rm(path.join(s.root, 'memory'), { recursive: true });
  await symlink(path.join(s.root, 'inbox'), path.join(s.root, 'memory'));
  await assert.rejects(s.create('memory', 'note.md', 'secret'));
});
test('mémoire refusée par défaut, accord et persistance après redémarrage', async t => {
  const s = await fixture(t);
  const args = { name: 'preference.md', content: 'Je préfère les exemples courts.' };
  assert.deepEqual(await execute(s, 'memory_save', args), { saved: false, reason: 'Accord refusé.' });
  assert.deepEqual(await s.list('memory'), []);
  await execute(s, 'memory_save', args, async () => true);
  const restarted = new Storage(s.root); await restarted.init();
  assert.match(JSON.stringify(await execute(restarted, 'memory_read', { query: 'courts' })), /validation utilisateur/);
});
test('compteur : vide, accents, espaces ; validation stricte', async t => {
  const s = await fixture(t);
  assert.deepEqual(await execute(s, 'compter_mots', { texte: ' Bonjour\nRiwane ' }), { nombre: 2, methode: 'séparation par espaces' });
  assert.equal((await execute(s, 'compter_mots', { texte: '   ' }) as { nombre: number }).nombre, 0);
  await assert.rejects(execute(s, 'compter_mots', { texte: 3 }));
  await assert.rejects(execute(s, 'compter_mots', { texte: 'a', commande: 'rm' }));
  await assert.rejects(execute(s, 'shell', {}));
  await assert.rejects(execute(s, 'toString', {}));
});
const call = (id: number, name: string, args: unknown): ToolCall => ({ id: String(id), type: 'function', function: { name, arguments: JSON.stringify(args) } });
test('boucle complète avec fournisseur simulé : liste, lecture, création, relecture', async t => {
  const s = await fixture(t);
  const calls = [call(1, 'documents_list', { area: 'inbox' }), call(2, 'document_read', { area: 'inbox', name: 'cours.md' }), call(3, 'report_create', { name: 'fiche.md', content: 'DNS — source cours.md:2' }), call(4, 'document_read', { area: 'outbox', name: 'fiche.md' })];
  let i = 0;
  const provider: Provider = async messages => {
    if (i > 0) assert.equal(messages.at(-1)?.role, 'tool');
    return i < calls.length ? { content: null, tool_calls: [calls[i++]], tokens: 1 } : { content: 'Fiche relue.', tokens: 1 };
  };
  const result = await runAgent({ prompt: 'Fais une fiche.', store: s, provider });
  assert.equal(result.text, 'Fiche relue.'); assert.equal(result.tokens, 5);
  assert.equal(await readFile(path.join(s.root, 'outbox/fiche.md'), 'utf8'), 'DNS — source cours.md:2');
});
test('argument JSON invalide renvoyé au modèle comme erreur outil', async t => {
  const s = await fixture(t); let n = 0;
  const provider: Provider = async messages => {
    if (n++ === 0) return { content: null, tokens: 0, tool_calls: [{ ...call(1, 'report_create', {}), function: { name: 'report_create', arguments: '{' } }] };
    assert.match(messages.at(-1)?.content ?? '', /error/);
    return { content: 'Erreur reconnue.', tokens: 0 };
  };
  await runAgent({ prompt: 'test', store: s, provider }); assert.deepEqual(await s.list('outbox'), []);
});
test('limite de tours et interruption', async t => {
  const s = await fixture(t); let n = 0;
  const provider: Provider = async () => ({ content: null, tokens: 0, tool_calls: [call(++n, 'compter_mots', { texte: 'test' })] });
  await assert.rejects(runAgent({ prompt: 'test', store: s, provider }), /Limite/); assert.equal(n, 10);
  const abort = new AbortController(); abort.abort();
  await assert.rejects(runAgent({ prompt: 'test', store: s, provider, signal: abort.signal })); assert.equal(n, 10);
});
