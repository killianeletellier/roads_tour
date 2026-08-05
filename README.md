# Roads Tour

Application web de gestion de convoi automobile — phase **production** (admin desktop) et phase **exploitation** (PWA mobile GPS temps réel).

## Stack

- **Monorepo** npm workspaces : `packages/server`, `packages/client`, `packages/shared`
- **Backend** : Node 20+, Fastify, Socket.io, Prisma, PostgreSQL
- **Frontend** : React 19, Vite, MapLibre GL JS, PWA
- **Routage** : OSRM self-hosted (Docker)
- **Déploiement** : 100 % Docker Compose (sans PM2)

## Structure

```
roads-tour/
├── packages/
│   ├── server/          # API REST + WebSocket
│   ├── client/          # React PWA + admin
│   └── shared/          # Types, GPX, navigation GPS
├── docker/
│   ├── Dockerfile       # Build multi-stage
│   ├── entrypoint.sh    # Migrations + démarrage
│   ├── nginx/           # Reverse proxy HTTPS
│   └── osrm/prepare.sh  # Préparation données OSRM
├── scripts/
│   ├── deploy-prod.sh       # Helper déploiement
│   └── init-letsencrypt.sh  # Premier certificat SSL
├── docker-compose.yml       # Dev (PostgreSQL + OSRM)
├── docker-compose.prod.yml  # Production complète
└── .env.prod.example        # Template production
```

## Développement local

### Prérequis

- Node.js 20+
- Docker (PostgreSQL, optionnellement OSRM)

### Installation

```bash
cp .env.example .env   # obligatoire — Prisma lit DATABASE_URL depuis la racine
npm install
npm run db:generate
```

### Démarrer PostgreSQL

```bash
docker compose up postgres -d
npm run db:migrate
```

> **Port 5433** : en dev, PostgreSQL Docker est exposé sur `localhost:5433` (et non 5432) pour éviter les conflits avec un PostgreSQL natif déjà installé sur macOS. Si vous n'avez pas de Postgres local, vous pouvez remettre `5432:5432` dans `docker-compose.yml` et `localhost:5432` dans `.env`.

### OSRM (optionnel en dev)

Sans OSRM local, le guidage turn-by-turn ne fonctionnera pas. Pour préparer les données :

```bash
# Télécharger un extract OSM (ex. région)
mkdir -p docker/osrm/data
wget -O docker/osrm/data/region.osm.pbf https://download.geofabrik.de/europe/monaco-latest.osm.pbf
chmod +x docker/osrm/prepare.sh
./docker/osrm/prepare.sh docker/osrm/data/region.osm.pbf
docker compose --profile osrm up osrm -d
```

### Lancer l'app

```bash
# Terminal 1 — API
npm run dev:server

# Terminal 2 — Client Vite (proxy /api et /socket.io)
npm run dev:client
```

- **PWA exploitation** : http://localhost:5173/
- **Admin production** : http://localhost:5173/admin/login (mot de passe : `admin` par défaut)

### Test depuis un téléphone (réseau local)

Le serveur API et Vite écoutent sur `0.0.0.0`, donc l'app est accessible depuis d'autres appareils du même réseau Wi‑Fi.

1. Trouver l'adresse IP locale de votre machine :
   ```bash
   # macOS / Linux
   ipconfig getifaddr en0
   # ou : ifconfig | grep "inet "
   ```
2. Démarrer l'app (`npm run dev:server` + `npm run dev:client`)
3. Sur le téléphone, ouvrir : `http://<VOTRE_IP>:5173/` (ex. `http://192.168.1.42:5173/`)

> **HTTPS** : en dev HTTP, la géolocalisation peut être limitée sur mobile. En production, HTTPS est requis (voir section Production).

> **Tunnel (ngrok, domaine personnalisé)** : en dev, Vite accepte tous les hôtes (`allowedHosts: true`). Pour une liste explicite : `VITE_ALLOWED_HOSTS=xxx.ngrok-free.app,dev.example.com npm run dev:client`.

## Production (Docker)

