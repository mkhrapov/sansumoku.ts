// The search worker.
//
// The original ran its engine on the main thread, which is why its activity
// spinner could never actually animate — the thread that would have drawn it was
// busy searching. Here the search is genuinely off the main thread, so the page
// stays responsive and can say that it is thinking.

import { BoardState } from '../core/boardState.js';
import { makeDefaultRng } from '../core/random.js';
import { createEngine } from '../engines/factory.js';
import type { SearchRequest, SearchResponse } from './protocol.js';

/**
 * A worker's globals rather than a window's. Declared narrowly here because
 * pulling in the full webworker lib collides with the DOM lib the UI needs.
 */
interface WorkerScope {
  onmessage: ((event: { data: SearchRequest }) => void) | null;
  postMessage(message: SearchResponse): void;
}

const scope = globalThis as unknown as WorkerScope;
const rng = makeDefaultRng();

scope.onmessage = (event) => {
  const { seq, level, board } = event.data;
  try {
    const move = createEngine(level, rng).search(BoardState.fromPlain(board));
    scope.postMessage({ seq, ok: true, move });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    scope.postMessage({ seq, ok: false, message });
  }
};
