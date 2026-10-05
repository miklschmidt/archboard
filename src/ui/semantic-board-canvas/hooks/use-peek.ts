// What the sidebar asks the picture to show, and the way to ask.

import { useContext } from "react";

import {
	PeekControlContext,
	PeekedContext,
	type PeekControl,
	type Peeked,
} from "@/ui/semantic-board-canvas/components/Peek";

/**
 * What the sidebar is asking the picture to show.
 * @returns The row pointed at and the trace asked for.
 */
function usePeeked(): Peeked {
	return useContext(PeekedContext);
}

/**
 * The way to ask the picture to show something. It never changes, so a row
 * that only asks is not drawn again when the answer does.
 * @returns How to point at a row and how to ask for a trace.
 */
function usePeekControl(): PeekControl {
	return useContext(PeekControlContext);
}

export { usePeekControl, usePeeked };
