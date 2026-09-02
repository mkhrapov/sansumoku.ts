// The complete rules of Sansumoku.
//
// Ported from Sansumoku/BoardState.swift of the iOS original
// (https://github.com/mkhrapov/sansumoku), Apache License 2.0.
//
// Three rule systems compose here, and none of them makes sense alone:
//
//  1. Ultimate Tic-Tac-Toe routing — where you play sends your opponent to a
//     particular section.
//  2. Sudoku constraints — the digit you play is forced by the section, and a
//     cell is blocked if that digit already appears in its row or column.
//  3. Three in a row — three of your cells aligned wins a section, three
//     sections aligned wins the game.

import {
  BLUE,
  CELL_COUNT,
  DONE,
  OPEN,
  ORAN,
  SECTION_COUNT,
  SIDE,
  cellAt,
  otherPlayer,
  ownSection,
  targetSection,
  xOf,
  yOf,
} from './constants.js';
import type { Marker, Player } from './constants.js';
import { PEERS, SECTION_LOCATIONS, SECTION_OF_CELL, WIN_TRIPLES } from './tables.js';
import type { Rng } from './random.js';

/** A board reduced to plain data, for sending across a worker boundary. */
export interface PlainBoardState {
  cellOccupied: Int8Array;
  cellValue: Int8Array;
  cellAllowed: Int8Array;
  sectionWon: Int8Array;
  sectionAllowed: Int8Array;
  sectionNextValue: Int8Array;
  sectionWonByConstraint: Int8Array;
  player: Player;
  gameWon: Marker;
}

export class BoardState {
  /** OPEN, BLUE or ORAN, per cell. */
  readonly cellOccupied = new Int8Array(CELL_COUNT);
  /** The digit played in each cell; 0 while the cell is empty. */
  readonly cellValue = new Int8Array(CELL_COUNT);
  /** Which cells may be played right now. Recomputed after every move. */
  readonly cellAllowed = new Int8Array(CELL_COUNT);
  /** OPEN, BLUE, ORAN or DONE (full but won by nobody), per section. */
  readonly sectionWon = new Int8Array(SECTION_COUNT);
  /** Which sections may be played in right now. */
  readonly sectionAllowed = new Int8Array(SECTION_COUNT);
  /** The digit the next move in each section must use. Starts at 1. */
  readonly sectionNextValue = new Int8Array(SECTION_COUNT);
  /** Sections awarded because the opponent had no legal move. Drawn differently. */
  readonly sectionWonByConstraint = new Int8Array(SECTION_COUNT);

  player: Player = BLUE;
  /** OPEN until the game ends, then BLUE, ORAN, or DONE for a draw. */
  gameWon: Marker = OPEN;

  // Presentation only. Not copied by clone(), not needed by engines.
  /** The cell of the last move, highlighted by the board view. -1 before any move. */
  mostRecent = -1;
  /** First and last section of the winning line, for the strike bar. */
  finalStrikeStart = -1;
  finalStrikeEnd = -1;

  constructor() {
    this.cellAllowed.fill(1);
    this.sectionAllowed.fill(1);
    this.sectionNextValue.fill(1);
  }

  /**
   * A copy suitable for search. Deliberately drops the presentation-only fields,
   * matching the original — engines never look at them.
   */
  clone(): BoardState {
    const child = new BoardState();
    child.cellOccupied.set(this.cellOccupied);
    child.cellValue.set(this.cellValue);
    child.cellAllowed.set(this.cellAllowed);
    child.sectionWon.set(this.sectionWon);
    child.sectionAllowed.set(this.sectionAllowed);
    child.sectionNextValue.set(this.sectionNextValue);
    child.sectionWonByConstraint.set(this.sectionWonByConstraint);
    child.player = this.player;
    child.gameWon = this.gameWon;
    return child;
  }

  toPlain(): PlainBoardState {
    return {
      cellOccupied: this.cellOccupied.slice(),
      cellValue: this.cellValue.slice(),
      cellAllowed: this.cellAllowed.slice(),
      sectionWon: this.sectionWon.slice(),
      sectionAllowed: this.sectionAllowed.slice(),
      sectionNextValue: this.sectionNextValue.slice(),
      sectionWonByConstraint: this.sectionWonByConstraint.slice(),
      player: this.player,
      gameWon: this.gameWon,
    };
  }

