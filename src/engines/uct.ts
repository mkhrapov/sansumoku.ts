// Real Monte Carlo tree search, with UCT selection.
//
// This is the one engine with no counterpart in the original. Its levels 3-5
// were flat Monte Carlo and Apple's GKMonteCarloStrategist, and the latter has
// no browser equivalent. Flat Monte Carlo throws away everything it learns below
// the first ply; UCT keeps it, so at an equal number of playouts it spends far
// more of them on the moves that are actually still in contention.

import { BoardState } from '../core/boardState.js';
import { otherPlayer } from '../core/constants.js';
import type { Marker, Player } from '../core/constants.js';
import type { Rng } from '../core/random.js';
import type { AIEngine, Budget } from './engine.js';
import { BudgetClock, obviousMove, pickRandom, playout, reward } from './engine.js';

/** The UCB1 exploration weight. sqrt(2) is the standard choice for 0/1 rewards. */
const EXPLORATION = Math.SQRT2;

/**
 * A draw counts as half a win. The flat Monte Carlo engine uses the original's
 * 0.05 instead; here the tree needs the more even value to compare lines that
 * differ only in how likely they are to fill the board.
 */
const DRAW_VALUE = 0.5;

interface Node {
  /** The move that led to this position, or -1 at the root. */
  readonly move: number;
  /** The player who made that move, and whose perspective `score` is in. */
  readonly player: Player;
  readonly parent: Node | null;
  children: Node[];
  /** Moves from this position that have not been expanded yet. */
  untried: number[];
  visits: number;
  score: number;
}

export class UctEngine implements AIEngine {
  readonly name: string;

  constructor(
    private readonly budget: Budget,
    private readonly rng: Rng,
    name = 'uct',
  ) {
    this.name = name;
  }

  search(board: BoardState): number {
    const obvious = obviousMove(board, this.rng);
    if (obvious >= 0) return obvious;

    const root: Node = {
      move: -1,
      player: otherPlayer(board.player),
      parent: null,
      children: [],
      untried: board.allLegalMoves(),
      visits: 0,
      score: 0,
    };

    const clock = new BudgetClock(this.budget);
    while (!clock.exhausted()) {
      const state = board.clone();
      const leaf = this.descend(root, state);
      const expanded = this.expand(leaf, state);
      const winner = playout(state, this.rng);
      backPropagate(expanded, winner);
      clock.spend();
    }

    return this.mostVisitedMove(root);
  }

  /** Walk down through fully expanded nodes, following UCB1. */
  private descend(root: Node, state: BoardState): Node {
    let node = root;
    while (node.untried.length === 0 && node.children.length > 0) {
      node = bestChild(node);
      state.setAt(node.move);
    }
    return node;
  }

  /** Add one child for an untried move, if there is one. */
  private expand(node: Node, state: BoardState): Node {
    if (node.untried.length === 0 || state.isTerminal()) return node;

    const index = this.rng.nextInt(node.untried.length);
    const move = node.untried[index];
    node.untried[index] = node.untried[node.untried.length - 1];
    node.untried.pop();

    const mover = state.player;
    state.setAt(move);

    const child: Node = {
      move,
      player: mover,
      parent: node,
      children: [],
      untried: state.allLegalMoves(),
      visits: 0,
      score: 0,
    };
    node.children.push(child);
    return child;
  }

  /**
   * The most-visited move, not the best-scoring one. A high score off two visits
   * is noise; visit count is what the search actually committed to.
   */
  private mostVisitedMove(root: Node): number {
    let best = -1;
    let tied: number[] = [];
    for (const child of root.children) {
      if (child.visits > best) {
        best = child.visits;
        tied = [];
      }
      if (child.visits === best) tied.push(child.move);
    }
    if (tied.length === 0) {
      // The budget ran out before a single playout finished.
      return pickRandom(root.untried, this.rng);
    }
    return pickRandom(tied, this.rng);
  }
}

function bestChild(node: Node): Node {
  const logVisits = Math.log(node.visits);
  let best: Node = node.children[0];
  let bestValue = -Infinity;
  for (const child of node.children) {
    const exploitation = child.score / child.visits;
    const exploration = EXPLORATION * Math.sqrt(logVisits / child.visits);
    const value = exploitation + exploration;
    if (value > bestValue) {
      bestValue = value;
      best = child;
    }
  }
  return best;
}

function backPropagate(from: Node, winner: Marker): void {
  for (let node: Node | null = from; node !== null; node = node.parent) {
    node.visits += 1;
    node.score += reward(winner, node.player, DRAW_VALUE);
  }
}
