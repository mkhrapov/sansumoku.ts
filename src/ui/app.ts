// The page: board, controls, undo stack, and the conversation with the worker.

import { BoardState } from '../core/boardState.js';
import { BLUE, ORAN } from '../core/constants.js';
import type { Player } from '../core/constants.js';
import { DEFAULT_LEVEL, LEVELS } from '../engines/factory.js';
import type { SearchRequest, SearchResponse } from '../worker/protocol.js';
import { MoveAnimator } from './animation.js';
import { BoardView, outcomeText } from './boardView.js';
import { paletteFor } from './colors.js';

/** Which side or sides the person at the keyboard is playing. */
type Mode = 'blue' | 'orange' | 'both';

const MAX_BOARD_SIZE = 600;
/** Room for the header, controls and status line before the board is sized. */
const CHROME_HEIGHT = 210;

function element<T extends HTMLElement>(id: string): T {
  const found = document.getElementById(id);
  if (found === null) throw new Error(`Missing element: ${id}`);
  return found as T;
}

const canvas = element<HTMLCanvasElement>('board');
const statusLine = element<HTMLParagraphElement>('status');
const modeSelect = element<HTMLSelectElement>('mode');
const levelSelect = element<HTMLSelectElement>('level');
const newGameButton = element<HTMLButtonElement>('new-game');
const undoButton = element<HTMLButtonElement>('undo');

const darkMode = window.matchMedia('(prefers-color-scheme: dark)');
const view = new BoardView(canvas, paletteFor(darkMode.matches));

const worker = new Worker(new URL('../worker/aiWorker.js', import.meta.url), { type: 'module' });

/** Every position so far. The last one is live; the rest are for undo. */
let history: BoardState[] = [new BoardState()];
let mode: Mode = 'blue';
let level = DEFAULT_LEVEL;
/** Identifies the current search, so a stale reply can be discarded. */
let searchSeq = 0;
let thinking = false;
let pendingMode: Mode | null = null;

/**
 * What is on the canvas. The rest of this file works on the live position and
 * lets the animator catch the screen up to it — so a search can start, and the
 * controls can settle, while the move that prompted them is still playing.
 */
const animator = new MoveAnimator(
  {
    paint: (board, progress) => view.render(board, progress),
    settled: () => updateControls(),
  },
  history[0],
);

function current(): BoardState {
  return history[history.length - 1];
}

function humanPlays(player: Player): boolean {
  if (mode === 'both') return true;
  return mode === 'blue' ? player === BLUE : player === ORAN;
}

function humanToMove(): boolean {
  return humanPlays(current().player);
}

// --- playing -------------------------------------------------------------

function play(move: number): void {
  const previous = current();
  const next = previous.clone();
  history.push(next);
  next.setAt(move);
  animator.play(previous, next);
  positionChanged();
}

function requestSearch(): void {
  const board = current();
  thinking = true;
  searchSeq += 1;
  const request: SearchRequest = { seq: searchSeq, level, board: board.toPlain() };
  worker.postMessage(request);
  updateControls();
}

worker.onmessage = (event: MessageEvent<SearchResponse>) => {
  const reply = event.data;
  // The board moved on while this search was running.
  if (reply.seq !== searchSeq) return;

  thinking = false;

  if (!reply.ok) {
    updateControls();
    statusLine.textContent = `The engine failed: ${reply.message}`;
    return;
  }
  if (!current().legalPlayAt(reply.move)) {
    updateControls();
    statusLine.textContent = 'The engine returned an illegal move. Please start a new game.';
    return;
  }
  play(reply.move);
};

worker.onerror = (event) => {
  thinking = false;
  updateControls();
  statusLine.textContent = `The engine crashed: ${event.message}`;
};

/** Let the engine move if it is its turn, and bring the controls up to date. */
function positionChanged(): void {
  updateControls();
  const board = current();
  if (!board.isTerminal() && !humanToMove() && !thinking) requestSearch();
}

/** The controls and the status line, which follow the live position. */
function updateControls(): void {
  undoButton.disabled = thinking || history.length <= 1;
  newGameButton.disabled = false;
  canvas.classList.toggle('waiting', thinking);
  statusLine.textContent = statusText();
}

function statusText(): string {
  const board = current();

  const outcome = outcomeText(board);
  if (outcome !== null) return outcome;

  if (thinking) return `Level ${level} is thinking…`;

  const side = board.player === BLUE ? 'Blue' : 'Orange';
  const whose = humanToMove() ? 'Your move' : `${side} to move`;
  const suffix = pendingMode === null ? '' : ' · the new sides start with your next game';
  return mode === 'both' ? `${side} to move${suffix}` : `${whose} — ${side}${suffix}`;
}

// --- controls ------------------------------------------------------------

function newGame(): void {
  if (pendingMode !== null) {
    mode = pendingMode;
    pendingMode = null;
  }
  // Abandon any search still running for the old game.
  searchSeq += 1;
  thinking = false;
  history = [new BoardState()];
  animator.snap(current());
  positionChanged();
}

function undo(): void {
  if (history.length <= 1) return;

  searchSeq += 1;
  thinking = false;

  // Step back past the engine's reply as well, so it is your move again.
  do {
    history.pop();
  } while (history.length > 1 && !humanToMove());

  animator.snap(current());
  positionChanged();
}

canvas.addEventListener('click', (event) => {
  // A click during a move cuts it short rather than playing. The board you were
  // looking at when you pressed is not the one you would be moving on, and the
  // engine's reply can be queued behind your own move, so this only ever asks
  // to see the position now — the move itself takes a second click.
  if (animator.busy) {
    animator.skip();
    return;
  }
  if (thinking || !humanToMove()) return;
  const cell = view.cellAtPoint(event);
  if (cell === null) return;
  if (!current().legalPlay(cell.x, cell.y)) return;
  play(cell.y * 9 + cell.x);
});

newGameButton.addEventListener('click', newGame);
undoButton.addEventListener('click', undo);

modeSelect.addEventListener('change', () => {
  const chosen = modeSelect.value as Mode;
  // Switching sides mid-game would either strand a position or throw it away,
  // so it waits for the next game unless nothing has happened yet.
  if (history.length === 1 && !thinking) {
    mode = chosen;
    pendingMode = null;
    positionChanged();
  } else {
    pendingMode = chosen;
    updateControls();
  }
});

levelSelect.addEventListener('change', () => {
  // Strength can change mid-game harmlessly; it applies to the engine's next move.
  level = Number(levelSelect.value);
  updateControls();
});

// --- layout --------------------------------------------------------------

function fitBoard(): void {
  const available = Math.min(
    canvas.parentElement?.clientWidth ?? window.innerWidth,
    window.innerHeight - CHROME_HEIGHT,
    MAX_BOARD_SIZE,
  );
  view.resize(Math.max(270, available));
  animator.redraw();
}

window.addEventListener('resize', fitBoard);
darkMode.addEventListener('change', () => {
  view.setPalette(paletteFor(darkMode.matches));
  animator.redraw();
});

for (const info of LEVELS) {
  const option = document.createElement('option');
  option.value = String(info.level);
  option.textContent = `${info.label} — ${info.description}`;
  option.selected = info.level === DEFAULT_LEVEL;
  levelSelect.append(option);
}
modeSelect.value = mode;

fitBoard();
positionChanged();
