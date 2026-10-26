import { copyFile, constants } from 'node:fs/promises';
import path from 'node:path';
import { Storage } from '../agent/lib/storage.ts';
const s = new Storage(); await s.init();
try {
  await copyFile(new URL('../examples/exemple-reseau.md', import.meta.url), path.join(s.root, 'inbox/exemple-reseau.md'), constants.COPYFILE_EXCL);
} catch (e) { if ((e as NodeJS.ErrnoException).code !== 'EEXIST') throw e; }
console.log('Dossiers prêts ; documents existants conservés.');
