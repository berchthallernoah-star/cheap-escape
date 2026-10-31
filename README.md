# Cheap Escape

Findet die billigste spontane Reise ab Salzburg, gerechnet von deiner Haustür bis zurück:
Flugzeug (alle Airlines), Flixbus, Zug oder Auto, dazu die billigsten Betten und Hotels am Ziel
und Preise, die nach einem Fehler aussehen.

**Deine App:** https://berchthallernoah-star.github.io/cheap-escape/ (mit Passwort geschützt)

## So funktioniert es

- **Automatisch alle 3 Stunden** holt GitHub die aktuellen Preise. Kostenlos, ohne Claude, ohne Tokens.
- **Sofort aktualisieren:** in der GitHub-App oder auf github.com → dieses Repository → *Actions* →
  *Refresh prices* → **Run workflow**. Oder in der App auf „Update now“ tippen.
- **Gesperrt mit deinem Passwort** (Repository-Secret `PAGE_PASSWORD`): Die Seite wird mit AES-256
  verschlüsselt, bevor sie online geht. Ohne Passwort sieht man nur Zeichensalat, auch wer den Link kennt.
  Passwort ändern: *Settings → Secrets and variables → Actions → PAGE_PASSWORD* bearbeiten, dann
  einmal „Run workflow“.
- **Handy-Benachrichtigung (optional, gratis):** App **ntfy** installieren, ein langes, geheimes Thema
  abonnieren (z. B. `cheap-escape-8f3k2q9x`), denselben Namen als Secret `NTFY_TOPIC` anlegen.
  Du bekommst nur **neue** Schnäppchen und mögliche Preisfehler, nie zweimal dasselbe.

## Was drin ist

| Bereich | Quelle | live? |
|---|---|---|
| Flüge | Ryanair-Fare-Finder, Wizz Air Preiskalender, Kiwi.com (alle Airlines, auch kombiniert) | live |
| Bus | Flixbus (zu den Flughäfen und zu ~90 Städten) | live |
| Zug | typische ÖBB/DB-Preise mit deinen Karten (DB/ÖBB sperren automatische Abfragen) | ≈ |
| Auto | Straßen-km (OpenStreetMap), heutiger Spritpreis (E-Control), Maut/Parken | live / ≈ |
| Betten | Hostelworld (billigstes Bett pro Stadt, ~80 Städte) | live |
| Hotels | trivago (billigste Hotels/Hostels/Apartments für die nächsten 2 Wochenenden, 30 Städte) | live |
| Preisfehler | eigene Erkennung (Preis weit unter dem Normalpreis der Strecke) + Travel-Dealz, Mydealz, Urlaubspiraten, Fly4free | live |

Details zu jeder Quelle: `docs/SOURCES.md`.

## Für Entwickler

    npm ci && npm test
    node src/app/bundle-refresh.js && node dist/refresh.mjs --out out     # Preise holen + App bauen
    PAGE_PASSWORD=... node src/site/encrypt.js out/cheap-escape.html _site/index.html

Ablauf: `.github/workflows/refresh.yml`. Planer: `src/planner/`, Quellen: `src/fetch/`, App: `src/app/`.
