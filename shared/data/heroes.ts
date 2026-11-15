// Superhero card datasets.
// All numbers are ILLUSTRATIVE GAME-BALANCE VALUES for this auction game, not official rankings.
// "core" and "expansion" use Marvel-inspired character names with generated placeholder art only —
// a commercial release must license them. The "original" pack is an IP-free roster of invented heroes.

import type { HeroCard, HeroClass, Threat } from '../types';
import { rarityOf, slug } from '../util';

// [name, class, overall, [STR SPD INT DEF PWR TMW], role, signature ability, special attack, passive, weakTo, tags, clue]
type Row = [string, HeroClass, number, number[], string, string, string, string, Threat, string, string];

const CORE: Row[] = [
  ['Iron Man', 'Tech', 91, [77, 90, 99, 88, 94, 91], 'Ranged Striker', 'Advanced Armor Systems', 'Unibeam Overload', 'Adapts his suit mid-fight', 'magic', 'leader,ranged,flyer,avengers,science', 'A genius billionaire who built his first suit in a cave'],
  ['Thor', 'Tank', 95, [97, 82, 75, 94, 99, 82], 'Frontline Powerhouse', 'Thunderstrike', 'God Blast', 'Storm-forged resilience', 'magic', 'ranged,flyer,avengers,asgard', 'Worthy wielder of an enchanted hammer'],
  ['Hulk', 'Tank', 94, [100, 70, 88, 96, 90, 62], 'Unstoppable Bruiser', 'Gamma Rage', 'World-Breaker Smash', 'The angrier he gets, the stronger he gets', 'mind', 'avengers,science', 'A mild scientist who turns green when angry'],
  ['Captain America', 'Tank', 88, [82, 80, 86, 92, 70, 99], 'Field Commander', 'Shield Mastery', 'Shield Ricochet', 'Inspires every ally nearby', 'energy', 'leader,avengers', 'A super-soldier who spent decades frozen in ice'],
  ['Black Widow', 'Support', 81, [62, 84, 90, 70, 60, 94], 'Infiltrator', 'Master Espionage', "Widow's Bite", 'Exposes enemy weak points', 'brute', 'avengers,spy', 'A former spy trained in a ruthless secret academy'],
  ['Hawkeye', 'Damage', 80, [64, 80, 82, 66, 72, 90], 'Sharpshooter', 'Never-Miss Marksmanship', 'Trick Arrow Volley', 'Deadlier from long range', 'brute', 'ranged,avengers', 'An archer with no superpowers who never misses'],
  ['Doctor Strange', 'Mystic', 93, [60, 78, 96, 86, 98, 84], 'Reality Bender', 'Mystic Arts Mastery', 'Mirror Dimension Trap', 'Foresees millions of outcomes', 'speed', 'leader,flyer,mystic-arts,avengers', 'A surgeon who became the Sorcerer Supreme'],
  ['Scarlet Witch', 'Mystic', 94, [58, 76, 84, 80, 100, 70], 'Chaos Caster', 'Chaos Magic', 'Hex Storm', 'Reality warps around her emotions', 'mind', 'ranged,avengers', 'Her hexes can rewrite reality itself'],
  ['Spider-Man', 'Damage', 89, [86, 92, 92, 80, 78, 88], 'Agile Skirmisher', 'Spider-Sense', 'Web Barrage', 'Dodges the first big hit', 'energy', 'avengers,street,science', 'A friendly neighbourhood hero bitten by a spider'],
  ['Black Panther', 'Damage', 88, [84, 88, 90, 90, 76, 88], 'Royal Hunter', 'Kinetic Energy Suit', 'Panther Pounce', 'Stores damage and releases it', 'magic', 'leader,wakanda,avengers', 'King and protector of a hidden advanced nation'],
  ['Ant-Man', 'Tech', 82, [70, 78, 84, 72, 80, 86], 'Size Shifter', 'Size-Shifting Particles', 'Giant Stomp', 'Slips past defences when tiny', 'energy', 'avengers,science', 'A reformed thief who shrinks and talks to insects'],
  ['Wasp', 'Tech', 82, [62, 90, 86, 70, 80, 88], 'Aerial Harasser', 'Bio-Sting Blasts', 'Swarm Strike', 'Hard to target while shrunken', 'brute', 'ranged,flyer,avengers,science', 'A winged partner who shrinks and stings'],
  ['Vision', 'Controller', 90, [86, 84, 96, 90, 92, 80], 'Phasing Sentinel', 'Density Control', 'Solar Beam', 'Phases through the first attack', 'magic', 'ranged,flyer,avengers', 'A synthetic being powered by a gem in his forehead'],
  ['Captain Marvel', 'Damage', 94, [94, 96, 82, 92, 98, 78], 'Cosmic Vanguard', 'Photon Absorption', 'Binary Burst', 'Absorbs energy attacks', 'mind', 'ranged,flyer,avengers,cosmic', 'A fighter pilot infused with cosmic energy'],
  ['Loki', 'Controller', 88, [72, 80, 96, 78, 90, 50], 'Trickster', 'Illusion Casting', 'Dagger of Deceit', 'Decoys confuse attackers', 'brute', 'asgard', 'The god of mischief'],
  ['Winter Soldier', 'Damage', 83, [82, 82, 80, 78, 70, 80], 'Covert Assassin', 'Cybernetic Arm', 'Ghost Protocol', 'First strike from the shadows', 'mind', 'ranged,avengers,spy', 'A brainwashed soldier with a metal arm'],
  ['Falcon', 'Tech', 80, [66, 90, 80, 70, 68, 92], 'Air Support', 'Wing Harness', 'Drone Dive', 'Scouts enemy positions', 'energy', 'flyer,ranged,avengers', 'A winged veteran with a drone sidekick'],
  ['War Machine', 'Tech', 84, [78, 82, 80, 88, 86, 84], 'Heavy Artillery', 'Arsenal Armor', 'Shoulder Cannon Barrage', 'Suppressive fire slows enemies', 'magic', 'ranged,flyer,avengers', 'A military pilot in a heavily armed suit'],
  ['Star-Lord', 'Controller', 81, [66, 82, 80, 70, 74, 90], 'Wildcard Captain', 'Element Blasters', 'Gravity Mine', 'Improvises a plan mid-battle', 'brute', 'leader,ranged,guardians,cosmic', 'A space outlaw who loves old mixtapes'],
  ['Gamora', 'Damage', 84, [82, 88, 82, 80, 66, 82], 'Blade Duelist', 'Master Assassin', 'Godslayer Slash', 'Critical strikes on single targets', 'energy', 'guardians,cosmic', 'Called the deadliest woman in the galaxy'],
  ['Groot', 'Tank', 83, [90, 56, 60, 92, 74, 96], 'Living Shield', 'Regrowth', 'Root Cage', 'Shields allies with his body', 'energy', 'guardians,cosmic', 'A tree-like being who says only three words'],
  ['Rocket Raccoon', 'Tech', 82, [50, 82, 94, 62, 84, 80], 'Gadgeteer', 'Improvised Weaponry', 'Big Gun Surprise', 'Builds a bigger weapon every round', 'brute', 'ranged,guardians,cosmic,science', 'A short-tempered genius with a tail'],
  ['Drax', 'Tank', 82, [90, 70, 56, 88, 62, 74], 'Berserker', 'Relentless Assault', 'Twin-Blade Fury', 'Ignores pain when enraged', 'mind', 'guardians,cosmic', 'A literal-minded warrior called the Destroyer'],
  ['Nebula', 'Tech', 81, [80, 82, 82, 82, 68, 64], 'Cyber Duelist', 'Self-Repairing Cybernetics', 'Electro-Baton Surge', 'Repairs herself between rounds', 'magic', 'guardians,cosmic', 'A blue cyborg rebuilt piece by piece'],
  ['Mantis', 'Support', 78, [48, 74, 76, 58, 82, 96], 'Empath', 'Emotional Empathy', 'Sleep Touch', 'Calms and steadies teammates', 'brute', 'guardians,cosmic', 'An antennaed empath who can put a giant to sleep'],
  ['Shuri', 'Tech', 83, [58, 78, 98, 72, 80, 90], 'Inventor', 'Rare-Metal Innovation', 'Gauntlet Blast', 'Upgrades allied equipment', 'brute', 'ranged,wakanda,science', "A princess who is her nation's top inventor"],
  ['Okoye', 'Support', 79, [74, 82, 82, 80, 56, 94], 'Royal Guard', 'Elite Guard Discipline', 'Spear Whirlwind', "Guards the team's leader", 'energy', 'wakanda', 'General of an elite all-female royal guard'],
  ['Valkyrie', 'Damage', 85, [88, 84, 76, 86, 74, 84], 'Sky Rider', 'Warrior Training', 'Dragonfang Charge', 'Rallies when allies fall', 'magic', 'asgard,flyer', 'A legendary warrior who rides a winged horse'],
  ['Wong', 'Mystic', 82, [60, 70, 90, 78, 86, 92], 'Arcane Librarian', 'Sling Ring Portals', 'Mystic Bindings', 'Opens escape portals for allies', 'speed', 'mystic-arts', 'Keeper of a sacred library of spells'],
  ['Nick Fury', 'Support', 78, [58, 66, 94, 64, 50, 98], 'Spymaster', 'Strategic Command', 'Orbital Strike Call', 'Always has a backup plan', 'energy', 'leader,avengers,spy', 'A one-eyed director who assembles heroes'],
  ['Daredevil', 'Damage', 81, [70, 86, 86, 74, 58, 76], 'Street Guardian', 'Radar Sense', 'Billy Club Combo', 'Cannot be blinded or surprised', 'energy', 'street', 'A blind lawyer who fights crime at night'],
  ['Wolverine', 'Damage', 89, [84, 82, 74, 90, 70, 70], 'Feral Brawler', 'Healing Factor', 'Berserker Barrage', 'Heals every round', 'mind', 'xmen', 'A mutant with unbreakable claws who heals from anything'],
  ['Deadpool', 'Damage', 86, [78, 84, 66, 84, 64, 58], 'Chaos Agent', 'Accelerated Healing', 'Maximum Effort', 'Unpredictable — ignores enemy plans', 'magic', 'street,xmen', 'A wisecracking mercenary who breaks the fourth wall'],
  ['Storm', 'Controller', 90, [62, 84, 86, 76, 96, 88], 'Weather Commander', 'Atmospheric Control', 'Lightning Tempest', 'Controls the battlefield climate', 'tech', 'leader,ranged,flyer,xmen', 'A mutant who commands the weather'],
  ['Professor X', 'Controller', 91, [30, 40, 100, 60, 98, 96], 'Telepath General', 'Global Telepathy', 'Psychic Shutdown', 'Coordinates allies mind-to-mind', 'brute', 'leader,xmen', "The world's most powerful telepath, who leads from a wheelchair"],
  ['Jean Grey', 'Mystic', 93, [56, 78, 90, 80, 100, 80], 'Cosmic Telekinetic', 'Telekinesis', 'Phoenix Flare', 'Rises stronger after a setback', 'mind', 'ranged,xmen,cosmic', 'A telepath bonded to a fiery cosmic force'],
  ['Cyclops', 'Damage', 84, [68, 74, 86, 72, 90, 94], 'Tactical Blaster', 'Optic Blast', 'Wide-Beam Sweep', 'Calls precise team formations', 'speed', 'leader,ranged,xmen', 'A team leader who must always wear a ruby visor'],
  ['Shang-Chi', 'Damage', 85, [80, 90, 82, 82, 84, 84], 'Martial Master', 'Ten Rings Mastery', 'Dragon Scale Strike', 'Counters melee attackers', 'tech', 'avengers,mystic-arts', 'A kung-fu master who inherited ten mystical rings'],
  ['Moon Knight', 'Mystic', 83, [80, 80, 78, 80, 78, 56], 'Lunar Avenger', 'Moon-Blessed Strength', 'Crescent Dart Storm', 'Stronger at night', 'mind', 'street', 'A vigilante who serves an Egyptian moon god'],
  ['She-Hulk', 'Tank', 87, [94, 74, 90, 90, 76, 84], 'Brawling Advocate', 'Controlled Gamma Strength', 'Jade Slam', 'Keeps her intellect when transformed', 'magic', 'avengers,science', 'A lawyer who stays smart when she turns green'],
  ['Ms. Marvel', 'Support', 80, [72, 78, 80, 78, 80, 92], 'Morphing Protector', 'Embiggen', 'Hard-Light Fist', 'Shields nearby allies', 'tech', 'avengers,street', 'A teenage superfan who can stretch and "embiggen"'],
  ['Silver Surfer', 'Mystic', 95, [90, 100, 88, 92, 100, 60], 'Cosmic Herald', 'Power Cosmic', 'Cosmic Wave', 'Travels faster than light', 'mind', 'ranged,flyer,cosmic', 'A silver herald who rides a board through space'],
  ['Quicksilver', 'Damage', 84, [70, 100, 72, 70, 66, 74], 'Speed Blitzer', 'Supersonic Speed', 'Thousand-Punch Rush', 'Always attacks first', 'magic', 'avengers,xmen', 'A silver-haired speedster with a twin sister'],
  ['Nightcrawler', 'Controller', 82, [62, 92, 80, 68, 78, 90], 'Teleporting Scout', 'Teleportation', 'Smoke Ambush', 'Repositions allies instantly', 'energy', 'xmen', 'A blue-skinned acrobat who teleports in a puff of smoke'],
  ['Mister Fantastic', 'Tech', 86, [66, 70, 100, 82, 74, 92], 'Elastic Genius', 'Elastic Body', 'Stretch Slingshot', 'Solves any problem given time', 'magic', 'leader,f4,science', 'The stretchy leader of a famous family of four'],
  ['Invisible Woman', 'Support', 88, [56, 72, 88, 96, 90, 96], 'Force-Field Guardian', 'Invisible Force Fields', 'Force Bubble Crush', 'Shields the entire team', 'mind', 'f4', 'She turns invisible and projects force fields'],
  ['Human Torch', 'Damage', 85, [66, 90, 70, 70, 92, 80], 'Flying Flame', 'Living Flame', 'Nova Burst', 'Burns brighter each round', 'tech', 'ranged,flyer,f4', 'A hothead who bursts into flame and flies'],
  ['The Thing', 'Tank', 86, [96, 56, 74, 96, 60, 86], 'Rock Wall', 'Rock-Hard Hide', 'Clobbering Blow', 'Shrugs off physical blows', 'energy', 'f4', 'A rocky orange powerhouse with a famous battle cry'],
];

