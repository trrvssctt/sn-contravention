# Intégration Flutter : App Officier et Espace Usager

Ce guide relie les écrans des maquettes mobiles (`SEN Contraventions.dc.html`, `Espace Usager.dc.html`) à l'API.
La référence complète est la spec OpenAPI : `http://<api>/docs` (interactive) ou `http://<api>/docs/openapi.json`.

## 1. Générer le client Dart

```bash
# depuis sen-contraventions/
npm run openapi                      # écrit apps/api/openapi.json
npx @openapitools/openapi-generator-cli generate \
  -i apps/api/openapi.json -g dart-dio -o ../sen_api_client \
  --additional-properties=pubName=sen_api_client
```

Puis dans `pubspec.yaml` de l'app : `sen_api_client: { path: ../sen_api_client }`.
Paquets conseillés : `dio`, `flutter_secure_storage` (jetons), `socket_io_client` (temps réel), `sqflite` ou `drift` (hors-ligne), `uuid`.

## 2. Conventions

- Base : `https://<api>/v1` ; JSON ; montants en **entiers FCFA** ; dates **ISO 8601**.
- En-tête : `Authorization: Bearer <accessToken>` (valable 15 min).
- Erreurs : `{ statusCode, message, error }`. `message` est en français et peut être affiché tel quel.
- **401** → appeler `POST /auth/refresh` avec `{ refreshToken }` ; si ce second appel échoue aussi, renvoyer vers la connexion.
- **423 `OFFICER_SUSPENDED`** (App Officier) → verrouiller le terminal (écran bloquant) et purger les jetons.

Intercepteur Dio minimal :

```dart
dio.interceptors.add(InterceptorsWrapper(
  onRequest: (o, h) async { o.headers['Authorization'] = 'Bearer ${await store.access}'; h.next(o); },
  onError: (e, h) async {
    final code = e.response?.statusCode;
    if (code == 423) { lockTerminal(); return h.reject(e); }
    if (code == 401 && await refreshTokens()) return h.resolve(await dio.fetch(e.requestOptions));
    h.next(e);
  },
));
```

## 3. App Officier : écran → endpoint

| Écran (maquette) | Appel |
|---|---|
| Login (matricule + mot de passe) | `POST /auth/officer/login` → `TokensDto` |
| Dashboard (stats du jour, objectif) | `GET /officer/me/dashboard` |
| Barème (cache local) | `GET /infraction-types` avec `If-None-Match: <etag>` → 304 si inchangé ; resynchroniser sur l'événement `infraction_types.updated` |
| Scanner OCR → fiche véhicule | `GET /vehicles/{plaque}` (documents, propriétaire, `impayees`, `totalDu`) ; **404 → enrôlement** |
| Enrôlement (véhicule → propriétaire → confirmation) | `POST /uploads` (photo CNI) puis `POST /vehicles` avec `owner {prenom, nom, cni, telephone, …}` |
| Choix d'infractions + détails (GPS, photo, notes) | `POST /uploads` (photo preuve) puis `POST /contraventions` |
| Confirmation (N°, QR, SMS) | réponse de `POST /contraventions` : `numero`, `qrPayload` (à encoder en QR) ; le SMS est envoyé par l'API |
| Liste des impayées → encaissement → reçu | `GET /vehicles/{plaque}` → `POST /payments` `{contraventions:[numero…], mode, referenceExterne, montant?}` → `numeroRecu` |
| Mes contraventions | `GET /contraventions?page=&per_page=` (restreint aux siennes) |
| Notifications | `GET /notifications`, `PATCH /notifications/{id}/read`, `POST /notifications/read-all` |
| Profil (FR / Wolof) | `GET /auth/me`, `PATCH /officer/me {lang: 'fr'|'wo'}`, `POST /officer/me/password` |

### Hors-ligne (émission sans réseau)
1. Générer `clientUuid = Uuid().v4()` **au moment du constat** et stocker la contravention en SQLite avec `dateHeure` (heure du constat).
2. À la reconnexion, rejouer `POST /contraventions` avec le même `clientUuid`. L'API renvoie la contravention existante si elle a déjà été reçue : pas de doublon.
3. Montant : l'API recalcule toujours depuis le barème actif. Resynchroniser le barème avant de rejouer la file.

## 4. Espace Usager : écran → endpoint

| Écran | Appel |
|---|---|
| Création de compte | `POST /auth/user/register {cni, telephone, password}` → défi OTP |
| Login | `POST /auth/user/login` → soit `TokensDto`, soit `{otpRequired, challengeId, maskedPhone}` |
| Saisie du code SMS | `POST /auth/user/verify-otp {challengeId, code}` |
| Accueil (total dû, véhicules, amendes récentes) | `GET /me/summary` |
| Mes véhicules / détail / ajout | `GET /me/vehicles`, `GET /me/vehicles/{plaque}`, `POST /me/vehicles` |
| Mes amendes / détail (QR, photo) | `GET /me/fines?statut=dues|payee`, `GET /me/fines/{numero}` |
| Paiement Wave / Orange Money | `POST /payments/intents {contraventions:[…], provider:'wave'|'orange_money'}` → ouvrir `checkoutUrl` (`url_launcher` ou WebView) |
| Traitement animé → reçu | écouter `payment.confirmed` (Socket.IO) **ou** interroger `GET /payments/intents/{id}` toutes les 2 s jusqu'à `statut == 'confirme'` → `numeroRecu` |
| Finances (graphe 6 mois, reçus) | `GET /me/finances` ; reçu détaillé : `GET /payments/{numeroRecu}` |
| Sécurité (2FA, biométrie, langue, mot de passe) | `PATCH /me/security`, `POST /me/password` (renvoie `reconnect: true`) |

En développement, `checkoutUrl` ouvre un **simulateur d'opérateur** avec les boutons « Confirmer » et « Refuser ». En production, l'API renverra l'URL Wave Checkout ou Orange Money sans changer le contrat.

## 5. Temps réel (Socket.IO)

```dart
final socket = IO.io('$apiBase/ws', IO.OptionBuilder()
  .setTransports(['websocket'])
  .setAuth({'token': accessToken})
  .build());
socket.on('infraction_types.updated', (_) => syncBareme());
socket.on('payment.confirmed', (p) => showReceipt(p['numeroRecu']));
socket.on('notification.created', (_) => refreshBadge());
socket.on('officer.suspended', (_) => lockTerminal());
socket.on('vehicle.flagged', (v) => alertBrigade(v['plaque']));
```

Après un refresh de jeton, reconnecter le socket avec le nouveau `accessToken`.

## 6. Tester rapidement

```bash
# connexion officier
curl -X POST localhost:4000/v1/auth/officer/login -H 'content-type: application/json' \
  -d '{"matricule":"PN-4471","password":"Passer123!"}'
```

Comptes de démo : voir le README principal. Sur un appareil physique, remplacer `localhost` par l'IP locale de la machine (l'API écoute sur `0.0.0.0:4000`) et ajouter l'origine si besoin dans `CORS_ORIGINS`. Mettre aussi `PUBLIC_URL=http://<ip>:4000` dans `apps/api/.env` : ce paramètre construit les URL des photos et du `checkoutUrl`.
