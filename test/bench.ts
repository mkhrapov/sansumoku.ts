// Measures playout throughput, so the difficulty budgets are set from numbers
// rather than guessed. Run with `npm run bench`.

import { BoardState } from '../src/core/boardState.js';
import { makeRng } from '../src/core/random.js';
import { playout } from '../src/engines/engine.js';
import { FlatMonteCarloEngine } from '../src/engines/flatMonteCarlo.js';
import { UctEngine } from '../src/engines/uct.js';

const rng = makeRng(1);

function midGameBoard(moves: number): BoardState {
  const board = new BoardState();
  for (let i = 0; i < moves && !board.isTerminal(); i++) {
    board.setAt(board.randomLegalMove(rng));
  }
  return board;
}

function timed<T>(label: string, run: () => T): T {
  const started = performance.now();
  const result = run();
  const elapsed = performance.now() - started;
  console.log(`${label.padEnd(42)} ${elapsed.toFixed(0).padStart(6)} ms`);
  return result;
}

const PLAYOUTS = 20000;

console.log('--- raw playouts ---');
for (const opening of [0, 20, 40]) {
  const board = midGameBoard(opening);
  const started = performance.now();
  for (let i = 0; i < PLAYOUTS; i++) playout(board.clone(), rng);
  const elapsed = performance.now() - started;
  const perSecond = (PLAYOUTS / elapsed) * 1000;
  console.log(
    `from move ${String(opening).padStart(2)}: ` +
      `${perSecond.toFixed(0).padStart(7)} playouts/sec ` +
      `(${(elapsed / PLAYOUTS).toFixed(3)} ms each)`,
  );
}

console.log('\n--- a single move at a given playout budget ---');
const board = midGameBoard(6);
for (const maxPlayouts of [200, 1000, 5000, 20000]) {
  timed(`flat MC  ${String(maxPlayouts).padStart(6)} playouts`, () =>
    new FlatMonteCarloEngine({ maxPlayouts }, rng).search(board),
  );
  timed(`UCT      ${String(maxPlayouts).padStart(6)} playouts`, () =>
    new UctEngine({ maxPlayouts }, rng).search(board),
  );
}

console.log('\n--- what a wall-clock budget buys ---');
for (const maxMs of [250, 1000, 3000]) {
  const engine = new UctEngine({ maxMs }, rng);
  const started = performance.now();
  engine.search(board);
  console.log(`UCT ${String(maxMs).padStart(5)} ms budget -> ${(performance.now() - started).toFixed(0)} ms actual`);
}