  static fromPlain(plain: PlainBoardState): BoardState {
    const board = new BoardState();
    board.cellOccupied.set(plain.cellOccupied);
    board.cellValue.set(plain.cellValue);
    board.cellAllowed.set(plain.cellAllowed);
    board.sectionWon.set(plain.sectionWon);
    board.sectionAllowed.set(plain.sectionAllowed);
    board.sectionNextValue.set(plain.sectionNextValue);
    board.sectionWonByConstraint.set(plain.sectionWonByConstraint);
    board.player = plain.player;
    board.gameWon = plain.gameWon;
    return board;
  }

  isInitialState(): boolean {
    return this.cellOccupied.every((occupant) => occupant === OPEN);
  }

  isTerminal(): boolean {
    return this.gameWon !== OPEN;
  }

  legalPlay(x: number, y: number): boolean {
    if (this.gameWon !== OPEN) return false;
    if (x < 0 || x >= SIDE || y < 0 || y >= SIDE) return false;
    return this.cellAllowed[cellAt(x, y)] === 1;
  }

  legalPlayAt(cell: number): boolean {
    if (this.gameWon !== OPEN) return false;
    if (cell < 0 || cell >= CELL_COUNT) return false;
    return this.cellAllowed[cell] === 1;
  }

  /** Legal moves as cell indices, in row-major order. */
  allLegalMoves(): number[] {
    const moves: number[] = [];
    if (this.gameWon !== OPEN) return moves;
    for (let cell = 0; cell < CELL_COUNT; cell++) {
      if (this.cellAllowed[cell] === 1) moves.push(cell);
    }
    return moves;
  }

  countLegalMoves(): number {
    if (this.gameWon !== OPEN) return 0;
    let count = 0;
    for (let cell = 0; cell < CELL_COUNT; cell++) {
      if (this.cellAllowed[cell] === 1) count++;
    }
    return count;
  }

  /**
   * A uniformly random legal move, or -1 if there is none. Allocation-free,
   * which matters because this is the innermost loop of every playout.
   */
  randomLegalMove(rng: Rng): number {
    const count = this.countLegalMoves();
    if (count === 0) return -1;
    let target = rng.nextInt(count);
    for (let cell = 0; cell < CELL_COUNT; cell++) {
      if (this.cellAllowed[cell] === 1) {
        if (target === 0) return cell;
        target--;
      }
    }
    return -1;
  }

  setAt(cell: number): void {
    this.set(xOf(cell), yOf(cell));
  }

  /**
   * Play a move. This is the whole game: place the digit, judge the section and
   * the game, recompute what is playable, resolve any deadlock, then hand over.
   */
  set(x: number, y: number): void {
    if (!this.legalPlay(x, y)) {
      throw new Error(`Illegal move at (${x}, ${y}).`);
    }

    const cell = cellAt(x, y);
    const section = ownSection(x, y);
    this.mostRecent = cell;

    this.cellOccupied[cell] = this.player;
    this.cellValue[cell] = this.sectionNextValue[section];
    this.sectionNextValue[section] += 1;

    if (this.sectionWonBy(this.player, section)) {
      this.sectionWon[section] = this.player;
      if (this.entireGameWonBy(this.player)) {
        this.gameWon = this.player;
      } else if (this.entireBoardIsFull()) {
        this.gameWon = DONE;
      }
    } else if (this.sectionIsFull(section)) {
      this.sectionWon[section] = DONE;
      if (this.entireBoardIsFull()) {
        this.gameWon = DONE;
      }
    }

    this.recomputeAllowed(targetSection(x, y));
    this.resolveConstraintDeadlock();

    this.player = otherPlayer(this.player);
  }

  /**
   * Work out where the opponent may play. They are sent to `nextSection`, but if
   * that section is already decided they may play in any section still open.
   */
  private recomputeAllowed(nextSection: number): void {
    this.sectionAllowed.fill(0);
    this.cellAllowed.fill(0);

    if (this.sectionWon[nextSection] === OPEN) {
      this.sectionAllowed[nextSection] = 1;
    } else {
      this.openSectionsBecomeAllowed();
    }

    this.recomputeAllowedCells();
  }

