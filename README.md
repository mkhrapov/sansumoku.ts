# Sansumoku.ts

TypeScript port of Sansumoku, my iOS game in Swift and C++.

Sansumoku is a two-player board game — a mash-up of Sudoku and Ultimate Tic-Tac-Toe. This is a
static site: no backend, no accounts, no persistence. The AI runs in a Web Worker in your browser.

- [Original iOS game](https://github.com/mkhrapov/sansumoku)
- [Game website](https://sansumoku.com/)

## Building

```bash
npm install
npm run build     # src/*.ts -> dist/*.js
npm run serve     # http://localhost:8000
```

Deploy by uploading `index.html`, `rules.html`, `styles.css`, `rules.css`, `assets/` and `dist/`.
There is nothing else to install and nothing to run on the server.

```bash
npm test          # rules, the constraint-deadlock regression, and engine tests
npm run playoff   # plays the five difficulty levels off against each other
npm run bench     # playout throughput, used to set the difficulty budgets
```

## Playing

Blue moves first. You choose which colour you play — or take both sides — and the computer's level,
from 1 (random) to 5 (three seconds of Monte Carlo tree search). The digit is never yours to choose:
each section hands out 1 to 9 in order. Three of your cells in a row wins a section, and three
sections in a row wins the game. Full rules are on the [how to play](rules.html) page.