Déploiement **100 % Docker** : PostgreSQL, OSRM, application Node (Fastify + client Vite buildé), Nginx (HTTPS), Certbot (renouvellement Let's Encrypt).

### Architecture

```
Internet → nginx:443 (HTTPS)
              ├── /           → app:3000 (static + SPA fallback)
              ├── /api/*      → app:3000
              └── /socket.io/* → app:3000 (WebSocket)

app → postgres:5432 (réseau internal, non exposé)
app → osrm:5000     (réseau internal, non exposé)
```

### Prérequis serveur

- Docker Engine 24+ et Docker Compose v2
- Nom de domaine avec enregistrement **A** (et **AAAA** si IPv6) pointant vers le serveur
- Ports **80** et **443** ouverts
- Espace disque suffisant pour PostgreSQL + extract OSM (ex. Monaco ~1 Mo, France ~4 Go)

### 1. Configuration

```bash
cp .env.prod.example .env.prod
```

Éditer `.env.prod` :

| Variable | Description |
|---|---|
| `POSTGRES_*` | Identifiants PostgreSQL |
| `DATABASE_URL` | URL Prisma (`@postgres:5432` dans Docker) |
| `ADMIN_PASSWORD` | Mot de passe admin global (`/admin/login`) |
| `JWT_SECRET` | Secret JWT (32+ caractères aléatoires) |
| `DOMAIN` | Domaine public (ex. `roadstour.example.com`) |
| `CERTBOT_EMAIL` | Email Let's Encrypt |
| `OSRM_URL` | Laisser `http://osrm:5000` |

### 2. Préparer OSRM (one-time)

OSRM n'est **pas** exposé publiquement ; seul le conteneur `app` y accède.

```bash
mkdir -p docker/osrm/data

# Exemple test (Monaco, rapide) :
wget -O docker/osrm/data/region.osm.pbf \
  https://download.geofabrik.de/europe/monaco-latest.osm.pbf

chmod +x docker/osrm/prepare.sh
./docker/osrm/prepare.sh docker/osrm/data/region.osm.pbf --prod
```

Pour une région plus large, télécharger l'extract correspondant sur [Geofabrik](https://download.geofabrik.de/) puis relancer la commande ci-dessus.

### 3. Premier déploiement

```bash
chmod +x scripts/deploy-prod.sh scripts/init-letsencrypt.sh

# Déployer toute la stack (HTTP tant que pas de certificat)
docker compose -f docker-compose.prod.yml --env-file .env.prod up -d --build

# Ou via le script helper :
./scripts/deploy-prod.sh
```

Vérifier que l'app répond en HTTP :

```bash
curl -sf http://localhost/api/health
# {"status":"ok"}
```

### 4. Certificats HTTPS (Let's Encrypt)

**Prérequis** : DNS propagé, port 80 accessible depuis Internet.

```bash
./scripts/init-letsencrypt.sh
```

Ce script :
1. Démarre postgres, osrm, app et nginx (config HTTP bootstrap)
2. Obtient le certificat via Certbot (webroot)
3. Redémarre nginx avec la config HTTPS et lance le conteneur certbot (renouvellement auto toutes les 12 h)

Vérifier :

```bash
curl -sf https://VOTRE_DOMAINE/api/health
```

> **HTTPS obligatoire** pour la géolocalisation et le micro (PWA mobile).

> **Test** : mettre `CERTBOT_STAGING=1` dans `.env.prod` pour éviter les limites de rate Let's Encrypt.

### 5. Mises à jour

```bash
git pull   # si applicable
docker compose -f docker-compose.prod.yml --env-file .env.prod up -d --build

# Application seule :
./scripts/deploy-prod.sh app
```

Les migrations Prisma s'exécutent automatiquement au démarrage du conteneur `app`.

### 6. Sauvegarde PostgreSQL

```bash
docker exec roads-tour-postgres pg_dump -U roadstour roadstour > backup-$(date +%F).sql
```

Restauration :

```bash
cat backup.sql | docker exec -i roads-tour-postgres psql -U roadstour -d roadstour
```

### 7. Logs et maintenance

```bash
# Tous les services
docker compose -f docker-compose.prod.yml logs -f

# Service spécifique
docker compose -f docker-compose.prod.yml logs -f app
docker compose -f docker-compose.prod.yml logs -f nginx

# État des conteneurs
docker compose -f docker-compose.prod.yml ps

# Renouvellement manuel certificat
docker compose -f docker-compose.prod.yml exec certbot certbot renew
docker compose -f docker-compose.prod.yml exec nginx nginx -s reload
```

### Dépannage : conteneur `app` unhealthy

Si `dependency failed to start: container roads-tour-app is unhealthy` :

```bash
docker logs roads-tour-app
docker compose -f docker-compose.prod.yml ps
```

Messages fréquents dans les logs :

| Log | Cause | Action |
|---|---|---|
| `Set JWT_SECRET in .env.prod` / `Set ADMIN_PASSWORD` | Secrets encore aux valeurs du template | Renseigner des secrets forts dans `.env.prod`, ou temporairement `ALLOW_INSECURE_SECRETS=1` |
| `PostgreSQL not reachable` | Postgres pas prêt ou `DATABASE_URL` incorrect | `docker logs roads-tour-postgres`, vérifier user/password/db |
| `Prisma migrate deploy failed` | Schéma DB incompatible ou droits manquants | Vérifier `DATABASE_URL`, logs postgres |
| `Cannot find module ... bcrypt_lib.node` | Module natif non compilé (image ancienne) | `docker compose ... up -d --build` pour reconstruire l'image |
| `Client build not found at ...` | Build client absent de l'image | Rebuild complet : `--build --no-cache` |
| `Fatal startup error` | Crash Node au démarrage | Lire la stack trace complète dans les logs |

Healthcheck interne : `GET http://127.0.0.1:3000/api/health` (délai de grâce 120 s au démarrage).

### 8. Arrêt

```bash
docker compose -f docker-compose.prod.yml down
# Conserver les volumes (données) :
docker compose -f docker-compose.prod.yml down
# Supprimer aussi les volumes (DESTRUCTIF) :
docker compose -f docker-compose.prod.yml down -v
```

### Fichiers Docker

| Fichier | Rôle |
|---|---|
| `docker-compose.prod.yml` | Stack production complète |
| `docker/Dockerfile` | Build multi-stage (shared + client + server) |
| `docker/entrypoint.sh` | Attente Postgres, migrations, démarrage |
| `docker/nginx/` | Reverse proxy HTTPS + WebSocket |
| `docker/osrm/prepare.sh` | Préparation données routage |
| `scripts/deploy-prod.sh` | Helper déploiement |
| `scripts/init-letsencrypt.sh` | Premier certificat SSL |
| `.env.prod.example` | Template variables production |

## Fonctionnalités

| Route | Description |
|---|---|
| `/` | Rejoindre un convoi (code + pseudo) |
| `/organizer` | Mode organisateur (appui long 2s sur logo → menu caché) |
| `/navigate` | HUD GPS turn-by-turn |
| `/admin/login` | Auth admin global (`ADMIN_PASSWORD`) |
| `/admin/convoys/*` | CRUD convois, import GPX, preview carte |

### Auth

- **Admin** : mot de passe global (`ADMIN_PASSWORD`)
- **Participant** : code convoi + pseudo
- **Organisateur** : code convoi + mot de passe admin du convoi

### GPX

- Segments = `<trkseg>` ou `<rte>`
- POI = dernier point de chaque segment

### Temps réel (Socket.io)

- Positions live (1/s)
- Rôles organisateurs (tête / balais / ouvreuse)
- Détection hors-tracé + notifications organisateurs
- Toggle visibilité positions participants
- Push-to-talk vocal (WebSocket relay)

## Build

```bash
npm run build
```

## Limitations connues (V1)

- Pas de mode offline
- Un seul organisateur peut parler en PTT à la fois
- Latence voix ~300–800 ms
- Snap POI sur route OSRM non implémenté (optionnel dans le plan)
- Reconnexion session via localStorage (basique)
- Zone OSRM à préparer manuellement selon la région du convoi

## Couleur accent

`#D14F8B`
