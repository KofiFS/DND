import { useState, useEffect, useCallback, useRef } from "react";
import { search as srdSearch, fetchDetail, formatDetail, describe } from "./api.js";
import { addPhoto, getPhotos, deletePhoto, updatePhotoCaption, resizeImage } from "./idb.js";

const STORAGE_KEY = "dnd-sheet-v1";

const INITIAL_CHARACTER = {
  name: "Arc-Elf Tanner",
  class: "Warlock 3 / Lock",
  race: "Orc/Elf",
  background: "Watching",
  level: 3,
  proficiencyBonus: 2,
  abilities: {
    strength: 11, dexterity: 12, constitution: 14,
    intelligence: 12, wisdom: 13, charisma: 14,
  },
  combat: {
    ac: 12, initiative: 1, speed: 30,
    hp: 26, maxHp: 26, tempHp: 0, hitDice: "3d6",
  },
  deathSaves: { successes: 0, failures: 0 },
  savingThrows: {
    strength: { prof: false }, dexterity: { prof: false }, constitution: { prof: false },
    intelligence: { prof: false }, wisdom: { prof: true }, charisma: { prof: true },
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
    "Agonizing Blast", "Mask of Many Faces", "Otherworldly Leap", "Adrenaline Rush",
    "Darkvision 120ft", "Relentless Endurance", "Steps of the Fey",
  ],
  equipment: [
    "Snake Staff", "Leather Armor", "2× Daggers", "Thieves' Tools", "Bedroll",
    "2× Pouches", "101 gp", "Traveler's Clothes", "Disguise Set",
  ],
  proficiencies: "Thieves' Tools, Simple Weapons, Light Armor",
  spellcasting: { ability: "CHA", saveDC: 12, attackBonus: 4 },
  spells: {
    cantrips: ["Minor Illusion", "Thunderclap"],
    level1: ["Charm Person", "Unseen Servant", "Illusory Script", "Sleep", "Faerie Fire"],
    level2: ["Hold Person", "Phantasmal Force", "Mirror Step", "Calm Emotions"],
    level3: [], level4: [], level5: [],
  },
  notes: "",
  // name -> rules text / description (from SRD lookups or typed by hand)
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

const PALETTE = {
  ink: "#2a1a0c", inkSoft: "#5c4422", gold: "#c9882a", goldLt: "#e8b84b",
  rust: "#7a1c1c", green: "#3d6a1c", parchment: "#f5ead6",
  darkA: "#1a0a02", darkB: "#3d1a05", darkC: "#5c2b0a",
};

const getMod = (score) => Math.floor((score - 10) / 2);
const fmtMod = (n) => (n >= 0 ? `+${n}` : `${n}`);
const pbFromLevel = (lvl) => 2 + Math.floor((Math.max(1, lvl) - 1) / 4);
const dieAvg = (size) => Math.floor(size / 2) + 1;

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
      <textarea autoFocus value={local} onChange={e => setLocal(e.target.value)} onBlur={commit}
        style={{ ...inputStyle, background: "rgba(201,136,42,0.15)", border: `1px solid ${PALETTE.gold}`, borderRadius: 4, color: "inherit", fontFamily: "inherit", fontSize: "inherit", padding: "2px 6px", width: "100%", resize: "vertical" }} />
    );
    return (
      <input autoFocus type={type} value={local}
        onChange={e => setLocal(type === "number" ? Number(e.target.value) : e.target.value)}
        onBlur={commit} onKeyDown={e => e.key === "Enter" && commit()}
        style={{ ...inputStyle, background: "rgba(201,136,42,0.15)", border: `1px solid ${PALETTE.gold}`, borderRadius: 4, color: "inherit", fontFamily: "inherit", fontSize: "inherit", padding: "2px 6px", textAlign: style.textAlign || "left", width: "100%" }} />
    );
  }
  return (
    <span onClick={() => setEditing(true)}
      style={{ cursor: "text", borderBottom: "1px dashed rgba(201,136,42,0.4)", display: "inline-block", ...style }}
      title="Tap to edit">{value}</span>
  );
}

function AbilityBlock({ name, score, onChange }) {
  const mod = getMod(score);
  return (
    <div style={{
      background: `linear-gradient(150deg,${PALETTE.darkB},${PALETTE.darkC})`,
      border: `1.5px solid ${PALETTE.gold}`, borderRadius: 12,
      padding: "9px 6px 8px", textAlign: "center", flex: 1, minWidth: 0,
      boxShadow: "0 2px 6px rgba(0,0,0,0.25)",
    }}>
      <div style={{ fontFamily: "Cinzel,serif", fontSize: "0.5rem", letterSpacing: 2, color: "#c9882aaa", textTransform: "uppercase", marginBottom: 1 }}>{name}</div>
      <div style={{ fontFamily: "Cinzel,serif", fontSize: "1.05rem", color: PALETTE.goldLt, background: "rgba(201,136,42,0.18)", borderRadius: 6, padding: "0 4px", display: "inline-block", margin: "2px 0", minWidth: 34 }}>
        {fmtMod(mod)}
      </div>
      <EditField value={score} onChange={v => onChange(Number(v))} type="number"
        style={{ fontFamily: "'Cinzel Decorative',serif", fontSize: "1.35rem", color: PALETTE.goldLt, textShadow: "0 0 10px rgba(201,136,42,0.4)", textAlign: "center", display: "block", width: "100%", borderBottom: "1px dashed rgba(201,136,42,0.25)" }}
        inputStyle={{ width: "54px", textAlign: "center" }} />
    </div>
  );
}

