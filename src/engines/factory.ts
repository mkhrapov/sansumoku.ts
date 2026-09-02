// The difficulty ladder.
//
// The original's five levels were random, basic, GameplayKit's UCT, and two
// flat Monte Carlo engines at 1000 iterations. GameplayKit has no browser
// equivalent, and difficulty there was expressed by swapping engines rather than
// by giving one more time — the top two levels ran identical budgets, so level 5
// was arguably weaker than level 4 (it lacked the win-in-one check).
//
// Here levels 4 and 5 are the same UCT engine with more thinking time, which
// makes the ladder monotonic by construction. Budgets come from `npm run bench`:
// roughly 30-80k playouts per second, so a second of UCT already searches deeper
// than the original's strongest engine did.

import type { Rng } from '../core/random.js';
import type { AIEngine, Budget } from './engine.js';
import { BasicEngine } from './basicEngine.js';
import { FlatMonteCarloEngine } from './flatMonteCarlo.js';
import { RandomEngine } from './randomEngine.js';
import { UctEngine } from './uct.js';

export interface LevelInfo {
  readonly level: number;
  readonly label: string;
  readonly description: string;
}

export const LEVELS: readonly LevelInfo[] = [
  { level: 1, label: '1', description: 'Plays at random.' },
  { level: 2, label: '2', description: 'Takes a win, avoids an obvious loss.' },
  { level: 3, label: '3', description: 'Tries a few hundred random games per move.' },
  { level: 4, label: '4', description: 'Searches for one second.' },
  { level: 5, label: '5', description: 'Searches for three seconds.' },
];

export const DEFAULT_LEVEL = 3;

export function createEngine(level: number, rng: Rng, override?: Budget): AIEngine {
  switch (level) {
    case 1:
      return new RandomEngine(rng);
    case 2:
      return new BasicEngine(rng);
    case 3:
      return new FlatMonteCarloEngine(override ?? { maxPlayouts: 300 }, rng, 'level-3');
    case 4:
      return new UctEngine(override ?? { maxMs: 1000 }, rng, 'level-4');
    case 5:
      return new UctEngine(override ?? { maxMs: 3000 }, rng, 'level-5');
    default:
      throw new Error(`No such level: ${level}`);
  }
}
