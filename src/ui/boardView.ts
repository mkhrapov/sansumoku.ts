// Canvas rendering of the board, ported from BoardView.swift.
//
// The draw order matters, because each pass paints over the last: the thin grid
// goes on top of the cell fills, a won section covers the digits inside it, and
// the heavy grid covers everything.

import type { BoardState } from '../core/boardState.js';
import { BLUE, DONE, OPEN, ORAN, SECTION_COUNT, SIDE, cellAt, ownSection } from '../core/constants.js';
import type { Palette } from './colors.js';

/** Where a digit sits inside its cell, as fractions of the cell size. */
const DIGIT_SIZE = 0.8;
const DIGIT_LEFT = 0.3;
const DIGIT_BASELINE = 0.765;

const FONT_STACK = '-apple-system, BlinkMacSystemFont, "SF Pro Text", system-ui, sans-serif';

/** Thin lines are only needed inside a section; 3 and 6 are covered by heavy ones. */
const THIN_LINE_OFFSETS = [1, 2, 4, 5, 7, 8];

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

  render(board: BoardState): void {
    const { context, size } = this;
    const cell = size / SIDE;
    const section = size / 3;

    context.fillStyle = this.palette.background;
    context.fillRect(0, 0, size, size);

    this.drawCells(board, cell);
    this.drawThinGrid(cell);
    this.drawWonSections(board, cell, section);
    this.drawHeavyGrid(section);
    this.drawFinalStrike(board, section);
  }

  private drawCells(board: BoardState, cell: number): void {
    const gameOver = board.gameWon !== OPEN;

    for (let y = 0; y < SIDE; y++) {
      for (let x = 0; x < SIDE; x++) {
        const index = cellAt(x, y);
        const occupant = board.cellOccupied[index];

        if (occupant === BLUE || occupant === ORAN) {
          const recent = index === board.mostRecent;
          const blue = occupant === BLUE;
          const background = recent
            ? blue
              ? this.palette.blueFg
              : this.palette.oranFg
            : blue
              ? this.palette.blueBg
              : this.palette.oranBg;
          const foreground = recent
            ? this.palette.recentFg
            : blue
              ? this.palette.blueFg
              : this.palette.oranFg;
          this.drawDigit(x, y, board.cellValue[index], foreground, background, cell);
          continue;
        }

        // A playable cell shows the digit it would have to take — the section's
        // counter, not a choice — tinted for whoever is to move. The original
        // leaves these on screen after the game ends; here they stop.
        if (!gameOver && board.cellAllowed[index] === 1) {
          const ghost =
            board.player === BLUE ? this.palette.blueGhost : this.palette.oranGhost;
          const digit = board.sectionNextValue[ownSection(x, y)];
          this.drawDigit(x, y, digit, ghost, this.palette.background, cell);
        }
      }
    }
  }

  private drawDigit(
    x: number,
    y: number,
    digit: number,
    foreground: string,
    background: string,
    cell: number,
  ): void {
    const { context } = this;
    const left = x * cell;
    const top = y * cell;

    context.fillStyle = background;
    context.fillRect(left, top, cell, cell);

    context.fillStyle = foreground;
    context.font = `${DIGIT_SIZE * cell}px ${FONT_STACK}`;
    context.textAlign = 'left';
    context.textBaseline = 'alphabetic';
    context.fillText(String(digit), left + DIGIT_LEFT * cell, top + DIGIT_BASELINE * cell);
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

  private drawWonSections(board: BoardState, cell: number, section: number): void {
    const { context } = this;

    for (let index = 0; index < SECTION_COUNT; index++) {
      const owner = board.sectionWon[index];
      // A section that filled up without a winner keeps its digits on show.
      if (owner !== BLUE && owner !== ORAN) continue;

      const left = (index % 3) * section;
      const top = Math.floor(index / 3) * section;

      context.fillStyle = owner === BLUE ? this.palette.blueFg : this.palette.oranFg;
      context.fillRect(left, top, section, section);

      if (board.sectionWonByConstraint[index] === 1) {
        context.fillStyle = this.palette.constraintMark;
        context.beginPath();
        context.arc(left + section / 2, top + section / 2, cell, 0, Math.PI * 2);
        context.fill();
      }
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

  private drawFinalStrike(board: BoardState, section: number): void {
    if (board.gameWon !== BLUE && board.gameWon !== ORAN) return;
    if (board.finalStrikeStart < 0 || board.finalStrikeEnd < 0) return;

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
    context.lineTo(to.x, to.y);
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
