# D&D Character Sheet

A mobile-friendly, auto-saving D&D 5e character sheet with live SRD rules lookups.

**Live app:** https://kofifs.github.io/DND/

## Features

- **Auto-saves** to your browser as you edit (no save button needed).
- **Tabs:** Stats, Skills, Combat, Spells, Gear, and a **Codex**.
- **Notes** field for session notes, lore, and reminders.
- **Codex** — search the official [D&D 5e SRD](https://www.dnd5eapi.co) for spells,
  features, traits, gear, conditions and magic items. Read what they do and add
  them to your sheet in one tap. The rules text is saved with the entry, so you can
  re-read it later (even offline) via the **Info** button next to it.
- **Backup** — Export your character to a JSON file and Import it on another device
  (Stats tab → Backup).

## Saving & devices

Your sheet is stored locally in each browser (`localStorage`). It persists across
visits on the same device. To move a character to another device, use
**Export JSON** on one device and **Import JSON** on the other.

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
