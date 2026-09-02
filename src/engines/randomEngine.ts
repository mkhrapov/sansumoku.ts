// Level 1. Picks a legal move at random, and that is the whole engine —
// exactly as in SwiftRandomPlayer.swift.

import type { BoardState } from '../core/boardState.js';
import type { Rng } from '../core/random.js';
import type { AIEngine } from './engine.js';
import { pickRandom } from './engine.js';

export class RandomEngine implements AIEngine {
  readonly name = 'random';

  constructor(private readonly rng: Rng) {}

  search(board: BoardState): number {
    const moves = board.allLegalMoves();
    if (moves.length === 0) {
      throw new Error('Asked for a move on a board that has none.');
    }
    return pickRandom(moves, this.rng);
  }
}
