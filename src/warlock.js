// ── Warlock class data (PHB) ──
// Table + feature summaries so the sheet can show "what do I get at level N"
// without opening the book. Descriptions are condensed rules text.

export const WARLOCK_TABLE = [
  // level, pb, cantrips, spellsKnown, slots, slotLevel, invocations
  [1, 2, 2, 2, 1, 1, 0], [2, 2, 2, 3, 2, 1, 2], [3, 2, 2, 4, 2, 2, 2], [4, 2, 3, 5, 2, 2, 2],
  [5, 3, 3, 6, 2, 3, 3], [6, 3, 3, 7, 2, 3, 3], [7, 3, 3, 8, 2, 4, 4], [8, 3, 3, 9, 2, 4, 4],
  [9, 4, 3, 10, 2, 5, 5], [10, 4, 4, 10, 2, 5, 5], [11, 4, 4, 11, 3, 5, 5], [12, 4, 4, 11, 3, 5, 6],
  [13, 5, 4, 12, 3, 5, 6], [14, 5, 4, 12, 3, 5, 6], [15, 5, 4, 13, 3, 5, 7], [16, 5, 4, 13, 3, 5, 7],
  [17, 6, 4, 14, 4, 5, 7], [18, 6, 4, 14, 4, 5, 8], [19, 6, 4, 15, 4, 5, 8], [20, 6, 4, 15, 4, 5, 8],
].map(([level, pb, cantrips, spellsKnown, slots, slotLevel, invocations]) => ({ level, pb, cantrips, spellsKnown, slots, slotLevel, invocations }));

export const rowFor = (level) => WARLOCK_TABLE[Math.min(20, Math.max(1, level)) - 1];

// Class features by level (patron features listed separately).
export const CLASS_FEATURES = [
  { level: 1, name: "Otherworldly Patron", desc: "You have struck a bargain with an otherworldly being: the Archfey, the Fiend, or the Great Old One. Your choice grants features at 1st, 6th, 10th and 14th level." },
  { level: 1, name: "Pact Magic", desc: "Spell slots: all your slots are the same level (see table) and you regain them on a short or long rest. Spellcasting ability is Charisma. Spell save DC = 8 + proficiency + CHA mod. Spell attack = proficiency + CHA mod. When you gain a level you can swap one known spell for another warlock spell of a level you can cast." },
  { level: 2, name: "Eldritch Invocations", desc: "You learn two invocations. You gain more as shown in the table, and when you gain a level you can swap one invocation for another. Prerequisites must be met at the time you learn an invocation." },
  { level: 3, name: "Pact Boon", desc: "Choose Pact of the Chain (find familiar as a ritual with extra forms: imp, pseudodragon, quasit, sprite; forgo one attack to let the familiar attack), Pact of the Blade (create a pact weapon as an action; you're proficient with it and it counts as magical; can bind a magic weapon with a 1-hour ritual), or Pact of the Tome (Book of Shadows with three cantrips from any class's list, cast at will)." },
  { level: 4, name: "Ability Score Improvement", desc: "Increase one ability score by 2, or two by 1 (max 20). Also at 8th, 12th, 16th and 19th level." },
  { level: 11, name: "Mystic Arcanum (6th level)", desc: "Choose one 6th-level warlock spell. Cast it once without a slot; regain on a long rest. Gain a 7th-level arcanum at 13th, 8th at 15th, 9th at 17th." },
  { level: 13, name: "Mystic Arcanum (7th level)", desc: "Choose one 7th-level warlock spell as an arcanum (one free cast per long rest)." },
  { level: 15, name: "Mystic Arcanum (8th level)", desc: "Choose one 8th-level warlock spell as an arcanum (one free cast per long rest)." },
  { level: 17, name: "Mystic Arcanum (9th level)", desc: "Choose one 9th-level warlock spell as an arcanum (one free cast per long rest)." },
  { level: 20, name: "Eldritch Master", desc: "Spend 1 minute entreating your patron to regain all expended Pact Magic spell slots. Once per long rest." },
];

