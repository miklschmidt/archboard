// A value that keeps its identity while what it says stays the same.
//
// The shell view is new with every piece of pane news, and what the navigator
// derives from it (which pane shows which board) mostly is not. Kept, it does
// not make the rows, their expansion and every row's handlers new (TASK-385.04).

import { useState } from "react";

/**
 * The value, or the one kept from before when it says the same.
 * @param value The value this render.
 * @param same Whether a kept value says what this one says.
 * @returns The kept value, or this one once it differs.
 */
function useKept<Value>(value: Value, same: (kept: Value, next: Value) => boolean): Value {
	const [kept, keep] = useState(value);
	if (kept === value || same(kept, value)) return kept;
	keep(value);
	return value;
}

export { useKept };
