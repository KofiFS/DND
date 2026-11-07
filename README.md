# D&D Character Sheet

A mobile-friendly, auto-saving D&D 5e character sheet with live SRD rules lookups.

**Live app:** https://kofifs.github.io/DND/

## Features

- **Auto-saves** to your browser as you edit (no save button needed).
- **Multiple characters** — tap the name in the header (or the ⇄ chip) to switch
  between characters, create a new blank one, duplicate, or delete. Each character
  keeps its own sheet, notes, lore and Paper-tab photos. The picker also offers
  ready-made characters (the original Warlock and a level 12 Arcane Trickster Rogue).
- **Class tab** knows the Warlock and Rogue rules (tables, features, patrons/archetypes,
  Arcane Trickster spellcasting). Put the class name in the class field to activate it.
- **Expertise** — on the Skills tab, tap a skill's dot twice to double your proficiency bonus.
- **DND Update** — the bar at the bottom of every tab. Type what happened in plain English
  ("I took 8 damage", "long rest", "add Fireball", "I hit level 5") and Claude updates the
  sheet for you, showing exactly what changed with an Undo button. Needs an Anthropic API key
  (tap ⚙ in the bar); the key is stored only in your browser and each update costs a few cents.
- **Tabs:** Stats, Skills, Combat, Spells, Gear, and a **Codex**.
- **Notes** field for session notes, lore, and reminders.
- **Codex** — search the official [D&D 5e SRD](https://www.dnd5eapi.co) for spells,
  features, traits, gear, conditions and magic items. Read what they do and add
  them to your sheet in one tap. The rules text is saved with the entry, so you can
  re-read it later (even offline) via the **Info** button next to it.
- **Backup** — Export the current character to a JSON file and Import it on another
  device (Stats tab → Backup, or the Characters picker). Importing adds a new character.

## Saving & devices

Your characters are stored locally in each browser (`localStorage`), one entry per
character plus a small roster index. They persist across visits on the same device.
To move a character to another device, use **Export JSON** on one device and
**Import JSON** on the other.

> Tip on a phone: open the live link, then "Add to Home Screen" to use it like an app.

## Develop locally

```bash
npm install
npm run dev      # local dev server
npm run build    # production build into dist/
```

## Deployment

Every push to `main` is built and published to GitHub Pages automatically by the
workflow in `.github/workflows/deploy.yml`. No manual build step needed.
