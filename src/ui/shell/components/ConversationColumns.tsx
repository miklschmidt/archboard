// The conversation beside the navigator, and the pane centre beside it, with a
// handle on the line between them. The conversation slides open and shut, and
// the handle drags it wider or narrower, or shut when it is dragged below its
// smallest. Its width is the person's, kept in this browser. Its content is
// mounted while it is open and while it slides out, so a shut conversation is
// not in the tab order or in the way of anything.

import {
	useCallback,
	useEffect,
	useRef,
	useState,
	type CSSProperties,
	type JSX,
	type ReactNode,
} from "react";
import { usePanelRef, type PanelSize } from "react-resizable-panels";

import { AGENT_PANEL_WIDTH } from "@/shared/shell-geometry/index";
import { AGENT_PANEL_SLIDE_MS } from "@/shared/timing/timing";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/ui/components/Resizable";

const STORAGE_KEY = "archboard.agent.panel.width";

/** The narrowest the conversation goes before it shuts, in pixels. */
const MIN_WIDTH = 320;

/** The widest the conversation is dragged, in pixels. */
const MAX_WIDTH = 720;

/** The narrowest the pane centre goes while the conversation is dragged wider. */
const CENTRE_MIN_WIDTH = 560;

/** What the stylesheet slides the panels with. */
const GROUP_STYLE: CSSProperties = { "--panel-slide-ms": `${AGENT_PANEL_SLIDE_MS}ms` };

/**
 * The width the person last gave the conversation, or the shell's own.
 * @returns The width in pixels, within what it can be.
 */
function storedWidth(): number {
	try {
		const value = Number(window.localStorage.getItem(STORAGE_KEY));
		return Number.isFinite(value) && value >= MIN_WIDTH && value <= MAX_WIDTH
			? value
			: AGENT_PANEL_WIDTH;
	} catch {
		return AGENT_PANEL_WIDTH;
	}
}

/**
 * Keep the width, when the browser lets us.
 * @param width The width in pixels.
 */
function storeWidth(width: number): void {
	try {
		window.localStorage.setItem(STORAGE_KEY, String(Math.round(width)));
	} catch {
		// The width still holds for this session.
	}
}

/** Inputs for the columns. */
interface ConversationColumnsProps {
	/** Whether the conversation is open. */
	readonly open: boolean;
	/** The conversation was dragged shut. */
	readonly onClose: () => void;
	/** The conversation, drawn while it is open and while it slides out. */
	readonly conversation: ReactNode;
	/** The pane centre. */
	readonly children: ReactNode;
}

/** Whether the conversation is open, as last seen, and whether it is still moving to that. */
interface Slide {
	readonly open: boolean;
	readonly moving: boolean;
}

/**
 * The conversation and the pane centre, with the handle between them.
 * @param props Whether the conversation is open, how it closes and what fills the columns.
 * @returns The columns.
 */
function ConversationColumns(props: ConversationColumnsProps): JSX.Element {
	const { open, onClose } = props;
	const panel = usePanelRef();
	const [initialWidth] = useState(storedWidth);
	const width = useRef(initialWidth);
	const size = useRef(0);
	// Set in the render that changes `open`, so a shut conversation is never
	// unmounted before it has slid out.
	const [slide, setSlide] = useState<Slide>({ open, moving: false });
	if (slide.open !== open) setSlide({ open, moving: true });
	useEffect(() => {
		if (!slide.moving) return undefined;
		const done = setTimeout(
			() => setSlide({ open: slide.open, moving: false }),
			AGENT_PANEL_SLIDE_MS + 40,
		);
		return () => clearTimeout(done);
	}, [slide]);
	useEffect(() => {
		if (open) panel.current?.resize(width.current);
		else panel.current?.collapse();
	}, [open, panel]);
	const handleResize = useCallback(
		(next: PanelSize): void => {
			size.current = next.inPixels;
			// A size of nothing while it slides open is where it starts from, not a drag shut.
			if (next.inPixels === 0 && open && !slide.moving) onClose();
		},
		[onClose, open, slide.moving],
	);
	// The width is kept when a drag settles, never on the way: a drag that shuts the
	// conversation passes through every width below the one the person gave it.
	const handleSettled = useCallback((): void => {
		if (size.current < MIN_WIDTH) return;
		width.current = size.current;
		storeWidth(size.current);
	}, []);
	return (
		<ResizablePanelGroup
			orientation="horizontal"
			data-sliding={slide.moving ? "" : undefined}
			onLayoutChanged={handleSettled}
			style={GROUP_STYLE}
			className="min-w-0 flex-1"
		>
			<ResizablePanel
				id="conversation"
				panelRef={panel}
				collapsible
				collapsedSize={0}
				minSize={MIN_WIDTH}
				maxSize={MAX_WIDTH}
				defaultSize={open ? initialWidth : 0}
				groupResizeBehavior="preserve-pixel-size"
				onResize={handleResize}
				inert={!open}
				className="flex h-full justify-end overflow-hidden"
			>
				{(open || slide.moving) && props.conversation}
			</ResizablePanel>
			<ResizableHandle withHandle disabled={!open} />
			<ResizablePanel
				id="centre"
				minSize={CENTRE_MIN_WIDTH}
				className="flex h-full min-w-0 flex-col"
			>
				{props.children}
			</ResizablePanel>
		</ResizablePanelGroup>
	);
}

export { ConversationColumns, type ConversationColumnsProps };
