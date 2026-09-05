// The timeline behind the board animation. Only the pure half is testable in
// Node — MoveAnimator itself needs requestAnimationFrame and a canvas — but the
// pure half is where the judgements are: what a move changed, and how long the
// screen spends showing it.

import test from 'node:test';
import assert from 'node:assert/strict';

import { BoardState } from '../src/core/boardState.js';
import { BLUE, ORAN } from '../src/core/constants.js';
import { diffMove, durationFor, progressAt } from '../src/ui/animation.js';
import type { MoveDiff } from '../src/ui/animation.js';

/**
 * A copy keeping the presentation fields that `clone()` drops on purpose. The
 * app diffs against the previous entry of its history, which still has them.
 */
function snapshot(board: BoardState): BoardState {
  const copy = board.clone();
  copy.mostRecent = board.mostRecent;
  copy.finalStrikeStart = board.finalStrikeStart;
  copy.finalStrikeEnd = board.finalStrikeEnd;
  return copy;
}

/** Play the moves out, holding on to the position before the last one. */
function playThrough(moves: number[]): { before: BoardState; after: BoardState } {
  const after = new BoardState();
  let before = new BoardState();
  moves.forEach((move, index) => {
    if (index === moves.length - 1) before = snapshot(after);
    after.setAt(move);
  });
  return { before, after };
}

test('a quiet move animates only the digit and the hints', () => {
  const { before, after } = playThrough([0, 1]);
  const diff = diffMove(before, after);

  assert.equal(diff.placed, 1);
  assert.equal(diff.demoted, 0);
  assert.deepEqual(diff.wonSections, []);
  assert.equal(diff.strike, false);
  assert.equal(durationFor(diff), 300);
});

test('the first move of a game has nothing to demote', () => {
  const { before, after } = playThrough([40]);

  assert.equal(before.mostRecent, -1);
  assert.equal(diffMove(before, after).demoted, -1);
});

test('taking a section is listed and lengthens the move', () => {
  // Blue's 25 completes a line in section 2. Every move here is legal under the
  // routing rule, so this goes through the real state machine.
  const { before, after } = playThrough([24, 65, 43, 48, 73, 59, 26, 80, 70, 32, 25]);
  const diff = diffMove(before, after);

  assert.equal(before.sectionWon[2], 0);
  assert.equal(after.sectionWon[2], BLUE);
  assert.deepEqual(diff.wonSections, [2]);
  assert.equal(diff.strike, false);
  assert.equal(durationFor(diff), 430);
});

test('a win by constraint reports every section it awarded at once', () => {
  const before = new BoardState();
  before.sectionWon.set([BLUE, ORAN, BLUE, ORAN, 0, 0, 0, 0, 0]);
  const after = snapshot(before);
  after.sectionWon.set([BLUE, ORAN, BLUE, ORAN, ORAN, ORAN, 0, 0, 0]);
  after.sectionWonByConstraint.set([0, 0, 0, 0, 1, 1, 0, 0, 0]);

  assert.deepEqual(diffMove(before, after).wonSections, [4, 5]);
});

test('the winning move ends with the strike bar and runs longest', () => {
  const before = new BoardState();
  const after = snapshot(before);
  after.finalStrikeStart = 0;
  after.finalStrikeEnd = 2;

  const diff = diffMove(before, after);
  assert.equal(diff.strike, true);
  assert.equal(durationFor(diff), 850);
});

/** The stages this diff actually puts on screen. */
function stagesOf(diff: MoveDiff): Array<'place' | 'hints' | 'sections' | 'strike'> {
  const stages: Array<'place' | 'hints' | 'sections' | 'strike'> = ['place', 'hints'];
  if (diff.wonSections.length > 0) stages.push('sections');
  if (diff.strike) stages.push('strike');
  return stages;
}

test('no move ends with something still moving', () => {
  const board = new BoardState();
  const quiet: MoveDiff = { placed: 0, demoted: -1, wonSections: [], strike: false };
  const section: MoveDiff = { ...quiet, wonSections: [4] };
  const win: MoveDiff = { ...section, strike: true };

  for (const diff of [quiet, section, win]) {
    const duration = durationFor(diff);
    const start = progressAt(board, diff, 0);
    const end = progressAt(board, diff, duration);
    for (const stage of stagesOf(diff)) {
      assert.equal(start[stage], 0, `${stage} at 0ms`);
      assert.equal(end[stage], 1, `${stage} at ${duration}ms`);
    }
  }
});

test('every stage stays within 0..1, before and after its own window', () => {
  const board = new BoardState();
  const diff: MoveDiff = { placed: 0, demoted: -1, wonSections: [4], strike: true };

  for (let elapsed = -50; elapsed <= 1200; elapsed += 7) {
    const at = progressAt(board, diff, elapsed);
    for (const stage of stagesOf(diff)) {
      assert.ok(at[stage] >= 0 && at[stage] <= 1, `${stage} at ${elapsed}ms: ${at[stage]}`);
    }
  }
});

test('the digit overshoots its size and settles back on it', () => {
  const board = new BoardState();
  const diff: MoveDiff = { placed: 0, demoted: -1, wonSections: [], strike: false };

  assert.ok(progressAt(board, diff, 0).placeScale < 1);
  assert.equal(progressAt(board, diff, durationFor(diff)).placeScale, 1);

  let peak = 0;
  for (let elapsed = 0; elapsed <= 200; elapsed += 1) {
    peak = Math.max(peak, progressAt(board, diff, elapsed).placeScale);
  }
  assert.ok(peak > 1 && peak < 1.1, `overshoot was ${peak}`);
});
