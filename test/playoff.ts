// Engine-vs-engine playoffs — ported from SansumokuTests/EngineCompetition.swift.
//
// There is no evaluation function to unit-test an engine against, so strength is
// established by playing them off against each other. Colours alternate every
// game, because Blue moves first and that is worth something.
//
// Budgets here are counted in playouts rather than milliseconds so a run is
// reproducible and does not depend on the machine. They are scaled down from the
// shipping budgets to keep a full ladder to a couple of minutes.
//
//   npm run playoff            -- 20 games per matchup
//   npm run playoff -- 100     -- longer, tighter error bars

import { BoardState } from '../src/core/boardState.js';
import { BLUE, DONE } from '../src/core/constants.js';
import type { Marker } from '../src/core/constants.js';
import { makeRng } from '../src/core/random.js';
import type { AIEngine, Budget } from '../src/engines/engine.js';
import { createEngine } from '../src/engines/factory.js';
import { FlatMonteCarloEngine } from '../src/engines/flatMonteCarlo.js';
import { UctEngine } from '../src/engines/uct.js';

const PLAYOFF_BUDGETS: Record<number, Budget | undefined> = {
  1: undefined,
  2: undefined,
  3: { maxPlayouts: 200 },
  4: { maxPlayouts: 600 },
  5: { maxPlayouts: 1800 },
};

interface Result {
  aWins: number;
  bWins: number;
  draws: number;
}

function playGame(blue: AIEngine, orange: AIEngine): Marker {
  const board = new BoardState();
  let moves = 0;

  while (!board.isTerminal()) {
    const engine = board.player === BLUE ? blue : orange;
    const move = engine.search(board);
    if (!board.legalPlayAt(move)) {
      throw new Error(`${engine.name} returned illegal cell ${move}`);
    }
    board.setAt(move);
    if (++moves > 81) throw new Error('A game outlasted the board.');
  }

  return board.gameWon;
}

function playoff(games: number, a: AIEngine, b: AIEngine): Result {
  const result: Result = { aWins: 0, bWins: 0, draws: 0 };

  for (let game = 0; game < games; game++) {
    const aIsBlue = game % 2 === 0;
    const winner = aIsBlue ? playGame(a, b) : playGame(b, a);

    if (winner === DONE) result.draws++;
    else if ((winner === BLUE) === aIsBlue) result.aWins++;
    else result.bWins++;
  }

  return result;
}

function report(label: string, result: Result, started: number): boolean {
  const { aWins, bWins, draws } = result;
  const decided = aWins + bWins;
  const share = decided === 0 ? 0.5 : bWins / decided;
  const elapsed = ((performance.now() - started) / 1000).toFixed(0);
  const verdict = share > 0.5 ? 'ok' : 'REGRESSION';

  console.log(
    `${label.padEnd(34)} ${String(aWins).padStart(3)} - ${String(bWins).padStart(3)}` +
      `  (${draws} draws)  ${(share * 100).toFixed(0).padStart(3)}% of decided games` +
      `  ${elapsed.padStart(3)}s  ${verdict}`,
  );
  return share > 0.5;
}

const games = Number(process.argv[2] ?? 20);
console.log(`${games} games per matchup, colours alternating.\n`);
console.log('The stronger engine is on the right; its share of decided games should exceed 50%.\n');

let allOk = true;

for (const [lower, higher] of [
  [1, 2],
  [2, 3],
  [3, 4],
  [4, 5],
] as const) {
  const started = performance.now();
  const a = createEngine(lower, makeRng(1000 + lower), PLAYOFF_BUDGETS[lower]);
  const b = createEngine(higher, makeRng(2000 + higher), PLAYOFF_BUDGETS[higher]);
  allOk = report(`level ${lower} vs level ${higher}`, playoff(games, a, b), started) && allOk;
}

// The reason UCT was worth adding: same playouts, better use of them.
{
  const started = performance.now();
  const budget = { maxPlayouts: 600 };
  const flat = new FlatMonteCarloEngine(budget, makeRng(31), 'flat-mc');
  const uct = new UctEngine(budget, makeRng(32), 'uct');
  allOk = report('flat MC vs UCT (600 playouts)', playoff(games, flat, uct), started) && allOk;
}

console.log(`\n${allOk ? 'Ladder holds.' : 'Ladder does NOT hold — see REGRESSION rows above.'}`);
process.exit(allOk ? 0 : 1);
