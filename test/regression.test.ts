// The constraint-deadlock cascade.
//
// Ported verbatim from testRecursiveConstraintProcessing in
// SansumokuTests/SansumokuTests.swift. This exact position crashed the original
// with "State is not terminal, but move count is zero" back when constraint
// processing ran only once instead of repeating.
//
// Playing (8, 0) fills all but one cell of section 2 and sends Orange there,
// where the last cell is blocked by a 9 in its row. Section 2 is forfeited to
// Blue. That reopens section 5, whose every empty cell is blocked too, so it is
// forfeited as well — which decides the last open section and ends the game as a
// draw.
//
// Two rounds of forfeiting is the point: an implementation that resolves the
// deadlock once would stop after section 2 and hand back a non-terminal board
// with no legal move.

import test from 'node:test';
import assert from 'node:assert/strict';

import { BLUE, DONE, OPEN } from '../src/core/constants.js';
import { boardFrom, cellsSet } from './fixtures.js';

const CELL_OCCUPIED = [
  0, 1, 1, 2, 1, 2, 2, 1, 0, 0, 0, 1, 2, 1, 2, 1, 1, 2, 0, 2, 1, 1, 2, 1, 0, 2, 1,
  2, 1, 2, 0, 2, 0, 2, 1, 1, 2, 1, 2, 0, 0, 0, 1, 2, 1, 1, 2, 1, 2, 0, 2, 2, 2, 0,
  1, 0, 2, 0, 0, 0, 2, 2, 1, 1, 2, 0, 1, 1, 1, 2, 0, 1, 2, 1, 1, 0, 0, 1, 2, 2, 2,
];

const CELL_VALUE = [
  0, 2, 5, 7, 4, 1, 3, 6, 0, 0, 0, 4, 2, 3, 5, 1, 7, 4, 0, 1, 3, 6, 9, 8, 0, 5, 2,
  4, 8, 1, 0, 2, 0, 6, 3, 7, 5, 3, 2, 0, 0, 0, 4, 8, 1, 7, 9, 6, 1, 0, 3, 5, 2, 0,
  1, 0, 5, 0, 0, 0, 2, 4, 3, 2, 7, 0, 3, 1, 4, 7, 0, 6, 3, 6, 4, 0, 0, 2, 8, 1, 5,
];

function deadlockPosition() {
  return boardFrom({
    player: BLUE,
    gameWon: OPEN,
    cellOccupied: CELL_OCCUPIED,
    cellValue: CELL_VALUE,
    sectionWon: [1, 3, 0, 3, 2, 0, 2, 1, 2],
    sectionAllowed: [0, 0, 1, 0, 0, 1, 0, 0, 0],
    sectionNextValue: [6, 10, 8, 10, 4, 9, 8, 5, 9],
    cellAllowed: cellsSet(8),
    sectionWonByConstraint: [0, 0, 0, 0, 1, 0, 0, 0, 0],
  });
}

test('the fixture arrays are the right length', () => {
  assert.equal(CELL_OCCUPIED.length, 81);
  assert.equal(CELL_VALUE.length, 81);
});

test('a cascading constraint deadlock terminates the game', () => {
  const board = deadlockPosition();

  board.set(8, 0);

  assert.ok(board.isTerminal(), 'board must be terminal after the cascade');
  assert.equal(board.countLegalMoves(), 0);
});

test('the cascade awards the remaining section and draws the game', () => {
  const board = deadlockPosition();

  board.set(8, 0);

  // Both sections go to Blue by constraint, one per round of the cascade.
  assert.equal(board.sectionWon[2], BLUE);
  assert.equal(board.sectionWon[5], BLUE);
  assert.equal(board.sectionWonByConstraint[2], 1, 'section 2 forfeited in round 1');
  assert.equal(board.sectionWonByConstraint[5], 1, 'section 5 forfeited in round 2');

  // The move itself was ordinary: section 2's counter was at 8.
  assert.equal(board.cellValue[8], 8);

  // No section is left open, and no line of three sections is one colour.
  assert.ok(!board.sectionWon.includes(OPEN));
  assert.equal(board.gameWon, DONE);
});
