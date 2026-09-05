// Canvas rendering of the board, ported from BoardView.swift.
//
// The draw order matters, because each pass paints over the last: the thin grid
// goes on top of the cell fills, a won section covers the digits inside it, and
// the heavy grid covers everything.
//
// Every frame is a full repaint from state. Animation does not change that: a
// frame is a position plus a `MoveProgress`, which says how far along the move
// that arrived at it is, and the passes below interpolate towards the position
// they would have drawn anyway. With no progress they draw exactly that.

import type { BoardState } from '../core/boardState.js';
import {
  BLUE,
  CELL_COUNT,
  DONE,
  OPEN,
  ORAN,
  SECTION_COUNT,
  SIDE,
  xOf,
  yOf,
} from '../core/constants.js';
import { SECTION_OF_CELL } from '../core/tables.js';
import type { MoveProgress } from './animation.js';
import { mix } from './colors.js';
import type { Palette } from './colors.js';

/** Where a digit sits inside its cell, as fractions of the cell size. */
const DIGIT_SIZE = 0.8;
const DIGIT_LEFT = 0.3;
const DIGIT_BASELINE = 0.765;

const FONT_STACK = '-apple-system, BlinkMacSystemFont, "SF Pro Text", system-ui, sans-serif';

/** Thin lines are only needed inside a section; 3 and 6 are covered by heavy ones. */
const THIN_LINE_OFFSETS = [1, 2, 4, 5, 7, 8];

/** How small a section's cover starts before it swells over its digits. */
const SECTION_GROWTH = 0.86;

