# Cheap Escape

Findet die billigste spontane Reise ab Salzburg, gerechnet von deiner Haustür bis zurück:
Flugzeug (alle Airlines), Flixbus, Zug oder Auto, dazu die billigsten Betten und Hotels am Ziel
und Preise, die nach einem Fehler aussehen.

**Deine App:** https://berchthallernoah-star.github.io/cheap-escape/ (mit Passwort geschützt)

## So benutzt du sie

- **Wochenende:** oben die Leiste mit allen Wochenenden, jedes mit dem billigsten Ziel. Antippen = Reisen dafür.
  „Los ab“ / „Wieder daheim bis“ darunter (z. B. Do ab 17 Uhr, Mo Nacht zurück).
- **Ein paar Tage:** Hin- und Rückdatum, dazu „± 1–3 Tage flexibel“. Darunter alle anderen Starttage mit Preis
  für gleich lange Reisen, der billigste ist gelb.
- **Anderswann billiger:** Ist ein anderes Wochenende oder ein anderer Starttag klar billiger, erscheint ein Tipp.
- **Wohin:** leer = überall; deutsch oder englisch („Mailand“, „Italien“, „London“, Flughafencode). Entfernung
  (ab 200 km ist Standard, sonst ist München mit dem Bus immer das Billigste).
- **Flug / Bus / Zug / Auto:** Filter über der Liste, jeweils mit dem billigsten Preis.
- **Suchen – wann ist es am billigsten?** Land oder Stadt eingeben (auch mehrere: „Spanien, Portugal“), Dauer wählen
  (Wochenende, 2–3 / 4–5 Nächte, 1 Woche). Die App rechnet jeden Termin durch: die 5 billigsten, ein Preis-Kalender
  je Starttag (grün = am billigsten) und die Reisen zum angetippten Tag.
- **Preisfehler** und **Betten** haben eigene Reiter.

## So funktioniert es

- **Automatisch alle 3 Stunden** holt GitHub die aktuellen Preise. Kostenlos, ohne Claude, ohne Tokens.
- **Sofort aktualisieren:** in der GitHub-App oder auf github.com → dieses Repository → *Actions* →
  *Refresh prices* → **Run workflow**. Oder in der App auf „Jetzt aktualisieren“ tippen.
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
| Flüge | Ryanair-Fare-Finder und Wizz Air Preiskalender (ca. 2 Monate), Kiwi.com (alle Airlines, auch kombiniert, 5 Wochen) | live |
| Bus | Flixbus (zu den Flughäfen und zu ~90 Städten, 5 Wochen) | live |
| Zug | typische ÖBB/DB-Preise mit deinen Karten (DB/ÖBB sperren automatische Abfragen) | ≈ |
| Auto | Straßen-km (OpenStreetMap), heutiger Spritpreis (E-Control), Maut/Parken | live / ≈ |
| Betten | Hostelworld (billigstes Bett pro Stadt, ~80 Städte) | live |
| Hotels | trivago (billigste Hotels/Hostels/Apartments für die nächsten 4 Wochenenden, 25 Städte) | live |
| Preisfehler | eigene Erkennung (Preis weit unter dem Normalpreis der Strecke) + Travel-Dealz, Mydealz, Urlaubspiraten, Fly4free | live |

Details zu jeder Quelle: `docs/SOURCES.md`.

## Für Entwickler

    npm ci && npm test
    node src/app/bundle-refresh.js && node dist/refresh.mjs --out out     # Preise holen + App bauen
    PAGE_PASSWORD=... node src/site/encrypt.js out/cheap-escape.html _site/index.html

Ablauf: `.github/workflows/refresh.yml`. Planer: `src/planner/`, Quellen: `src/fetch/`, App: `src/app/`.