// ── Entry row with expandable, editable, fetchable description ──
function EntryRow({ name, icon, desc, onSetDesc, onRemove, styles }) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const hasDesc = !!(desc && desc.trim());

  const fetchDesc = async () => {
    setLoading(true); setErr("");
    try {
      const text = await describe(name);
      if (text) onSetDesc(text);
      else setErr("No 5e SRD match for that name — you can type one instead.");
    } catch {
      setErr("Couldn’t reach the SRD. Check your connection.");
    }
    setLoading(false);
  };

  return (
    <div style={{ borderBottom: "1px solid rgba(139,94,26,0.14)" }}>
      <div onClick={() => setOpen(o => !o)}
        style={{ display: "flex", alignItems: "center", gap: 9, padding: "8px 0", cursor: "pointer" }}>
        {icon && <span style={{ color: PALETTE.gold, fontSize: "0.72rem", width: 14, textAlign: "center", flexShrink: 0 }}>{icon}</span>}
        <span style={{ flex: 1, fontSize: "0.92rem", color: PALETTE.ink }}>{name}</span>
        {hasDesc && <span title="Has a description" style={{ width: 6, height: 6, borderRadius: "50%", background: PALETTE.green, flexShrink: 0 }} />}
        <span style={{ color: PALETTE.inkSoft, fontSize: "0.7rem", width: 12, textAlign: "center" }}>{open ? "▾" : "▸"}</span>
        {onRemove && <button style={styles.removeBtn} onClick={(e) => { e.stopPropagation(); onRemove(); }}>×</button>}
      </div>
      {open && (
        <div style={{ padding: "0 0 12px 23px" }}>
          <textarea value={desc || ""} onChange={e => onSetDesc(e.target.value)}
            placeholder="Write a description, or fetch it from the 5e SRD…"
            style={{ width: "100%", boxSizing: "border-box", minHeight: 64, background: "rgba(61,26,5,0.05)", border: "1px solid rgba(201,136,42,0.3)", borderRadius: 8, fontFamily: "'Crimson Text',serif", fontSize: "0.84rem", color: "#3d2b0a", padding: "8px 10px", resize: "vertical", lineHeight: 1.5 }} />
          <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 6, flexWrap: "wrap" }}>
            <button style={styles.smallBtn} onClick={fetchDesc} disabled={loading}>
              {loading ? "Fetching…" : "⟳ Fetch from 5e SRD"}
            </button>
            {err && <span style={{ color: PALETTE.rust, fontSize: "0.72rem" }}>{err}</span>}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Level-up helper modal ──
function LevelUpModal({ char, onApply, onClose, styles }) {
  const die = (() => { const m = /d(\d+)/.exec(char.combat.hitDice || ""); return m ? Number(m[1]) : 8; })();
  const conMod = getMod(char.abilities.constitution);
  const suggested = Math.max(1, dieAvg(die) + conMod);
  const [hpGain, setHpGain] = useState(suggested);
  const nextLevel = (char.level || 1) + 1;
  const newPb = pbFromLevel(nextLevel);
  const pbChanges = newPb !== char.proficiencyBonus;
  const asi = [4, 8, 12, 16, 19].includes(nextLevel);

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 300, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div onClick={e => e.stopPropagation()} style={{ width: "100%", maxWidth: 360, background: PALETTE.parchment, borderRadius: 14, border: `2px solid ${PALETTE.gold}`, padding: 18, boxShadow: "0 10px 40px rgba(0,0,0,0.5)" }}>
        <div style={{ fontFamily: "'Cinzel Decorative',serif", fontSize: "1.2rem", color: PALETTE.rust, textAlign: "center", marginBottom: 4 }}>Level Up</div>
        <div style={{ textAlign: "center", fontFamily: "Cinzel,serif", color: PALETTE.inkSoft, fontSize: "0.8rem", marginBottom: 14 }}>
          Level {char.level || 1} → <span style={{ color: PALETTE.rust, fontWeight: 700 }}>{nextLevel}</span>
        </div>

        <div style={{ fontFamily: "Cinzel,serif", fontSize: "0.6rem", letterSpacing: 1.5, color: PALETTE.rust, textTransform: "uppercase", marginBottom: 6 }}>Hit Points Gained</div>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
          <button style={styles.hpBtn} onClick={() => setHpGain(v => Math.max(1, v - 1))}>−</button>
          <input type="number" value={hpGain} onChange={e => setHpGain(Math.max(0, Number(e.target.value)))}
            style={{ flex: 1, textAlign: "center", fontFamily: "'Cinzel Decorative',serif", fontSize: "1.6rem", color: PALETTE.rust, background: "rgba(201,136,42,0.1)", border: `1px solid ${PALETTE.gold}`, borderRadius: 8, padding: "4px" }} />
          <button style={styles.hpBtn} onClick={() => setHpGain(v => v + 1)}>+</button>
        </div>
        <div style={{ fontSize: "0.74rem", color: PALETTE.inkSoft, marginBottom: 14, lineHeight: 1.4 }}>
          Suggested <b>{suggested}</b> (avg of d{die} {fmtMod(conMod)} CON). Or roll 1d{die}{fmtMod(conMod)} and enter it.
        </div>

        <div style={{ background: "rgba(201,136,42,0.1)", borderRadius: 8, padding: "10px 12px", fontSize: "0.8rem", color: PALETTE.ink, lineHeight: 1.5, marginBottom: 16 }}>
          On confirm: max HP <b>{char.combat.maxHp} → {char.combat.maxHp + hpGain}</b>
          {pbChanges && <> · proficiency <b>+{char.proficiencyBonus} → +{newPb}</b></>}
          {" · hit dice +1"}
          {asi && <div style={{ marginTop: 6, color: PALETTE.rust }}>★ Level {nextLevel} usually grants an Ability Score Increase or feat — set it on the Stats tab.</div>}
          <div style={{ marginTop: 6, color: PALETTE.inkSoft }}>Remember to add any new spells/features for this level (use the Codex).</div>
        </div>

        <div style={{ display: "flex", gap: 10 }}>
          <button style={{ ...styles.btn, flex: 1 }} onClick={() => onApply(hpGain)}>Confirm</button>
          <button style={{ ...styles.btnGhost, flex: 1 }} onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  );
}

