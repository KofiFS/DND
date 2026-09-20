# D&D Character Sheet

A mobile-friendly, auto-saving D&D 5e character sheet with live SRD rules lookups.

**Live app:** https://kofifs.github.io/DND/

## Features

- **Auto-saves** to your browser as you edit (no save button needed).
- **Tabs:** Stats, Skills, Combat, Spells, Class, Gear, Codex, **Maps** and Paper.
- **Notes** field for session notes, lore, and reminders.
- **Codex** — search the official [D&D 5e SRD](https://www.dnd5eapi.co) for spells,
  features, traits, gear, conditions and magic items. Read what they do and add
  them to your sheet in one tap. The rules text is saved with the entry, so you can
  re-read it later (even offline) via the **Info** button next to it.
- **Spell slots** — The Spells tab tracks Pact Magic: tap **Cast** on a spell to
  spend a slot, or tap the pips directly. Cantrips are free and marked *at will*.
  **Short Rest** brings every slot back. The number of slots and their level come
  from the warlock table for your level; type over the count to override it.
- **Dice** — A d20 button on every tab opens the dice tray: d4 through d100, a
  count and bonus stepper, advantage/disadvantage, and any expression you type
  (`2d6+3`, `1d8+1d6`). Natural 20s and 1s are called out, and the last 30 rolls
  are kept. Tap any modifier on the sheet — an ability, a save, a skill,
  initiative, a hit die, a death save — to roll it with the right bonus.
- **Maps** — Upload your region or battle map PNGs, then drop pins for the party,
  each character, enemies and places. Drag a pin to move it as you travel, pinch or
  scroll to zoom, and open the map fullscreen. Pins are stored as a fraction of the
  image, so they stay put at any zoom level and on any screen size.
- **Backup** — Export your character to a JSON file and Import it on another device
  (Stats tab → Backup).

## Saving & devices

Your sheet is stored locally in each browser (`localStorage`). It persists across
visits on the same device. To move a character to another device, use
**Export JSON** on one device and **Import JSON** on the other.

Maps and sheet photos are larger, so they live in IndexedDB instead. They stay on
the device they were uploaded to and are **not** included in the JSON export.

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
