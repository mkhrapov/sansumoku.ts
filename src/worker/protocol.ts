// Messages between the page and the search worker.
//
// A board crosses as plain typed arrays, which structured cloning copies
// natively. `seq` exists because a search cannot be cancelled once started: a
// reply whose sequence number is stale — the user hit New Game or Undo while the
// engine was thinking — is thrown away on arrival.

import type { PlainBoardState } from '../core/boardState.js';

export interface SearchRequest {
  seq: number;
  level: number;
  board: PlainBoardState;
}

export type SearchResponse =
  | { seq: number; ok: true; move: number }
  | { seq: number; ok: false; message: string };
