const el = id => document.getElementById(id);
const synthesis = window.speechSynthesis;
const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
let session, busy = false, listening = false, speaking = false, controller, recognition;
let lastAnswer = '', approvalId, speechGeneration = 0, utterance;
function status(text) { el('status').textContent = text; }
function controls() {
  el('send').disabled = !session || busy || listening;
  el('mic').disabled = !session || busy || !Recognition;
  el('mic').textContent = listening ? 'Terminer la dictée' : 'Activer le micro';
  el('mic').setAttribute('aria-pressed', String(listening));
  el('stop').disabled = !busy && !listening && !speaking;
  el('reset').disabled = !session || busy || listening;
  el('replay').disabled = !synthesis || !lastAnswer || busy || listening;
}
function message(text, role) {
  const node = document.createElement('div'); node.className = `message ${role}`;
  const label = document.createElement('strong'); label.textContent = role === 'user' ? 'TOI' : role === 'error' ? 'INFORMATION' : el('name').textContent;
  node.append(label, document.createTextNode(text)); el('messages').append(node);
  node.scrollIntoView({ block: 'nearest' });
}
async function api(route, input, signal) {
  const response = await fetch(route, { method: 'POST', signal,
    headers: { 'Content-Type': 'application/json', ...(session ? { 'X-Session': session } : {}) }, body: JSON.stringify(input) });
  if (!response.ok) { const data = await response.json(); throw new Error(data.error || `Erreur HTTP ${response.status}`); }
  return response;
}
function stopSpeech() { speechGeneration++; synthesis?.cancel(); speaking = false; utterance = undefined; controls(); }
function readAloud(text) {
  stopSpeech();
  if (!synthesis) return;
  const generation = speechGeneration;
  // Petits segments pour éviter les coupures sur les longues réponses.
  const chunks = text.replace(/https?:\/\/\S+/g, 'lien affiché').replace(/[#*`]/g, '').match(/.{1,220}(?:\s|$)|.{1,220}/gs) || [];
  let index = 0; speaking = true; controls(); status('Je te réponds…');
  const next = () => {
    if (generation !== speechGeneration) return;
    if (index >= chunks.length) { speaking = false; controls(); status('À toi de parler.'); return; }
    utterance = new SpeechSynthesisUtterance(chunks[index++]); utterance.lang = 'fr-FR';
    utterance.voice = synthesis.getVoices().find(v => v.voiceURI === el('voice').value) || null;
    utterance.onend = next;
    utterance.onerror = () => { if (generation === speechGeneration) { speaking = false; controls(); status('Lecture audio indisponible. La réponse reste affichée.'); } };
    synthesis.speak(utterance);
  };
  next();
}
function loadVoices() {
  const previous = el('voice').value;
  const voices = synthesis?.getVoices().filter(v => v.lang.toLowerCase().startsWith('fr')).sort((a, b) => Number(b.localService) - Number(a.localService)) || [];
  el('voice').replaceChildren(new Option('Voix du système', ''));
  for (const voice of voices) el('voice').add(new Option(voice.name + (voice.localService ? ' · locale' : ' · en ligne'), voice.voiceURI));
  el('voice').value = voices.some(v => v.voiceURI === previous) ? previous : voices[0]?.voiceURI || '';
}
function hideApproval() { approvalId = undefined; el('approval').hidden = true; }
async function approve(approved) {
  if (!approvalId) return;
  el('approve').disabled = el('deny').disabled = true;
  try { await api('/api/confirm', { id: approvalId, approved }); hideApproval(); status('Je poursuis…'); }
  catch (error) { message(error.message, 'error'); hideApproval(); }
}
async function send() {
  if (busy || !session) return;
  const prompt = el('prompt').value.trim(); if (!prompt) return;
  stopSpeech(); busy = true; controller = new AbortController(); controls(); hideApproval();
  message(prompt, 'user'); el('prompt').value = ''; el('activity').textContent = ''; status('Je réfléchis…');
  let completed = false;
  try {
    const response = await api('/api/chat', { prompt }, controller.signal);
    const reader = response.body.getReader(); const decoder = new TextDecoder(); let buffer = '';
    const event = data => {
      if (data.type === 'trace') { el('activity').textContent += data.text + '\n'; }
      if (data.type === 'approval') {
        approvalId = data.id; el('approval-content').textContent = `${data.name}\n\n${data.content}`;
        el('approval').hidden = false; el('approve').disabled = el('deny').disabled = false;
        el('approve').focus(); status('Ton accord est nécessaire pour mémoriser.');
      }
      if (data.type === 'answer') { completed = true; hideApproval(); message(data.text, 'assistant'); lastAnswer = data.text; status('Réponse reçue.'); }
      if (data.type === 'error') { completed = true; hideApproval(); throw new Error(data.text); }
    };
    while (true) {
      const { value, done } = await reader.read();
      buffer += decoder.decode(value, { stream: !done });
      let newline;
      while ((newline = buffer.indexOf('\n')) !== -1) {
        const line = buffer.slice(0, newline); buffer = buffer.slice(newline + 1);
        if (line.trim()) event(JSON.parse(line));
      }
      if (done) break;
    }
    if (!completed) throw new Error('Connexion interrompue avant la réponse.');
    if (el('speak').checked) readAloud(lastAnswer);
  } catch (error) {
    const text = controller.signal.aborted ? 'Mission arrêtée. Les fichiers déjà créés sont conservés.' : error.message === 'Failed to fetch' ? 'Serveur inaccessible. Vérifie que npm run voice tourne toujours.' : error.message;
    message(text, 'error'); status('Tu peux réessayer.');
  } finally { busy = false; controller = undefined; hideApproval(); controls(); }
}
el('chat').addEventListener('submit', event => { event.preventDefault(); void send(); });
el('prompt').addEventListener('keydown', event => {
  if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) { event.preventDefault(); if (!busy && !listening) void send(); }
});
el('mic').addEventListener('click', () => {
  if (listening) { recognition.stop(); return; }
  stopSpeech();
  recognition = new Recognition(); recognition.lang = 'fr-FR'; recognition.interimResults = true; recognition.continuous = false;
  let finalText = '', cancelled = false;
  recognition.onstart = () => { listening = true; controls(); status('Je t’écoute…'); };
  recognition.onresult = event => {
    finalText = ''; let interim = '';
    for (let i = 0; i < event.results.length; i++) {
      if (event.results[i].isFinal) finalText += event.results[i][0].transcript + ' ';
      else interim += event.results[i][0].transcript;
    }
    el('prompt').value = (finalText + interim).trim();
  };
  recognition.onerror = event => {
    cancelled = true;
    const errors = { 'not-allowed': 'Micro refusé : autorise-le dans les paramètres du site.', 'audio-capture': 'Aucun microphone disponible.', 'no-speech': 'Je n’ai rien entendu. Réessaie.', network: 'La dictée du navigateur nécessite une connexion Internet.', aborted: 'Dictée arrêtée.' };
    status(errors[event.error] || `Dictée indisponible : ${event.error}. Tu peux écrire ta question.`);
  };
  recognition.onend = () => {
    listening = false; controls();
    if (!cancelled && finalText.trim()) { el('prompt').value = finalText.trim(); void send(); }
    else if (!cancelled) status('Aucune phrase reconnue. Réessaie ou écris ta question.');
  };
  recognition.cancel = () => { cancelled = true; recognition.abort(); };
  try { recognition.start(); } catch { status('Micro indisponible. Réessaie ou utilise le clavier.'); }
});
el('stop').addEventListener('click', () => { recognition?.cancel?.(); controller?.abort(); stopSpeech(); hideApproval(); status('Arrêt demandé.'); });
el('speak').addEventListener('change', () => { if (!el('speak').checked) stopSpeech(); });
el('replay').addEventListener('click', () => readAloud(lastAnswer));
el('approve').addEventListener('click', () => void approve(true));
el('deny').addEventListener('click', () => void approve(false));
el('reset').addEventListener('click', async () => {
  stopSpeech();
  try { await api('/api/reset', {}); el('messages').replaceChildren(); el('activity').textContent = ''; lastAnswer = ''; controls(); status('Nouvelle conversation. Les préférences enregistrées restent conservées.'); }
  catch (error) { message(error.message, 'error'); }
});
window.addEventListener('pagehide', () => { recognition?.cancel?.(); controller?.abort(); stopSpeech(); });
if (synthesis) { synthesis.addEventListener('voiceschanged', loadVoices); loadVoices(); }
else { el('speak').checked = false; el('speak').disabled = true; }
if (!Recognition) el('mic-notice').textContent = 'La dictée n’est pas disponible dans ce navigateur. Utilise Chrome ou Edge sur ton PC, ou écris ta question. La lecture audio dépend des voix installées sur le système.';
api('/api/session', {}).then(r => r.json()).then(data => {
  session = data.session; el('name').textContent = data.name; el('model').textContent = `Modèle configuré : ${data.model}`;
  status('Prêt. Clique sur le micro ou écris ta question.'); controls();
}).catch(error => { status(error.message); });
