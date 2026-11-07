// ── Rogue class data (PHB) ──
// Table + condensed feature text so the Class tab can show "what do I get at
// level N" for a rogue, mirroring warlock.js.

export const ROGUE_TABLE = Array.from({ length: 20 }, (_, i) => {
  const level = i + 1;
  return { level, pb: 2 + Math.floor((level - 1) / 4), sneak: Math.ceil(level / 2) };
});

export const rogueRowFor = (level) => ROGUE_TABLE[Math.min(20, Math.max(1, level)) - 1];

export const ROGUE_FEATURES = [
  { level: 1, name: "Expertise", desc: "Choose two of your skill proficiencies, or one skill and thieves' tools. Your proficiency bonus is doubled for ability checks using them. At 6th level choose two more. (On the Skills tab, tap a dot twice to mark Expertise.)" },
  { level: 1, name: "Sneak Attack", desc: "Once per turn, deal extra damage (see the Sneak Attack column) to one creature you hit with an attack if you have advantage on the attack roll. The attack must use a finesse or ranged weapon. You don't need advantage if another enemy of the target is within 5 feet of it, that enemy isn't incapacitated, and you don't have disadvantage on the roll." },
  { level: 1, name: "Thieves' Cant", desc: "You know thieves' cant, a secret mix of dialect, jargon and code. Only another creature that knows it understands such messages; conveying one takes four times longer than speaking plainly. You also understand secret signs and symbols marking danger, a thieves' guild's territory, loot, or safe houses." },
  { level: 2, name: "Cunning Action", desc: "You can take a bonus action on each of your turns to Dash, Disengage, or Hide." },
  { level: 3, name: "Roguish Archetype", desc: "Choose Thief, Assassin, or Arcane Trickster. Your archetype grants features at 3rd, 9th, 13th and 17th level." },
  { level: 4, name: "Ability Score Improvement", desc: "Increase one ability score by 2, or two by 1 (max 20). Also at 8th, 10th, 12th, 16th and 19th level — rogues get an extra one at 10th." },
  { level: 5, name: "Uncanny Dodge", desc: "When an attacker you can see hits you with an attack, use your reaction to halve the attack's damage against you." },
  { level: 6, name: "Expertise (2 more)", desc: "Choose two more of your proficiencies (skills or thieves' tools) to double your proficiency bonus for." },
  { level: 7, name: "Evasion", desc: "When you are subjected to an effect that allows a Dexterity saving throw to take only half damage, you instead take no damage on a success and only half damage on a failure." },
  { level: 11, name: "Reliable Talent", desc: "Whenever you make an ability check that lets you add your proficiency bonus, you can treat a d20 roll of 9 or lower as a 10." },
  { level: 14, name: "Blindsense", desc: "If you are able to hear, you are aware of the location of any hidden or invisible creature within 10 feet of you." },
  { level: 15, name: "Slippery Mind", desc: "You gain proficiency in Wisdom saving throws." },
  { level: 18, name: "Elusive", desc: "No attack roll has advantage against you while you aren't incapacitated." },
  { level: 20, name: "Stroke of Luck", desc: "If your attack misses a target within range, you can turn the miss into a hit. Alternatively, if you fail an ability check, you can treat the d20 roll as a 20. Once per short or long rest." },
];

