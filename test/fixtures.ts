import { BoardState } from '../src/core/boardState.js';
import type { Marker, Player } from '../src/core/constants.js';

export interface BoardFixture {
  cellOccupied?: number[];
  cellValue?: number[];
  cellAllowed?: number[];
  sectionWon?: number[];
  sectionAllowed?: number[];
  sectionNextValue?: number[];
  sectionWonByConstraint?: number[];
  player?: Player;
  gameWon?: Marker;
}

/** Build a board directly from field values, bypassing the rules. */
export function boardFrom(fixture: BoardFixture): BoardState {
  const board = new BoardState();
  if (fixture.cellOccupied) board.cellOccupied.set(fixture.cellOccupied);
  if (fixture.cellValue) board.cellValue.set(fixture.cellValue);
  if (fixture.cellAllowed) board.cellAllowed.set(fixture.cellAllowed);
  if (fixture.sectionWon) board.sectionWon.set(fixture.sectionWon);
  if (fixture.sectionAllowed) board.sectionAllowed.set(fixture.sectionAllowed);
  if (fixture.sectionNextValue) board.sectionNextValue.set(fixture.sectionNextValue);
  if (fixture.sectionWonByConstraint) {
    board.sectionWonByConstraint.set(fixture.sectionWonByConstraint);
  }
  if (fixture.player !== undefined) board.player = fixture.player;
  if (fixture.gameWon !== undefined) board.gameWon = fixture.gameWon;
  return board;
}

/** An 81-long array of zeros with the listed cells set to 1. */
export function cellsSet(...cells: number[]): number[] {
  const flags = new Array<number>(81).fill(0);
  for (const cell of cells) flags[cell] = 1;
  return flags;
}

/** A 9-long array of zeros with the listed sections set to 1. */
export function sectionsSet(...sections: number[]): number[] {
  const flags = new Array<number>(9).fill(0);
  for (const section of sections) flags[section] = 1;
  return flags;
}
