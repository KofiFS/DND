import { useState, useEffect, useCallback, useRef } from "react";
import { search as srdSearch, fetchDetail, formatDetail } from "./api.js";

const STORAGE_KEY = "dnd-sheet-v1";

const INITIAL_CHARACTER = {
  name: "Arc-Elf Tanner",
  class: "Warlock 3 / Lock",
  race: "Orc/Elf",
  background: "Watching",
  proficiencyBonus: 2,
  abilities: {
    strength: 11,
    dexterity: 12,
    constitution: 14,
    intelligence: 12,
    wisdom: 13,
    charisma: 14,
  },
  combat: {
    ac: 12,
    initiative: 1,
    speed: 30,
    hp: 26,
    maxHp: 26,
    tempHp: 0,
    hitDice: "3d6",
  },
  deathSaves: { successes: 0, failures: 0 },
  savingThrows: {
    strength: { prof: false },
    dexterity: { prof: false },
    constitution: { prof: false },
    intelligence: { prof: false },
    wisdom: { prof: true },
    charisma: { prof: true },
  },
  skills: {
    acrobatics: { ability: "dexterity", prof: false },
    animalHandling: { ability: "wisdom", prof: false },
    arcana: { ability: "intelligence", prof: false },
    athletics: { ability: "strength", prof: false },
    deception: { ability: "charisma", prof: true },
    history: { ability: "intelligence", prof: false },
    insight: { ability: "wisdom", prof: true },
    intimidation: { ability: "charisma", prof: true },
    investigation: { ability: "intelligence", prof: true },
    medicine: { ability: "wisdom", prof: false },
    nature: { ability: "intelligence", prof: false },
    perception: { ability: "wisdom", prof: false },
    performance: { ability: "charisma", prof: false },
    persuasion: { ability: "charisma", prof: false },
    religion: { ability: "intelligence", prof: false },
    sleightOfHand: { ability: "dexterity", prof: false },
    stealth: { ability: "dexterity", prof: true },
    survival: { ability: "wisdom", prof: false },
  },
  features: [
    "Agonizing Blast",
    "Mask of Many Faces",
    "Otherworldly Leap",
    "Adrenaline Rush",
    "Darkvision 120ft",
    "Relentless Endurance",
    "Steps of the Fey",
  ],
  equipment: [
    "Snake Staff",
    "Leather Armor",
    "2× Daggers",
    "Thieves' Tools",
    "Bedroll",
    "2× Pouches",
    "101 gp",
    "Traveler's Clothes",
    "Disguise Set",
  ],
  proficiencies: "Thieves' Tools, Simple Weapons, Light Armor",
  spellcasting: {
    ability: "CHA",
    saveDC: 12,
    attackBonus: 4,
  },
  spells: {
    cantrips: ["Minor Illusion", "Thunderclap"],
    level1: ["Charm Person", "Unseen Servant", "Illusory Script", "Sleep", "Faerie Fire"],
    level2: ["Hold Person", "Phantasmal Force", "Mirror Step", "Calm Emotions"],
    level3: [],
    level4: [],
    level5: [],
  },
  notes: "",
  // name -> rules text looked up from the 5e SRD (so it's readable offline)
  lore: {},
};

const SKILL_LABELS = {
  acrobatics: "Acrobatics", animalHandling: "Animal Handling", arcana: "Arcana",
  athletics: "Athletics", deception: "Deception", history: "History",
  insight: "Insight", intimidation: "Intimidation", investigation: "Investigation",
  medicine: "Medicine", nature: "Nature", perception: "Perception",
  performance: "Performance", persuasion: "Persuasion", religion: "Religion",
  sleightOfHand: "Sleight of Hand", stealth: "Stealth", survival: "Survival",
};

const ABILITY_SHORT = { strength: "STR", dexterity: "DEX", constitution: "CON", intelligence: "INT", wisdom: "WIS", charisma: "CHA" };

function getMod(score) {
  return Math.floor((score - 10) / 2);
}
function fmtMod(n) {
  return n >= 0 ? `+${n}` : `${n}`;
}

// Merge a stored character with the initial shape so new fields always exist.
function hydrate(stored) {
  if (!stored || typeof stored !== "object") return INITIAL_CHARACTER;
  return {
    ...INITIAL_CHARACTER,
    ...stored,
    abilities: { ...INITIAL_CHARACTER.abilities, ...stored.abilities },
    combat: { ...INITIAL_CHARACTER.combat, ...stored.combat },
    deathSaves: { ...INITIAL_CHARACTER.deathSaves, ...stored.deathSaves },
    savingThrows: { ...INITIAL_CHARACTER.savingThrows, ...stored.savingThrows },
    skills: { ...INITIAL_CHARACTER.skills, ...stored.skills },
    spellcasting: { ...INITIAL_CHARACTER.spellcasting, ...stored.spellcasting },
    spells: { ...INITIAL_CHARACTER.spells, ...stored.spells },
    lore: { ...(stored.lore || {}) },
  };
}