const EXPANSION: Row[] = [
  ['Thanos', 'Tank', 97, [99, 78, 96, 98, 98, 40], 'Mad Titan', 'Titan Physiology', 'Gauntlet Snap', 'Grows more dangerous late in a fight', 'speed', 'cosmic,ranged,villain', 'A purple titan obsessed with balance'],
  ['Ultron', 'Tech', 92, [88, 84, 100, 92, 90, 36], 'Machine Overlord', 'Self-Replication', 'Encephalo-Ray', 'Uploads himself to a new body', 'magic', 'ranged,flyer,villain', 'A rogue AI who wants to replace humanity'],
  ['Hela', 'Mystic', 94, [92, 84, 84, 90, 98, 40], 'Death Goddess', 'Blade Summoning', 'Blade Rain', 'Draws power from her homeland', 'energy', 'ranged,asgard,villain', 'The goddess of death and first-born of a royal house'],
  ['Killmonger', 'Damage', 85, [84, 86, 88, 84, 70, 50], 'Usurper', 'Black-Ops Training', 'Golden Jaguar Strike', 'Studies and copies enemy tactics', 'magic', 'wakanda,villain', 'An exiled prince who challenges for the throne'],
  ['Green Goblin', 'Tech', 84, [80, 84, 92, 74, 78, 34], 'Glider Menace', 'Goblin Formula', 'Pumpkin Bomb Run', 'Madness makes him unpredictable', 'mind', 'ranged,flyer,street,villain', 'A cackling industrialist on a glider'],
  ['Doctor Octopus', 'Tech', 84, [82, 70, 96, 82, 72, 40], 'Multi-Arm Mastermind', 'Mechanical Tentacles', 'Four-Arm Crush', 'Fights four enemies at once', 'energy', 'street,science,villain', 'A scientist fused to four mechanical arms'],
  ['Venom', 'Tank', 87, [92, 82, 70, 90, 74, 44], 'Symbiote Brute', 'Symbiote Bonding', 'Tendril Lash', 'Immune to danger-sense', 'energy', 'street,villain', 'An alien symbiote bonded to a human host'],
  ['Magneto', 'Controller', 93, [60, 76, 94, 90, 98, 70], 'Master of Magnetism', 'Magnetic Field Control', 'Metal Storm', 'Disarms anything made of metal', 'magic', 'leader,ranged,flyer,xmen,villain', 'A mutant who bends all metal to his will'],
  ['Doctor Doom', 'Mystic', 94, [80, 74, 100, 94, 96, 50], 'Sorcerer Monarch', 'Science and Sorcery', 'Doom Blast', 'Prepared for every opponent', 'speed', 'leader,ranged,f4,science,villain', 'An armoured monarch who mixes science with sorcery'],
  ['Kang', 'Controller', 93, [76, 80, 100, 90, 94, 40], 'Time Conqueror', 'Temporal Technology', 'Timeline Erasure', 'Rewinds one mistake per battle', 'magic', 'leader,ranged,cosmic,villain', 'A conqueror who wages war across timelines'],
  ['Red Skull', 'Controller', 80, [70, 68, 92, 70, 66, 60], 'Shadow Commander', 'Master Strategist', 'Dust of Death', 'Commands endless reinforcements', 'brute', 'leader,spy,villain', 'A crimson-faced wartime mastermind'],
  ['Mysterio', 'Controller', 79, [56, 66, 92, 60, 76, 40], 'Illusionist', 'Holographic Illusions', 'Hall of Mirrors', 'Enemies strike at phantoms', 'brute', 'street,villain', 'A special-effects wizard in a fishbowl helmet'],
  ['Dormammu', 'Mystic', 96, [94, 70, 90, 94, 100, 20], 'Dark Dimension Lord', 'Dark Dimension Energy', 'Eternal Flames', 'Timeless inside his own realm', 'mind', 'ranged,cosmic,mystic-arts,villain', 'A flaming ruler of a timeless dark dimension'],
  ['Juggernaut', 'Tank', 88, [98, 58, 56, 98, 70, 40], 'Unstoppable Force', 'Unstoppable Momentum', 'Crimson Charge', 'Cannot be halted once moving', 'mind', 'xmen,villain', 'A helmeted giant nobody can stop once he starts running'],
  ['Mystique', 'Support', 80, [62, 84, 90, 66, 62, 70], 'Shapeshifting Spy', 'Perfect Shapeshifting', 'Identity Ambush', "Copies an enemy's appearance", 'energy', 'xmen,spy,villain', 'A blue shapeshifter who can impersonate anyone'],
  ['Abomination', 'Tank', 86, [97, 62, 70, 94, 72, 36], 'Gamma Monster', 'Gamma Mutation', 'Spine Crusher', 'Never tires in long fights', 'mind', 'science,villain', 'A soldier mutated into a spined gamma monster'],
];

