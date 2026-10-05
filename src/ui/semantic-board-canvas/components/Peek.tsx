// What the sidebar asks the picture to show while a person reads it.
//
// The picture and the sidebar of a pane are siblings, and two things pass from
// the one to the other: the relationship a row is pointed at, which the picture
// lights while it is, and a trace of what a part reaches, which the picture
// lights as a wave. Both are attention, like the camera and the selection:
// nothing is written, and both belong to the part that is picked out, so they go
// when the pick does.

import { createContext, useMemo, useState, type JSX, type ReactNode } from "react";

import type { Way } from "@/ui/semantic-board-canvas/lib/reach";

/** A trace of what a part reaches, in one direction. */
interface Trace {
	/** The part it was asked of. */
	readonly part: string;
	/** Onward along what it sends to, or back along what sends to it. */
	readonly way: Way;
}

/** What the sidebar is asking the picture to show now. */
interface Peeked {
	/** The subject a row is pointed at, or null. */
	readonly row: string | null;
	/** The trace asked for, or null. */
	readonly trace: Trace | null;
}

/** How the sidebar asks. */
interface PeekControl {
	/**
	 * Point at a row, or leave it.
	 * @param row The subject the row is about, or null for none.
	 */
	readonly point: (row: string | null) => void;
	/**
	 * Ask for a trace, or take it back.
	 * @param trace The trace, or null for none.
	 */
	readonly trace: (trace: Trace | null) => void;
}

const NOTHING_PEEKED: Peeked = Object.freeze({ row: null, trace: null });

/** Ask for nothing: there is no picture to show it. */
function asksNothing(): void {}

/** A pane outside a stage, such as a test's: nothing is ever asked of the picture. */
const NO_CONTROL: PeekControl = Object.freeze({ point: asksNothing, trace: asksNothing });

/** What the sidebar is asking the picture to show now. */
const PeekedContext = createContext<Peeked>(NOTHING_PEEKED);

/** How the sidebar asks, which never changes. */
const PeekControlContext = createContext<PeekControl>(NO_CONTROL);

/** Inputs for the provider. */
interface PeekProviderProps {
	/** The subject picked out, which what is asked belongs to. */
	readonly selection: string | null;
	readonly children: ReactNode;
}

/**
 * Carry what the sidebar asks of the picture, for as long as the same part is picked out.
 * @param props The pick and the picture and sidebar it holds.
 * @returns The children, with what is asked and the way to ask it.
 */
function PeekProvider(props: PeekProviderProps): JSX.Element {
	const [peeked, setPeeked] = useState<Peeked>(NOTHING_PEEKED);
	const [forSelection, setForSelection] = useState(props.selection);
	// Another pick is another part: what was asked of the last one goes with it.
	if (forSelection !== props.selection) {
		setForSelection(props.selection);
		setPeeked(NOTHING_PEEKED);
	}
	const control = useMemo<PeekControl>(
		() => ({
			/**
			 * Point at a row, or leave it.
			 * @param row The subject the row is about, or null for none.
			 */
			point: (row) => {
				setPeeked((was) => (was.row === row ? was : { ...was, row }));
			},
			/**
			 * Ask for a trace, or take it back.
			 * @param trace The trace, or null for none.
			 */
			trace: (trace) => {
				setPeeked((was) => ({ ...was, trace }));
			},
		}),
		[],
	);
	return (
		<PeekControlContext value={control}>
			<PeekedContext value={peeked}>{props.children}</PeekedContext>
		</PeekControlContext>
	);
}

export {
	NOTHING_PEEKED,
	PeekControlContext,
	PeekProvider,
	PeekedContext,
	type PeekControl,
	type Peeked,
	type Trace,
};
