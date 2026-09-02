// The engine interface and the pieces every engine shares.
//
// The original's AIEngine protocol is `search() -> (Int, Int)` plus
// `setBoardState(_:)`. Here `search` simply takes the board, which removes the
// mutable field and makes engines safe to reuse across games.

import { BoardState } from '../core/boardState.js';
import { DONE } from '../core/constants.js';
import type { Marker, Player } from '../core/constants.js';
import type { Rng } from '../core/random.js';

/**
 * How long an engine may think. `maxPlayouts` keeps tests reproducible;
 * `maxMs` keeps the browser responsive. Given both, whichever runs out first
 * stops the search.
 */
export interface Budget {
  maxPlayouts?: number;
  maxMs?: number;
}

export interface AIEngine {
  readonly name: string;
  /** The chosen move, as a cell index. */
  search(board: BoardState): number;
}

/**
 * The four corners and the centre of the middle section. The original opens
 * from this book rather than searching an empty board, where every one of the
 * 81 moves looks alike.
 */
export const OPENING_BOOK: readonly number[] = [30, 32, 40, 48, 50];

export function pickRandom<T>(items: readonly T[], rng: Rng): T {
  return items[rng.nextInt(items.length)];
}

/** Play uniformly at random to the end. Mutates `state`. */
export function playout(state: BoardState, rng: Rng): Marker {
  while (!state.isTerminal()) {
    const move = state.randomLegalMove(rng);
    if (move < 0) {
      throw new Error('Non-terminal board with no legal move — constraint processing is broken.');
    }
    state.setAt(move);
  }
  return state.gameWon;
}

/** A move that wins outright, or -1. */
export function immediatelyWinningMove(board: BoardState): number {
  const player = board.player;
  for (const move of board.allLegalMoves()) {
    const child = board.clone();
    child.setAt(move);
    if (child.gameWon === player) return move;
  }
  return -1;
}

/**
 * Moves that do not hand the opponent an immediate win. If every move loses,
 * the caller falls back to the full list — there is nothing better to do.
 */
export function smartMoves(board: BoardState): number[] {
  const smart: number[] = [];
  for (const move of board.allLegalMoves()) {
    const child = board.clone();
    child.setAt(move);
    if (child.isTerminal() || immediatelyWinningMove(child) < 0) smart.push(move);
  }
  return smart;
}

/**
 * The shortcuts every searching engine takes before it starts thinking:
 * the opening book, a forced move, and a win in one. Returns -1 when the
 * position actually needs searching.
 */
export function obviousMove(board: BoardState, rng: Rng): number {
  if (board.isInitialState()) return pickRandom(OPENING_BOOK, rng);

  const moves = board.allLegalMoves();
  if (moves.length === 0) {
    throw new Error('Asked for a move on a board that has none.');
  }
  if (moves.length === 1) return moves[0];

  return immediatelyWinningMove(board);
}

/** What a finished playout is worth to `player`. */
export function reward(winner: Marker, player: Player, drawValue: number): number {
  if (winner === player) return 1;
  if (winner === DONE) return drawValue;
  return 0;
}

/** Tracks a budget across a search. */
export class BudgetClock {
  private readonly maxPlayouts: number;
  private readonly deadline: number;
  private spent = 0;

  constructor(budget: Budget) {
    this.maxPlayouts = budget.maxPlayouts ?? Number.POSITIVE_INFINITY;
    this.deadline =
      budget.maxMs === undefined ? Number.POSITIVE_INFINITY : performance.now() + budget.maxMs;
  }

  get playouts(): number {
    return this.spent;
  }

  spend(count = 1): void {
    this.spent += count;
  }

  exhausted(): boolean {
    if (this.spent >= this.maxPlayouts) return true;
    return performance.now() >= this.deadline;
  }
}
