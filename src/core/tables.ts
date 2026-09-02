// Precomputed lookup tables.
//
// The Swift original rebuilds all of this on every call — `sectionLocations()`
// allocates a fresh array, `won()` re-creates the winning triples, and `peers()`
// unions eighteen `Set<Int>`s. Those calls sit in the innermost playout loop, so
// here they become tables built once at module load, matching what the C and C++
// engines of the original do.

import { CELL_COUNT, SECTION_COUNT, SIDE, cellAt, ownSection, xOf, yOf } from './constants.js';

/**
 * The eight ways to get three in a row, as offsets into a 3x3 group.
 * Used for winning a section (over its nine cells) and for winning the game
 * (over the nine sections).
 */
export const WIN_TRIPLES: ReadonlyArray<readonly [number, number, number]> = [
  [0, 1, 2],
  [3, 4, 5],
  [6, 7, 8],
  [0, 3, 6],
  [1, 4, 7],
  [2, 5, 8],
  [0, 4, 8],
  [2, 4, 6],
];

/** SECTION_OF_CELL[cell] is the section that cell belongs to. */
export const SECTION_OF_CELL: Int8Array = (() => {
  const table = new Int8Array(CELL_COUNT);
  for (let cell = 0; cell < CELL_COUNT; cell++) {
    table[cell] = ownSection(xOf(cell), yOf(cell));
  }
  return table;
})();

/** SECTION_LOCATIONS[section] lists that section's nine cells, top-left first. */
export const SECTION_LOCATIONS: ReadonlyArray<Int8Array> = (() => {
  const table: Int8Array[] = [];
  for (let section = 0; section < SECTION_COUNT; section++) {
    const cells = new Int8Array(9);
    const baseX = (section % 3) * 3;
    const baseY = ((section / 3) | 0) * 3;
    for (let i = 0; i < 9; i++) {
      cells[i] = cellAt(baseX + (i % 3), baseY + ((i / 3) | 0));
    }
    table.push(cells);
  }
  return table;
})();

/**
 * PEERS[cell] lists the sixteen cells that share a row or column with it.
 *
 * Sections are deliberately *not* a Sudoku group here: a section's digits are
 * handed out by a counter that runs 1..9, so a section can never repeat a digit
 * and does not need constraining. Rows and columns are the only groups.
 *
 * This is the *static* peer set. Cells in sections already won by a player stop
 * constraining, but that is dynamic, so it is applied when the table is read
 * rather than baked in here.
 */
export const PEERS: ReadonlyArray<Int8Array> = (() => {
  const table: Int8Array[] = [];
  for (let cell = 0; cell < CELL_COUNT; cell++) {
    const x = xOf(cell);
    const y = yOf(cell);
    const peers = new Int8Array(16);
    let n = 0;
    for (let i = 0; i < SIDE; i++) {
      if (i !== x) peers[n++] = cellAt(i, y);
      if (i !== y) peers[n++] = cellAt(x, i);
    }
    table.push(peers);
  }
  return table;
})();
