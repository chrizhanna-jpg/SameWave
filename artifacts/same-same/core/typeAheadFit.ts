/** Pure layout helpers for Feeling / Topic type-ahead row budgets. */

export const TYPEAHEAD_ROW_HEIGHT = 48;
export const TYPEAHEAD_LIST_PAD = 4;
export const TYPEAHEAD_MAX_ROWS = 6;
export const TYPEAHEAD_MIN_ROWS = 3;

export function typeAheadListHeight(rows: number): number {
  if (rows <= 0) return 0;
  return TYPEAHEAD_LIST_PAD * 2 + rows * TYPEAHEAD_ROW_HEIGHT;
}

/** How many suggestion rows fit in `availablePx` without scrolling or clipping. */
export function typeAheadRowsThatFit(availablePx: number, prefer = TYPEAHEAD_MAX_ROWS): number {
  if (availablePx <= TYPEAHEAD_LIST_PAD * 2 + TYPEAHEAD_ROW_HEIGHT) {
    return TYPEAHEAD_MIN_ROWS;
  }
  const fit = Math.floor((availablePx - TYPEAHEAD_LIST_PAD * 2) / TYPEAHEAD_ROW_HEIGHT);
  return Math.max(TYPEAHEAD_MIN_ROWS, Math.min(prefer, Math.max(1, fit)));
}