export const ARCHETYPES = {
  Thief: {
    blurb: "Burglars, bandits, cutpurses and treasure seekers. You improve your agility and stealth, and learn to use magic items you normally couldn't.",
    features: [
      { level: 3, name: "Fast Hands", desc: "You can use the bonus action from Cunning Action to make a Dexterity (Sleight of Hand) check, use your thieves' tools to disarm a trap or open a lock, or take the Use an Object action." },
      { level: 3, name: "Second-Story Work", desc: "Climbing no longer costs you extra movement. When you make a running jump, the distance you cover increases by a number of feet equal to your Dexterity modifier." },
      { level: 9, name: "Supreme Sneak", desc: "You have advantage on Dexterity (Stealth) checks if you move no more than half your speed on the same turn." },
      { level: 13, name: "Use Magic Device", desc: "You ignore all class, race and level requirements on the use of magic items." },
      { level: 17, name: "Thief's Reflexes", desc: "You can take two turns during the first round of any combat: your first at your normal initiative and your second at your initiative minus 10. You can't use this when you are surprised." },
    ],
  },
  Assassin: {
    blurb: "Hired killers, spies, bounty hunters. Stealth, poison and disguise help you eliminate foes with deadly efficiency.",
    features: [
      { level: 3, name: "Bonus Proficiencies", desc: "You gain proficiency with the disguise kit and the poisoner's kit." },
      { level: 3, name: "Assassinate", desc: "You have advantage on attack rolls against any creature that hasn't taken a turn in the combat yet. Any hit you score against a creature that is surprised is a critical hit." },
      { level: 9, name: "Infiltration Expertise", desc: "Spend seven days and 25 gp to establish a false identity (history, profession, affiliations). Thereafter, if you adopt it as a disguise, other creatures believe you to be that person until given an obvious reason not to." },
      { level: 13, name: "Impostor", desc: "After studying a person's speech, writing and behavior for at least three hours, you can unerringly mimic them. Your ruse is indiscernible to casual observers; if a wary creature suspects something, you have advantage on Charisma (Deception) checks to avoid detection." },
      { level: 17, name: "Death Strike", desc: "When you attack and hit a creature that is surprised, it must make a Constitution saving throw (DC 8 + your Dexterity modifier + your proficiency bonus). On a failed save, double the damage of your attack against it." },
    ],
  },
  "Arcane Trickster": {
    blurb: "Rogues who enhance stealth and agility with magic — tricks of enchantment and illusion. Spells come from the wizard list and use Intelligence.",
    features: [
      { level: 3, name: "Spellcasting", desc: "You cast wizard spells using Intelligence. Cantrips: mage hand plus two others of your choice (a third at 10th level). Spells known are shown in the table; each must be enchantment or illusion, except the spells you learn at 3rd, 8th, 14th and 20th level, which can be from any school. Spell save DC = 8 + proficiency + INT mod. Spell attack = proficiency + INT mod. Slots return on a long rest. On gaining a level you can swap one known spell." },
      { level: 3, name: "Mage Hand Legerdemain", desc: "When you cast mage hand, you can make the hand invisible, and you can use it to stow or retrieve an object in a container worn or carried by another creature, or to use thieves' tools to pick locks and disarm traps at range. You can do one of these unnoticed if you win a Dexterity (Sleight of Hand) check against the creature's Wisdom (Perception) check. You can control the hand with your Cunning Action bonus action." },
      { level: 9, name: "Magical Ambush", desc: "If you are hidden from a creature when you cast a spell on it, the creature has disadvantage on any saving throw it makes against the spell this turn." },
      { level: 13, name: "Versatile Trickster", desc: "As a bonus action on your turn, designate a creature within 5 feet of your mage hand. You have advantage on attack rolls against that creature until the end of the turn." },
      { level: 17, name: "Spell Thief", desc: "Immediately after a creature casts a spell that targets you or includes you in its area, use your reaction to force it to make a saving throw with its spellcasting ability against your spell save DC. On a failure, you negate the spell's effect on you and steal the spell (if it is at least 1st level and of a level you can cast) for 8 hours; the creature can't cast it during that time. Once per long rest." },
    ],
  },
};

// Arcane Trickster Spellcasting: level → { cantrips, spellsKnown, slots: [1st, 2nd, 3rd, 4th] }
export const AT_SPELLCASTING = {
  3: { cantrips: 3, spellsKnown: 3, slots: [2] },
  4: { cantrips: 3, spellsKnown: 4, slots: [3] },
  5: { cantrips: 3, spellsKnown: 4, slots: [3] },
  6: { cantrips: 3, spellsKnown: 4, slots: [3] },
  7: { cantrips: 3, spellsKnown: 5, slots: [4, 2] },
  8: { cantrips: 3, spellsKnown: 6, slots: [4, 2] },
  9: { cantrips: 3, spellsKnown: 6, slots: [4, 2] },
  10: { cantrips: 4, spellsKnown: 7, slots: [4, 3] },
  11: { cantrips: 4, spellsKnown: 8, slots: [4, 3] },
  12: { cantrips: 4, spellsKnown: 8, slots: [4, 3] },
  13: { cantrips: 4, spellsKnown: 9, slots: [4, 3, 2] },
  14: { cantrips: 4, spellsKnown: 10, slots: [4, 3, 2] },
  15: { cantrips: 4, spellsKnown: 10, slots: [4, 3, 2] },
  16: { cantrips: 4, spellsKnown: 11, slots: [4, 3, 3] },
  17: { cantrips: 4, spellsKnown: 11, slots: [4, 3, 3] },
  18: { cantrips: 4, spellsKnown: 11, slots: [4, 3, 3] },
  19: { cantrips: 4, spellsKnown: 12, slots: [4, 3, 3, 1] },
  20: { cantrips: 4, spellsKnown: 13, slots: [4, 3, 3, 1] },
};

export const atSpellsFor = (level) => AT_SPELLCASTING[Math.min(20, level)] || null;
