import test from 'node:test';
import assert from 'node:assert/strict';

import { BoardState } from '../src/core/boardState.js';
import { BLUE, DONE, OPEN, ORAN } from '../src/core/constants.js';
import { makeRng } from '../src/core/random.js';
import { boardFrom, cellsSet, sectionsSet } from './fixtures.js';
import type { BoardFixture } from './fixtures.js';

test('a new board is wide open and Blue moves first', () => {
  const board = new BoardState();

  assert.equal(board.player, BLUE);
  assert.equal(board.gameWon, OPEN);
  assert.ok(board.isInitialState());
  assert.equal(board.countLegalMoves(), 81);
  assert.ok(board.sectionNextValue.every((digit) => digit === 1));
});

test('a move sends the opponent to the section matching its position in its own', () => {
  const board = new BoardState();

  // (0, 0) is the top-left cell of its section, so it sends Orange to section 0.
  board.set(0, 0);

  assert.equal(board.player, ORAN);
  assert.deepEqual(board.allLegalMoves(), [1, 2, 9, 10, 11, 18, 19, 20]);
});

test('a section hands out digits 1..9 in order, so the digit is never chosen', () => {
  const board = new BoardState();

  board.set(0, 0);
  assert.equal(board.cellValue[0], 1);
  assert.equal(board.sectionNextValue[0], 2);

  board.set(1, 0);
  assert.equal(board.cellValue[1], 2);
  assert.equal(board.sectionNextValue[0], 3);
});

test('a digit already in the row blocks the cells that would repeat it', () => {
  const board = new BoardState();

  board.set(0, 0); // Blue plays 1 at the top-left corner, then Orange...
  board.set(1, 0); // ...plays 2 beside it, sending Blue to section 1.

  // Section 1 must play a 1, but its top row shares row 0 with the 1 at (0, 0).
  assert.deepEqual(board.allLegalMoves(), [12, 13, 14, 21, 22, 23]);
});

test('winning a section erases its cells from the Sudoku constraints', () => {
  // Orange is about to play at (1, 3), which sends Blue to section 1. Section 1
  // must play a 1, and its top row shares row 0 with the 1 sitting at (0, 0).
  const fixture: BoardFixture = {
    player: ORAN,
    cellOccupied: cellsSet(0).map((flag) => flag * BLUE),
    cellValue: cellsSet(0),
    cellAllowed: cellsSet(28),
    sectionAllowed: sectionsSet(3),
  };

  const stillOpen = boardFrom({ ...fixture, sectionWon: [OPEN, 0, 0, 0, 0, 0, 0, 0, 0] });
  stillOpen.set(1, 3);
  assert.deepEqual(
    stillOpen.allLegalMoves(),
    [12, 13, 14, 21, 22, 23],
    'while section 0 is open its 1 still constrains row 0',
  );

  const alreadyWon = boardFrom({ ...fixture, sectionWon: [BLUE, 0, 0, 0, 0, 0, 0, 0, 0] });
  alreadyWon.set(1, 3);
  assert.deepEqual(
    alreadyWon.allLegalMoves(),
    [3, 4, 5, 12, 13, 14, 21, 22, 23],
    'once Blue owns section 0 its 1 constrains nothing',
  );
});

test('a decided target section frees the opponent to play anywhere still open', () => {
  const board = boardFrom({
    player: ORAN,
    cellAllowed: cellsSet(28),
    sectionAllowed: sectionsSet(3),
    // Section 1 is where (1, 3) would send Blue, but Blue already owns it.
    sectionWon: [OPEN, BLUE, OPEN, OPEN, OPEN, OPEN, OPEN, OPEN, OPEN],
  });

  board.set(1, 3);

  assert.equal(board.sectionAllowed[1], 0, 'a decided section is never allowed');
  assert.equal(
    board.sectionAllowed.reduce((sum, flag) => sum + flag, 0),
    8,
    'every other section is open to Blue',
  );
});

