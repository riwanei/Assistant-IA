import { Storage } from './lib/storage.ts';
import { createVoiceServer } from './web-server.ts';
const store = new Storage(); await store.init();
const port = Number(process.env.ASSISTANT_WEB_PORT || 3210);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('ASSISTANT_WEB_PORT doit être compris entre 1 et 65535.');
const server = createVoiceServer(store);
server.on('error', error => { console.error(`Démarrage impossible : ${error.message}`); process.exitCode = 1; });
server.listen(port, '127.0.0.1', () => {
  console.log(`Assistant vocal : ouvrez http://127.0.0.1:${port} dans Chrome ou Edge sur ce PC.`);
  console.log('Ollama doit être démarré avec le modèle installé. Ctrl+C pour quitter.');
});