export class BoardView {
  private readonly context: CanvasRenderingContext2D;
  /** The board's on-screen side, in CSS pixels. */
  private size = 0;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private palette: Palette,
  ) {
    const context = canvas.getContext('2d');
    if (context === null) throw new Error('This browser has no 2D canvas context.');
    this.context = context;
  }

  setPalette(palette: Palette): void {
    this.palette = palette;
  }

  /** Size the canvas to `size` CSS pixels, allowing for a retina display. */
  resize(size: number): void {
    const ratio = window.devicePixelRatio || 1;
    this.size = size;
    this.canvas.width = Math.round(size * ratio);
    this.canvas.height = Math.round(size * ratio);
    this.canvas.style.width = `${size}px`;
    this.canvas.style.height = `${size}px`;
    this.context.setTransform(ratio, 0, 0, ratio, 0, 0);
  }

  /** The cell under a pointer event, or null if the click missed the board. */
  cellAtPoint(event: { clientX: number; clientY: number }): { x: number; y: number } | null {
    const bounds = this.canvas.getBoundingClientRect();
    const cell = this.size / SIDE;
    const x = Math.floor((event.clientX - bounds.left) / cell);
    const y = Math.floor((event.clientY - bounds.top) / cell);
    if (x < 0 || x >= SIDE || y < 0 || y >= SIDE) return null;
    return { x, y };
  }

  /** Draw `board`, either at rest or partway through the move that reached it. */
  render(board: BoardState, progress: MoveProgress | null = null): void {
    const { context, size } = this;
    const cell = size / SIDE;
    const section = size / 3;

    context.fillStyle = this.palette.background;
    context.fillRect(0, 0, size, size);

    this.drawCells(board, cell, progress);
    this.drawThinGrid(cell);
    this.drawWonSections(board, cell, section, progress);
    this.drawHeavyGrid(section);
    this.drawFinalStrike(board, section, progress);
  }

  private drawCells(board: BoardState, cell: number, progress: MoveProgress | null): void {
    const { context } = this;

    // Backgrounds for the whole board first, then digits. Filling and writing
    // one cell at a time would be the same picture at rest, but the hints
    // cross-fade puts two digits in one cell, and the second fill would erase
    // the first digit.
    for (let index = 0; index < CELL_COUNT; index++) {
      const occupant = board.cellOccupied[index];
      if (occupant !== BLUE && occupant !== ORAN) continue;
      context.fillStyle = this.cellBackground(board, index, occupant === BLUE, progress);
      context.fillRect(xOf(index) * cell, yOf(index) * cell, cell, cell);
    }

    for (let index = 0; index < CELL_COUNT; index++) {
      const occupant = board.cellOccupied[index];
      if (occupant !== BLUE && occupant !== ORAN) continue;

      // The digit that has just been played fades up and settles into size.
      const landing = progress !== null && index === progress.diff.placed;
      context.globalAlpha = landing ? progress.place : 1;
      this.drawDigit(
        index,
        board.cellValue[index],
        this.cellForeground(board, index, occupant === BLUE, progress),
        cell,
        landing ? progress.placeScale : 1,
      );
      context.globalAlpha = 1;
    }

    // The hints belong to whoever is to move, so every move replaces the whole
    // set. Cross-fading the old out and the new in keeps the board from
    // flickering through a frame where nine digits change at once.
    this.drawHints(board, cell, progress === null ? 1 : progress.hints);
    if (progress !== null) {
      this.drawHints(progress.previous, cell, 1 - progress.hints, progress.diff.placed);
    }
  }

  /**
   * A played cell is pale with a saturated digit; the most recent move inverts
   * that. Both ends of that swap move on every turn, so both are interpolated.
   */
  private cellBackground(
    board: BoardState,
    index: number,
    blue: boolean,
    progress: MoveProgress | null,
  ): string {
    const held = blue ? this.palette.blueBg : this.palette.oranBg;
    const fresh = blue ? this.palette.blueFg : this.palette.oranFg;

    if (progress !== null) {
      if (index === progress.diff.placed) {
        return mix(this.palette.background, fresh, progress.place);
      }
      if (index === progress.diff.demoted) return mix(fresh, held, progress.place);
    }
    return index === board.mostRecent ? fresh : held;
  }

  private cellForeground(
    board: BoardState,
    index: number,
    blue: boolean,
    progress: MoveProgress | null,
  ): string {
    const own = blue ? this.palette.blueFg : this.palette.oranFg;

    if (progress !== null) {
      if (index === progress.diff.placed) return this.palette.recentFg;
      if (index === progress.diff.demoted) return mix(this.palette.recentFg, own, progress.place);
    }
    return index === board.mostRecent ? this.palette.recentFg : own;
  }

  /**
   * The digits on the playable cells: what that cell would have to take — the
   * section's counter, not a choice — tinted for whoever is to move. The
   * original leaves these on screen after the game ends; here they stop.
   */
  private drawHints(board: BoardState, cell: number, alpha: number, skip = -1): void {
    if (alpha <= 0 || board.gameWon !== OPEN) return;

    const { context } = this;
    const ghost = board.player === BLUE ? this.palette.blueGhost : this.palette.oranGhost;
    context.globalAlpha = alpha;
    for (let index = 0; index < CELL_COUNT; index++) {
      if (board.cellAllowed[index] !== 1 || index === skip) continue;
      this.drawDigit(index, board.sectionNextValue[SECTION_OF_CELL[index]], ghost, cell, 1);
    }
    context.globalAlpha = 1;
  }

  /** One digit, scaled about the centre of its cell. The caller owns the fill. */
  private drawDigit(
    index: number,
    digit: number,
    colour: string,
    cell: number,
    scale: number,
  ): void {
    const { context } = this;
    const left = xOf(index) * cell;
    const top = yOf(index) * cell;

    context.fillStyle = colour;
    context.font = `${DIGIT_SIZE * cell}px ${FONT_STACK}`;
    context.textAlign = 'left';
    context.textBaseline = 'alphabetic';

    if (scale !== 1) {
      context.save();
      context.translate(left + cell / 2, top + cell / 2);
      context.scale(scale, scale);
      context.translate(-(left + cell / 2), -(top + cell / 2));
    }
    context.fillText(String(digit), left + DIGIT_LEFT * cell, top + DIGIT_BASELINE * cell);
    if (scale !== 1) context.restore();
  }

  private drawThinGrid(cell: number): void {
    const { context, size } = this;
    context.strokeStyle = this.palette.lightLine;
    context.lineWidth = 1;
    context.beginPath();
    for (const offset of THIN_LINE_OFFSETS) {
      // The half-pixel keeps a one-pixel line from straddling two pixels.
      const at = Math.round(offset * cell) + 0.5;
      context.moveTo(0, at);
      context.lineTo(size, at);
      context.moveTo(at, 0);
      context.lineTo(at, size);
    }
    context.stroke();
  }

  private drawWonSections(
    board: BoardState,
    cell: number,
    section: number,
    progress: MoveProgress | null,
  ): void {
    const { context } = this;

    for (let index = 0; index < SECTION_COUNT; index++) {
      const owner = board.sectionWon[index];
      // A section that filled up without a winner keeps its digits on show.
      if (owner !== BLUE && owner !== ORAN) continue;

      // A section just taken swells over its digits instead of blinking shut.
      const taken =
        progress !== null && progress.diff.wonSections.includes(index) ? progress.sections : 1;
      if (taken <= 0) continue;

      const left = (index % 3) * section;
      const top = Math.floor(index / 3) * section;
      const side = (SECTION_GROWTH + (1 - SECTION_GROWTH) * taken) * section;
      const inset = (section - side) / 2;

      context.globalAlpha = taken;
      context.fillStyle = owner === BLUE ? this.palette.blueFg : this.palette.oranFg;
      context.fillRect(left + inset, top + inset, side, side);

      if (board.sectionWonByConstraint[index] === 1) {
        context.fillStyle = this.palette.constraintMark;
        context.beginPath();
        context.arc(left + section / 2, top + section / 2, cell * taken, 0, Math.PI * 2);
        context.fill();
      }
      context.globalAlpha = 1;
    }
  }

  private drawHeavyGrid(section: number): void {
    const { context, size } = this;
    const width = size / 150;
    context.strokeStyle = this.palette.heavyLine;
    context.lineWidth = width;
    context.beginPath();
    // The outer border is inset by half its width so the stroke stays on board.
    for (const at of [width / 2, section, 2 * section, size - width / 2]) {
      context.moveTo(0, at);
      context.lineTo(size, at);
      context.moveTo(at, 0);
      context.lineTo(at, size);
    }
    context.stroke();
  }

  private drawFinalStrike(
    board: BoardState,
    section: number,
    progress: MoveProgress | null,
  ): void {
    if (board.gameWon !== BLUE && board.gameWon !== ORAN) return;
    if (board.finalStrikeStart < 0 || board.finalStrikeEnd < 0) return;

    // The bar is struck through, from the first section of the line to the last.
    const drawn = progress !== null && progress.diff.strike ? progress.strike : 1;
    if (drawn <= 0) return;

    const centre = (index: number) => ({
      x: (index % 3) * section + section / 2,
      y: Math.floor(index / 3) * section + section / 2,
    });
    const from = centre(board.finalStrikeStart);
    const to = centre(board.finalStrikeEnd);

    const { context } = this;
    context.strokeStyle = this.palette.finalStrike;
    context.lineWidth = this.size * 0.04;
    context.lineCap = 'butt';
    context.beginPath();
    context.moveTo(from.x, from.y);
    context.lineTo(from.x + (to.x - from.x) * drawn, from.y + (to.y - from.y) * drawn);
    context.stroke();
  }
}

/** Whether the game ended and how, phrased for the status line. */
export function outcomeText(board: BoardState): string | null {
  switch (board.gameWon) {
    case BLUE:
      return 'Blue wins.';
    case ORAN:
      return 'Orange wins.';
    case DONE:
      return 'A draw — no sections left.';
    default:
      return null;
  }
}
