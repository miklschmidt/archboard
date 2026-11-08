// The look of a row in either side column, whatever it lists: the left column's tree and the
// right panel's lists draw their rows with these classes, so the two columns answer the pointer,
// the keyboard and a choice in one way.

import { cn } from "@archboard/ui-kit/components";

/** What a row says of itself. */
interface RowState {
	/** The row of what the reader stands on or has open: it rises out of the column. */
	readonly lit: boolean;
	readonly disabled?: boolean | undefined;
}

/**
 * The classes of a row's tone. A row lies on the column's ground with no plate of its own. Under
 * the pointer it takes half a Control Face. The row that is lit rises as a Control Face, with no
 * gold, so a row never competes with the selection on the picture. A row that cannot be used is in
 * muted ink and keeps still.
 * @param state What the row says of itself.
 * @returns The classes.
 */
function rowTone(state: RowState): string {
	return cn(
		"rounded-control focus-visible:ring-ring min-h-7 outline-none focus-visible:ring-1 focus-visible:ring-inset",
		state.lit && "bg-face shadow-raised",
		// A row that cannot be used keeps still under the pointer.
		!state.lit && state.disabled !== true && "hover:bg-face/50",
		state.disabled === true && "text-muted-foreground",
	);
}

/**
 * The words of a line that names rows that belong together, such as the flows of a collection or
 * the changes of a module. It is no row: it stands in full ink over its rows, which stand one step
 * deeper, so it reads as their parent and never as a row that is off.
 */
const GROUP_LINE = "text-control text-foreground font-medium";

export { GROUP_LINE, rowTone, type RowState };
