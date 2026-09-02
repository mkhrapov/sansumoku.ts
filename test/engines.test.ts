import test from 'node:test';
import assert from 'node:assert/strict';

import { BoardState } from '../src/core/boardState.js';
import { BLUE, DONE, OPEN, ORAN } from '../src/core/constants.js';
import { makeRng } from '../src/core/random.js';
import { createEngine } from '../src/engines/factory.js';
import { immediatelyWinningMove, smartMoves } from '../src/engines/engine.js';
import { boardFrom, cellsSet, sectionsSet } from './fixtures.js';

const LEVELS = [1, 2, 3, 4, 5];
/** Small budgets keep these tests fast; strength is measured by the playoff. */
const TEST_BUDGET = { maxPlayouts: 200 };

function engineFor(level: number, seed = 7) {
  return createEngine(level, makeRng(seed), TEST_BUDGET);
}

/** Blue owns sections 0 and 1, and can take section 2 — and the game — at cell 8. */
function winInOnePosition(): BoardState {
  return boardFrom({
    player: BLUE,
    cellOccupied: (() => {
      const cells = new Array<number>(81).fill(0);
      cells[6] = BLUE;
      cells[7] = BLUE;
      return cells;
    })(),
    cellValue: (() => {
      const values = new Array<number>(81).fill(0);
      values[6] = 1;
      values[7] = 2;
      return values;
    })(),
    sectionWon: [BLUE, BLUE, OPEN, OPEN, OPEN, OPEN, OPEN, OPEN, OPEN],
    sectionAllowed: sectionsSet(2),
    cellAllowed: cellsSet(8, 15, 16),
    sectionNextValue: [1, 1, 3, 1, 1, 1, 1, 1, 1],
  });
}

test('the win-in-one position really does offer a win', () => {
  const board = winInOnePosition();
  assert.equal(immediatelyWinningMove(board), 8);

  const winner = board.clone();
  winner.setAt(8);
  assert.equal(winner.gameWon, BLUE);
});

for (const level of LEVELS) {
  test(`level ${level} returns a legal move from many positions`, () => {
    const rng = makeRng(100 + level);
    const engine = engineFor(level);

    for (let game = 0; game < 5; game++) {
      const board = new BoardState();
      while (!board.isTerminal()) {
        const move = engine.search(board);
        assert.ok(board.legalPlayAt(move), `level ${level} returned illegal cell ${move}`);
        // Advance with a random move so positions vary between games.
        board.setAt(game === 0 ? move : board.randomLegalMove(rng));
      }
    }
  });
}

for (const level of [2, 3, 4, 5]) {
  test(`level ${level} takes a win that is one move away`, () => {
    assert.equal(engineFor(level).search(winInOnePosition()), 8);
  });
}

test('smart moves exclude those that hand over an immediate win', () => {
  // Blue owns sections 0 and 1 and needs section 2 to finish the row; taking
  // cell 8 would win it. Orange is confined to section 3, and which of those
  // nine cells is safe depends entirely on where each one sends Blue.
  const board = winInOnePosition();
  board.player = ORAN;
  board.sectionAllowed.set(sectionsSet(3));
  board.cellAllowed.set(cellsSet(27, 28, 29, 36, 37, 38, 45, 46, 47));

  assert.deepEqual(board.allLegalMoves(), [27, 28, 29, 36, 37, 38, 45, 46, 47]);

  // 29 sends Blue straight to section 2. 27 and 28 send Blue to sections Blue
  // has already won, which frees Blue to play anywhere — including cell 8.
  assert.deepEqual(smartMoves(board), [36, 37, 38, 45, 46, 47]);
});

test('the same seed gives the same move', () => {
  const board = new BoardState();
  board.setAt(40);
  board.setAt(30);

  for (const level of LEVELS) {
    const first = createEngine(level, makeRng(42), TEST_BUDGET).search(board);
    const second = createEngine(level, makeRng(42), TEST_BUDGET).search(board);
    assert.equal(first, second, `level ${level} is not reproducible`);
  }
});

test('two engines can play a game to the end', () => {
  const blue = engineFor(3, 1);
  const orange = engineFor(2, 2);
  const board = new BoardState();

  let moves = 0;
  while (!board.isTerminal()) {
    board.setAt(board.player === BLUE ? blue.search(board) : orange.search(board));
    moves++;
    assert.ok(moves <= 81);
  }

  assert.ok([BLUE, ORAN, DONE].includes(board.gameWon));
});
