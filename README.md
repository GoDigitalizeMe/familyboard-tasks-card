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
