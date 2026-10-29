# SmartGrid Web Sémantique

Application web de consultation et de gestion d'une ontologie Smart Grid. Le projet associe une interface React/Vite à une API Flask qui interroge et modifie l'ontologie RDF située dans `data/smartgrid.owl`.

## Prérequis

- Python 3.13 (voir les dépendances Python dans `backend/requirements.txt`)
- Node.js et npm
- Git pour cloner le dépôt

## Lancer le backend

Depuis la racine du projet, créez un environnement virtuel et installez les dépendances :

```powershell
cd backend
python -m venv .venv
.venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
python -m spacy download fr_core_news_md
python app.py
```

Sous macOS ou Linux, activez l'environnement avec `source .venv/bin/activate`.

L'API démarre sur `http://localhost:5000`. L'ontologie est chargée automatiquement depuis `data/smartgrid.owl`. L'installation du modèle spaCy français active l'assistant en langage naturel. Pour quitter le serveur, utilisez `Ctrl+C`.

## Lancer le frontend

Dans un second terminal, depuis la racine du projet :

```powershell
cd frontend-react
npm install
Copy-Item .env.example .env
npm run dev
```

Sous macOS ou Linux, remplacez la copie de l'environnement par `cp .env.example .env`.

Ouvrez l'adresse affichée par Vite (par défaut `http://localhost:5173`). Le fichier `frontend-react/.env` configure l'URL de l'API avec `VITE_API_URL=http://localhost:5000/api`. Redémarrez Vite après toute modification de cette variable.

## Vérifications et production

```powershell
cd frontend-react
npm run lint
npm run build
npm run preview
```

L'API Flask utilise son serveur de développement avec `python app.py` ; pour un déploiement, configurez un serveur WSGI adapté.

## Structure

- `backend/` : API Flask, traitement NLP et dépendances Python.
- `frontend-react/` : application React et configuration Vite.
- `data/smartgrid.owl` : ontologie RDF utilisée par l'API.