export const PATRONS = {
  Archfey: {
    spells: { 1: ["Faerie Fire", "Sleep"], 2: ["Calm Emotions", "Phantasmal Force"], 3: ["Blink", "Plant Growth"], 4: ["Dominate Beast", "Greater Invisibility"], 5: ["Dominate Person", "Seeming"] },
    features: [
      { level: 1, name: "Fey Presence", desc: "As an action, each creature in a 10-foot cube originating from you makes a Wisdom save against your warlock spell save DC. On a failure it is charmed or frightened by you (your choice) until the end of your next turn. Once per short or long rest." },
      { level: 6, name: "Misty Escape", desc: "When you take damage, use your reaction to turn invisible and teleport up to 60 feet to an unoccupied space you can see. You stay invisible until the start of your next turn or until you attack or cast a spell. Once per short or long rest." },
      { level: 10, name: "Beguiling Defenses", desc: "You are immune to being charmed. When another creature attempts to charm you, use your reaction to turn it back: it makes a Wisdom save against your spell save DC or is charmed by you for 1 minute or until it takes damage." },
      { level: 14, name: "Dark Delirium", desc: "As an action, choose a creature you can see within 60 feet. Wisdom save or it is charmed or frightened by you (your choice) for 1 minute or until your concentration breaks; it perceives only itself, you and an illusory realm of your design. Ends early if it takes damage. Once per short or long rest." },
    ],
  },
  Fiend: {
    spells: { 1: ["Burning Hands", "Command"], 2: ["Blindness/Deafness", "Scorching Ray"], 3: ["Fireball", "Stinking Cloud"], 4: ["Fire Shield", "Wall of Fire"], 5: ["Flame Strike", "Hallow"] },
    features: [
      { level: 1, name: "Dark One's Blessing", desc: "When you reduce a hostile creature to 0 HP, gain temporary HP equal to your CHA modifier + warlock level (minimum 1)." },
      { level: 6, name: "Dark One's Own Luck", desc: "When you make an ability check or saving throw, add a d10 to the roll (after seeing the initial roll, before effects resolve). Once per short or long rest." },
      { level: 10, name: "Fiendish Resilience", desc: "When you finish a short or long rest, choose a damage type; you have resistance to it until you choose another. Magical and silvered weapons ignore it." },
      { level: 14, name: "Hurl Through Hell", desc: "When you hit a creature with an attack, transport it through the lower planes. It vanishes and returns at the end of your next turn; if not a fiend, it takes 10d10 psychic damage. Once per long rest." },
    ],
  },
  "Great Old One": {
    spells: { 1: ["Dissonant Whispers", "Tasha's Hideous Laughter"], 2: ["Detect Thoughts", "Phantasmal Force"], 3: ["Clairvoyance", "Sending"], 4: ["Dominate Beast", "Evard's Black Tentacles"], 5: ["Dominate Person", "Telekinesis"] },
    features: [
      { level: 1, name: "Awakened Mind", desc: "Telepathically speak to any creature you can see within 30 feet. It needn't share a language, but must understand at least one." },
      { level: 6, name: "Entropic Ward", desc: "When a creature makes an attack roll against you, use your reaction to impose disadvantage. If the attack misses, your next attack roll against that creature has advantage before the end of your next turn. Once per short or long rest." },
      { level: 10, name: "Thought Shield", desc: "Your thoughts can't be read telepathically unless you allow it. You have resistance to psychic damage, and any creature dealing psychic damage to you takes the same amount." },
      { level: 14, name: "Create Thrall", desc: "As an action, touch an incapacitated humanoid; it is charmed by you until remove curse, the charmed condition is removed, or you use this again. You can communicate telepathically with it on the same plane." },
    ],
  },
};