// ── Inline editable field ──
function EditField({ value, onChange, style = {}, inputStyle = {}, multiline = false, type = "text" }) {
  const [editing, setEditing] = useState(false);
  const [local, setLocal] = useState(value);

  useEffect(() => { setLocal(value); }, [value]);

  const commit = () => { setEditing(false); onChange(local); };

  if (editing) {
    if (multiline) return (
      <textarea
        autoFocus
        value={local}
        onChange={e => setLocal(e.target.value)}
        onBlur={commit}
        style={{ ...inputStyle, background: "rgba(201,136,42,0.15)", border: "1px solid #c9882a", borderRadius: 4, color: "inherit", fontFamily: "inherit", fontSize: "inherit", padding: "2px 6px", width: "100%", resize: "vertical" }}
      />
    );
    return (
      <input
        autoFocus
        type={type}
        value={local}
        onChange={e => setLocal(type === "number" ? Number(e.target.value) : e.target.value)}
        onBlur={commit}
        onKeyDown={e => e.key === "Enter" && commit()}
        style={{ ...inputStyle, background: "rgba(201,136,42,0.15)", border: "1px solid #c9882a", borderRadius: 4, color: "inherit", fontFamily: "inherit", fontSize: "inherit", padding: "2px 6px", textAlign: style.textAlign || "left", width: "100%" }}
      />
    );
  }
  return (
    <span
      onClick={() => setEditing(true)}
      style={{ cursor: "text", borderBottom: "1px dashed rgba(201,136,42,0.4)", display: "inline-block", ...style }}
      title="Tap to edit"
    >{value}</span>
  );
}

// ── Ability block ──
function AbilityBlock({ name, score, onChange }) {
  const mod = getMod(score);
  return (
    <div style={{
      background: "linear-gradient(135deg,#3d1a05,#5c2b0a)",
      border: "1.5px solid #c9882a", borderRadius: 8,
      padding: "8px 10px", textAlign: "center", flex: 1,
      minWidth: 0
    }}>
      <div style={{ fontFamily: "Cinzel,serif", fontSize: "0.5rem", letterSpacing: 2, color: "#c9882a88", textTransform: "uppercase", marginBottom: 2 }}>{name}</div>
      <EditField
        value={score}
        onChange={v => onChange(Number(v))}
        type="number"
        style={{ fontFamily: "'Cinzel Decorative',serif", fontSize: "1.5rem", color: "#e8b84b", textShadow: "0 0 10px rgba(201,136,42,0.5)", textAlign: "center", display: "block", width: "100%" }}
        inputStyle={{ width: "60px", textAlign: "center" }}
      />
      <div style={{ fontFamily: "Cinzel,serif", fontSize: "0.7rem", color: "#f0d090", background: "rgba(201,136,42,0.2)", borderRadius: 3, padding: "1px 4px", display: "inline-block", marginTop: 2 }}>
        {fmtMod(mod)}
      </div>
    </div>
  );
}

// ── Collapsible rules text (for looked-up spells/features) ──
function LoreText({ text }) {
  return (
    <div style={{
      marginTop: 4, marginBottom: 4, padding: "8px 10px",
      background: "rgba(61,26,5,0.06)", border: "1px solid rgba(201,136,42,0.25)",
      borderRadius: 6, fontSize: "0.8rem", color: "#3d2b0a", whiteSpace: "pre-wrap", lineHeight: 1.45,
    }}>
      {text}
    </div>
  );
}

