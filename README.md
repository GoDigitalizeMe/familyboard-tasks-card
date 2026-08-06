# Familyboard Tasks Card

Lovelace-"Post-it"-Board für To-Dos und Einkaufslisten (inkl. Bring!):
farbige Klebezettel mit Titel, optionaler Beschreibung,
Fälligkeitsdatum und Avataren der zuständigen Personen – im gleichen
Look wie die [Familyboard-Planner-Karte](https://github.com/GoDigitalizeMe/familyboard-planner-card).

Diese Karte ist der reine Anzeige-Layer. Die eigentliche Logik (Listen,
Zuständigkeiten, Datenabruf) übernimmt die zugehörige Python-Integration:
👉 **[familyboard-tasks-ha](https://github.com/GoDigitalizeMe/familyboard-tasks-ha)**
– dort zuerst installieren und einrichten, bevor diese Karte einen
gültigen `entity`-Wert zur Auswahl hat.

## Funktionen

- **Sticky Notes**: jeder Eintrag ein leicht gedrehter, farbiger Zettel
  (Farbe der zugehörigen Liste), mit Häkchen zum Abhaken direkt auf dem
  Zettel.
- **Zuständigkeit**: beliebig viele Personen pro Eintrag, ausgewählt über
  Profilbilder (kein Text nötig – auch für Kinder geeignet, die noch
  nicht lesen können), sichtbar als Avatare auf dem Zettel und als
  Filter-Chips im Header (analog zur Planner-Karte).
- **Fälligkeitsdatum** wird angezeigt und bei Überfälligkeit rot markiert.
- **Filtern**: Personen (Header) und Listen (Footer) sind anklickbar und
  heben passende Zettel hervor, statt andere komplett auszublenden.
- **Erledigt-Bereich** ein-/ausklappbar, standardmäßig eingeklappt.
- **Hinzufügen** über den „+“-Button im Header: Liste wählen, Titel
  (Pflichtfeld), Beschreibung, Fälligkeit und Zuständige (alles optional
  außer Titel) in einem Schritt.
- **Bearbeiten**: Klick auf einen Zettel öffnet ein Detail-Fenster mit
  Titel, Beschreibung, Fälligkeit, Zuständigkeit sowie Erledigt/Wieder
  öffnen und Löschen als eigene Buttons (nicht nur über die kleine
  Checkbox auf dem Zettel).

## Installation über HACS

1. HACS → Dashboard (bzw. Frontend/Plugin, je nach HACS-Version) →
   benutzerdefiniertes Repository hinzufügen:
   `https://github.com/GoDigitalizeMe/familyboard-tasks-card`, Typ
   **Dashboard** (ältere HACS-Versionen: **Plugin**).
2. „Familyboard Tasks Card“ in der Liste öffnen und herunterladen.
3. Home Assistant Frontend neu laden (harter Browser-Reload reicht i. d. R.).

## Manuelle Installation

1. `dist/familyboard-tasks-card.js` nach
   `config/www/familyboard-tasks-card.js` kopieren.
2. Einstellungen → Dashboards → Ressourcen → Ressource hinzufügen:
   URL `/local/familyboard-tasks-card.js`, Typ „JavaScript-Modul“.

## Verwendung

Dashboard bearbeiten → Karte hinzufügen → „Familyboard Tasks Card“
(visueller Editor) oder manuell per YAML:

```yaml
type: custom:familyboard-tasks-card
entity: sensor.familienboard_offene_punkte   # Sensor der familyboard_tasks-Integration
title: Familienboard
language: de
exclude_persons: []
```

| Option | Standard | Beschreibung |
| --- | --- | --- |
| `entity` | *(erforderlich)* | Sensor-Entity der Familyboard-Tasks-Integration |
| `title` | „Familienboard“ | Überschrift der Karte |
| `language` | `de` | Sprache für Datumsformate (`de`/`en`) |
| `exclude_persons` | `[]` | Liste von `person.*`-Entities, die in der Zuständigkeits-Auswahl und als Filter nicht angezeigt werden (z. B. ein Display-/Wallboard-Account) |

## Mini-Karte

Zusätzlich zur vollen Karte enthält dieses Repo eine kompakte Variante für
z. B. eine Übersichtsseite: `familyboard-tasks-mini-card` zeigt die Anzahl
offener Punkte plus eine kurze Vorschauliste, dazu einen „+"-Button zum
schnellen Hinzufügen eines neuen Eintrags (Liste + Titel). Ein Tap auf die
Karte selbst (nicht auf den „+"-Button) springt zu einer anderen
Dashboard-View (typischerweise die volle Tasks-Karte) – Bearbeiten
einzelner Einträge bleibt dort.

```yaml
type: custom:familyboard-tasks-mini-card
entity: sensor.familienboard_offene_punkte
title: Familienboard
language: de
max_items: 5
font_scale: 1
show_preview: true
exclude_lists: []
navigation_path: /lovelace-wallboard/tasks
```

| Option | Standard | Beschreibung |
| --- | --- | --- |
| `entity` | *(erforderlich)* | Sensor-Entity der Familyboard-Tasks-Integration |
| `title` | „Familienboard" | Überschrift der Karte |
| `language` | `de` | Sprache für Datumsformate (`de`/`en`) |
| `max_items` | `5` | Maximale Anzahl in der Vorschauliste angezeigter offener Punkte |
| `font_scale` | `1` | Skalierungsfaktor für die gesamte Schriftgröße (z. B. `1.3` für ~30 % größer) – hilfreich für Übersichtsboards, die aus der Ferne gelesen werden |
| `show_preview` | `true` | Bei `false` zeigt die Karte statt der Vorschauliste nur einen Hinweistext ("Es sind X Artikel auf der Liste") plus den „+"-Button |
| `exclude_lists` | `[]` | Liste von `todo.*`-Entities (z. B. eine Bring!-Liste), die in dieser Karteninstanz weder gezählt noch angezeigt werden |
| `navigation_path` | *(keiner)* | Dashboard-View-Pfad, zu dem beim Antippen der Karte gesprungen wird; ohne Angabe ist die Karte nicht klickbar |

### Mehrere Instanzen mit unterschiedlichen Listen

Da dieselbe `entity` mehrere zugehörige Listen bündelt (eigene Liste +
eingebundene externe Listen wie Bring!), lässt sich dieselbe Karte mehrfach
auf einem Dashboard platzieren, um jede Liste separat darzustellen –
`exclude_lists` steuert pro Karteninstanz, welche Listen jeweils
ausgeblendet werden. Beispiel: eine kompakte reine Bring-Karte, die nur
die Artikelanzahl zeigt und das Hinzufügen erlaubt, während alle anderen
Listen für diese Instanz ausgeblendet sind:

```yaml
type: custom:familyboard-tasks-mini-card
entity: sensor.familienboard_offene_punkte
title: Einkaufsliste
exclude_lists:
  - todo.familienboard_to_do
  - todo.hailey
show_preview: false
```
