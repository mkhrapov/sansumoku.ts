// Level 2. One ply of foresight in each direction: take a win if there is one,
// otherwise avoid any move that lets the opponent win at once. Ported from
// SwiftBasicPlayer.swift.

import type { BoardState } from '../core/boardState.js';
import type { Rng } from '../core/random.js';
import type { AIEngine } from './engine.js';
import { obviousMove, pickRandom, smartMoves } from './engine.js';

export class BasicEngine implements AIEngine {
  readonly name = 'basic';

  constructor(private readonly rng: Rng) {}

  search(board: BoardState): number {
    const obvious = obviousMove(board, this.rng);
    if (obvious >= 0) return obvious;

    const smart = smartMoves(board);
    if (smart.length > 0) return pickRandom(smart, this.rng);

    // Every move loses. Pick one and hope the opponent misses it.
    return pickRandom(board.allLegalMoves(), this.rng);
  }
}