// ── Main App ──
export default function DnDSheet() {
  const [char, setChar] = useState(INITIAL_CHARACTER);
  const [tab, setTab] = useState("stats");
  const [saved, setSaved] = useState(false);
  const [addingFeature, setAddingFeature] = useState(false);
  const [newFeature, setNewFeature] = useState("");
  const [addingItem, setAddingItem] = useState(false);
  const [newItem, setNewItem] = useState("");
  const [addingSpell, setAddingSpell] = useState(null);
  const [newSpell, setNewSpell] = useState("");
  const [levelUpOpen, setLevelUpOpen] = useState(false);
  const fileInputRef = useRef(null);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) setChar(hydrate(JSON.parse(raw)));
    } catch {}
  }, []);

  const save = useCallback((data) => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
      setSaved(true);
      setTimeout(() => setSaved(false), 1500);
    } catch {}
  }, []);

  const update = useCallback((updater) => {
    setChar(prev => { const next = updater(prev); save(next); return next; });
  }, [save]);

  const setAbility = (key, val) => update(c => ({ ...c, abilities: { ...c.abilities, [key]: val } }));
  const setCombat = (key, val) => update(c => ({ ...c, combat: { ...c.combat, [key]: val } }));
  const toggleSave = (key) => update(c => ({ ...c, savingThrows: { ...c.savingThrows, [key]: { ...c.savingThrows[key], prof: !c.savingThrows[key].prof } } }));
  const toggleSkill = (key) => update(c => ({ ...c, skills: { ...c.skills, [key]: { ...c.skills[key], prof: !c.skills[key].prof } } }));
  const toggleDS = (type) => update(c => { const cur = c.deathSaves[type]; return { ...c, deathSaves: { ...c.deathSaves, [type]: cur >= 3 ? 0 : cur + 1 } }; });
  const setLore = (name, text) => update(c => ({ ...c, lore: { ...c.lore, [name]: text } }));

  const applyLevelUp = (hpGain) => {
    update(c => {
      const nextLevel = (c.level || 1) + 1;
      let hd = c.combat.hitDice;
      const m = /^(\d+)d(\d+)$/.exec(hd || "");
      if (m) hd = `${Number(m[1]) + 1}d${m[2]}`;
      return {
        ...c, level: nextLevel, proficiencyBonus: pbFromLevel(nextLevel),
        combat: { ...c.combat, maxHp: c.combat.maxHp + hpGain, hp: c.combat.hp + hpGain, hitDice: hd },
      };
    });
    setLevelUpOpen(false);
  };

  const handleExport = () => {
    const blob = new Blob([JSON.stringify(char, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `dnd-${(char.name || "character").replace(/[^a-z0-9]+/gi, "-").toLowerCase()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };
  const handleImportFile = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try { update(() => hydrate(JSON.parse(reader.result))); setTab("stats"); }
      catch { alert("That file could not be read as a character export."); }
    };
    reader.readAsText(file);
    e.target.value = "";
  };

  const TABS = [
    { id: "stats", label: "Stats", icon: "❖" },
    { id: "skills", label: "Skills", icon: "✦" },
    { id: "combat", label: "Combat", icon: "⚔" },
    { id: "spells", label: "Spells", icon: "✷" },
    { id: "gear", label: "Gear", icon: "⚙" },
    { id: "codex", label: "Codex", icon: "❡" },
    { id: "paper", label: "Paper", icon: "❒" },
  ];

  const s = char;
  const pb = s.proficiencyBonus;
  const getSaveMod = (key) => getMod(s.abilities[key]) + (s.savingThrows[key].prof ? pb : 0);
  const getSkillMod = (key) => { const sk = s.skills[key]; return getMod(s.abilities[sk.ability]) + (sk.prof ? pb : 0); };

  const styles = {
    app: { minHeight: "100vh", background: "#0f0804", backgroundImage: "radial-gradient(ellipse at top,#1a0a02 0%,#0a0402 100%)", fontFamily: "'Crimson Text',Georgia,serif", color: PALETTE.ink, maxWidth: 480, margin: "0 auto" },
    header: { background: `linear-gradient(135deg,${PALETTE.darkA},${PALETTE.darkB})`, borderBottom: `2px solid ${PALETTE.gold}`, padding: "12px 16px 10px", position: "sticky", top: 0, zIndex: 50 },
    charName: { fontFamily: "'Cinzel Decorative',serif", fontSize: "1.35rem", fontWeight: 900, color: PALETTE.goldLt, textShadow: "0 0 20px rgba(201,136,42,0.4)", lineHeight: 1.05 },
    charSub: { fontFamily: "Cinzel,serif", fontSize: "0.6rem", letterSpacing: 2, color: "#c9882aaa", marginTop: 4 },
    lvChip: { fontFamily: "Cinzel,serif", fontSize: "0.55rem", letterSpacing: 1, color: PALETTE.darkA, background: `linear-gradient(135deg,${PALETTE.goldLt},${PALETTE.gold})`, borderRadius: 20, padding: "3px 9px", fontWeight: 700, whiteSpace: "nowrap" },
    savedBadge: { fontFamily: "Cinzel,serif", fontSize: "0.5rem", letterSpacing: 2, color: "#7fe089", background: "rgba(76,175,80,0.15)", border: "1px solid rgba(76,175,80,0.35)", borderRadius: 20, padding: "2px 8px", transition: "opacity 0.3s", opacity: saved ? 1 : 0 },
    tabBar: { display: "flex", overflowX: "auto", background: "#0f0804", borderBottom: "1px solid #3d1a05", position: "sticky", top: 62, zIndex: 49, scrollbarWidth: "none" },
    tabBtn: (active) => ({ flex: "0 0 auto", minWidth: 62, padding: "7px 12px 6px", display: "flex", flexDirection: "column", alignItems: "center", gap: 2, fontFamily: "Cinzel,serif", fontSize: "0.55rem", letterSpacing: 1, textTransform: "uppercase", border: "none", cursor: "pointer", background: active ? `linear-gradient(180deg,${PALETTE.darkB},${PALETTE.darkA})` : "transparent", color: active ? PALETTE.goldLt : "#8b5e1a", borderBottom: active ? `2px solid ${PALETTE.gold}` : "2px solid transparent", transition: "all 0.15s" }),
    tabIcon: (active) => ({ fontSize: "0.95rem", color: active ? PALETTE.goldLt : "#7a521a", lineHeight: 1 }),
    page: { padding: "16px", background: PALETTE.parchment, backgroundImage: "linear-gradient(160deg,#f8eedc 0%,#eedfc0 100%)", minHeight: "calc(100vh - 108px)" },
    sectionTitle: { fontFamily: "Cinzel,serif", fontSize: "0.58rem", letterSpacing: 3, textTransform: "uppercase", color: PALETTE.rust, display: "flex", alignItems: "center", gap: 7, borderBottom: "1px solid rgba(201,136,42,0.4)", paddingBottom: 5, marginBottom: 10, marginTop: 18 },
    card: { background: "rgba(255,250,240,0.65)", border: "1px solid rgba(201,136,42,0.3)", borderRadius: 12, padding: "10px 13px", marginBottom: 10, boxShadow: "0 1px 4px rgba(120,80,20,0.06)" },
    btn: { fontFamily: "Cinzel,serif", fontSize: "0.62rem", letterSpacing: 1.2, textTransform: "uppercase", background: `linear-gradient(135deg,${PALETTE.darkB},${PALETTE.darkC})`, border: `1px solid ${PALETTE.gold}`, borderRadius: 8, color: PALETTE.goldLt, padding: "8px 14px", cursor: "pointer" },
    btnGhost: { fontFamily: "Cinzel,serif", fontSize: "0.62rem", letterSpacing: 1.2, textTransform: "uppercase", background: "transparent", border: `1px solid ${PALETTE.rust}`, borderRadius: 8, color: PALETTE.rust, padding: "8px 14px", cursor: "pointer" },
    addBtn: { fontFamily: "Cinzel,serif", fontSize: "0.6rem", letterSpacing: 1.2, textTransform: "uppercase", background: `linear-gradient(135deg,${PALETTE.darkB},${PALETTE.darkC})`, border: `1px solid ${PALETTE.gold}`, borderRadius: 8, color: PALETTE.goldLt, padding: "6px 12px", cursor: "pointer", marginTop: 8 },
    smallBtn: { fontFamily: "Cinzel,serif", fontSize: "0.55rem", letterSpacing: 1, textTransform: "uppercase", background: "rgba(61,26,5,0.08)", border: `1px solid ${PALETTE.gold}`, borderRadius: 6, color: PALETTE.darkB, padding: "5px 10px", cursor: "pointer" },
    removeBtn: { background: "none", border: "none", color: PALETTE.rust, cursor: "pointer", fontSize: "1rem", padding: "0 2px", lineHeight: 1, flexShrink: 0 },
    input: { flex: 1, background: "rgba(201,136,42,0.1)", border: `1px solid ${PALETTE.gold}`, borderRadius: 8, color: PALETTE.ink, fontFamily: "inherit", padding: "7px 10px", fontSize: "0.9rem" },
    hpBtn: { width: 38, height: 38, borderRadius: "50%", border: `1.5px solid ${PALETTE.gold}`, background: `linear-gradient(135deg,${PALETTE.darkB},${PALETTE.darkC})`, color: PALETTE.goldLt, fontSize: "1.3rem", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 900, flexShrink: 0 },
  };

  const SectionTitle = ({ children }) => (
    <div style={styles.sectionTitle}><span style={{ color: PALETTE.gold }}>❖</span>{children}</div>
  );

  // ── STATS ──
  const statsTab = () => (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 6 }}>
        <div style={{ flex: 1 }}>
          <div style={styles.charName}>
            <EditField value={s.name} onChange={v => update(c => ({ ...c, name: v }))} style={{ color: PALETTE.rust, fontSize: "1.1rem" }} />
          </div>
          <div style={{ fontFamily: "Cinzel,serif", fontSize: "0.62rem", color: PALETTE.inkSoft, marginTop: 3 }}>
            <EditField value={s.class} onChange={v => update(c => ({ ...c, class: v }))} style={{ color: PALETTE.inkSoft }} />
            {" · "}
            <EditField value={s.race} onChange={v => update(c => ({ ...c, race: v }))} style={{ color: PALETTE.inkSoft }} />
          </div>
        </div>
      </div>

      {/* Level / PB / Level-up */}
      <div style={{ display: "flex", gap: 10, alignItems: "stretch", marginTop: 8 }}>
        <div style={{ ...styles.card, flex: 1, marginBottom: 0, textAlign: "center", padding: "8px 6px" }}>
          <div style={{ fontFamily: "Cinzel,serif", fontSize: "0.5rem", letterSpacing: 1.5, color: PALETTE.inkSoft, textTransform: "uppercase" }}>Level</div>
          <div style={{ fontFamily: "'Cinzel Decorative',serif", fontSize: "1.5rem", color: PALETTE.rust }}>
            <EditField value={s.level} onChange={v => update(c => ({ ...c, level: Math.max(1, Number(v)) }))} type="number" style={{ color: PALETTE.rust }} inputStyle={{ width: 44, textAlign: "center" }} />
          </div>
        </div>
        <div style={{ ...styles.card, flex: 1, marginBottom: 0, textAlign: "center", padding: "8px 6px" }}>
          <div style={{ fontFamily: "Cinzel,serif", fontSize: "0.5rem", letterSpacing: 1.5, color: PALETTE.inkSoft, textTransform: "uppercase" }}>Prof Bonus</div>
          <div style={{ fontFamily: "'Cinzel Decorative',serif", fontSize: "1.5rem", color: PALETTE.rust }}>
            +<EditField value={pb} onChange={v => update(c => ({ ...c, proficiencyBonus: Number(v) }))} type="number" style={{ color: PALETTE.rust }} inputStyle={{ width: 36, textAlign: "center" }} />
          </div>
          {pbFromLevel(s.level) !== pb && (
            <button style={{ ...styles.smallBtn, marginTop: 2, padding: "2px 6px" }} onClick={() => update(c => ({ ...c, proficiencyBonus: pbFromLevel(c.level) }))}>↻ +{pbFromLevel(s.level)} from level</button>
          )}
        </div>
        <button style={{ ...styles.btn, flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 2 }} onClick={() => setLevelUpOpen(true)}>
          <span style={{ fontSize: "1.1rem" }}>⤴</span>Level Up
        </button>
      </div>

      <SectionTitle>Ability Scores</SectionTitle>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 8 }}>
        {Object.entries(s.abilities).map(([key, val]) => (
          <AbilityBlock key={key} name={ABILITY_SHORT[key]} score={val} onChange={v => setAbility(key, v)} />
        ))}
      </div>

      <SectionTitle>Saving Throws</SectionTitle>
      <div style={styles.card}>
        {Object.entries(s.savingThrows).map(([key]) => {
          const mod = getSaveMod(key);
          return (
            <div key={key} style={{ display: "flex", alignItems: "center", gap: 9, padding: "4px 0", borderBottom: "1px solid rgba(139,94,26,0.14)" }}>
              <Dot on={s.savingThrows[key].prof} onClick={() => toggleSave(key)} />
              <span style={{ fontFamily: "Cinzel,serif", fontSize: "0.7rem", fontWeight: 700, color: "#3d2b0a", minWidth: 30 }}>{fmtMod(mod)}</span>
              <span style={{ fontSize: "0.85rem", color: PALETTE.ink, textTransform: "capitalize" }}>{key.replace(/([A-Z])/g, ' $1')}</span>
            </div>
          );
        })}
      </div>

      <SectionTitle>Features & Traits</SectionTitle>
      <div style={styles.card}>
        {s.features.map((f, i) => (
          <EntryRow key={i} name={f} icon="✦" desc={s.lore[f]} styles={styles}
            onSetDesc={(t) => setLore(f, t)}
            onRemove={() => update(c => ({ ...c, features: c.features.filter((_, j) => j !== i) }))} />
        ))}
        {addingFeature ? (
          <AddInline value={newFeature} setValue={setNewFeature} placeholder="Feature name…" styles={styles}
            onAdd={() => { const v = newFeature.trim(); if (v) { update(c => ({ ...c, features: [...c.features, v] })); setNewFeature(""); setAddingFeature(false); } }}
            onCancel={() => setAddingFeature(false)} />
        ) : (
          <div style={{ display: "flex", gap: 8 }}>
            <button style={styles.addBtn} onClick={() => setAddingFeature(true)}>+ Add Feature</button>
            <button style={{ ...styles.addBtn, background: "transparent", color: PALETTE.rust, borderColor: PALETTE.rust }} onClick={() => setTab("codex")}>🔍 Look up</button>
          </div>
        )}
      </div>

      <SectionTitle>Notes</SectionTitle>
      <textarea value={s.notes} onChange={e => update(c => ({ ...c, notes: e.target.value }))}
        placeholder="Session notes, lore, reminders…"
        style={{ width: "100%", boxSizing: "border-box", minHeight: 130, background: "rgba(255,250,240,0.6)", border: "1px solid rgba(201,136,42,0.3)", borderRadius: 10, fontFamily: "'Crimson Text',serif", fontSize: "0.92rem", color: PALETTE.ink, padding: "10px 12px", resize: "vertical", lineHeight: 1.5 }} />

      <SectionTitle>Backup</SectionTitle>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button style={styles.addBtn} onClick={handleExport}>⬇ Export JSON</button>
        <button style={styles.addBtn} onClick={() => fileInputRef.current?.click()}>⬆ Import JSON</button>
        <button onClick={() => { if (confirm("Reset to the original character? This overwrites your current sheet.")) update(() => INITIAL_CHARACTER); }}
          style={{ ...styles.addBtn, background: "rgba(122,28,28,0.15)", borderColor: PALETTE.rust, color: PALETTE.rust }}>↺ Reset</button>
        <input ref={fileInputRef} type="file" accept="application/json" onChange={handleImportFile} style={{ display: "none" }} />
      </div>
      <div style={{ fontSize: "0.72rem", color: PALETTE.inkSoft, marginTop: 8, lineHeight: 1.45 }}>
        Auto-saves on this device. Export a JSON backup to copy your sheet to another device. (Photos in the Paper tab stay on this device.)
      </div>
    </div>
  );

  // ── SKILLS ──
  const skillsTab = () => (
    <div>
      <SectionTitle>Skills</SectionTitle>
      <div style={{ ...styles.card, padding: "6px 12px" }}>
        {Object.entries(s.skills).map(([key]) => {
          const mod = getSkillMod(key); const sk = s.skills[key];
          return (
            <div key={key} style={{ display: "flex", alignItems: "center", gap: 9, padding: "5px 0", borderBottom: "1px solid rgba(139,94,26,0.14)" }}>
              <Dot on={sk.prof} onClick={() => toggleSkill(key)} />
              <span style={{ fontFamily: "Cinzel,serif", fontSize: "0.7rem", fontWeight: 700, color: "#3d2b0a", minWidth: 30 }}>{fmtMod(mod)}</span>
              <span style={{ fontSize: "0.85rem", color: PALETTE.ink, flex: 1 }}>{SKILL_LABELS[key]}</span>
              <span style={{ fontFamily: "Cinzel,serif", fontSize: "0.52rem", color: PALETTE.inkSoft }}>{ABILITY_SHORT[sk.ability]}</span>
            </div>
          );
        })}
      </div>
      <div style={{ ...styles.card, marginTop: 12, textAlign: "center" }}>
        <div style={{ fontFamily: "Cinzel,serif", fontSize: "0.55rem", letterSpacing: 2, color: PALETTE.rust, marginBottom: 4 }}>PASSIVE WISDOM (PERCEPTION)</div>
        <div style={{ fontFamily: "'Cinzel Decorative',serif", fontSize: "2rem", color: "#3d2b0a" }}>{10 + getSkillMod("perception")}</div>
      </div>
    </div>
  );

  // ── COMBAT ──
  const combatTab = () => (
    <div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 10, marginBottom: 14 }}>
        {[{ label: "Armor Class", key: "ac" }, { label: "Initiative", key: "initiative" }, { label: "Speed", key: "speed" }].map(({ label, key }) => (
          <div key={key} style={{ textAlign: "center" }}>
            <div style={{ width: 66, height: 66, borderRadius: "50%", background: `linear-gradient(135deg,${PALETTE.darkB},${PALETTE.darkC})`, border: `2px solid ${PALETTE.gold}`, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 5px", boxShadow: "0 2px 10px rgba(201,136,42,0.25)" }}>
              <EditField value={s.combat[key]} onChange={v => setCombat(key, Number(v))} type="number"
                style={{ fontFamily: "'Cinzel Decorative',serif", fontSize: "1.3rem", color: PALETTE.goldLt, textAlign: "center", display: "block" }} inputStyle={{ width: 44, textAlign: "center" }} />
            </div>
            <span style={{ fontFamily: "Cinzel,serif", fontSize: "0.5rem", letterSpacing: 1.5, color: PALETTE.inkSoft, textTransform: "uppercase" }}>{label}</span>
          </div>
        ))}
      </div>

      <div style={{ ...styles.card, background: "linear-gradient(135deg,rgba(122,28,28,0.1),rgba(122,28,28,0.04))", border: `1.5px solid ${PALETTE.rust}`, textAlign: "center" }}>
        <div style={{ fontFamily: "Cinzel,serif", fontSize: "0.55rem", letterSpacing: 2, color: PALETTE.rust, marginBottom: 4 }}>HIT POINTS</div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 14 }}>
          <button style={styles.hpBtn} onClick={() => setCombat("hp", Math.max(0, s.combat.hp - 1))}>−</button>
          <div>
            <EditField value={s.combat.hp} onChange={v => setCombat("hp", Number(v))} type="number"
              style={{ fontFamily: "'Cinzel Decorative',serif", fontSize: "3rem", color: PALETTE.rust, lineHeight: 1 }} inputStyle={{ width: 70, textAlign: "center" }} />
            <span style={{ fontFamily: "Cinzel,serif", fontSize: "1rem", color: PALETTE.inkSoft }}>
              {" / "}<EditField value={s.combat.maxHp} onChange={v => setCombat("maxHp", Number(v))} type="number" style={{ color: PALETTE.inkSoft }} inputStyle={{ width: 40 }} />
            </span>
          </div>
          <button style={styles.hpBtn} onClick={() => setCombat("hp", Math.min(s.combat.maxHp, s.combat.hp + 1))}>+</button>
        </div>
        <div style={{ display: "flex", gap: 7, justifyContent: "center", marginTop: 10, flexWrap: "wrap" }}>
          {[-10, -5, -1, "+1", "+5", "+10"].map(v => (
            <button key={v} onClick={() => { const d = typeof v === "number" ? v : parseInt(v); setCombat("hp", Math.max(0, Math.min(s.combat.maxHp, s.combat.hp + d))); }}
              style={{ fontFamily: "Cinzel,serif", fontSize: "0.6rem", padding: "4px 9px", background: typeof v === "number" ? "rgba(122,28,28,0.14)" : "rgba(61,43,10,0.12)", border: `1px solid ${typeof v === "number" ? PALETTE.rust : PALETTE.gold}`, borderRadius: 6, color: typeof v === "number" ? PALETTE.rust : "#3d2b0a", cursor: "pointer" }}>{v}</button>
          ))}
        </div>
      </div>

      <div style={{ ...styles.card, textAlign: "center" }}>
        <div style={{ fontFamily: "Cinzel,serif", fontSize: "0.55rem", letterSpacing: 2, color: PALETTE.inkSoft, marginBottom: 4 }}>TEMP HP</div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 14 }}>
          <button style={{ ...styles.hpBtn, width: 32, height: 32 }} onClick={() => setCombat("tempHp", Math.max(0, s.combat.tempHp - 1))}>−</button>
          <EditField value={s.combat.tempHp} onChange={v => setCombat("tempHp", Number(v))} type="number" style={{ fontFamily: "'Cinzel Decorative',serif", fontSize: "1.8rem", color: "#3d2b0a" }} inputStyle={{ width: 50, textAlign: "center" }} />
          <button style={{ ...styles.hpBtn, width: 32, height: 32 }} onClick={() => setCombat("tempHp", s.combat.tempHp + 1)}>+</button>
        </div>
      </div>

      <div style={{ ...styles.card, display: "flex", alignItems: "center", gap: 12 }}>
        <span style={{ fontFamily: "Cinzel,serif", fontSize: "0.55rem", letterSpacing: 2, color: PALETTE.inkSoft, textTransform: "uppercase" }}>Hit Dice</span>
        <EditField value={s.combat.hitDice} onChange={v => setCombat("hitDice", v)} style={{ fontFamily: "Cinzel,serif", fontSize: "0.95rem", fontWeight: 700, color: "#3d2b0a" }} />
      </div>

      <SectionTitle>Death Saves</SectionTitle>
      <div style={{ ...styles.card, display: "flex", gap: 24, justifyContent: "center" }}>
        {[["successes", PALETTE.green, "Successes"], ["failures", PALETTE.rust, "Failures"]].map(([type, color, label]) => (
          <div key={type} style={{ textAlign: "center" }}>
            <div style={{ fontFamily: "Cinzel,serif", fontSize: "0.5rem", letterSpacing: 2, color: PALETTE.inkSoft, marginBottom: 7 }}>{label.toUpperCase()}</div>
            <div style={{ display: "flex", gap: 7 }}>
              {[0, 1, 2].map(i => (
                <div key={i} onClick={() => toggleDS(type)} style={{ width: 19, height: 19, borderRadius: "50%", cursor: "pointer", background: i < s.deathSaves[type] ? color : "#e8d4a8", border: `2px solid ${color}`, transition: "all 0.2s" }} />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );

  // ── SPELLS ──
  const spellsTab = () => {
    const levelLabels = { cantrips: "Cantrips", level1: "1st Level", level2: "2nd Level", level3: "3rd Level", level4: "4th Level", level5: "5th Level" };
    const addSpell = (lvl, name) => {
      update(c => c.spells[lvl].includes(name) ? c : ({ ...c, spells: { ...c.spells, [lvl]: [...c.spells[lvl], name] } }));
      // Auto-fetch a description in the background for newly added spells.
      describe(name).then(t => { if (t) setLore(name, t); }).catch(() => {});
    };
    return (
      <div>
        <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
          {[["Ability", 0], ["Save DC", 1], ["Atk Bonus", 2]].map(([l, i]) => (
            <div key={l} style={{ flex: 1, textAlign: "center", border: "1px solid rgba(201,136,42,0.4)", borderRadius: 10, padding: "8px 4px", background: "rgba(201,136,42,0.06)" }}>
              <div style={{ fontFamily: "'Cinzel Decorative',serif", fontSize: "1.05rem", color: PALETTE.rust }}>
                {i === 0 ? <EditField value={s.spellcasting.ability} onChange={v => update(c => ({ ...c, spellcasting: { ...c.spellcasting, ability: v } }))} style={{ color: PALETTE.rust }} />
                  : i === 1 ? <EditField value={s.spellcasting.saveDC} onChange={v => update(c => ({ ...c, spellcasting: { ...c.spellcasting, saveDC: Number(v) } }))} type="number" style={{ color: PALETTE.rust }} />
                    : <span>+<EditField value={s.spellcasting.attackBonus} onChange={v => update(c => ({ ...c, spellcasting: { ...c.spellcasting, attackBonus: Number(v) } }))} type="number" style={{ color: PALETTE.rust }} /></span>}
              </div>
              <div style={{ fontFamily: "Cinzel,serif", fontSize: "0.5rem", letterSpacing: 1.5, color: PALETTE.inkSoft, textTransform: "uppercase", marginTop: 2 }}>{l}</div>
            </div>
          ))}
        </div>

        <button style={{ ...styles.addBtn, background: "transparent", color: PALETTE.rust, borderColor: PALETTE.rust, marginTop: 0, marginBottom: 8, width: "100%" }} onClick={() => setTab("codex")}>🔍 Look up a spell in the Codex</button>

        {Object.entries(s.spells).map(([lvl, spells]) => (
          <div key={lvl} style={{ border: "1px solid rgba(201,136,42,0.3)", borderRadius: 12, overflow: "hidden", marginBottom: 10 }}>
            <div style={{ background: `linear-gradient(135deg,${PALETTE.darkB},${PALETTE.darkC})`, padding: "7px 13px", fontFamily: "Cinzel,serif", fontSize: "0.62rem", letterSpacing: 2, color: PALETTE.goldLt, textTransform: "uppercase", display: "flex", justifyContent: "space-between" }}>
              <span>{levelLabels[lvl]}</span><span style={{ color: "#c9882aaa" }}>{spells.length}</span>
            </div>
            <div style={{ padding: "4px 13px 8px", background: "rgba(255,250,240,0.5)" }}>
              {spells.map((spell, i) => (
                <EntryRow key={i} name={spell} icon="✷" desc={s.lore[spell]} styles={styles}
                  onSetDesc={(t) => setLore(spell, t)}
                  onRemove={() => update(c => ({ ...c, spells: { ...c.spells, [lvl]: c.spells[lvl].filter((_, j) => j !== i) } }))} />
              ))}
              {addingSpell === lvl ? (
                <AddInline value={newSpell} setValue={setNewSpell} placeholder="Spell name…" styles={styles}
                  onAdd={() => { const v = newSpell.trim(); if (v) { addSpell(lvl, v); setNewSpell(""); setAddingSpell(null); } }}
                  onCancel={() => setAddingSpell(null)} />
              ) : (
                <button style={{ ...styles.addBtn, fontSize: "0.55rem", padding: "4px 10px" }} onClick={() => { setAddingSpell(lvl); setNewSpell(""); }}>+ Add</button>
              )}
            </div>
          </div>
        ))}
      </div>
    );
  };

  // ── GEAR ──
  const gearTab = () => (
    <div>
      <SectionTitle>Equipment</SectionTitle>
      <div style={styles.card}>
        {s.equipment.map((item, i) => (
          <EntryRow key={i} name={item} icon="⚔" desc={s.lore[item]} styles={styles}
            onSetDesc={(t) => setLore(item, t)}
            onRemove={() => update(c => ({ ...c, equipment: c.equipment.filter((_, j) => j !== i) }))} />
        ))}
        {addingItem ? (
          <AddInline value={newItem} setValue={setNewItem} placeholder="Item name…" styles={styles}
            onAdd={() => { const v = newItem.trim(); if (v) { update(c => ({ ...c, equipment: [...c.equipment, v] })); setNewItem(""); setAddingItem(false); } }}
            onCancel={() => setAddingItem(false)} />
        ) : (
          <div style={{ display: "flex", gap: 8 }}>
            <button style={styles.addBtn} onClick={() => setAddingItem(true)}>+ Add Item</button>
            <button style={{ ...styles.addBtn, background: "transparent", color: PALETTE.rust, borderColor: PALETTE.rust }} onClick={() => setTab("codex")}>🔍 Look up</button>
          </div>
        )}
      </div>

      <SectionTitle>Proficiencies & Languages</SectionTitle>
      <div style={styles.card}>
        <EditField value={s.proficiencies} onChange={v => update(c => ({ ...c, proficiencies: v }))} multiline style={{ fontSize: "0.88rem", display: "block", width: "100%" }} inputStyle={{ fontSize: "0.88rem" }} />
      </div>
    </div>
  );

  return (
    <div style={styles.app}>
      <link href="https://fonts.googleapis.com/css2?family=Cinzel+Decorative:wght@400;700;900&family=Cinzel:wght@400;600;700&family=Crimson+Text:ital,wght@0,400;0,600;1,400&display=swap" rel="stylesheet" />
      <style>{`.dnd-tabs::-webkit-scrollbar{display:none} *{-webkit-tap-highlight-color:transparent}`}</style>

      <div style={styles.header}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
          <div style={{ minWidth: 0 }}>
            <div style={styles.charName}>{s.name}</div>
            <div style={styles.charSub}>{s.class} · {s.race}</div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 5 }}>
            <span style={styles.lvChip}>LV {s.level}</span>
            <span style={styles.savedBadge}>✓ SAVED</span>
          </div>
        </div>
      </div>

      <div className="dnd-tabs" style={styles.tabBar}>
        {TABS.map(t => (
          <button key={t.id} style={styles.tabBtn(tab === t.id)} onClick={() => setTab(t.id)}>
            <span style={styles.tabIcon(tab === t.id)}>{t.icon}</span>{t.label}
          </button>
        ))}
      </div>

      <div style={styles.page}>
        {tab === "stats" && statsTab()}
        {tab === "skills" && skillsTab()}
        {tab === "combat" && combatTab()}
        {tab === "spells" && spellsTab()}
        {tab === "gear" && gearTab()}
        {tab === "codex" && <CodexTab styles={styles} setLore={setLore} update={update} SectionTitle={SectionTitle} />}
        {tab === "paper" && <PhotoTab styles={styles} SectionTitle={SectionTitle} />}
      </div>

      {levelUpOpen && <LevelUpModal char={s} styles={styles} onApply={applyLevelUp} onClose={() => setLevelUpOpen(false)} />}
    </div>
  );
}

// ── Small shared bits ──
function Dot({ on, onClick }) {
  return (
    <div onClick={onClick} style={{
      width: 13, height: 13, borderRadius: "50%", flexShrink: 0, cursor: "pointer",
      background: on ? "radial-gradient(circle at 35% 35%,#e8b84b,#c9882a)" : "#e8d4a8",
      border: `1.5px solid ${on ? "#c9882a" : "#8b5e1a"}`,
      boxShadow: on ? "0 0 6px rgba(201,136,42,0.5)" : "none",
    }} />
  );
}

function AddInline({ value, setValue, onAdd, onCancel, placeholder, styles }) {
  return (
    <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
      <input autoFocus value={value} onChange={e => setValue(e.target.value)}
        onKeyDown={e => { if (e.key === "Enter") onAdd(); if (e.key === "Escape") onCancel(); }}
        placeholder={placeholder} style={styles.input} />
      <button style={styles.addBtn} onClick={onAdd}>Add</button>
      <button style={{ ...styles.addBtn, background: "transparent", color: "#8b5e1a" }} onClick={onCancel}>×</button>
    </div>
  );
}

// ── CODEX (5e SRD lookup) ──
function CodexTab({ styles, setLore, update, SectionTitle }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [status, setStatus] = useState("idle");
  const [openItem, setOpenItem] = useState(null);
  const [details, setDetails] = useState({});
  const debounceRef = useRef(null);

  useEffect(() => {
    clearTimeout(debounceRef.current);
    if (query.trim().length < 2) { setResults([]); setStatus("idle"); return; }
    setStatus("loading");
    debounceRef.current = setTimeout(async () => {
      try { setResults(await srdSearch(query)); setStatus("done"); }
      catch { setStatus("error"); }
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
        setDetails(d => ({ ...d, [key]: { text: formatDetail(item.resource, raw) } }));
      } catch {
        setDetails(d => ({ ...d, [key]: { text: "Could not load details." } }));
      }
    }
  };

  const addEntry = (item, target) => {
    const key = `${item.resource}/${item.index}`;
    const text = details[key]?.text || "";
    const name = item.name;
    if (target === "spell") {
      const lvl = item.level === 0 ? "cantrips" : `level${item.level}`;
      update(c => {
        const bucket = c.spells[lvl] || [];
        const spells = bucket.includes(name) ? c.spells : { ...c.spells, [lvl]: [...bucket, name] };
        return { ...c, spells, lore: { ...c.lore, [name]: text || c.lore[name] } };
      });
    } else if (target === "feature") {
      update(c => ({ ...c, features: c.features.includes(name) ? c.features : [...c.features, name], lore: { ...c.lore, [name]: text || c.lore[name] } }));
    } else if (target === "gear") {
      update(c => ({ ...c, equipment: c.equipment.includes(name) ? c.equipment : [...c.equipment, name], lore: { ...c.lore, [name]: text || c.lore[name] } }));
    } else if (target === "note") {
      update(c => ({ ...c, notes: (c.notes ? c.notes + "\n\n" : "") + `【${name}】\n${text}` }));
    }
  };

  const chipColor = { Spell: "#7a1c1c", Feature: "#3d6a1c", Trait: "#1c4a7a", Gear: "#5c2b0a", Condition: "#6a1c6a", "Magic Item": "#8a5a00", Monster: "#1c5a4a", Race: "#2a4a7a" };

  return (
    <div>
      <SectionTitle>Codex — 5e Rules Lookup</SectionTitle>
      <div style={{ fontSize: "0.8rem", color: PALETTE.inkSoft, marginBottom: 10, lineHeight: 1.45 }}>
        Search official D&D 5e spells, features, traits, gear, conditions, monsters and races. Misspellings are okay — it suggests the closest match. Tap a result to read it, then add it to your sheet (or save it to Notes). Saved rules text can be read again later, even offline.
      </div>
      <input autoFocus value={query} onChange={e => setQuery(e.target.value)} placeholder="e.g. Fireball, Darkvision, Rage…"
        style={{ width: "100%", boxSizing: "border-box", background: "rgba(201,136,42,0.1)", border: `1px solid ${PALETTE.gold}`, borderRadius: 10, color: PALETTE.ink, fontFamily: "'Crimson Text',serif", fontSize: "1rem", padding: "10px 13px" }} />

      <div style={{ marginTop: 10 }}>
        {status === "loading" && <div style={{ color: PALETTE.inkSoft, fontSize: "0.82rem", padding: "8px 0" }}>Searching…</div>}
        {status === "error" && <div style={{ color: PALETTE.rust, fontSize: "0.82rem", padding: "8px 0" }}>Couldn’t reach the SRD API. Check your connection and try again.</div>}
        {status === "done" && results.length === 0 && <div style={{ color: PALETTE.inkSoft, fontSize: "0.82rem", padding: "8px 0" }}>No matches found — try fewer letters.</div>}
        {status === "done" && results.length > 0 && results[0].fuzzy && (
          <div style={{ color: PALETTE.rust, fontSize: "0.78rem", fontStyle: "italic", padding: "2px 0 8px" }}>No exact match — showing closest results:</div>
        )}

        {results.map(item => {
          const key = `${item.resource}/${item.index}`;
          const isOpen = openItem === key; const d = details[key];
          return (
            <div key={key} style={{ border: "1px solid rgba(201,136,42,0.3)", borderRadius: 10, marginBottom: 8, overflow: "hidden", background: "rgba(255,250,240,0.6)" }}>
              <div onClick={() => openDetail(item)} style={{ display: "flex", alignItems: "center", gap: 9, padding: "9px 11px", cursor: "pointer" }}>
                <span style={{ fontFamily: "Cinzel,serif", fontSize: "0.5rem", letterSpacing: 1, textTransform: "uppercase", color: "#fff", background: chipColor[item.label] || PALETTE.darkC, borderRadius: 5, padding: "2px 7px", flexShrink: 0 }}>
                  {item.label}{item.resource === "spells" ? ` ${item.level === 0 ? "C" : item.level}` : ""}
                </span>
                <span style={{ flex: 1, fontSize: "0.92rem", color: PALETTE.ink }}>{item.name}</span>
                {item.fuzzy && <span title="Closest match" style={{ color: PALETTE.gold, fontSize: "0.8rem" }}>≈</span>}
                <span style={{ color: PALETTE.inkSoft, fontSize: "0.8rem" }}>{isOpen ? "▾" : "▸"}</span>
              </div>
              {isOpen && (
                <div style={{ padding: "0 11px 11px" }}>
                  {!d ? <div style={{ color: PALETTE.inkSoft, fontSize: "0.82rem" }}>Loading…</div> : (
                    <>
                      <div style={{ whiteSpace: "pre-wrap", fontSize: "0.83rem", color: "#3d2b0a", lineHeight: 1.5, marginBottom: 8 }}>{d.text}</div>
                      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                        {item.resource === "spells" && <button style={styles.addBtn} onClick={() => addEntry(item, "spell")}>+ Add Spell</button>}
                        {(item.resource === "features" || item.resource === "traits" || item.resource === "conditions") && <button style={styles.addBtn} onClick={() => addEntry(item, "feature")}>+ Add Feature</button>}
                        {(item.resource === "equipment" || item.resource === "magic-items") && <button style={styles.addBtn} onClick={() => addEntry(item, "gear")}>+ Add to Gear</button>}
                        <button style={{ ...styles.addBtn, background: "transparent", color: PALETTE.rust, borderColor: PALETTE.rust }} onClick={() => addEntry(item, "note")}>+ Notes</button>
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

// ── PAPER (photo attachments) ──
function PhotoTab({ styles, SectionTitle }) {
  const [photos, setPhotos] = useState(null);
  const [viewer, setViewer] = useState(null);
  const [zoom, setZoom] = useState(false);
  const [busy, setBusy] = useState(false);
  const uploadRef = useRef(null);
  const cameraRef = useRef(null);

  const reload = async () => { try { setPhotos(await getPhotos()); } catch { setPhotos([]); } };
  useEffect(() => { reload(); }, []);

  const onFiles = async (e) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    setBusy(true);
    for (const f of files) {
      try {
        const dataUrl = await resizeImage(f);
        const id = (crypto.randomUUID && crypto.randomUUID()) || `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
        await addPhoto({ id, dataUrl, caption: "", created: Date.now() });
      } catch {}
    }
    e.target.value = "";
    setBusy(false);
    reload();
  };

  const remove = async (id) => { await deletePhoto(id); reload(); };
  const openViewer = (p) => { setViewer(p); setZoom(false); };

  return (
    <div>
      <SectionTitle>Paper Sheet Photos</SectionTitle>
      <div style={{ fontSize: "0.8rem", color: PALETTE.inkSoft, marginBottom: 12, lineHeight: 1.45 }}>
        Snap or upload photos of your paper character sheet to keep as reference. Tap a photo to view it full-screen and zoom in while you copy values across.
      </div>

      <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
        <button style={{ ...styles.btn, flex: 1 }} onClick={() => cameraRef.current?.click()} disabled={busy}>📷 Take Photo</button>
        <button style={{ ...styles.btn, flex: 1 }} onClick={() => uploadRef.current?.click()} disabled={busy}>🖼 Upload</button>
        <input ref={cameraRef} type="file" accept="image/*" capture="environment" onChange={onFiles} style={{ display: "none" }} />
        <input ref={uploadRef} type="file" accept="image/*" multiple onChange={onFiles} style={{ display: "none" }} />
      </div>

      {busy && <div style={{ color: PALETTE.inkSoft, fontSize: "0.82rem", marginBottom: 10 }}>Processing photo…</div>}

      {photos === null ? (
        <div style={{ color: PALETTE.inkSoft, fontSize: "0.82rem" }}>Loading…</div>
      ) : photos.length === 0 ? (
        <div style={{ ...styles.card, textAlign: "center", color: PALETTE.inkSoft, fontSize: "0.85rem", padding: "26px 12px" }}>
          No photos yet. Tap <b>Take Photo</b> or <b>Upload</b> to add one.
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          {photos.map(p => (
            <div key={p.id} style={{ border: `1px solid ${PALETTE.gold}`, borderRadius: 10, overflow: "hidden", background: "#fff", position: "relative" }}>
              <img src={p.dataUrl} alt={p.caption || "sheet photo"} onClick={() => openViewer(p)}
                style={{ width: "100%", height: 130, objectFit: "cover", display: "block", cursor: "zoom-in" }} />
              <button onClick={() => remove(p.id)} title="Delete"
                style={{ position: "absolute", top: 6, right: 6, width: 26, height: 26, borderRadius: "50%", border: "none", background: "rgba(122,28,28,0.85)", color: "#fff", fontSize: "1rem", cursor: "pointer", lineHeight: 1 }}>×</button>
              <input value={p.caption || ""} placeholder="Caption…"
                onChange={e => { const v = e.target.value; setPhotos(ps => ps.map(x => x.id === p.id ? { ...x, caption: v } : x)); }}
                onBlur={e => updatePhotoCaption(p.id, e.target.value)}
                style={{ width: "100%", boxSizing: "border-box", border: "none", borderTop: "1px solid rgba(201,136,42,0.3)", padding: "5px 8px", fontFamily: "'Crimson Text',serif", fontSize: "0.78rem", color: PALETTE.ink, background: "rgba(255,250,240,0.8)" }} />
            </div>
          ))}
        </div>
      )}

      {viewer && (
        <div onClick={() => setViewer(null)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.93)", zIndex: 300, overflow: "auto", display: "flex", alignItems: zoom ? "flex-start" : "center", justifyContent: "center", padding: zoom ? 0 : 12 }}>
          <img src={viewer.dataUrl} alt={viewer.caption || "sheet photo"} onClick={e => { e.stopPropagation(); setZoom(z => !z); }}
            style={zoom ? { width: "200%", maxWidth: "none", cursor: "zoom-out", display: "block" } : { maxWidth: "100%", maxHeight: "100%", objectFit: "contain", cursor: "zoom-in", display: "block" }} />
          <button onClick={() => setViewer(null)} style={{ position: "fixed", top: 14, right: 14, width: 40, height: 40, borderRadius: "50%", border: "none", background: "rgba(255,255,255,0.15)", color: "#fff", fontSize: "1.5rem", cursor: "pointer", lineHeight: 1 }}>×</button>
          <div style={{ position: "fixed", bottom: 16, left: 0, right: 0, textAlign: "center", color: "rgba(255,255,255,0.7)", fontFamily: "Cinzel,serif", fontSize: "0.65rem", letterSpacing: 1 }}>
            {viewer.caption ? viewer.caption + " · " : ""}TAP IMAGE TO {zoom ? "FIT" : "ZOOM"}
          </div>
        </div>
      )}
    </div>
  );
}
