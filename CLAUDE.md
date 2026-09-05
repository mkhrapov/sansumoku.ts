# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A browser port of Sansumoku, originally an iOS game in Swift and C/C++. It is a static site: no
backend, no persistence, all computation client-side. TypeScript is compiled locally with `tsc` and
the output is uploaded to a static host.

## Commands

```bash
npm install          # typescript and @types/node, both dev-only
npm run build        # src/ -> dist/, what you upload
npm run typecheck    # tsc --noEmit
npm test             # rule, regression and engine tests (node --test)
npm run playoff      # engine-vs-engine ladder, ~1 min; takes a game count: -- 60
npm run bench        # playouts/sec, for setting difficulty budgets
npm run serve        # python3 -m http.server 8000
```

Run one test file: `npx tsc -p tsconfig.test.json && node --test .build/test/regression.test.js`.

Deploy by uploading `index.html`, `rules.html`, `styles.css`, `rules.css`, `assets/` and `dist/`.
Nothing else is needed at runtime; `.build/` is tests only and never ships.

Two tsconfigs: `tsconfig.json` builds `src/` to `dist/`, `tsconfig.test.json` builds `src/` and
`test/` to `.build/`. Module resolution is `nodenext` with `"type": "module"`, so imports are written
with explicit `.js` extensions and the emitted ES modules run unchanged in both the browser and Node.

## Reference implementation

The original is a sibling checkout at `~/Developer/sansumoku` (GitHub: `mkhrapov/sansumoku`,
Apache 2.0, same author). It remains the authority on game rules. `Sansumoku/BoardState.swift` is the
rules, `Sansumoku/BoardView.swift` the rendering, `SansumokuTests/` the tests this repo's
`test/regression.test.ts` and `test/playoff.ts` come from, and `Sansumoku/www/how_to_play.html` the
source of `rules.html`.

Deliberately not ported: `CppConnector`, `BoardStateInt8` and the bridging headers (a Swift/C
marshalling layer with no purpose here), and `SwiftGKMCPlayer` (Apple's GameplayKit).

## Game model

A 9x9 grid (81 cells) of nine 3x3 sections. Blue moves first. Constants: `OPEN=0`, `BLUE=1`,
`ORAN=2`, `DONE=3` (`DONE` means full-but-not-won for a section, or a draw for the game).

Three rule systems compose in `src/core/boardState.ts`, and any one of them alone is wrong:

1. **Ultimate Tic-Tac-Toe routing.** A move at `(x, y)` sends the opponent to section
   `3*(y%3) + (x%3)`; the mover's own section is `3*(y/3) + (x/3)`. If the target section is already
   decided, the opponent may play in any still-`OPEN` section.
2. **Sudoku constraints on digits.** Each section has a `sectionNextValue` counter starting at 1 and
   incrementing per placement, so the digit played is forced by the section, not chosen. A cell is
   blocked if that digit already appears among its row/column peers. Sections already won by a player
   have their cells removed from the peer set, so constraints shrink as the game progresses — rows
   and columns are Sudoku groups but sections deliberately are not, because the 1..9 counter already
   stops a section repeating a digit.
3. **Three-in-a-row.** Three cells of one colour aligned in a section win that section (digit values
   are irrelevant, only ownership); three sections aligned win the game.

**Win by constraint** is the subtle rule. If the player to move has no legal cell at all, every
currently-allowed section is awarded to the *previous* player and flagged in `sectionWonByConstraint`,
after which the opponent may play in any open section. Awarding sections changes which peers are
constrained, which can immediately produce another deadlock, so this repeats until a legal move
exists or the game terminates. Resolving it only once is a known bug in the original;
`test/regression.test.ts` pins the position that exposed it and needs two rounds to settle. Run it
before trusting any change to the rules.

`BoardState.set()` is a mutating state machine: place the digit, evaluate section/game win, clear all
`sectionAllowed`/`cellAllowed` flags, recompute them, resolve deadlock, then flip `player`. The
precomputed `cellAllowed`/`sectionAllowed` arrays are what the UI draws and what engines enumerate,
so they must be correct after every move, not merely on demand.

`src/core/tables.ts` holds `SECTION_LOCATIONS`, `WIN_TRIPLES` and `PEERS`, built once at load. The
Swift original rebuilds all three per call, inside the innermost playout loop; this is most of why
the port runs ~30k playouts/sec against the C engine's ~2k.

## Engines

`src/engines/` — `AIEngine` is `search(board): number`, returning a cell index. `Budget` is
`{ maxPlayouts?, maxMs? }`: the UI passes milliseconds, tests pass playouts so results are
reproducible. Every engine takes a seedable `Rng` (`src/core/random.ts`).

Levels come from `factory.ts`: 1 random, 2 one-ply basic, 3 flat Monte Carlo, 4 and 5 UCT at one and
three seconds.

Note the naming trap in the original: `MonteCarloTreeSearch.swift`, `monte_carlo_tree_search.c` and
`advanced_mcts.cpp` contain **no tree search**. All three are flat Monte Carlo — every root move gets
N uniform random playouts, scores accumulate 1.0 win / 0.05 draw / 0.0 loss, argmax wins.
`flatMonteCarlo.ts` is the faithful port of that. `uct.ts` is new: real MCTS with UCB1 selection, and
it beats flat Monte Carlo about 3:1 on decided games at an equal playout budget.

Engine correctness is established by playing engines against each other, not by unit assertions —
`npm run playoff` must keep the ladder ordered 5 > 4 > 3 > 2 > 1.

## UI

`src/ui/boardView.ts` ports `BoardView.swift` to Canvas 2D. Draw order is load-bearing, since each
pass paints over the last: cell fills, then cell digits, then the thin grid, then opaque won-section
fills that hide the digits under them, then the heavy grid, then the final strike bar. Fills and
digits are separate passes over the whole board rather than a fill-then-write per cell, because the
hints cross-fade puts two digits in one cell and a second fill would erase the first. Colours in
`colors.ts` come from `MyColors.swift`.

`src/ui/animation.ts` animates moves. `render()` stays a pure repaint from state: a frame is a
position plus an optional `MoveProgress`, which carries the diff against the previous position and a
few 0..1 stage values, and the view interpolates towards the picture it would have drawn anyway.
Passing no progress draws exactly that picture, so the board at rest is unchanged. The stages overlap
and a quiet move is over in 300ms; only taking a section (430ms) and winning (850ms) run longer.

`MoveAnimator` queues moves rather than letting them interrupt each other, because the engine replies
from a worker and at level 1 its move lands while yours is still in the air. Everything that is not a
move — New Game, Undo, a resize, a palette change — cuts straight to the position, as does
`prefers-reduced-motion`. A click during a move only cuts it short; the move itself takes a second
click, since the board you pressed on is not the one you would be moving on.

`src/ui/app.ts` owns the undo stack and talks to the worker. It works on the live position and lets
the animator catch the screen up to it, so a search starts while the move that prompted it is still
playing. The search runs in
`src/worker/aiWorker.ts` — the original ran it on the main thread, which is why its activity spinner
could never animate. Replies carry a `seq`; a search cannot be cancelled, so a reply whose `seq` is
stale (New Game or Undo happened meanwhile) is discarded on arrival.