test('three in a row wins a section whatever the digits are', () => {
  // Blue holds the top-left and top-middle of section 0, with unrelated digits.
  const board = boardFrom({
    player: BLUE,
    cellOccupied: [BLUE, BLUE, ...new Array<number>(79).fill(0)],
    cellValue: [3, 7, ...new Array<number>(79).fill(0)],
    cellAllowed: cellsSet(2),
    sectionAllowed: sectionsSet(0),
    sectionNextValue: [5, 1, 1, 1, 1, 1, 1, 1, 1],
  });

  board.set(2, 0);

  assert.equal(board.cellValue[2], 5, 'the digit played is whatever the section owed');
  assert.equal(board.sectionWon[0], BLUE, 'ownership wins the section, not the digits');
});

test('a full section nobody won is marked DONE rather than awarded', () => {
  // Section 0 has eight cells filled with no line; Orange fills the last one.
  const occupied = new Array<number>(81).fill(0);
  const values = new Array<number>(81).fill(0);
  const layout = [BLUE, BLUE, ORAN, ORAN, ORAN, BLUE, BLUE, ORAN, 0];
  const cells = [0, 1, 2, 9, 10, 11, 18, 19, 20];
  cells.forEach((cell, i) => {
    occupied[cell] = layout[i];
    values[cell] = i + 1;
  });

  const board = boardFrom({
    player: ORAN,
    cellOccupied: occupied,
    cellValue: values,
    cellAllowed: cellsSet(20),
    sectionAllowed: sectionsSet(0),
    sectionNextValue: [9, 1, 1, 1, 1, 1, 1, 1, 1],
  });

  board.set(2, 2);

  assert.equal(board.sectionWon[0], DONE);
});

test('clone copies the arrays instead of aliasing them', () => {
  const board = new BoardState();
  board.set(4, 4);

  const child = board.clone();
  child.set(3, 3);

  assert.equal(board.cellOccupied[30], OPEN, 'the parent must not see the child move');
  assert.notEqual(child.cellOccupied[30], OPEN);
  assert.equal(board.player, ORAN);
  assert.equal(child.player, BLUE);
});

test('a board survives a round trip through its plain form', () => {
  const board = new BoardState();
  board.set(4, 4);
  board.set(3, 3);

  const copy = BoardState.fromPlain(board.toPlain());

  assert.deepEqual(Array.from(copy.cellOccupied), Array.from(board.cellOccupied));
  assert.deepEqual(Array.from(copy.cellValue), Array.from(board.cellValue));
  assert.deepEqual(Array.from(copy.cellAllowed), Array.from(board.cellAllowed));
  assert.deepEqual(Array.from(copy.sectionWon), Array.from(board.sectionWon));
  assert.deepEqual(Array.from(copy.sectionNextValue), Array.from(board.sectionNextValue));
  assert.equal(copy.player, board.player);
  assert.equal(copy.gameWon, board.gameWon);
});

test('random games always terminate legally', () => {
  const rng = makeRng(20260902);
  const outcomes = { [BLUE]: 0, [ORAN]: 0, [DONE]: 0 } as Record<number, number>;

  for (let game = 0; game < 400; game++) {
    const board = new BoardState();
    let moves = 0;

    while (!board.isTerminal()) {
      const move = board.randomLegalMove(rng);
      assert.notEqual(move, -1, 'a non-terminal board always offers a move');
      assert.equal(board.cellOccupied[move], OPEN, 'an allowed cell is always empty');
      assert.ok(board.allLegalMoves().includes(move));

      board.setAt(move);
      moves++;
      assert.ok(moves <= 81, 'a game cannot outlast the board');
    }

    assert.ok([BLUE, ORAN, DONE].includes(board.gameWon));
    outcomes[board.gameWon]++;
  }

  // Not a strict rule, but all three outcomes should show up in 400 games.
  assert.ok(outcomes[BLUE] > 0 && outcomes[ORAN] > 0 && outcomes[DONE] > 0);
});
