# Validation du 26 octobre 2026

- Node 24.19.0 ; installation reproductible `npm ci` réussie.
- Vérification TypeScript réussie ; 10 tests réussis, aucun ignoré.
- Démo sans IA : source lue, rapport créé et relu, compteur vérifié.
- Préparation répétée sans écrasement des documents existants.
- Terminal lancé réellement ; `/documents` et `/memoire` vérifiés.
- Ollama 0.40.11 Linux installé dans `/workspace/tools/ollama` après vérification
  SHA-256 de l'archive officielle. Serveur démarré sur la boucle locale.
- `/api/tags` répond avec une liste vide : serveur disponible, aucun modèle installé.
- `ollama pull qwen3:4b` échoue avec `Forbidden` pour `registry.ollama.ai`.
- L'assistant atteint l'API réelle, qui renvoie HTTP 404 car le modèle est absent.
- La conversation IA et la mission documentaire avec un vrai modèle restent non validées.

Le domaine du registre est ajouté au brouillon des paramètres réseau. Après
application du changement, relancer le téléchargement. Si le registre redirige
vers un domaine de stockage également bloqué, relever ce domaine et l'ajouter via
les paramètres autorisés, sans désactiver TLS ni contourner le proxy.

## Reprendre dans le cloud

```sh
# Depuis /workspace/Assistant-IA
bash scripts/install-ollama-cloud.sh
# Dans un terminal distinct, uniquement si le serveur ne tourne pas déjà :
OLLAMA_HOST=127.0.0.1:11434 OLLAMA_MODELS=/workspace/tools/ollama/models OLLAMA_NO_CLOUD=1 /workspace/tools/ollama/bin/ollama serve
# Puis :
/workspace/tools/ollama/bin/ollama pull qwen3:4b
npm run dev
```

Au premier démarrage, Ollama crée son répertoire standard `~/.ollama`. Dans le
cloud restreint, cette création a nécessité une exécution autorisée hors sandbox.
Les poids du modèle restent dans `/workspace/tools/ollama/models`.
Les processus devront être relancés dans une nouvelle tâche ; leur présence
actuelle ne garantit pas leur restauration.

## Reprise à 19 h 05 (heure de Paris)

Le registre `registry.ollama.ai` est maintenant accessible : le manifeste de
`qwen3:4b` a été récupéré. Le téléchargement des poids redirige vers
`dd20bb891979d25aebc8bec07b2b3bbc.r2.cloudflarestorage.com`, encore refusé par le
proxy. Ce domaine précis est ajouté au brouillon, en conservant le registre.
Ollama a été redémarré ; l'inférence reste bloquée tant que les poids sont absents.

`npm run test:model` automatise une vraie conversation, puis la création et la
relecture d'une fiche dans un répertoire de validation séparé sous `workspace`.
Il échoue si le modèle est absent ; il ne remplace jamais le fournisseur par
un simulacre. Une fois le parcours technique réussi, la qualité pédagogique
et l'exactitude des citations doivent encore être examinées.
