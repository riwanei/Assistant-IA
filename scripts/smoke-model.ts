import assert from 'node:assert/strict';
import { mkdtemp, copyFile } from 'node:fs/promises';
import path from 'node:path';
import { Storage } from '../agent/lib/storage.ts';
import { createProvider } from '../agent/lib/provider.ts';
import { runAgent } from '../agent/agent.ts';

// Véritable appel au fournisseur configuré : aucun remplacement par un modèle simulé.
const storeRoot = path.resolve('workspace');
const parent = new Storage(storeRoot); await parent.init();
const root = await mkdtemp(path.join(storeRoot, 'validation-'));
const store = new Storage(root); await store.init();
await copyFile(new URL('../examples/exemple-reseau.md', import.meta.url), path.join(root, 'inbox/exemple-reseau.md'));
console.log(`Dossier de validation : ${root}`);
const provider = createProvider();
try {
  const intro = await runAgent({ prompt: "Donne une définition simple d'une API en une phrase, sans outil.", store, provider });
  assert.ok(intro.text.trim() && intro.text !== '(Réponse vide)', 'Réponse du modèle vide.');
  console.log(intro.text);
  const result = await runAgent({
    prompt: 'Liste inbox, lis exemple-reseau.md puis crée fiche-validation.md dans outbox avec cinq notions, chacune accompagnée de son nom de fichier source et de ses lignes. Relis cette fiche avec document_read puis donne son chemin.',
    store, provider, trace: event => console.log(event)
  });
  const calls = result.history.flatMap(m => m.tool_calls ?? []);
  for (const name of ['documents_list', 'document_read', 'report_create']) {
    assert.ok(calls.some(c => c.function.name === name), `Outil manquant : ${name}`);
  }
  const rereadIndex = calls.findIndex(c => c.function.name === 'document_read' &&
    JSON.parse(c.function.arguments).area === 'outbox' && JSON.parse(c.function.arguments).name === 'fiche-validation.md');
  assert.ok(rereadIndex > calls.findIndex(c => c.function.name === 'report_create'), 'Relecture après création manquante.');
  const report = await store.read('outbox', 'fiche-validation.md');
  assert.match(report, /exemple-reseau\.md/);
  assert.ok(report.length > 100, 'Rapport trop court.');
  console.log(result.text);
  console.log('Parcours technique validé. Vérifier manuellement les cinq notions et la justesse des citations :');
  console.log(path.join(root, 'outbox/fiche-validation.md'));
} catch (error) {
  console.error(error instanceof Error ? error.message : 'Échec du test modèle.');
  process.exitCode = 1;
}
