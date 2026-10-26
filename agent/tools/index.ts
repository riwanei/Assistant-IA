import { z } from 'zod';
import { Storage, numbered } from '../lib/storage.ts';

const area = z.enum(['inbox', 'outbox']);
const name = z.string().min(1).max(125);
const text = z.string().max(60_000);
const specs = {
  documents_list: { description: 'Liste les documents texte dans inbox ou outbox.', schema: z.strictObject({ area }) },
  document_read: { description: 'Lit un document texte avec ses numéros de ligne.', schema: z.strictObject({ area, name }) },
  document_search: { description: 'Recherche un texte exact dans inbox (20 résultats maximum).', schema: z.strictObject({ query: z.string().min(2).max(200) }) },
  report_create: { description: 'Crée et vérifie un nouveau rapport, sans écraser un fichier.', schema: z.strictObject({ name, content: text }) },
  memory_save: { description: 'Propose une préférence à mémoriser ; accord humain obligatoire.', schema: z.strictObject({ name, content: z.string().min(1).max(4000) }) },
  memory_read: { description: 'Relit les préférences persistantes, filtrées par texte (vide = toutes).', schema: z.strictObject({ query: z.string().max(200) }) },
  compter_mots: { description: 'Compte les éléments séparés par des espaces.', schema: z.strictObject({ texte: z.string().max(12000) }) }
};
export const definitions = Object.entries(specs).map(([name, s]) => ({
  type: 'function', function: { name, description: s.description, parameters: z.toJSONSchema(s.schema) }
}));
export type Confirm = (name: string, content: string) => Promise<boolean>;
export async function execute(store: Storage, tool: string, input: unknown, confirm: Confirm = async () => false): Promise<unknown> {
  if (!Object.hasOwn(specs, tool)) throw new Error('Outil inconnu.');
  const args = specs[tool as keyof typeof specs].schema.parse(input) as Record<string, string>;
  switch (tool) {
    case 'documents_list': return store.list(args.area as 'inbox' | 'outbox');
    case 'document_read': return { source: `${args.area}/${args.name}`, content: numbered(await store.read(args.area as 'inbox' | 'outbox', args.name)) };
    case 'report_create': return store.create('outbox', args.name, args.content);
    case 'memory_save': {
      if (!await confirm(args.name, args.content)) return { saved: false, reason: 'Accord refusé.' };
      return store.create('memory', args.name, `Date : ${new Date().toISOString()}\nProvenance : validation utilisateur\n\n${args.content}`);
    }
    case 'memory_read': {
      const results = [];
      for (const name of (await store.list('memory')).slice(0, 20)) {
        const content = await store.read('memory', name);
        if (content.toLocaleLowerCase().includes(args.query.toLocaleLowerCase())) results.push({ name, content });
        if (JSON.stringify(results).length > 60_000) throw new Error('Mémoire trop longue : préciser la recherche.');
      }
      return results;
    }
    case 'document_search': {
      const results = [];
      for (const name of await store.list('inbox')) {
        const lines = (await store.read('inbox', name)).split('\n');
        for (let i = 0; i < lines.length; i++) {
          if (lines[i].toLocaleLowerCase().includes(args.query.toLocaleLowerCase())) results.push({ name, line: i + 1, text: lines[i] });
          if (results.length === 20) return results;
        }
      }
      return results;
    }
    case 'compter_mots': return { nombre: args.texte.trim() ? args.texte.trim().split(/\s+/).length : 0, methode: 'séparation par espaces' };
  }
}
