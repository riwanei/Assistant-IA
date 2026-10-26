# Assistant IA de Riwane

Une V1 d'assistant d'étude en français, en terminal, construite à partir du cours
**Comprendre et créer ton assistant IA** (26 octobre 2026). Nom provisoire :
`MON_ASSISTANT`. Le modèle tourne avec **Ollama**, sur la machine qui exécute le
programme. Dans un environnement cloud, « local » désigne cette machine cloud,
pas votre PC.

## Démarrer sur votre PC

1. Installer Node.js **24 ou plus** et Ollama depuis <https://ollama.com/download>.
2. Dans un terminal, télécharger le modèle :

```sh
ollama pull qwen3:4b
```

Le modèle occupe plusieurs Go ; les performances dépendent de la RAM et du GPU.
Si Ollama ne tourne pas déjà, lancer `ollama serve` dans un autre terminal.
Ne pas démarrer une seconde instance si l'application Ollama est déjà ouverte.

3. Dans le dossier du projet :

```sh
npm ci
npm run prepare:workspace
npm run check
npm run dev
```

Sous PowerShell, utiliser `npm.cmd` si l'exécution de `npm.ps1` est refusée.
La configuration par défaut fonctionne sans `.env` et sans clé API. Pour changer
le nom, le modèle ou l'adresse du serveur, copier `.env.example` vers `.env`,
puis modifier les valeurs. Le modèle choisi doit gérer les appels d'outils.

4. Dans l'assistant, commencer par :

```text
Réponds en français : donne une définition simple d'une API.
```

Puis essayer :

```text
Liste les documents d'inbox. Lis exemple-reseau.md. Crée une fiche de révision
nommée fiche-reseau-01.md dans outbox avec cinq notions et leurs lignes sources.
Relis la fiche et indique le chemin du fichier réellement créé.
```

Une sortie existante n'est jamais écrasée : choisir un nouveau nom à chaque version.
Les lignes `[Outil : …]` et `[Résultat : …]` permettent de vérifier les actions.
Le cours fourni dans cette conversation a été extrait dans le dossier privé
`workspace/inbox/cours-creer-mon-assistant.txt` de la machine cloud. Il n'est pas
inclus dans les fichiers destinés à Git.

## Commandes du terminal

| Commande | Effet |
| --- | --- |
| `/aide` | Affiche les possibilités et les limites |
| `/documents` | Liste les documents sans appeler le modèle |
| `/memoire` | Affiche les préférences persistantes sans modèle |
| `/nouveau` | Efface le contexte de conversation en mémoire vive |
| `/quitter` | Quitte l'assistant |
| Ctrl+C pendant une mission | Interrompt l'appel ; conserve les fichiers déjà créés |

Cette version n'utilise pas eve : `/login` n'est donc pas une commande de
connexion. Ollama local ne demande pas de compte ChatGPT ou de clé API.

## Documents, outils et mémoire

- Déposer des fichiers UTF-8 `.txt` ou `.md` dans `workspace/inbox`.
- Retrouver les fiches dans `workspace/outbox`.
- Une préférence n'est écrite dans `workspace/memory` qu'après une réponse
  explicite `oui` à la proposition affichée par le programme.
- Pour corriger ou effacer une préférence, modifier ou supprimer son fichier
  dans ce dossier, puis utiliser `/nouveau` pour repartir sans ancien contexte.
- L'historique de conversation reste en mémoire vive ; il n'est pas sauvegardé.

Les sept outils sont `documents_list`, `document_read`, `document_search`,
`report_create`, `memory_save`, `memory_read` et `compter_mots`.
La recherche est textuelle, pas sémantique. Les lectures donnent des lignes sources.
Les outils refusent les chemins hors des dossiers prévus et les liens symboliques.
Le programme ne propose ni shell, ni envoi de courriel, ni publication.

Pour un PDF, extraire d'abord le texte avec un outil comme `pdftotext` (Poppler),
puis placer le `.txt` dans inbox. Les PDF scannés nécessitent un OCR externe.
Limites : 120 Ko par fichier lu, 60 000 caractères par rapport proposé, 100 noms
listés par dossier, 20 résultats de recherche, 10 appels modèle par mission,
délai de 60 secondes par requête et contexte de 180 000 caractères maximum.
Pour les longs cours, créer plusieurs fichiers par chapitre. Ce plafond ne garantit
pas que tous les modèles disposent d'une fenêtre de contexte suffisante.

## Vérifications

```sh
npm run check       # TypeScript + tests automatisés
npm run demo        # démonstration déterministe des outils, sans IA
npm run test:model  # vrai modèle requis : échange, fiche et relecture
```

Les tests utilisent des répertoires temporaires, un modèle simulé et un serveur
HTTP local simulant le protocole Ollama. Ils ne prouvent pas la qualité d'un modèle
réel. La démo crée et relit un rapport dans un dossier temporaire annoncé à l'écran.
Le dossier `docs` explique l'architecture et le périmètre vérifié.

## Confidentialité et limites

Avec l'adresse Ollama locale par défaut, les échanges vont au serveur local.
Si vous configurez un fournisseur distant, les demandes, documents lus, résultats
d'outils et préférences consultées lui sont transmis. Ne placez pas de secret dans
un document destiné au modèle. Les documents sont traités comme des données,
jamais comme une autorisation d'ajouter de nouveaux pouvoirs à l'assistant.

Les fichiers privés, `.env` et `node_modules` sont ignorés par Git. Les résultats
sont affichés dans le terminal mais aucun journal de conversation n'est écrit.
L'assistant est mono-utilisateur ; il ne constitue pas un service Web public.
Les citations et synthèses du modèle doivent être vérifiées. La voix, MCP,
l'interface graphique et les intégrations externes sont des évolutions futures.
