// The conversation beside the navigator, and the pane centre beside it, with a
// handle on the line between them. The handle drags the conversation wider or
// narrower, or shut when it is dragged below its smallest. Its width is the
// person's, kept in this browser.
//
// The conversation opens and shuts by its column's width, one panel size eased
// by the stylesheet, so the pane centre gives way to it frame by frame and
// nothing jumps. The content keeps the width it has at rest throughout, held to
// the column's far edge, so it slides in from the navigator and never reflows.
// The content is mounted while it is open and while it slides out, so a shut
// conversation is not in the tab order or in the way of anything.

import {
	useCallback,
	useEffect,
	useMemo,
	useRef,
	useState,
	type CSSProperties,
	type JSX,
	type ReactNode,
} from "react";
import { usePanelRef, type PanelSize } from "react-resizable-panels";

import { AGENT_PANEL_WIDTH } from "@archboard/renderer/shell-geometry";
import { COLUMN_MS } from "@archboard/timing";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@archboard/ui-kit/display";

const STORAGE_KEY = "archboard.agent.panel.width";

/** The narrowest the conversation goes before it shuts, in pixels. */
const MIN_WIDTH = 320;

/** The widest the conversation is dragged, in pixels. */
const MAX_WIDTH = 720;

/** The narrowest the pane centre goes while the conversation is dragged wider. */
const CENTRE_MIN_WIDTH = 560;

/** What the stylesheet slides the content with. */
const GROUP_STYLE: CSSProperties = { "--panel-slide-ms": `${COLUMN_MS.agentPanelSlide}ms` };

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
 * The conversation's content, held at the width it has at rest while the column
 * moves under it. Nothing while it is shut.
 * @param props Whether it is open, whether it is moving, its width and the content.
 * @param props.open Whether the conversation is open.
 * @param props.moving Whether the column is opening or shutting.
 * @param props.width The width the content has at rest, in pixels.
 * @param props.children The content.
 * @returns The content, or nothing.
 */
function ConversationSlide(props: {
	readonly open: boolean;
	readonly moving: boolean;
	readonly width: number;
	readonly children: ReactNode;
}): JSX.Element | null {
	const { open, moving, width } = props;
	const held = useMemo(
		(): CSSProperties | undefined => (moving ? { width } : undefined),
		[moving, width],
	);
	if (!open && !moving) return null;
	return (
		<div data-slot="conversation-slide" className="flex h-full w-full shrink-0" style={held}>
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
	const [width, setWidth] = useState(initialWidth);
	const size = useRef(0);
	// Set in the render that changes `open`, so a shut conversation is never
	// unmounted before it has slid out.
	const [slide, setSlide] = useState<Slide>({ open, moving: false });
	if (slide.open !== open) setSlide({ open, moving: true });
	useEffect(() => {
		if (!slide.moving) return undefined;
		const done = setTimeout(
			() => setSlide({ open: slide.open, moving: false }),
			COLUMN_MS.agentPanelSlide + COLUMN_MS.slideSettled,
		);
		return () => clearTimeout(done);
	}, [slide]);
	// The stylesheet eases the column to the size it is given here.
	useEffect(() => {
		if (open) panel.current?.resize(width);
		else panel.current?.collapse();
	}, [open, width, panel]);
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
		setWidth(size.current);
		storeWidth(size.current);
	}, []);
	return (
		<ResizablePanelGroup
			orientation="horizontal"
			onLayoutChanged={handleSettled}
			style={GROUP_STYLE}
			data-sliding={slide.moving ? "" : undefined}
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
				<ConversationSlide open={open} moving={slide.moving} width={width}>
					{props.conversation}
				</ConversationSlide>
			</ResizablePanel>
			<ResizableHandle withHandle disabled={!open} aria-label="Conversation width" />
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