// Fully original heroes — invented for this game, safe to ship without any third-party IP.
const ORIGINAL: Row[] = [
  ['Aegis Prime', 'Tank', 95, [96, 74, 80, 99, 90, 88], 'Bulwark Captain', 'Titan Barrier', 'Shieldquake', 'Absorbs hits meant for allies', 'mind', 'leader,vanguard', 'Carries a shield forged from a fallen star'],
  ['Bastion Rook', 'Tank', 88, [92, 60, 70, 96, 70, 84], 'Fortress', 'Stonewall Stance', 'Rampart Slam', 'Cannot be pushed back', 'magic', 'vanguard', 'A living fortress shaped like a chess piece'],
  ['Ironroot', 'Tank', 84, [90, 52, 62, 92, 72, 90], 'Grove Guardian', 'Bark Armor', 'Thornwall', 'Regrows when rooted', 'energy', 'starborn', 'An ancient forest spirit made of iron-hard wood'],
  ['Magnaforge', 'Tank', 90, [95, 66, 78, 92, 88, 70], 'Molten Juggernaut', 'Magma Plating', 'Furnace Burst', 'Burns attackers on contact', 'tech', 'foundry', 'A walking furnace with lava for blood'],
  ['Tidewall', 'Tank', 82, [86, 68, 70, 90, 78, 82], 'Wave Breaker', 'Pressure Shell', 'Riptide Crash', 'Stronger near water', 'energy', 'starborn', 'A deep-sea diver fused with living coral'],
  ['Granite Vow', 'Tank', 79, [88, 50, 64, 90, 56, 86], 'Oathkeeper', 'Unbreaking Oath', 'Boulder Toss', 'Never abandons a teammate', 'mind', 'nightwatch', 'A statue that came to life to keep a promise'],
  ['Colossa', 'Tank', 86, [97, 58, 66, 93, 68, 76], 'Giantess', 'Growth Surge', 'Skyfall Stomp', 'Grows larger as the fight goes on', 'speed', 'vanguard', 'She can grow as tall as a skyscraper'],
  ['Voltara', 'Damage', 94, [80, 97, 82, 80, 99, 76], 'Storm Lancer', 'Living Lightning', 'Thousand-Volt Spear', 'Chains damage between enemies', 'magic', 'ranged,flyer,starborn', 'A lightning bolt that learned to think'],
  ['Ember Lynx', 'Damage', 86, [78, 92, 76, 74, 88, 78], 'Flame Stalker', 'Heat Mirage', 'Cinder Pounce', 'Leaves a burning trail', 'tech', 'nightwatch', 'A feline hunter wreathed in embers'],
  ['Riftblade', 'Damage', 91, [86, 90, 84, 82, 90, 70], 'Dimensional Duelist', 'Rift Cutting', 'Split-Second Slash', 'Strikes from two places at once', 'mind', 'starborn', 'Wields a sword that cuts holes in space'],
  ['Sable Comet', 'Damage', 88, [84, 96, 74, 78, 86, 72], 'Night Flyer', 'Dark-Matter Flight', 'Meteor Dive', 'Faster in darkness', 'magic', 'flyer,nightwatch', 'A shadow that streaks across the sky like a comet'],
  ['Kestrel Nine', 'Damage', 82, [66, 86, 84, 68, 76, 90], 'Marksman', 'Hawk-Eye Optics', 'Nine-Shot Burst', 'Never misses a marked target', 'brute', 'ranged,vanguard', 'The ninth and last of an elite sniper squad'],
  ['Thornstrike', 'Damage', 80, [78, 84, 70, 74, 72, 74], 'Briar Fencer', 'Venom Thorns', 'Bramble Flurry', 'Poisons with every hit', 'energy', 'starborn', 'A duelist whose rapier is a living thorn'],
  ['Nova Jackal', 'Damage', 85, [80, 90, 78, 72, 88, 52], 'Solar Scavenger', 'Star-Core Claws', 'Supernova Bite', 'Feeds on enemy energy', 'mind', 'foundry', 'A laughing scavenger with a miniature sun in his chest'],
  ['Crimson Tempo', 'Damage', 83, [76, 94, 80, 70, 70, 84], 'Rhythm Fighter', 'Perfect Timing', 'Crescendo Combo', 'Each hit lands faster than the last', 'tech', 'nightwatch', 'A drummer who fights to a beat only she can hear'],
  ['Nyx Oracle', 'Mystic', 93, [54, 76, 97, 82, 98, 86], 'Seer', 'Starlit Prophecy', 'Fate Unravel', 'Knows the next enemy move', 'speed', 'leader,nightwatch', 'A blindfolded seer who reads the night sky'],
  ['Starweaver', 'Mystic', 90, [56, 80, 90, 80, 96, 88], 'Constellation Mage', 'Thread of Stars', 'Astral Net', 'Links allies with protective threads', 'tech', 'ranged,starborn', 'She stitches constellations into weapons'],
  ['Hollow Saint', 'Mystic', 87, [70, 72, 84, 86, 92, 60], 'Spirit Vessel', 'Soul Lantern', 'Requiem Wave', 'Returns once from defeat', 'mind', 'nightwatch', 'An empty suit of armour carrying a lantern of souls'],
  ['Runebinder', 'Mystic', 84, [62, 68, 92, 80, 88, 84], 'Glyph Scholar', 'Living Runes', 'Seal of Silence', 'Silences enemy abilities', 'brute', 'vanguard', 'Every inch of his skin is covered in glowing glyphs'],
  ['Astral Monk', 'Mystic', 82, [74, 84, 86, 78, 82, 90], 'Spirit Walker', 'Out-of-Body Strike', 'Hundred Palm Echo', 'Fights in two planes at once', 'tech', 'starborn', 'Meditates so deeply his spirit leaves his body'],
  ['Lady Eclipse', 'Mystic', 96, [70, 82, 92, 90, 100, 58], 'Umbral Sovereign', 'Total Eclipse', 'Corona Collapse', 'Dims every enemy power', 'speed', 'ranged,flyer,nightwatch', 'She can blot out the sun at will'],
  ['Cipher', 'Tech', 91, [62, 82, 100, 78, 90, 88], 'Master Hacker', 'System Override', 'Zero-Day Strike', 'Turns enemy tech against itself', 'magic', 'leader,foundry', 'Nobody has ever seen the face behind the code'],
  ['Gearhawk', 'Tech', 85, [72, 90, 86, 78, 82, 86], 'Clockwork Flyer', 'Mechanical Wings', 'Cog Cyclone', 'Scouts and marks targets', 'energy', 'ranged,flyer,foundry', 'A pilot with brass wings and a clockwork heart'],
  ['Photon Jack', 'Tech', 83, [66, 88, 84, 70, 88, 80], 'Light Gunner', 'Hard-Light Projector', 'Prism Barrage', 'Blinds enemies on hit', 'brute', 'ranged,vanguard', 'A stuntman who builds weapons out of solid light'],
  ['Nanite Queen', 'Tech', 89, [70, 78, 96, 86, 90, 72], 'Swarm Commander', 'Nanite Swarm', 'Grey Tide', 'Repairs allies each round', 'magic', 'foundry', 'She commands a billion machines too small to see'],
  ['Circuit Sage', 'Tech', 80, [56, 70, 94, 68, 76, 92], 'Field Engineer', 'Instant Fabrication', 'Turret Garden', 'Builds cover for the team', 'brute', 'foundry', 'An old inventor who can build anything in seconds'],
  ['Drone Marshal', 'Tech', 82, [64, 76, 88, 74, 80, 94], 'Tactical Controller', 'Drone Squadron', 'Carpet Sweep', 'Drones intercept incoming fire', 'energy', 'leader,ranged,vanguard', 'Commands a squadron of loyal drones by whistle'],
  ['Quantum Fox', 'Tech', 86, [68, 94, 92, 70, 84, 78], 'Phase Trickster', 'Probability Shift', 'Schrödinger Strike', 'Is never quite where she appears', 'mind', 'nightwatch', 'A thief who is in two places until you look'],
  ['Mindloom', 'Controller', 92, [40, 60, 99, 70, 97, 92], 'Psychic Weaver', 'Thought Weaving', 'Mass Hypnosis', 'Links the minds of teammates', 'brute', 'leader,starborn', 'She weaves thoughts together like thread'],
  ['Gravitas', 'Controller', 90, [78, 66, 86, 88, 96, 74], 'Gravity Warden', 'Gravity Well', 'Event Horizon', 'Pins flyers to the ground', 'speed', 'ranged,vanguard', 'Everything near him weighs ten times more'],
  ['Frostline', 'Controller', 84, [66, 78, 82, 80, 88, 82], 'Ice Tactician', 'Absolute Zero', 'Glacier Wall', 'Slows the whole battlefield', 'energy', 'ranged,starborn', 'She draws a line of frost nobody can cross'],
  ['Echo Maze', 'Controller', 81, [58, 80, 88, 66, 80, 80], 'Illusion Architect', 'Sound Mirage', 'Labyrinth of Echoes', 'Enemies attack false targets', 'brute', 'nightwatch', 'Her voice builds mazes out of echoes'],
  ['Tempest Warden', 'Controller', 87, [70, 86, 82, 78, 92, 84], 'Storm Shepherd', 'Wind Dominion', 'Cyclone Cage', 'Redirects ranged attacks', 'tech', 'ranged,flyer,vanguard', 'A lighthouse keeper who herds hurricanes'],
  ['Chrono Wren', 'Controller', 89, [56, 92, 94, 72, 92, 76], 'Time Skipper', 'Second Chances', 'Rewind Strike', 'Undoes one hit per battle', 'magic', 'flyer,starborn', 'A small bird-masked hero who skips through seconds'],
  ['Halcyon', 'Support', 90, [58, 80, 88, 86, 92, 99], 'Guardian Healer', 'Calm Aura', 'Dawn Chorus', 'Heals the whole team each round', 'brute', 'flyer,starborn', 'Her presence makes every battlefield go quiet'],
  ['Beacon', 'Support', 84, [64, 78, 84, 80, 86, 96], 'Signal Bearer', 'Guiding Light', 'Flare Burst', 'Reveals hidden enemies', 'mind', 'leader,ranged,vanguard', 'A lighthouse in human form'],
  ['Lifebloom', 'Support', 81, [50, 70, 80, 72, 84, 97], 'Field Medic', 'Rapid Regrowth', 'Pollen Cloud', 'Revives one fallen ally', 'energy', 'starborn', 'Flowers bloom wherever she walks'],
  ['Rally Kite', 'Support', 78, [56, 88, 76, 62, 70, 95], 'Aerial Courier', 'Tailwind', 'Slipstream Boost', 'Speeds up every teammate', 'brute', 'flyer,vanguard', 'A messenger who rides the wind on a glider'],
  ['Mender Vale', 'Support', 80, [60, 66, 92, 74, 72, 94], 'Combat Surgeon', 'Battlefield Triage', 'Adrenaline Shot', 'Removes weaknesses from one ally', 'tech', 'foundry', 'A surgeon who has never lost a patient'],
  ['Captain Meridian', 'Support', 87, [78, 80, 90, 86, 74, 99], 'Grand Strategist', 'Perfect Formation', 'All-Out Rally', 'Every ally fights as one', 'magic', 'leader,vanguard', 'A navigator who always knows the way'],
];

