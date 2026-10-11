# Sujet 2 - Observabilité d'un jeu multijoueur web

Projet UE03 Données et Analytics. Le but est de mettre en place la chaîne CI/CD et toute la partie observabilité (logs, métriques, dashboards, alertes) autour du service de télémétrie fourni dans `support/`, puis d'utiliser tout ça pour comprendre ce qui s'est passé en production entre le 20 et le 26 septembre.

## Ce qu'il faut avoir

- Docker avec Docker Compose (v2)
- Les ports 3000, 3100, 8080, 9090, 9093 et 12345 libres sur la machine
- Node.js 20 ou plus, seulement si on veut lancer les tests sans Docker

## Lancer le projet

Tout se lance avec une seule commande à la racine du dépôt :

```bash
docker compose up -d --build
```

Au premier lancement il faut compter une ou deux minutes, le temps de télécharger les images et de construire celle du service.

Une fois démarré, on a :

- le service (`app`) sur http://localhost:8080, qui simule les parties et reçoit les rapports des clients
- le générateur de charge (`loadgen`) qui envoie des rapports en continu, avec un pic toutes les 2 minutes
- un conteneur `history-import` qui charge l'export historique dans Loki puis s'arrête
- Prometheus sur http://localhost:9090
- Alertmanager sur http://localhost:9093
- Loki sur http://localhost:3100, avec Alloy qui lui envoie les logs du service
- Grafana sur http://localhost:3000

Grafana est accessible sans se connecter (lecture seule). Pour se connecter en admin c'est `admin` / `admin`, Grafana demande de changer le mot de passe à la première connexion.

L'import de l'historique ne se refait pas si les données sont déjà dans Loki. Pour tout remettre à zéro (logs, métriques, historique) :

```bash
docker compose down -v
```

## Les dashboards

Ils sont dans le dossier `Game telemetry` de Grafana et sont chargés automatiquement au démarrage (rien à importer à la main) :

- **Santé du service** : est-ce que l'API tient la charge (débit, erreurs, latence), rapports refusés, état du process Node et du tick serveur
- **Performance côté joueur** : les saccades remontées par les clients, par cause et par build
- **Activité de jeu et intégrité** : parties en cours, parties anormalement courtes, quarantaine, rapports falsifiés
- **Analyse de l'export 20-26/09** : les données historiques. Ce dashboard est réglé sur la période du 20 au 26/09, il ne faut pas changer la plage de temps sinon il est vide

Chaque panneau a pour titre la question à laquelle il répond.

## Travailler sur le service sans Docker

```bash
cd support
npm ci
npm run lint
npm test
npm start
```

Le script d'import peut aussi être lancé à la main, par exemple pour vérifier le parsing sans rien envoyer :

```bash
cd support
node scripts/import-history.js --dry-run
node scripts/import-history.js --loki http://localhost:3100
```

## La pipeline CI

Elle est dans `.github/workflows/ci.yml` et tourne sur GitHub Actions à chaque push et pull request :

1. lint et tests
2. construction de l'image Docker
3. scan de l'image avec Trivy, le job échoue s'il trouve une vulnérabilité critique qui a un correctif
4. sur `main` seulement : publication de l'image sur `ghcr.io/issabdl/game-telemetry-demo`, avec un tag `version-commit` (par exemple `0.9.0-76dda50`) et `latest`

Si les tests ne passent pas, l'image n'est pas construite.

## Organisation du dépôt

- `support/` : le service fourni, avec ce que j'ai ajouté (Dockerfile, métriques dans `src/metrics.js`, classification des rapports dans `src/classify.js`, script d'import dans `scripts/import-history.js`)
- `observability/` : la config de chaque outil (Prometheus et ses règles, Loki et ses règles, Alloy, Alertmanager, Grafana)
- `docker-compose.yml` : la stack complète
- `.github/workflows/` : la pipeline
