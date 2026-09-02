// Flat Monte Carlo — a faithful port of what the original's C and C++ engines
// actually do, despite their "monte carlo tree search" file names. There is no
// tree: every candidate move gets the same number of random playouts, and the
// one with the best total wins.
//
// Two deliberate departures from the original:
//
//  - The original scans an 81-wide score array with `>` from 0.0, so when every
//    playout loses it returns cell 0, which is usually an illegal move. Here the
//    best score is chosen among the candidates with a random tie-break, which
//    fixes that case for free.
//  - Draws are worth DRAW_VALUE, kept at the original's 0.05. That is close to
//    counting a draw as a loss, which suits a game this prone to filling up.

import { BoardState } from '../core/boardState.js';
import type { Rng } from '../core/random.js';
import type { AIEngine, Budget } from './engine.js';
import { BudgetClock, obviousMove, pickRandom, playout, reward, smartMoves } from './engine.js';

const DRAW_VALUE = 0.05;

export class FlatMonteCarloEngine implements AIEngine {
  readonly name: string;

  constructor(
    private readonly budget: Budget,
    private readonly rng: Rng,
    name = 'flat-mc',
  ) {
    this.name = name;
  }

  search(board: BoardState): number {
    const obvious = obviousMove(board, this.rng);
    if (obvious >= 0) return obvious;

    const candidates = smartMoves(board);
    if (candidates.length === 0) return pickRandom(board.allLegalMoves(), this.rng);
    if (candidates.length === 1) return candidates[0];

    const player = board.player;
    const scores = new Float64Array(candidates.length);
    const clock = new BudgetClock(this.budget);

    // Round-robin, so every candidate always has the same number of playouts
    // behind its score.
    while (!clock.exhausted()) {
      for (let i = 0; i < candidates.length; i++) {
        const state = board.clone();
        state.setAt(candidates[i]);
        scores[i] += reward(playout(state, this.rng), player, DRAW_VALUE);
      }
      clock.spend(candidates.length);
    }

    return bestScoring(candidates, scores, this.rng);
  }
}

function bestScoring(candidates: number[], scores: Float64Array, rng: Rng): number {
  let best = -1;
  const tied: number[] = [];
  for (let i = 0; i < candidates.length; i++) {
    if (scores[i] > best) {
      best = scores[i];
      tied.length = 0;
    }
    if (scores[i] === best) tied.push(candidates[i]);
  }
  return pickRandom(tied, rng);
}