const WORDS: [string, string][] = [
  ['Overwhelming strength', 'Lacks raw strength'],
  ['Blinding speed', 'Slow to react'],
  ['Brilliant tactician', 'Easily out-thought'],
  ['Near-impenetrable defense', 'Fragile under fire'],
  ['Devastating power output', 'Limited firepower'],
  ['Exceptional teamwork', 'Poor team player'],
];
const WEAK_TEXT: Record<Threat, string> = {
  brute: 'Vulnerable to brute-force brawlers',
  magic: 'Vulnerable to magic and the supernatural',
  tech: 'Vulnerable to advanced technology',
  mind: 'Vulnerable to mind control and illusions',
  speed: 'Vulnerable to faster opponents',
  energy: 'Vulnerable to energy blasts',
};

function build(pack: string) {
  return (r: Row): HeroCard => {
    const [name, cls, overall, rawStats, role, ability, attack, passive, weakTo, tags, clue] = r;
    const stats = rawStats.map((v) => Math.min(99, v));
    const order = stats.map((v, i) => ({ v, i })).sort((a, b) => b.v - a.v);
    return {
      kind: 'hero', id: 'h-' + slug(name), name, overall, rarity: rarityOf(overall), stats,
      trait: passive, cls, role, ability, attack, passive, weakTo, tags: tags.split(','), pack,
      strengths: [WORDS[order[0].i][0], WORDS[order[1].i][0]],
      weaknesses: [WEAK_TEXT[weakTo], WORDS[order[5].i][1]],
      clues: [`Hero class: ${cls} · Team role: ${role}`, `Primary ability: ${ability}`, `Famous for: ${clue}`],
    };
  };
}

export const HEROES: HeroCard[] = [...CORE.map(build('core')), ...EXPANSION.map(build('expansion')), ...ORIGINAL.map(build('original'))];
