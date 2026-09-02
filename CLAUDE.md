# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Status

This repository is empty apart from `README.md`. It is a planned TypeScript port of Sansumoku, an
iOS board game written in Swift and C/C++. No source, package manifest, build system, or test runner
exists yet — do not assume a toolchain. When one is chosen, record the build/lint/test commands here.

## Reference implementation

The original lives in a sibling checkout at `~/Developer/sansumoku` (GitHub: `mkhrapov/sansumoku`,
Apache 2.0). It is the authority on game rules and engine behavior; read it before porting anything.

| Original | Purpose |
| --- | --- |
| `Sansumoku/BoardState.swift` | All game logic. The canonical thing to port first. |
| `Sansumoku/BoardStateInt8.swift` | Packed `Int8` mirror of `BoardState`, used to cross the Swift/C boundary. |
| `Sansumoku/SwiftGameEngines/` | `AIEngine` protocol plus the Swift engines (random, basic, GameplayKit `GKMonteCarloStrategist`, pure-Swift MCTS) and the `CppConnector` bridge. |
| `Sansumoku/CFiles/`, `Sansumoku/CppGameEngines/` | The C and C++ MCTS engines. |
| `Sansumoku/BoardView.swift` | Core Graphics board rendering — the part with no direct TS analogue. |
| `Sansumoku/www/how_to_play.html` | Illustrated rules, the best prose spec of the game. |
| `SansumokuTests/EngineCompetition.swift` | Engine-vs-engine playoff harness. |

## Game model

A 9x9 grid (81 cells) of nine 3x3 sections. Blue moves first, then Orange. Constants: `OPEN=0`,
`BLUE=1`, `ORAN=2`, `DONE=3` (`DONE` means full-but-not-won for a section, or a draw for the game).

Three rule systems compose, and porting any one in isolation will be wrong:

1. **Ultimate Tic-Tac-Toe routing.** A move at `(x, y)` sends the opponent to section
   `3*(y%3) + (x%3)`; the mover's own section is `3*(y/3) + (x/3)`. If the target section is already
   decided, the opponent may play in any still-`OPEN` section.
2. **Sudoku constraints on digits.** Each section has a `sectionNextValue` counter starting at 1 and
   incrementing per placement, so the digit played is forced by the section, not chosen. A cell is
   blocked if that digit already appears among its row/column peers. Sections already won by a player
   have their cells removed from the peer set (`constraintRemoved`), so constraints shrink as the
   game progresses — rows and columns are Sudoku groups but sections deliberately are not.
3. **Three-in-a-row.** Three cells of one color aligned in a section win that section (digit values
   are irrelevant to the win, only ownership); three sections aligned win the game.

**Win by constraint** is the subtle rule. If the player to move has no legal cell at all, every
currently-allowed section is awarded to the *previous* player and flagged in `sectionWonByConstraint`,
after which the opponent may play in any open section. Awarding sections changes which peers are
constrained, which can immediately produce another deadlock — hence `recursiveConstraintProcessing()`
loops until a legal move exists or the game terminates. A non-recursive implementation is a known bug
(noted in the original's test file); reproduce the recursion.

`BoardState.set()` is a mutating state machine: place the digit, evaluate section/game win, clear all
`sectionAllowed`/`cellAllowed` flags, recompute them, run constraint processing, then flip `player`.
The precomputed `cellAllowed`/`sectionAllowed` arrays are what the UI draws and what engines enumerate
via `allLegalMoves()`, so they must be correct after every move, not merely on demand.

## Engine architecture

Engines are interchangeable behind a one-method interface — `search() -> (x, y)` plus
`setBoardState(_:)` — and are selected by an integer difficulty level (`AI.swift`). Search is
Monte Carlo Tree Search throughout; there is no evaluation function, so engines depend on
`BoardState.clone()` and fast random playouts. In the original, the pure-Swift MCTS was too slow for
useful iteration counts, which is why the C and C++ engines and the `Int8` marshalling layer exist.

For the TypeScript port, the Swift/C bridge (`CppConnector`, `BoardStateInt8`, the bridging headers,
and the hand-unrolled tuple marshalling) is incidental complexity that should not be carried over.
Keep the engine interface and the MCTS algorithm; pick a TS-appropriate performance strategy
(typed arrays, WebAssembly) only if profiling shows it is needed.

Correctness of engines is established by playing them against each other over many games rather than
by unit assertions — port `EngineCompetition`'s playoff harness (alternating colors, tallying
win/loss/draw) alongside the engines themselves.
