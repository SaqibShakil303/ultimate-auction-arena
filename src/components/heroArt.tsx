// Original emblem artwork for hero cards.
//
// There is no freely licensed artwork of Marvel characters, and this project does not copy
// studio images. Each hero therefore gets an ORIGINAL emblem: a generic symbol that hints at the
// character's powers (a hammer, a shield, a moon…) on an energy-core backdrop coloured by class.
// These are placeholders by design — they are not likenesses of any copyrighted character.

import { useId } from 'react';
import {
  Anchor, Atom, Axe, Biohazard, Binoculars, Bird, Bomb, BookOpen, Bot, BicepsFlexed, Brain, Bug, Castle, Cat, CircleDot,
  CloudLightning, Cog, Compass, Cpu, Crosshair, Crown, Diamond, Dna, Drama, Droplet, Eye, EyeOff, Feather, Fingerprint,
  Flame, FlaskConical, Flower2, Gavel, Gem, Ghost, Glasses, Hammer, Hand, Headphones, HeartPulse, Hourglass, Infinity as InfinityIcon,
  Laugh, Leaf, Lightbulb, Magnet, Minimize2, Moon, Mountain, Music, Network, Orbit, PawPrint, Radar, Rocket, Satellite, Scale,
  Send, Shield, ShieldHalf, ShieldPlus, Skull, Snowflake, Sparkles, Sprout, Star, Sun, Sword, Swords, Target, Timer, Tornado,
  TreePine, WandSparkles, Waves, Wind, Zap, type LucideIcon,
} from 'lucide-react';
import type { HeroCard, HeroClass } from '../../shared/types';
import { hashStr } from '../../shared/util';

const CLASS_ICON: Record<HeroClass, LucideIcon> = { Tank: Shield, Damage: Zap, Mystic: Sparkles, Tech: Cpu, Controller: Orbit, Support: HeartPulse };
/** Base hue per class; each hero shifts a little so no two emblems look identical. */
const CLASS_HUE: Record<HeroClass, number> = { Tank: 214, Damage: 8, Mystic: 284, Tech: 190, Controller: 250, Support: 146 };

const ICONS: Record<string, LucideIcon> = {
  // Marvel-inspired core roster — generic symbols only
  'Iron Man': Atom, Thor: Hammer, Hulk: BicepsFlexed, 'Captain America': Shield, 'Black Widow': Crosshair, Hawkeye: Target,
  'Doctor Strange': Eye, 'Scarlet Witch': Sparkles, 'Spider-Man': Bug, 'Black Panther': Cat, 'Ant-Man': Minimize2, Wasp: Feather,
  Vision: Gem, 'Captain Marvel': Star, Loki: Drama, 'Winter Soldier': Snowflake, Falcon: Bird, 'War Machine': Rocket,
  'Star-Lord': Headphones, Gamora: Sword, Groot: TreePine, 'Rocket Raccoon': Bomb, Drax: Swords, Nebula: Orbit, Mantis: Leaf,
  Shuri: FlaskConical, Okoye: ShieldHalf, Valkyrie: Axe, Wong: BookOpen, 'Nick Fury': Binoculars, Daredevil: Scale,
  Wolverine: PawPrint, Deadpool: Laugh, Storm: CloudLightning, 'Professor X': Brain, 'Jean Grey': Flame, Cyclops: Glasses,
  'Shang-Chi': CircleDot, 'Moon Knight': Moon, 'She-Hulk': Gavel, 'Ms. Marvel': Hand, 'Silver Surfer': Waves, Quicksilver: Wind,
  Nightcrawler: Ghost, 'Mister Fantastic': InfinityIcon, 'Invisible Woman': EyeOff, 'Human Torch': Sun, 'The Thing': Mountain,
  // villains expansion
  Thanos: Diamond, Ultron: Bot, Hela: Crown, Killmonger: Cat, 'Green Goblin': Bomb, 'Doctor Octopus': Network, Venom: Droplet,
  Magneto: Magnet, 'Doctor Doom': Castle, Kang: Hourglass, 'Red Skull': Skull, Mysterio: Glasses, Dormammu: Flame,
  Juggernaut: Mountain, Mystique: Drama, Abomination: Biohazard,
  // original heroes
  'Aegis Prime': ShieldPlus, 'Bastion Rook': Castle, Ironroot: Sprout, Magnaforge: Flame, Tidewall: Waves, 'Granite Vow': Mountain,
  Colossa: BicepsFlexed, Voltara: Zap, 'Ember Lynx': Cat, Riftblade: Sword, 'Sable Comet': Send, 'Kestrel Nine': Crosshair,
  Thornstrike: Flower2, 'Nova Jackal': Sun, 'Crimson Tempo': Music, 'Nyx Oracle': Eye, Starweaver: Star, 'Hollow Saint': Ghost,
  Runebinder: BookOpen, 'Astral Monk': WandSparkles, 'Lady Eclipse': Moon, Cipher: Fingerprint, Gearhawk: Cog, 'Photon Jack': Lightbulb,
  'Nanite Queen': Dna, 'Circuit Sage': Cpu, 'Drone Marshal': Satellite, 'Quantum Fox': Atom, Mindloom: Brain, Gravitas: Anchor,
  Frostline: Snowflake, 'Echo Maze': Radar, 'Tempest Warden': Tornado, 'Chrono Wren': Timer, Halcyon: Bird, Beacon: Lightbulb,
  Lifebloom: Leaf, 'Rally Kite': Wind, 'Mender Vale': HeartPulse, 'Captain Meridian': Compass,
};

