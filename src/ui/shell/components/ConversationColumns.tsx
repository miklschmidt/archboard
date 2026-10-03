// The conversation beside the navigator, and the pane centre beside it, with a
// handle on the line between them. The handle drags the conversation wider or
// narrower, or shut when it is dragged below its smallest. Its width is the
// person's, kept in this browser.
//
// The conversation slides open and shut without anything being laid out again
// as it moves. Opening, the columns are laid out at their final sizes at once
// and the conversation's content slides in from the navigator by a transform;
// shutting, the content slides out first and the columns are laid out once it
// has gone. The content keeps its width throughout, so it never reflows, and
// the pane centre beside it is laid out once, not on every frame. The content
// is mounted while it is open and while it slides out, so a shut conversation
// is not in the tab order or in the way of anything.

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

/** What the stylesheet slides the content with. */
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
 * Whether the person has not asked for less motion.
 * @returns True when the content may slide.
 */
function motionAllowed(): boolean {
	try {
		return !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
	} catch {
		return true;
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
 * The conversation's content, held at the width it will have and slid in or out
 * by a transform. Nothing while it is shut.
 * @param props Whether it is open, whether it is moving, and the content.
 * @param props.open Whether the conversation is open.
 * @param props.moving Whether it is sliding in or out.
 * @param props.children The content.
 * @returns The slide, or nothing.
 */
function ConversationSlide(props: {
	readonly open: boolean;
	readonly moving: boolean;
	readonly children: ReactNode;
}): JSX.Element | null {
	const { open, moving } = props;
	if (!open && !moving) return null;
	return (
		<div
			data-slot="conversation-slide"
			data-slide={moving ? (open ? "in" : "out") : undefined}
			className="flex h-full w-full min-w-80 shrink-0"
		>
			{props.children}
		</div>
	);
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
			AGENT_PANEL_SLIDE_MS + 20,
		);
		return () => clearTimeout(done);
	}, [slide]);
	// Opening is laid out at once; shutting waits for the content to have slid out.
	useEffect(() => {
		if (open) {
			panel.current?.resize(width.current);
			return undefined;
		}
		const shut = setTimeout(
			() => panel.current?.collapse(),
			motionAllowed() ? AGENT_PANEL_SLIDE_MS : 0,
		);
		return () => clearTimeout(shut);
	}, [open, panel]);
	const handleResize = useCallback(
		(next: PanelSize): void => {
			size.current = next.inPixels;
			// A size of nothing while it opens is where it starts from, not a drag shut.
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
				<ConversationSlide open={open} moving={slide.moving}>
					{props.conversation}
				</ConversationSlide>
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