// ── Main App ──
export default function DnDSheet() {
  const [char, setChar] = useState(INITIAL_CHARACTER);
  const [tab, setTab] = useState("stats");
  const [saved, setSaved] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [addingFeature, setAddingFeature] = useState(false);
  const [newFeature, setNewFeature] = useState("");
  const [addingItem, setAddingItem] = useState(false);
  const [newItem, setNewItem] = useState("");
  const [addingSpell, setAddingSpell] = useState(null);
  const [newSpell, setNewSpell] = useState("");
  const [openLore, setOpenLore] = useState({}); // name -> bool (expanded)
  const fileInputRef = useRef(null);

  // Load from localStorage once on mount.
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) setChar(hydrate(JSON.parse(raw)));
    } catch {}
    setLoaded(true);
  }, []);

  // Save (only after the initial load, so we never overwrite saved data with defaults).
  const save = useCallback((data) => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
      setSaved(true);
      setTimeout(() => setSaved(false), 1500);
    } catch {}
  }, []);

  const update = useCallback((updater) => {
    setChar(prev => {
      const next = updater(prev);
      save(next);
      return next;
    });
  }, [save]);

  const setAbility = (key, val) => update(c => ({ ...c, abilities: { ...c.abilities, [key]: val } }));
  const setCombat = (key, val) => update(c => ({ ...c, combat: { ...c.combat, [key]: val } }));
  const toggleSave = (key) => update(c => ({ ...c, savingThrows: { ...c.savingThrows, [key]: { ...c.savingThrows[key], prof: !c.savingThrows[key].prof } } }));
  const toggleSkill = (key) => update(c => ({ ...c, skills: { ...c.skills, [key]: { ...c.skills[key], prof: !c.skills[key].prof } } }));
  const toggleDS = (type) => update(c => {
    const cur = c.deathSaves[type];
    return { ...c, deathSaves: { ...c.deathSaves, [type]: cur >= 3 ? 0 : cur + 1 } };
  });

  // Store looked-up rules text against a name.
  const setLore = (name, text) => update(c => ({ ...c, lore: { ...c.lore, [name]: text } }));
  const toggleLore = (name) => setOpenLore(o => ({ ...o, [name]: !o[name] }));

  // Export / import.
  const handleExport = () => {
    const blob = new Blob([JSON.stringify(char, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    const safe = (char.name || "character").replace(/[^a-z0-9]+/gi, "-").toLowerCase();
    a.download = `dnd-${safe}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };
  const handleImportFile = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = hydrate(JSON.parse(reader.result));
        update(() => data);
        setTab("stats");
      } catch {
        alert("That file could not be read as a character export.");
      }
    };
    reader.readAsText(file);
    e.target.value = "";
  };

  const TABS = [
    { id: "stats", label: "Stats" },
    { id: "skills", label: "Skills" },
    { id: "combat", label: "Combat" },
    { id: "spells", label: "Spells" },
    { id: "gear", label: "Gear" },
    { id: "codex", label: "Codex" },
  ];

  const s = char;
  const pb = s.proficiencyBonus;

  const getSaveMod = (key) => getMod(s.abilities[key]) + (s.savingThrows[key].prof ? pb : 0);
  const getSkillMod = (key) => {
    const sk = s.skills[key];
    return getMod(s.abilities[sk.ability]) + (sk.prof ? pb : 0);
  };

  const styles = {
    app: {
      minHeight: "100vh",
      background: "#0f0804",
      backgroundImage: "radial-gradient(ellipse at top, #1a0a02 0%, #0a0402 100%)",
      fontFamily: "'Crimson Text',Georgia,serif",
      color: "#1a1008",
      maxWidth: 480,
      margin: "0 auto",
    },
    header: {
      background: "linear-gradient(135deg,#1a0a02,#3d1a05)",
      borderBottom: "2px solid #c9882a",
      padding: "14px 16px 10px",
      position: "sticky", top: 0, zIndex: 50,
    },
    charName: {
      fontFamily: "'Cinzel Decorative',serif",
      fontSize: "1.4rem", fontWeight: 900,
      color: "#e8b84b",
      textShadow: "0 0 20px rgba(201,136,42,0.4)",
      lineHeight: 1,
    },
    charSub: {
      fontFamily: "Cinzel,serif",
      fontSize: "0.6rem", letterSpacing: 2,
      color: "#c9882a88",
      marginTop: 3,
    },
    savedBadge: {
      fontFamily: "Cinzel,serif", fontSize: "0.5rem",
      letterSpacing: 2, color: "#4caf50",
      background: "rgba(76,175,80,0.15)",
      border: "1px solid rgba(76,175,80,0.3)",
      borderRadius: 20, padding: "2px 8px",
      transition: "opacity 0.3s",
      opacity: saved ? 1 : 0,
    },
    tabBar: {
      display: "flex",
      background: "#0f0804",
      borderBottom: "1px solid #3d1a05",
      position: "sticky", top: 66, zIndex: 49,
    },
    tabBtn: (active) => ({
      flex: 1, padding: "10px 2px",
      fontFamily: "Cinzel,serif", fontSize: "0.55rem",
      letterSpacing: 1, textTransform: "uppercase",
      border: "none", cursor: "pointer",
      background: active ? "linear-gradient(180deg,#3d1a05,#1a0a02)" : "transparent",
      color: active ? "#e8b84b" : "#8b5e1a",
      borderBottom: active ? "2px solid #c9882a" : "2px solid transparent",
      transition: "all 0.2s",
    }),
    page: {
      padding: "16px",
      background: "#f5ead6",
      backgroundImage: "linear-gradient(160deg,#f8eedc 0%,#eedfc0 100%)",
      minHeight: "calc(100vh - 110px)",
    },
    sectionTitle: {
      fontFamily: "Cinzel,serif", fontSize: "0.55rem",
      letterSpacing: 3, textTransform: "uppercase",
      color: "#7a1c1c",
      borderBottom: "1px solid rgba(201,136,42,0.4)",
      paddingBottom: 4, marginBottom: 10, marginTop: 16,
    },
    card: {
      background: "rgba(245,234,214,0.7)",
      border: "1px solid rgba(201,136,42,0.3)",
      borderRadius: 8, padding: "10px 12px",
      marginBottom: 10,
    },
    addBtn: {
      fontFamily: "Cinzel,serif", fontSize: "0.6rem",
      letterSpacing: 1.5, textTransform: "uppercase",
      background: "linear-gradient(135deg,#3d1a05,#5c2b0a)",
      border: "1px solid #c9882a", borderRadius: 4,
      color: "#e8b84b", padding: "5px 12px",
      cursor: "pointer", marginTop: 8,
    },
    removeBtn: {
      background: "none", border: "none",
      color: "#7a1c1c", cursor: "pointer",
      fontSize: "0.85rem", padding: "0 4px",
      lineHeight: 1,
    },
    infoBtn: {
      background: "none", border: "1px solid rgba(201,136,42,0.5)",
      color: "#7a1c1c", cursor: "pointer",
      fontSize: "0.6rem", borderRadius: 4,
      padding: "0 5px", lineHeight: 1.4, fontFamily: "Cinzel,serif",
    },
    hpBtn: {
      width: 36, height: 36, borderRadius: "50%",
      border: "1.5px solid #c9882a",
      background: "linear-gradient(135deg,#3d1a05,#5c2b0a)",
      color: "#e8b84b", fontSize: "1.2rem",
      cursor: "pointer", display: "flex",
      alignItems: "center", justifyContent: "center",
      fontWeight: 900,
    },
  };

  // ── Reusable list row that can carry a lore description ──
  const LoreRow = ({ name, icon, onRemove }) => {
    const hasLore = !!s.lore[name];
    return (
      <div style={{ borderBottom: "1px dashed rgba(139,94,26,0.2)", padding: "3px 0" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          {icon && <span style={{ color: "#c9882a", fontSize: "0.65rem" }}>{icon}</span>}
          <span style={{ fontSize: "0.85rem", flex: 1 }}>{name}</span>
          {hasLore && (
            <button style={styles.infoBtn} onClick={() => toggleLore(name)} title="Show rules text">
              {openLore[name] ? "Hide" : "Info"}
            </button>
          )}
          {onRemove && <button style={styles.removeBtn} onClick={onRemove}>×</button>}
        </div>
        {hasLore && openLore[name] && <LoreText text={s.lore[name]} />}
      </div>
    );
  };

  // ── STATS TAB ──
  const StatsTab = () => (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
        <div>
          <div style={styles.charName}>
            <EditField value={s.name} onChange={v => update(c => ({ ...c, name: v }))} style={{ color: "#7a1c1c", fontSize: "1.1rem" }} />
          </div>
          <div style={{ fontFamily: "Cinzel,serif", fontSize: "0.6rem", color: "#8b5e1a", marginTop: 2 }}>
            <EditField value={s.class} onChange={v => update(c => ({ ...c, class: v }))} style={{ color: "#8b5e1a" }} />
            {" · "}
            <EditField value={s.race} onChange={v => update(c => ({ ...c, race: v }))} style={{ color: "#8b5e1a" }} />
          </div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontFamily: "Cinzel,serif", fontSize: "0.55rem", color: "#8b5e1a" }}>Prof Bonus</div>
          <div style={{ fontFamily: "'Cinzel Decorative',serif", fontSize: "1.3rem", color: "#7a1c1c" }}>
            +<EditField value={pb} onChange={v => update(c => ({ ...c, proficiencyBonus: Number(v) }))} type="number" style={{ color: "#7a1c1c" }} />
          </div>
        </div>
      </div>

      <div style={styles.sectionTitle}>Ability Scores</div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 8, marginBottom: 4 }}>
        {Object.entries(s.abilities).map(([key, val]) => (
          <AbilityBlock key={key} name={ABILITY_SHORT[key]} score={val} onChange={v => setAbility(key, v)} />
        ))}
      </div>

      <div style={styles.sectionTitle}>Saving Throws</div>
      <div style={styles.card}>
        {Object.entries(s.savingThrows).map(([key]) => {
          const mod = getSaveMod(key);
          return (
            <div key={key} style={{ display: "flex", alignItems: "center", gap: 8, padding: "3px 0", borderBottom: "1px dashed rgba(139,94,26,0.2)" }}>
              <div
                onClick={() => toggleSave(key)}
                style={{
                  width: 12, height: 12, borderRadius: "50%", flexShrink: 0, cursor: "pointer",
                  background: s.savingThrows[key].prof ? "radial-gradient(circle at 35% 35%,#e8b84b,#c9882a)" : "#e8d4a8",
                  border: `1.5px solid ${s.savingThrows[key].prof ? "#c9882a" : "#8b5e1a"}`,
                  boxShadow: s.savingThrows[key].prof ? "0 0 6px rgba(201,136,42,0.5)" : "none",
                }}
              />
              <span style={{ fontFamily: "Cinzel,serif", fontSize: "0.65rem", fontWeight: 700, color: "#3d2b0a", minWidth: 28 }}>{fmtMod(mod)}</span>
              <span style={{ fontSize: "0.8rem", color: "#1a1008", textTransform: "capitalize" }}>{key.replace(/([A-Z])/g, ' $1')}</span>
            </div>
          );
        })}
      </div>

      <div style={styles.sectionTitle}>Features & Traits</div>
      <div style={styles.card}>
        {s.features.map((f, i) => (
          <LoreRow
            key={i}
            name={f}
            icon="✦"
            onRemove={() => update(c => ({ ...c, features: c.features.filter((_, j) => j !== i) }))}
          />
        ))}
        {addingFeature ? (
          <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
            <input autoFocus value={newFeature} onChange={e => setNewFeature(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter" && newFeature.trim()) { update(c => ({ ...c, features: [...c.features, newFeature.trim()] })); setNewFeature(""); setAddingFeature(false); } }}
              placeholder="Feature name…"
              style={{ flex: 1, background: "rgba(201,136,42,0.1)", border: "1px solid #c9882a", borderRadius: 4, color: "#1a1008", fontFamily: "inherit", padding: "4px 8px" }}
            />
            <button style={styles.addBtn} onClick={() => { if (newFeature.trim()) { update(c => ({ ...c, features: [...c.features, newFeature.trim()] })); setNewFeature(""); setAddingFeature(false); } }}>Add</button>
            <button style={{ ...styles.addBtn, background: "transparent", color: "#8b5e1a" }} onClick={() => setAddingFeature(false)}>Cancel</button>
          </div>
        ) : (
          <div style={{ display: "flex", gap: 8 }}>
            <button style={styles.addBtn} onClick={() => setAddingFeature(true)}>+ Add Feature</button>
            <button style={{ ...styles.addBtn, background: "transparent", color: "#7a1c1c", borderColor: "#7a1c1c" }} onClick={() => setTab("codex")}>🔍 Look up</button>
          </div>
        )}
      </div>

      <div style={styles.sectionTitle}>Notes</div>
      <textarea
        value={s.notes}
        onChange={e => update(c => ({ ...c, notes: e.target.value }))}
        placeholder="Session notes, lore, reminders…"
        style={{ width: "100%", minHeight: 120, background: "rgba(245,234,214,0.5)", border: "1px solid rgba(201,136,42,0.3)", borderRadius: 6, fontFamily: "'Crimson Text',serif", fontSize: "0.9rem", color: "#1a1008", padding: "8px 10px", resize: "vertical" }}
      />

      <div style={styles.sectionTitle}>Backup</div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button style={styles.addBtn} onClick={handleExport}>⬇ Export JSON</button>
        <button style={styles.addBtn} onClick={() => fileInputRef.current?.click()}>⬆ Import JSON</button>
        <button
          onClick={() => { if (confirm("Reset to the original character? This overwrites your current sheet.")) { update(() => INITIAL_CHARACTER); } }}
          style={{ ...styles.addBtn, background: "rgba(122,28,28,0.2)", borderColor: "#7a1c1c", color: "#7a1c1c" }}
        >
          ↺ Reset
        </button>
        <input ref={fileInputRef} type="file" accept="application/json" onChange={handleImportFile} style={{ display: "none" }} />
      </div>
      <div style={{ fontSize: "0.7rem", color: "#8b5e1a", marginTop: 8, lineHeight: 1.4 }}>
        Your sheet auto-saves on this device. Export a JSON backup to move it to another device or keep it safe.
      </div>
    </div>
  );

  // ── SKILLS TAB ──
  const SkillsTab = () => (
    <div>
      <div style={styles.sectionTitle}>Skills</div>
      <div style={{ ...styles.card, padding: "6px 10px" }}>
        {Object.entries(s.skills).map(([key]) => {
          const mod = getSkillMod(key);
          const sk = s.skills[key];
          return (
            <div key={key} style={{ display: "flex", alignItems: "center", gap: 8, padding: "4px 0", borderBottom: "1px dashed rgba(139,94,26,0.2)" }}>
              <div
                onClick={() => toggleSkill(key)}
                style={{
                  width: 12, height: 12, borderRadius: "50%", flexShrink: 0, cursor: "pointer",
                  background: sk.prof ? "radial-gradient(circle at 35% 35%,#e8b84b,#c9882a)" : "#e8d4a8",
                  border: `1.5px solid ${sk.prof ? "#c9882a" : "#8b5e1a"}`,
                  boxShadow: sk.prof ? "0 0 6px rgba(201,136,42,0.5)" : "none",
                }}
              />
              <span style={{ fontFamily: "Cinzel,serif", fontSize: "0.65rem", fontWeight: 700, color: "#3d2b0a", minWidth: 28 }}>{fmtMod(mod)}</span>
              <span style={{ fontSize: "0.8rem", color: "#1a1008", flex: 1 }}>{SKILL_LABELS[key]}</span>
              <span style={{ fontFamily: "Cinzel,serif", fontSize: "0.5rem", color: "#8b5e1a" }}>{ABILITY_SHORT[sk.ability]}</span>
            </div>
          );
        })}
      </div>
      <div style={{ ...styles.card, marginTop: 12 }}>
        <div style={{ fontFamily: "Cinzel,serif", fontSize: "0.55rem", letterSpacing: 2, color: "#7a1c1c", marginBottom: 6 }}>PASSIVE WISDOM (PERCEPTION)</div>
        <div style={{ fontFamily: "'Cinzel Decorative',serif", fontSize: "1.8rem", color: "#3d2b0a" }}>
          {10 + getSkillMod("perception")}
        </div>
      </div>
    </div>
  );

  // ── COMBAT TAB ──
  const CombatTab = () => (
    <div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 10, marginBottom: 14 }}>
        {[
          { label: "Armor Class", key: "ac" },
          { label: "Initiative", key: "initiative" },
          { label: "Speed", key: "speed" },
        ].map(({ label, key }) => (
          <div key={key} style={{ textAlign: "center" }}>
            <div style={{ width: 64, height: 64, borderRadius: "50%", background: "linear-gradient(135deg,#3d1a05,#5c2b0a)", border: "2px solid #c9882a", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", margin: "0 auto 4px", boxShadow: "0 0 12px rgba(201,136,42,0.25)" }}>
              <EditField value={s.combat[key]} onChange={v => setCombat(key, Number(v))} type="number"
                style={{ fontFamily: "'Cinzel Decorative',serif", fontSize: "1.2rem", color: "#e8b84b", textAlign: "center", display: "block" }}
                inputStyle={{ width: 44, textAlign: "center" }}
              />
            </div>
            <span style={{ fontFamily: "Cinzel,serif", fontSize: "0.5rem", letterSpacing: 1.5, color: "#8b5e1a", textTransform: "uppercase" }}>{label}</span>
          </div>
        ))}
      </div>

      {/* HP */}
      <div style={{ ...styles.card, background: "linear-gradient(135deg,rgba(122,28,28,0.1),rgba(122,28,28,0.05))", border: "1.5px solid #7a1c1c", textAlign: "center", marginBottom: 10 }}>
        <div style={{ fontFamily: "Cinzel,serif", fontSize: "0.55rem", letterSpacing: 2, color: "#7a1c1c", marginBottom: 4 }}>HIT POINTS</div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 12 }}>
          <button style={styles.hpBtn} onClick={() => setCombat("hp", Math.max(0, s.combat.hp - 1))}>−</button>
          <div>
            <EditField value={s.combat.hp} onChange={v => setCombat("hp", Number(v))} type="number"
              style={{ fontFamily: "'Cinzel Decorative',serif", fontSize: "3rem", color: "#7a1c1c", lineHeight: 1 }}
              inputStyle={{ width: 70, textAlign: "center" }}
            />
            <span style={{ fontFamily: "Cinzel,serif", fontSize: "1rem", color: "#8b5e1a" }}>
              {" / "}
              <EditField value={s.combat.maxHp} onChange={v => setCombat("maxHp", Number(v))} type="number" style={{ color: "#8b5e1a" }} inputStyle={{ width: 40 }} />
            </span>
          </div>
          <button style={styles.hpBtn} onClick={() => setCombat("hp", Math.min(s.combat.maxHp, s.combat.hp + 1))}>+</button>
        </div>
        <div style={{ display: "flex", gap: 8, justifyContent: "center", marginTop: 8 }}>
          {[-10,-5,-1,"+1","+5","+10"].map(v => (
            <button key={v} onClick={() => {
              const delta = typeof v === "number" ? v : parseInt(v);
              setCombat("hp", Math.max(0, Math.min(s.combat.maxHp, s.combat.hp + delta)));
            }} style={{ fontFamily: "Cinzel,serif", fontSize: "0.55rem", padding: "3px 8px", background: typeof v === "number" ? "rgba(122,28,28,0.15)" : "rgba(61,43,10,0.15)", border: `1px solid ${typeof v === "number" ? "#7a1c1c" : "#c9882a"}`, borderRadius: 4, color: typeof v === "number" ? "#7a1c1c" : "#3d2b0a", cursor: "pointer" }}>
              {v}
            </button>
          ))}
        </div>
      </div>

      {/* Temp HP */}
      <div style={{ ...styles.card, textAlign: "center" }}>
        <div style={{ fontFamily: "Cinzel,serif", fontSize: "0.55rem", letterSpacing: 2, color: "#8b5e1a", marginBottom: 4 }}>TEMP HP</div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 12 }}>
          <button style={{ ...styles.hpBtn, width: 30, height: 30 }} onClick={() => setCombat("tempHp", Math.max(0, s.combat.tempHp - 1))}>−</button>
          <EditField value={s.combat.tempHp} onChange={v => setCombat("tempHp", Number(v))} type="number"
            style={{ fontFamily: "'Cinzel Decorative',serif", fontSize: "1.8rem", color: "#3d2b0a" }}
            inputStyle={{ width: 50, textAlign: "center" }}
          />
          <button style={{ ...styles.hpBtn, width: 30, height: 30 }} onClick={() => setCombat("tempHp", s.combat.tempHp + 1)}>+</button>
        </div>
      </div>

      {/* Hit Dice */}
      <div style={{ ...styles.card, display: "flex", alignItems: "center", gap: 10 }}>
        <span style={{ fontFamily: "Cinzel,serif", fontSize: "0.55rem", letterSpacing: 2, color: "#8b5e1a", textTransform: "uppercase" }}>Hit Dice</span>
        <EditField value={s.combat.hitDice} onChange={v => setCombat("hitDice", v)}
          style={{ fontFamily: "Cinzel,serif", fontSize: "0.9rem", fontWeight: 700, color: "#3d2b0a" }}
        />
      </div>

      {/* Death Saves */}
      <div style={styles.sectionTitle}>Death Saves</div>
      <div style={{ ...styles.card, display: "flex", gap: 20, justifyContent: "center" }}>
        {[["successes","#2d7a2d","Successes"], ["failures","#7a1c1c","Failures"]].map(([type, color, label]) => (
          <div key={type} style={{ textAlign: "center" }}>
            <div style={{ fontFamily: "Cinzel,serif", fontSize: "0.5rem", letterSpacing: 2, color: "#8b5e1a", marginBottom: 6 }}>{label.toUpperCase()}</div>
            <div style={{ display: "flex", gap: 6 }}>
              {[0,1,2].map(i => (
                <div key={i} onClick={() => toggleDS(type)} style={{
                  width: 18, height: 18, borderRadius: "50%", cursor: "pointer",
                  background: i < s.deathSaves[type] ? color : "#e8d4a8",
                  border: `2px solid ${color}`,
                  transition: "all 0.2s",
                }} />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );

  // ── SPELLS TAB ──
  const SpellsTab = () => {
    const levelLabels = { cantrips: "Cantrips", level1: "1st Level", level2: "2nd Level", level3: "3rd Level", level4: "4th Level", level5: "5th Level" };
    return (
      <div>
        <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
          {[["Ability", s.spellcasting.ability], ["Save DC", s.spellcasting.saveDC], ["Atk Bonus", `+${s.spellcasting.attackBonus}`]].map(([l, v], i) => (
            <div key={l} style={{ flex: 1, textAlign: "center", border: "1px solid rgba(201,136,42,0.4)", borderRadius: 6, padding: "6px", background: "rgba(201,136,42,0.06)" }}>
              <div style={{ fontFamily: "'Cinzel Decorative',serif", fontSize: "1rem", color: "#7a1c1c" }}>
                {i === 0 ? (
                  <EditField value={s.spellcasting.ability} onChange={v => update(c => ({ ...c, spellcasting: { ...c.spellcasting, ability: v } }))} style={{ color: "#7a1c1c" }} />
                ) : i === 1 ? (
                  <EditField value={s.spellcasting.saveDC} onChange={v => update(c => ({ ...c, spellcasting: { ...c.spellcasting, saveDC: Number(v) } }))} type="number" style={{ color: "#7a1c1c" }} />
                ) : (
                  <span>+<EditField value={s.spellcasting.attackBonus} onChange={v => update(c => ({ ...c, spellcasting: { ...c.spellcasting, attackBonus: Number(v) } }))} type="number" style={{ color: "#7a1c1c" }} /></span>
                )}
              </div>
              <div style={{ fontFamily: "Cinzel,serif", fontSize: "0.5rem", letterSpacing: 1.5, color: "#8b5e1a", textTransform: "uppercase" }}>{l}</div>
            </div>
          ))}
        </div>

        <button style={{ ...styles.addBtn, background: "transparent", color: "#7a1c1c", borderColor: "#7a1c1c", marginTop: 0, marginBottom: 8 }} onClick={() => setTab("codex")}>🔍 Look up a spell</button>

        {Object.entries(s.spells).map(([lvl, spells]) => (
          <div key={lvl} style={{ border: "1px solid rgba(201,136,42,0.3)", borderRadius: 8, overflow: "hidden", marginBottom: 10 }}>
            <div style={{ background: "linear-gradient(135deg,#3d1a05,#5c2b0a)", padding: "6px 12px", fontFamily: "Cinzel,serif", fontSize: "0.6rem", letterSpacing: 2, color: "#e8b84b", textTransform: "uppercase" }}>
              {levelLabels[lvl]}
            </div>
            <div style={{ padding: "6px 12px", background: "rgba(245,234,214,0.5)" }}>
              {spells.map((spell, i) => (
                <LoreRow
                  key={i}
                  name={spell}
                  icon="✦"
                  onRemove={() => update(c => ({ ...c, spells: { ...c.spells, [lvl]: c.spells[lvl].filter((_, j) => j !== i) } }))}
                />
              ))}
              {addingSpell === lvl ? (
                <div style={{ display: "flex", gap: 6, marginTop: 4 }}>
                  <input autoFocus value={newSpell} onChange={e => setNewSpell(e.target.value)}
                    onKeyDown={e => { if (e.key === "Enter" && newSpell.trim()) { update(c => ({ ...c, spells: { ...c.spells, [lvl]: [...c.spells[lvl], newSpell.trim()] } })); setNewSpell(""); setAddingSpell(null); } }}
                    placeholder="Spell name…"
                    style={{ flex: 1, background: "rgba(201,136,42,0.1)", border: "1px solid #c9882a", borderRadius: 4, color: "#1a1008", fontFamily: "inherit", padding: "3px 8px", fontSize: "0.8rem" }}
                  />
                  <button style={styles.addBtn} onClick={() => { if (newSpell.trim()) { update(c => ({ ...c, spells: { ...c.spells, [lvl]: [...c.spells[lvl], newSpell.trim()] } })); setNewSpell(""); setAddingSpell(null); } }}>+</button>
                  <button style={{ ...styles.removeBtn, fontSize: "1rem" }} onClick={() => setAddingSpell(null)}>×</button>
                </div>
              ) : (
                <button style={{ ...styles.addBtn, fontSize: "0.55rem", padding: "3px 8px", marginTop: 4 }} onClick={() => { setAddingSpell(lvl); setNewSpell(""); }}>+ Add</button>
              )}
            </div>
          </div>
        ))}
      </div>
    );
  };

  // ── GEAR TAB ──
  const GearTab = () => (
    <div>
      <div style={styles.sectionTitle}>Equipment</div>
      <div style={styles.card}>
        {s.equipment.map((item, i) => (
          <LoreRow
            key={i}
            name={item}
            icon="⚔"
            onRemove={() => update(c => ({ ...c, equipment: c.equipment.filter((_, j) => j !== i) }))}
          />
        ))}
        {addingItem ? (
          <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
            <input autoFocus value={newItem} onChange={e => setNewItem(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter" && newItem.trim()) { update(c => ({ ...c, equipment: [...c.equipment, newItem.trim()] })); setNewItem(""); setAddingItem(false); } }}
              placeholder="Item name…"
              style={{ flex: 1, background: "rgba(201,136,42,0.1)", border: "1px solid #c9882a", borderRadius: 4, color: "#1a1008", fontFamily: "inherit", padding: "4px 8px" }}
            />
            <button style={styles.addBtn} onClick={() => { if (newItem.trim()) { update(c => ({ ...c, equipment: [...c.equipment, newItem.trim()] })); setNewItem(""); setAddingItem(false); } }}>Add</button>
            <button style={{ ...styles.addBtn, background: "transparent", color: "#8b5e1a" }} onClick={() => setAddingItem(false)}>Cancel</button>
          </div>
        ) : (
          <div style={{ display: "flex", gap: 8 }}>
            <button style={styles.addBtn} onClick={() => setAddingItem(true)}>+ Add Item</button>
            <button style={{ ...styles.addBtn, background: "transparent", color: "#7a1c1c", borderColor: "#7a1c1c" }} onClick={() => setTab("codex")}>🔍 Look up</button>
          </div>
        )}
      </div>

      <div style={styles.sectionTitle}>Proficiencies &amp; Languages</div>
      <div style={styles.card}>
        <EditField
          value={s.proficiencies}
          onChange={v => update(c => ({ ...c, proficiencies: v }))}
          multiline
          style={{ fontSize: "0.85rem", display: "block", width: "100%" }}
          inputStyle={{ fontSize: "0.85rem" }}
        />
      </div>
    </div>
  );

  const tabContent = {
    stats: <StatsTab />, skills: <SkillsTab />, combat: <CombatTab />,
    spells: <SpellsTab />, gear: <GearTab />, codex: (
      <CodexTab
        styles={styles}
        char={s}
        setLore={setLore}
        update={update}
      />
    ),
  };

  return (
    <div style={styles.app}>
      <link href="https://fonts.googleapis.com/css2?family=Cinzel+Decorative:wght@400;700;900&family=Cinzel:wght@400;600;700&family=Crimson+Text:ital,wght@0,400;0,600;1,400&display=swap" rel="stylesheet" />

      {/* Sticky header */}
      <div style={styles.header}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <div style={styles.charName}>{s.name}</div>
            <div style={styles.charSub}>{s.class} · {s.race}</div>
          </div>
          <div style={styles.savedBadge}>✓ SAVED</div>
        </div>
      </div>

      {/* Tab bar */}
      <div style={styles.tabBar}>
        {TABS.map(t => (
          <button key={t.id} style={styles.tabBtn(tab === t.id)} onClick={() => setTab(t.id)}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Page */}
      <div style={styles.page}>
        {tabContent[tab]}
      </div>
    </div>
  );
}

// ── CODEX TAB (5e SRD lookup) ──
function CodexTab({ styles, char, setLore, update }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [status, setStatus] = useState("idle"); // idle | loading | error | done
  const [openItem, setOpenItem] = useState(null); // `${resource}/${index}`
  const [details, setDetails] = useState({}); // key -> { text, raw }
  const debounceRef = useRef(null);

  useEffect(() => {
    clearTimeout(debounceRef.current);
    if (query.trim().length < 2) {
      setResults([]);
      setStatus("idle");
      return;
    }
    setStatus("loading");
    debounceRef.current = setTimeout(async () => {
      try {
        const r = await srdSearch(query);
        setResults(r);
        setStatus("done");
      } catch {
        setStatus("error");
      }
    }, 300);
    return () => clearTimeout(debounceRef.current);
  }, [query]);

  const openDetail = async (item) => {
    const key = `${item.resource}/${item.index}`;
    if (openItem === key) { setOpenItem(null); return; }
    setOpenItem(key);
    if (!details[key]) {
      try {
        const raw = await fetchDetail(item.resource, item.index);
        const text = formatDetail(item.resource, raw);
        setDetails(d => ({ ...d, [key]: { text, raw } }));
      } catch {
        setDetails(d => ({ ...d, [key]: { text: "Could not load details.", raw: null } }));
      }
    }
  };

  // Add a found entry to the character, storing its rules text too.
  const addEntry = (item, target) => {
    const key = `${item.resource}/${item.index}`;
    const text = details[key]?.text || "";
    const name = item.name;
    if (text) setLore(name, text);

    if (target === "spell") {
      const lvl = item.level === 0 ? "cantrips" : `level${item.level}`;
      update(c => {
        const bucket = c.spells[lvl] || [];
        if (bucket.includes(name)) return { ...c, lore: { ...c.lore, [name]: text || c.lore[name] } };
        return { ...c, spells: { ...c.spells, [lvl]: [...bucket, name] }, lore: { ...c.lore, [name]: text || c.lore[name] } };
      });
    } else if (target === "feature") {
      update(c => c.features.includes(name)
        ? { ...c, lore: { ...c.lore, [name]: text || c.lore[name] } }
        : { ...c, features: [...c.features, name], lore: { ...c.lore, [name]: text || c.lore[name] } });
    } else if (target === "gear") {
      update(c => c.equipment.includes(name)
        ? { ...c, lore: { ...c.lore, [name]: text || c.lore[name] } }
        : { ...c, equipment: [...c.equipment, name], lore: { ...c.lore, [name]: text || c.lore[name] } });
    }
  };

  const chipColor = {
    Spell: "#7a1c1c", Feature: "#3d6a1c", Trait: "#1c4a7a",
    Gear: "#5c2b0a", Condition: "#6a1c6a", "Magic Item": "#8a5a00",
  };

  return (
    <div>
      <div style={styles.sectionTitle}>Codex — 5e Rules Lookup</div>
      <div style={{ fontSize: "0.78rem", color: "#5c4422", marginBottom: 10, lineHeight: 1.4 }}>
        Search official D&D 5e spells, features, traits, gear and conditions. Tap a result to read what it does, then add it to your sheet — its rules text is saved so you can read it again later, even offline.
      </div>

      <input
        autoFocus
        value={query}
        onChange={e => setQuery(e.target.value)}
        placeholder="e.g. Fireball, Darkvision, Rage…"
        style={{ width: "100%", boxSizing: "border-box", background: "rgba(201,136,42,0.1)", border: "1px solid #c9882a", borderRadius: 6, color: "#1a1008", fontFamily: "'Crimson Text',serif", fontSize: "1rem", padding: "8px 12px" }}
      />

      <div style={{ marginTop: 10 }}>
        {status === "loading" && <div style={{ color: "#8b5e1a", fontSize: "0.8rem", padding: "8px 0" }}>Searching…</div>}
        {status === "error" && <div style={{ color: "#7a1c1c", fontSize: "0.8rem", padding: "8px 0" }}>Couldn’t reach the SRD API. Check your connection and try again.</div>}
        {status === "done" && results.length === 0 && <div style={{ color: "#8b5e1a", fontSize: "0.8rem", padding: "8px 0" }}>No matches found.</div>}

        {results.map(item => {
          const key = `${item.resource}/${item.index}`;
          const isOpen = openItem === key;
          const d = details[key];
          return (
            <div key={key} style={{ border: "1px solid rgba(201,136,42,0.3)", borderRadius: 8, marginBottom: 8, overflow: "hidden", background: "rgba(245,234,214,0.6)" }}>
              <div
                onClick={() => openDetail(item)}
                style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 10px", cursor: "pointer" }}
              >
                <span style={{ fontFamily: "Cinzel,serif", fontSize: "0.5rem", letterSpacing: 1, textTransform: "uppercase", color: "#fff", background: chipColor[item.label] || "#5c2b0a", borderRadius: 4, padding: "2px 6px", flexShrink: 0 }}>
                  {item.label}{item.resource === "spells" ? ` ${item.level === 0 ? "C" : item.level}` : ""}
                </span>
                <span style={{ flex: 1, fontSize: "0.9rem", color: "#1a1008" }}>{item.name}</span>
                <span style={{ color: "#8b5e1a", fontSize: "0.8rem" }}>{isOpen ? "▾" : "▸"}</span>
              </div>
              {isOpen && (
                <div style={{ padding: "0 10px 10px" }}>
                  {!d ? (
                    <div style={{ color: "#8b5e1a", fontSize: "0.8rem" }}>Loading…</div>
                  ) : (
                    <>
                      <div style={{ whiteSpace: "pre-wrap", fontSize: "0.82rem", color: "#3d2b0a", lineHeight: 1.45, marginBottom: 8 }}>{d.text}</div>
                      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                        {item.resource === "spells" && (
                          <button style={styles.addBtn} onClick={() => addEntry(item, "spell")}>+ Add Spell</button>
                        )}
                        {(item.resource === "features" || item.resource === "traits") && (
                          <button style={styles.addBtn} onClick={() => addEntry(item, "feature")}>+ Add Feature</button>
                        )}
                        {(item.resource === "equipment" || item.resource === "magic-items") && (
                          <button style={styles.addBtn} onClick={() => addEntry(item, "gear")}>+ Add to Gear</button>
                        )}
                        {/* Always allow adding as a feature/note-style entry */}
                        {item.resource === "conditions" && (
                          <button style={styles.addBtn} onClick={() => addEntry(item, "feature")}>+ Add as Feature</button>
                        )}
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
