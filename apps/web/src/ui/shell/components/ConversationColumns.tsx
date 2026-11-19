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
import { Resizable } from "@archboard/ui-kit/components";
import { storedWidth, storeWidth, type ColumnWidths } from "#ui/shell/clients/column-width.ts";

/** What the conversation can be: it shuts below its narrowest. */
const CONVERSATION: ColumnWidths = {
	key: "archboard.agent.panel.width",
	min: 320,
	max: 720,
	initial: AGENT_PANEL_WIDTH,
};

/** The narrowest the pane centre goes while the conversation is dragged wider. */
const CENTRE_MIN_WIDTH = 560;

/** What the stylesheet slides the content with. */
const GROUP_STYLE: CSSProperties = { "--panel-slide-ms": `${COLUMN_MS.agentPanelSlide}ms` };

/**
 * The column clips what it holds and never scrolls: the conversation scrolls in its own
 * viewport. The library gives the element that takes a panel's classes `overflow: auto` in its
 * style, which no class overrides, so a column that scrolled would draw a second scroll bar
 * and a scroll into view would move the whole conversation under its header.
 */
const COLUMN_STYLE: CSSProperties = { overflow: "clip" };

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
	const [initialWidth] = useState(() => storedWidth(CONVERSATION));
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
		if (size.current < CONVERSATION.min) return;
		setWidth(size.current);
		storeWidth(CONVERSATION, size.current);
	}, []);
	return (
		<Resizable
			orientation="horizontal"
			onLayoutChanged={handleSettled}
			style={GROUP_STYLE}
			data-sliding={slide.moving ? "" : undefined}
			className="min-w-0 flex-1"
		>
			<Resizable.Panel
				id="conversation"
				panelRef={panel}
				collapsible
				collapsedSize={0}
				minSize={CONVERSATION.min}
				maxSize={CONVERSATION.max}
				defaultSize={open ? initialWidth : 0}
				groupResizeBehavior="preserve-pixel-size"
				onResize={handleResize}
				inert={!open}
				style={COLUMN_STYLE}
				className="relative z-20 flex h-full justify-end"
			>
				<ConversationSlide open={open} moving={slide.moving} width={width}>
					{props.conversation}
				</ConversationSlide>
			</Resizable.Panel>
			{/* Closed, the handle takes the chrome's tone, so no line stands beside the picture. */}
			<Resizable.Handle
				withHandle
				disabled={!open}
				aria-label="Conversation width"
				className="data-[separator=disabled]:bg-sidebar"
			/>
			<Resizable.Panel
				id="centre"
				minSize={CENTRE_MIN_WIDTH}
				className="flex h-full min-w-0 flex-col"
			>
				{props.children}
			</Resizable.Panel>
		</Resizable>
	);
}

export { ConversationColumns };