// Eldritch Invocations (PHB). prereq: { level, cantrip, pact } — all optional.
export const INVOCATIONS = [
  { name: "Agonizing Blast", prereq: { cantrip: "Eldritch Blast" }, desc: "When you cast eldritch blast, add your Charisma modifier to the damage it deals on a hit." },
  { name: "Armor of Shadows", prereq: {}, desc: "Cast mage armor on yourself at will, without a spell slot or material components." },
  { name: "Ascendant Step", prereq: { level: 9 }, desc: "Cast levitate on yourself at will, without a spell slot or material components." },
  { name: "Beast Speech", prereq: {}, desc: "Cast speak with animals at will, without a spell slot." },
  { name: "Beguiling Influence", prereq: {}, desc: "Gain proficiency in Deception and Persuasion." },
  { name: "Bewitching Whispers", prereq: { level: 7 }, desc: "Cast compulsion once using a warlock spell slot. Once per long rest." },
  { name: "Book of Ancient Secrets", prereq: { pact: "Tome" }, desc: "Inscribe two 1st-level ritual spells from any class in your Book of Shadows and cast them as rituals. Add other ritual spells you find (level ≤ half your warlock level, rounded up) for 50 gp and 2 hours per spell level." },
  { name: "Chains of Carceri", prereq: { level: 15, pact: "Chain" }, desc: "Cast hold monster at will on a celestial, fiend or elemental, without a spell slot or material components. Long rest before targeting the same creature again." },
  { name: "Devil's Sight", prereq: {}, desc: "See normally in darkness, magical and nonmagical, to 120 feet." },
  { name: "Dreadful Word", prereq: { level: 7 }, desc: "Cast confusion once using a warlock spell slot. Once per long rest." },
  { name: "Eldritch Sight", prereq: {}, desc: "Cast detect magic at will, without a spell slot." },
  { name: "Eldritch Spear", prereq: { cantrip: "Eldritch Blast" }, desc: "Eldritch blast's range becomes 300 feet." },
  { name: "Eyes of the Rune Keeper", prereq: {}, desc: "You can read all writing." },
  { name: "Fiendish Vigor", prereq: {}, desc: "Cast false life on yourself at will as a 1st-level spell, without a spell slot or material components." },
  { name: "Gaze of Two Minds", prereq: {}, desc: "Use your action to touch a willing humanoid and perceive through its senses until the end of your next turn (use your action each turn to keep it up). You are blinded and deafened to your own surroundings while doing so." },
  { name: "Lifedrinker", prereq: { level: 12, pact: "Blade" }, desc: "When you hit with your pact weapon, it deals extra necrotic damage equal to your Charisma modifier (minimum 1)." },
  { name: "Mask of Many Faces", prereq: {}, desc: "Cast disguise self at will, without a spell slot." },
  { name: "Master of Myriad Forms", prereq: { level: 15 }, desc: "Cast alter self at will, without a spell slot." },
  { name: "Minions of Chaos", prereq: { level: 9 }, desc: "Cast conjure elemental once using a warlock spell slot. Once per long rest." },
  { name: "Mire the Mind", prereq: { level: 5 }, desc: "Cast slow once using a warlock spell slot. Once per long rest." },
  { name: "Misty Visions", prereq: {}, desc: "Cast silent image at will, without a spell slot or material components." },
  { name: "One with Shadows", prereq: { level: 5 }, desc: "In dim light or darkness, use your action to become invisible until you move or take an action or reaction." },
  { name: "Otherworldly Leap", prereq: { level: 9 }, desc: "Cast jump on yourself at will, without a spell slot or material components." },
  { name: "Repelling Blast", prereq: { cantrip: "Eldritch Blast" }, desc: "When you hit a creature with eldritch blast, push it up to 10 feet away from you in a straight line." },
  { name: "Sculptor of Flesh", prereq: { level: 7 }, desc: "Cast polymorph once using a warlock spell slot. Once per long rest." },
  { name: "Sign of Ill Omen", prereq: { level: 5 }, desc: "Cast bestow curse once using a warlock spell slot. Once per long rest." },
  { name: "Thief of Five Fates", prereq: {}, desc: "Cast bane once using a warlock spell slot. Once per long rest." },
  { name: "Thirsting Blade", prereq: { level: 5, pact: "Blade" }, desc: "Attack twice, instead of once, when you take the Attack action with your pact weapon." },
  { name: "Visions of Distant Realms", prereq: { level: 15 }, desc: "Cast arcane eye at will, without a spell slot." },
  { name: "Voice of the Chain Master", prereq: { pact: "Chain" }, desc: "Communicate telepathically with your familiar and perceive through its senses on the same plane; you can also speak through it in your own voice." },
  { name: "Whispers of the Grave", prereq: { level: 9 }, desc: "Cast speak with dead at will, without a spell slot." },
  { name: "Witch Sight", prereq: { level: 15 }, desc: "See the true form of any shapechanger or creature concealed by illusion or transmutation magic within 30 feet, without line of sight." },
];

export function prereqText(p) {
  const parts = [];
  if (p.level) parts.push(`${p.level}th level`);
  if (p.cantrip) parts.push(`${p.cantrip} cantrip`);
  if (p.pact) parts.push(`Pact of the ${p.pact}`);
  return parts.join(", ");
}

export function meetsPrereq(p, { level, cantrips, pact }) {
  if (p.level && level < p.level) return false;
  if (p.cantrip && !cantrips.some((c) => c.toLowerCase() === p.cantrip.toLowerCase())) return false;
  if (p.pact && pact !== p.pact) return false;
  return true;
}