  private openSectionsBecomeAllowed(): void {
    for (let section = 0; section < SECTION_COUNT; section++) {
      this.sectionAllowed[section] = this.sectionWon[section] === OPEN ? 1 : 0;
    }
  }

  private recomputeAllowedCells(): void {
    for (let section = 0; section < SECTION_COUNT; section++) {
      if (this.sectionAllowed[section] !== 1) continue;
      const locations = SECTION_LOCATIONS[section];
      for (let i = 0; i < locations.length; i++) {
        const cell = locations[i];
        if (this.cellOccupied[cell] === OPEN && !this.sudokuConstrained(cell)) {
          this.cellAllowed[cell] = 1;
        }
      }
    }
  }

  /**
   * Win by constraint.
   *
   * If the player to move has no legal cell anywhere, every section they were
   * allowed to play in is awarded to the player who just moved, and the game
   * reopens to any section. Awarding a section removes its cells from the peer
   * sets, which loosens the Sudoku constraints, which can immediately produce
   * another deadlock — so this repeats until somebody can move or the game ends.
   *
   * Doing this only once is a real bug: it left the original crashing with
   * "State is not terminal, but move count is zero". See test/regression.test.ts.
   *
   * Note this runs before the player flip, so `this.player` is still the mover.
   */
  private resolveConstraintDeadlock(): void {
    while (!this.isTerminal() && this.noAllowedCells()) {
      for (let section = 0; section < SECTION_COUNT; section++) {
        if (this.sectionAllowed[section] === 1) {
          this.sectionWon[section] = this.player;
          this.sectionWonByConstraint[section] = 1;
        }
      }

      if (this.entireGameWonBy(this.player)) {
        this.gameWon = this.player;
        return;
      }
      if (this.entireBoardIsFull()) {
        this.gameWon = DONE;
        return;
      }

      this.openSectionsBecomeAllowed();
      this.recomputeAllowedCells();
    }
  }

  /** Would this digit repeat in the cell's row or column? */
  private sudokuConstrained(cell: number): boolean {
    const digit = this.sectionNextValue[SECTION_OF_CELL[cell]];
    const peers = PEERS[cell];
    for (let i = 0; i < peers.length; i++) {
      const peer = peers[i];
      if (this.cellValue[peer] !== digit) continue;
      // Cells in a section a player has won are erased from the Sudoku, so the
      // constraints shrink as the game goes on.
      const owner = this.sectionWon[SECTION_OF_CELL[peer]];
      if (owner !== BLUE && owner !== ORAN) return true;
    }
    return false;
  }

  private noAllowedCells(): boolean {
    for (let cell = 0; cell < CELL_COUNT; cell++) {
      if (this.cellAllowed[cell] === 1) return false;
    }
    return true;
  }

  /** Three cells of one colour aligned in a section. Digits are irrelevant. */
  private sectionWonBy(player: Player, section: number): boolean {
    const locations = SECTION_LOCATIONS[section];
    for (const [a, b, c] of WIN_TRIPLES) {
      if (
        this.cellOccupied[locations[a]] === player &&
        this.cellOccupied[locations[b]] === player &&
        this.cellOccupied[locations[c]] === player
      ) {
        return true;
      }
    }
    return false;
  }

  /** Three sections of one colour aligned. Records the line for the strike bar. */
  private entireGameWonBy(player: Player): boolean {
    for (const [a, b, c] of WIN_TRIPLES) {
      if (
        this.sectionWon[a] === player &&
        this.sectionWon[b] === player &&
        this.sectionWon[c] === player
      ) {
        this.finalStrikeStart = a;
        this.finalStrikeEnd = c;
        return true;
      }
    }
    return false;
  }

  private sectionIsFull(section: number): boolean {
    const locations = SECTION_LOCATIONS[section];
    for (let i = 0; i < locations.length; i++) {
      if (this.cellOccupied[locations[i]] === OPEN) return false;
    }
    return true;
  }

  /** True when no section is still open — not when all 81 cells are filled. */
  private entireBoardIsFull(): boolean {
    for (let section = 0; section < SECTION_COUNT; section++) {
      if (this.sectionWon[section] === OPEN) return false;
    }
    return true;
  }
}
