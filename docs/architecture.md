# Comprendre cette V1

Le cours décrit une ancienne V1 eve non fournie et analyse Jarvis. Ce projet est
une nouvelle implémentation indépendante : aucun code de Jarvis ni connexion eve
n'est repris. Il applique les premières étapes du cours, avec Ollama choisi par
Riwane. Il ne prétend pas réaliser toutes les extensions présentées.

```text
Terminal (cli.ts)
  → Orchestrateur (agent.ts) : instructions + contexte + limite de tours
  → Adaptateur Ollama / Chat Completions (lib/provider.ts)
  ← Proposition d'appel d'outil
  → Validation Zod (tools/index.ts)
  → Accord utilisateur si mémoire
  → Stockage contrôlé (lib/storage.ts)
  ← Résultat réel, transmis au modèle
  → Réponse et traces dans le terminal
```

L'orchestrateur transmet des descriptions JSON des outils au modèle. Il valide
ensuite leurs arguments à l'exécution : les types TypeScript ne suffisent pas.
L'écriture exclusive `wx` empêche l'écrasement et la relecture vérifie les octets.
Le contenu d'une fiche est fourni par le modèle ; cette vérification ne prouve
pas son exactitude pédagogique. Le modèle doit citer les fichiers et leurs lignes.

La mémoire est un ensemble de notes Markdown datées et explicitement approuvées.
Elle survit au redémarrage ; l'historique, lui, disparaît. Le modèle doit appeler
`memory_read` pour retrouver les préférences : il n'existe pas de mémoire magique.
Une nouvelle tentative de création sous le même nom est refusée. Cette protection
n'est pas une garantie d'idempotence entre plusieurs noms différents.

## Correspondance avec le cours

- Chapitres 2, 5–7 : boucle agentique, TypeScript, validation des outils.
- Chapitres 14, 17–18 : mémoire explicite, limites, protection des chemins.
- Chapitre 15 : identité configurable avec `ASSISTANT_NAME`.
- Chapitres 21–22 : démo sans modèle et outil `compter_mots`.
- Chapitres 24, 27 : tests et mission vérifiable sur un cours d'exemple.
- Chapitre 20 : interface vocale dans le navigateur ; transcription entièrement locale et services externes différés.

## Périmètre technique

Les dossiers de travail sont supposés détenus par l'utilisateur local et ne doivent
pas être modifiés concurremment par un processus hostile. Le stockage n'est pas
une sandbox système destinée à isoler plusieurs utilisateurs.
Le modèle n'a aucun outil de réseau ni de commande système. Le seul service appelé
par le programme est le fournisseur configuré par l'utilisateur.

## Interface vocale

`npm run voice` lance `agent/web.ts` et le serveur `agent/web-server.ts`.
Le navigateur sert d’interface : reconnaissance `SpeechRecognition` en français,
puis requête texte vers le même orchestrateur que le terminal. La réponse finale
est lue par `speechSynthesis`, en petits segments, avec une voix française.
Ces API dépendent du navigateur et des voix installées ; la dictée peut être distante.

`web/app.js` affiche les messages comme du texte, sans interpréter de HTML du
modèle. Le flux HTTP NDJSON transporte les étapes, demandes d’accord et résultats.
La déconnexion annule la mission côté serveur ; une demande de mémoire expire
au bout de deux minutes et est refusée par défaut. Le bouton Arrêter coupe aussi
la synthèse et la dictée. Les effets déjà accomplis ne sont pas annulés.

Le serveur vérifie Host et Origin, exige du JSON et un identifiant de session pour
les actions. Il n’écoute que sur la boucle locale. Les sessions ont des historiques
séparés et une seule mission simultanée chacune ; le stockage mono-utilisateur est
commun. Aucun secret du fournisseur n’est renvoyé au navigateur. Ce serveur n’est
pas conçu pour être exposé au réseau ou utilisé comme un service multi-utilisateur.
