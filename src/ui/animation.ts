// Move animation: what a move changed, how far along each part of that change
// is, and the loop that walks the board from one position to the next.
//
// The view is a pure repaint from state, and it stays that way. A move is
// described here as a diff against the previous position, and a frame is that
// diff plus a handful of 0..1 progress values; the view interpolates, the
// animator does the timing, and neither needs to know the other's business.
// Nothing in this file mutates a board.

import { BLUE, ORAN, SECTION_COUNT } from '../core/constants.js';
import type { BoardState } from '../core/boardState.js';

/** What changed between two positions, as far as the screen is concerned. */
export interface MoveDiff {
  /** The cell just played. */
  placed: number;
  /** The cell that held the "most recent" highlight before this move, or -1. */
  demoted: number;
  /**
   * Sections that this move handed to a player. Usually none or one, but a
   * win by constraint can award several at once, and the deadlock loop can go
   * round more than once, so this is a list.
   */
  wonSections: number[];
  /** Whether this move ended the game with a line of three sections. */
  strike: boolean;
}

/**
 * The stages of a move, in milliseconds from its start. They overlap: the
 * playable-cell hints begin swapping over while the new digit is still landing,
 * and a section starts closing over its digits a moment after that.
 */
const PLACE = { from: 0, ms: 170 };
const HINTS = { from: 110, ms: 190 };
const SECTIONS = { from: 150, ms: 280 };
const STRIKE = { from: 430, ms: 420 };

/**
 * How long this move takes. A quiet move is over in 300ms — short enough that
 * a fast engine's reply never feels queued behind it — and only the two moves
 * worth pausing on, taking a section and winning, run longer.
 */
export function durationFor(diff: MoveDiff): number {
  if (diff.strike) return STRIKE.from + STRIKE.ms;
  if (diff.wonSections.length > 0) return SECTIONS.from + SECTIONS.ms;
  return HINTS.from + HINTS.ms;
}

export function diffMove(before: BoardState, after: BoardState): MoveDiff {
  const wonSections: number[] = [];
  for (let section = 0; section < SECTION_COUNT; section++) {
    const owner = after.sectionWon[section];
    if ((owner === BLUE || owner === ORAN) && before.sectionWon[section] !== owner) {
      wonSections.push(section);
    }
  }

  return {
    placed: after.mostRecent,
    demoted: before.mostRecent,
    wonSections,
    strike: after.finalStrikeStart >= 0 && before.finalStrikeStart < 0,
  };
}

/** One frame of a move: everything the view needs beyond the position itself. */
export interface MoveProgress {
  /** The position before the move, for cross-fading the hints out of it. */
  previous: BoardState;
  diff: MoveDiff;
  /** The new digit's colour and opacity. */
  place: number;
  /** The new digit's size. Overshoots 1 slightly, so the digit lands. */
  placeScale: number;
  /** The cross-fade between the two sets of playable-cell hints. */
  hints: number;
  /** How far a newly taken section has closed over its digits. */
  sections: number;
  /** How much of the winning bar is drawn. */
  strike: number;
}

export function progressAt(previous: BoardState, diff: MoveDiff, elapsed: number): MoveProgress {
  const placed = stage(elapsed, PLACE);
  return {
    previous,
    diff,
    place: easeOut(placed),
    placeScale: 0.5 + 0.5 * easeOutBack(placed),
    hints: easeOut(stage(elapsed, HINTS)),
    sections: easeOut(stage(elapsed, SECTIONS)),
    strike: easeOut(stage(elapsed, STRIKE)),
  };
}

function stage(elapsed: number, { from, ms }: { from: number; ms: number }): number {
  return Math.min(1, Math.max(0, (elapsed - from) / ms));
}

function easeOut(t: number): number {
  return 1 - (1 - t) ** 3;
}

/** Overshoots its target and settles back. Mild: a digit, not a beach ball. */
function easeOutBack(t: number): number {
  const back = 1.2;
  return 1 + (back + 1) * (t - 1) ** 3 + back * (t - 1) ** 2;
}

interface Step {
  previous: BoardState;
  next: BoardState;
  diff: MoveDiff;
  duration: number;
}

export interface AnimatorHooks {
  /** Paint one frame. `progress` is null for a position at rest. */
  paint: (board: BoardState, progress: MoveProgress | null) => void;
  /** Called whenever the board comes to rest, so the controls can catch up. */
  settled: () => void;
}

/**
 * Plays moves one after another.
 *
 * Moves have to queue rather than interrupt each other: the engine runs in a
 * worker and its reply can land while your own move is still in the air, and at
 * level 1 it always does. Anything that is not a move — New Game, Undo, a
 * resize — cuts straight to the position instead.
 */
export class MoveAnimator {
  private readonly queue: Step[] = [];
  private step: Step | null = null;
  private startedAt = 0;
  private frame = 0;
  /** Honour the reduced-motion setting by skipping the animation entirely. */
  private readonly stillness = window.matchMedia('(prefers-reduced-motion: reduce)');

  constructor(
    private readonly hooks: AnimatorHooks,
    private displayed: BoardState,
  ) {}

  /** Whether a move is still playing out. */
  get busy(): boolean {
    return this.step !== null;
  }

  /** Animate the move that turned `previous` into `next`. */
  play(previous: BoardState, next: BoardState): void {
    if (this.stillness.matches) {
      this.snap(next);
      return;
    }
    const diff = diffMove(previous, next);
    this.queue.push({ previous, next, diff, duration: durationFor(diff) });
    if (this.step === null) this.advance();
  }

  /** Show a position at once, dropping anything queued behind it. */
  snap(board: BoardState): void {
    if (this.frame !== 0) cancelAnimationFrame(this.frame);
    this.frame = 0;
    this.step = null;
    this.queue.length = 0;
    this.displayed = board;
    this.hooks.paint(board, null);
  }

  /** Cut to the end of what is playing. A click on the board asks for this. */
  skip(): void {
    const last = this.queue.length > 0 ? this.queue[this.queue.length - 1] : this.step;
    if (last === null) return;
    this.snap(last.next);
    this.hooks.settled();
  }

  /** Repaint after a resize or a palette change; a running move repaints itself. */
  redraw(): void {
    if (this.step === null) this.hooks.paint(this.displayed, null);
  }

  private advance(): void {
    const step = this.queue.shift();
    if (step === undefined) {
      this.step = null;
      this.hooks.settled();
      return;
    }
    this.step = step;
    this.startedAt = performance.now();
    this.frame = requestAnimationFrame(this.tick);
  }

  private readonly tick = (now: number): void => {
    const step = this.step;
    if (step === null) return;

    this.displayed = step.next;
    const elapsed = now - this.startedAt;

    // A backgrounded tab stops sending frames, so this can be well past the
    // end when it comes back. Landing on the final position is the whole point.
    if (elapsed >= step.duration) {
      this.frame = 0;
      this.hooks.paint(step.next, null);
      this.advance();
      return;
    }

    this.hooks.paint(step.next, progressAt(step.previous, step.diff, elapsed));
    this.frame = requestAnimationFrame(this.tick);
  };
}