export function heroIcon(card: HeroCard): LucideIcon {
  return ICONS[card.name] ?? CLASS_ICON[card.cls];
}
export function heroHues(card: HeroCard): [number, number] {
  const h = (CLASS_HUE[card.cls] + (hashStr(card.name) % 44) - 22 + 360) % 360;
  return [h, (h + 38 + (hashStr(card.id) % 30)) % 360];
}

export function HeroArt({ card }: { card: HeroCard }) {
  const id = useId().replace(/[^a-zA-Z0-9]/g, '');
  const [h1, h2] = heroHues(card);
  const Icon = heroIcon(card);
  const villain = card.tags.includes('villain');
  const spin = (hashStr(card.name) % 360);
  return (
    <>
      <svg viewBox="0 0 200 200" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
        <defs>
          <radialGradient id={`bg${id}`} cx="50%" cy="46%" r="70%">
            <stop offset="0" stopColor={`hsl(${h1} 95% 62%)`} stopOpacity="0.95" />
            <stop offset="0.42" stopColor={`hsl(${h2} 85% 42%)`} stopOpacity="0.8" />
            <stop offset="1" stopColor={villain ? '#16040f' : '#070a1c'} />
          </radialGradient>
          <radialGradient id={`core${id}`} cx="50%" cy="50%" r="50%">
            <stop offset="0" stopColor="#fff" stopOpacity="0.95" />
            <stop offset="0.55" stopColor={`hsl(${h1} 100% 78%)`} stopOpacity="0.5" />
            <stop offset="1" stopColor={`hsl(${h1} 100% 60%)`} stopOpacity="0" />
          </radialGradient>
        </defs>
        <rect width="200" height="200" fill={`url(#bg${id})`} />
        <g transform={`rotate(${spin} 100 96)`} opacity="0.55">
          {Array.from({ length: 12 }, (_, i) => (
            <path key={i} d="M100 96 L92 -40 L108 -40 Z" transform={`rotate(${i * 30} 100 96)`} fill="#fff" opacity={i % 2 ? 0.07 : 0.14} />
          ))}
        </g>
        <circle cx="100" cy="96" r="62" fill="none" stroke={`hsl(${h1} 100% 80%)`} strokeOpacity="0.5" strokeWidth="1.2" strokeDasharray="3 7" />
        <circle cx="100" cy="96" r="50" fill="#060918" fillOpacity="0.5" stroke="#fff" strokeOpacity="0.55" strokeWidth="1.6" />
        <circle cx="100" cy="96" r="48" fill={`url(#core${id})`} opacity="0.45" />
        <path d="M100 30l57 33v66l-57 33-57-33V63z" fill="none" stroke={`hsl(${h2} 100% 78%)`} strokeOpacity="0.35" strokeWidth="1.4" />
      </svg>
      <span className="uc-emblem" style={{ color: '#fff', filter: `drop-shadow(0 0 6px hsl(${h1} 100% 70%)) drop-shadow(0 2px 4px rgba(0,0,0,.6))` }}>
        <Icon strokeWidth={1.7} aria-hidden="true" />
      </span>
    </>
  );
}
