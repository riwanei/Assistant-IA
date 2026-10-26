import { mkdir, realpath, lstat, readdir, open } from 'node:fs/promises';
import { constants } from 'node:fs';
import path from 'node:path';

export type Area = 'inbox' | 'outbox' | 'memory';
export class Storage {
  root: string;
  constructor(root = path.resolve('workspace')) { this.root = path.resolve(root); }
  async init() {
    await mkdir(this.root, { recursive: true });
    if ((await lstat(this.root)).isSymbolicLink()) throw new Error('Dossier racine symbolique interdit.');
    for (const area of ['inbox', 'outbox', 'memory'] as Area[]) {
      await mkdir(path.join(this.root, area), { recursive: true });
      await this.directory(area);
    }
  }
  async directory(area: Area) {
    if (!['inbox', 'outbox', 'memory'].includes(area)) throw new Error('Zone interdite.');
    const dir = path.join(this.root, area);
    if ((await lstat(dir)).isSymbolicLink() || await realpath(dir) !== path.join(await realpath(this.root), area)) {
      throw new Error('Lien symbolique interdit.');
    }
    return dir;
  }
  async file(area: Area, name: string) {
    if (!/^[\p{L}\p{N}_-][\p{L}\p{N}_. -]{0,119}\.(md|txt)$/u.test(name) || name.includes('..')) {
      throw new Error('Nom invalide : fichier .md ou .txt sans chemin.');
    }
    return path.join(await this.directory(area), name);
  }
  async list(area: Area) {
    const entries = await readdir(await this.directory(area), { withFileTypes: true });
    return entries.filter(e => e.isFile() && /\.(md|txt)$/.test(e.name)).map(e => e.name).sort().slice(0, 100);
  }
  async read(area: Area, name: string) {
    const file = await this.file(area, name);
    if ((await lstat(file)).isSymbolicLink()) throw new Error('Lien symbolique interdit.');
    const h = await open(file, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
    try {
      const stat = await h.stat();
      if (!stat.isFile() || stat.size > 120_000) throw new Error('Fichier non régulier ou supérieur à 120 Ko.');
      return await h.readFile('utf8');
    } finally { await h.close(); }
  }
  async create(area: 'outbox' | 'memory', name: string, content: string) {
    if (!['outbox', 'memory'].includes(area)) throw new Error('Écriture interdite.');
    if (Buffer.byteLength(content) > 120_000) throw new Error('Contenu supérieur à 120 Ko.');
    const file = await this.file(area, name);
    const h = await open(file, 'wx');
    try { await h.writeFile(content, 'utf8'); } finally { await h.close(); }
    const reread = await this.read(area, name);
    if (reread !== content) throw new Error('Échec de vérification après écriture.');
    return { path: file, verified: true };
  }
}
export const numbered = (text: string) => text.split('\n').map((line, i) => `${i + 1}: ${line}`).join('\n');
