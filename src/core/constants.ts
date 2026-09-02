// Sansumoku — shared constants and index arithmetic.
//
// Ported from Sansumoku/BoardState.swift of the iOS original
// (https://github.com/mkhrapov/sansumoku), Apache License 2.0.

/** A cell with nobody in it, or a section/game that is not yet decided. */
export const OPEN = 0;
/** The first player. Blue always moves first. */
export const BLUE = 1;
/** The second player. */
export const ORAN = 2;
/** A section that is full but won by nobody, or a game that ended in a draw. */
export const DONE = 3;

export type Player = typeof BLUE | typeof ORAN;
/** OPEN, BLUE, ORAN or DONE. */
export type Marker = 0 | 1 | 2 | 3;

/** The board is 9x9. */
export const SIDE = 9;
/** 81 cells, addressed row-major as `y * 9 + x`. */
export const CELL_COUNT = 81;
/** Nine 3x3 sections, addressed as `3 * (y / 3) + (x / 3)`. */
export const SECTION_COUNT = 9;
/** Cells per section, and also the highest digit that can be played. */
export const SECTION_SIZE = 9;

export function cellAt(x: number, y: number): number {
  return y * SIDE + x;
}

export function xOf(cell: number): number {
  return cell % SIDE;
}

export function yOf(cell: number): number {
  return (cell / SIDE) | 0;
}

/** The section a move at (x, y) is played into. */
export function ownSection(x: number, y: number): number {
  return 3 * ((y / 3) | 0) + ((x / 3) | 0);
}

/**
 * The section the opponent is sent to by a move at (x, y) — the Ultimate
 * Tic-Tac-Toe routing rule. Note it uses the position *within* the 3x3 section,
 * not the section itself.
 */
export function targetSection(x: number, y: number): number {
  return 3 * (y % 3) + (x % 3);
}

export function otherPlayer(player: Player): Player {
  return player === BLUE ? ORAN : BLUE;
}
