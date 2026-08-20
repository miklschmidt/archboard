// The board-store bug from TASK-057, kept alive so the check keeps catching it.
//
// `boards` is kept, so it holds the boards a human has open. Re-evaluating this
// module re-ran the write and replaced an open board with an empty one, under
// a pane that was looking at it. The fix was the `if (!boards.has(...))` guard
// that is deliberately missing here.

import { kept } from '../../../src/core/hot.js';

const boards = kept('fixture-boards', () => new Map<string, { elements: string[] }>());

boards.set('scratch', { elements: [] });

export { boards };
