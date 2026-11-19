// A column beside the navigator, such as the conversation or the code view, and what lies beyond
// it, with a handle on the line between them. The handle drags the column wider or narrower, or
// shut when it is dragged below its smallest. Its width is the person's, kept in this browser.
//
// The column opens and shuts by its width, one panel size eased by the stylesheet, so what lies
// beyond gives way to it frame by frame and nothing jumps. The content keeps the width it has at
// rest throughout, held to the column's far edge, so it slides in from the navigator and never
// reflows. The content is mounted while it is open and while it slides out, so a shut column is
// not in the tab order or in the way of anything.
//
// The column's line is on its left edge, against the navigator. The handle on its right edge
// takes the chrome's tone at rest, so no line stands beside the picture's rounded sheet: it shows
// only while the pointer is on it or drags it.

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
import { usePanelRef, type Layout, type LayoutChangedMeta } from "react-resizable-panels";

import { columnMs, columnSlideSettledMs } from "@archboard/timing";
import { cn, Resizable } from "@archboard/ui-kit/components";
import { storedWidth, storeWidth, type ColumnWidths } from "#ui/shell/clients/column-width.ts";

/** How much room a visible handle takes between its panels. */
const SIDE_COLUMN_HANDLE_WIDTH = 1;

/** What the stylesheet slides the content with. */
const GROUP_STYLE: CSSProperties = { "--panel-slide-ms": `${columnMs("agentPanelSlide")}ms` };

/**
 * The column clips what it holds and never scrolls: its content scrolls in its own viewport. The
 * library gives the element that takes a panel's classes `overflow: auto` in its style, which no
 * class overrides, so a column that scrolled would draw a second scroll bar and a scroll into view
 * would move the whole content under its header.
 */
const COLUMN_STYLE: CSSProperties = { overflow: "clip" };

/**
 * Convert a settled layout's share to pixels before the panels themselves resize.
 * @param share The column's percentage of the group's panel space.
 * @param handle The handle between the panels.
 * @returns The settled width, when the group is mounted.
 */
function settledWidth(
	share: number | undefined,
	handle: HTMLDivElement | null,
): number | undefined {
	if (share === undefined || handle === null) return undefined;
	const group = handle.parentElement;
	if (group === null) return undefined;
	return Math.round((share / 100) * (group.clientWidth - handle.offsetWidth));
}

/** Inputs for a column. */
interface SideColumnProps {
	/** The column's panel, as the page names it. */
	readonly id: string;
	/** What the handle that sizes it is called. */
	readonly label: string;
	/** What the column can be, and where this browser keeps its width. */
	readonly widths: ColumnWidths;
	/** The minimum room to leave for the columns and panes beyond this one. */
	readonly minBeyond: number;
	/**
	 * Whether the shut column's handle keeps its one pixel. One handle does, so the stage beside
	 * the navigator is as wide as the shell geometry says with every column shut.
	 */
	readonly keepsHandle: boolean;
	/** Whether the column is open. */
	readonly open: boolean;
	/** The column was dragged shut. */
	readonly onClose: () => void;
	/** The column's content, drawn while it is open and while it slides out. */
	readonly content: ReactNode;
	/** What lies beyond the column. */
	readonly children: ReactNode;
}

/** Whether the column is open, as last seen, and whether it is still moving to that. */
interface Slide {
	readonly open: boolean;
	readonly moving: boolean;
}

/**
 * The column's content, held at the width it has at rest while the column moves under it.
 * Nothing while it is shut.
 * @param props Whether it is open, whether it is moving, its width and the content.
 * @param props.open Whether the column is open.
 * @param props.moving Whether the column is opening or shutting.
 * @param props.width The width the content has at rest, in pixels.
 * @param props.children The content.
 * @returns The content, or nothing.
 */
function ColumnSlide(props: {
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
		<div data-slot="column-slide" className="flex h-full w-full shrink-0" style={held}>
			{props.children}
		</div>
	);
}

/**
 * Whether a column is open, and whether it is still sliding there. Set in the render that changes
 * `open`, so a shut column is never unmounted before it has slid out.
 * @param open Whether the column is open.
 * @returns The slide.
 */
function useSlide(open: boolean): Slide {
	const [slide, setSlide] = useState<Slide>({ open, moving: false });
	if (slide.open !== open) setSlide({ open, moving: true });
	useEffect(() => {
		if (!slide.moving) return undefined;
		const done = setTimeout(
			() => setSlide({ open: slide.open, moving: false }),
			columnSlideSettledMs(columnMs("agentPanelSlide")),
		);
		return () => clearTimeout(done);
	}, [slide]);
	return slide;
}

/**
 * A column and what lies beyond it, with the handle between them.
 * @param props The column, whether it is open, how it closes and what lies beyond.
 * @returns The columns.
 */
function SideColumn(props: SideColumnProps): JSX.Element {
	const { id, open, onClose, widths } = props;
	const panel = usePanelRef();
	const handle = useRef<HTMLDivElement>(null);
	const [initialWidth] = useState(() => storedWidth(widths));
	const [width, setWidth] = useState(initialWidth);
	const slide = useSlide(open);
	const group = useRef<HTMLDivElement>(null);
	const { minBeyond } = props;
	// An inner column can gain or lose room when its parent resizes.
	useEffect(() => {
		const element = group.current;
		if (!open || element === null) return undefined;
		/** Fit the preferred width after the library has updated its own limits. */
		const resize = (): void => {
			const available = element.clientWidth - SIDE_COLUMN_HANDLE_WIDTH - minBeyond;
			if (available >= widths.min) panel.current?.resize(Math.min(width, available));
		};
		let frame = 0;
		const observer = new ResizeObserver(() => {
			cancelAnimationFrame(frame);
			frame = requestAnimationFrame(resize);
		});
		observer.observe(element);
		/** Stop resizing the column after it closes. */
		return () => {
			observer.disconnect();
			cancelAnimationFrame(frame);
		};
	}, [minBeyond, open, panel, width, widths.min]);
	// The stylesheet eases the column to the size it is given here.
	useEffect(() => {
		if (open) panel.current?.resize(width);
		else panel.current?.collapse();
	}, [open, width, panel]);
	// A parent panel can resize this group. Only a move of its own handle changes the
	// preferred width. The settled layout arrives before the DOM reflects the new size.
	const handleSettled = useCallback(
		(layout: Layout, meta: LayoutChangedMeta): void => {
			if (!open || !meta.isUserInteraction) return;
			const nextWidth = settledWidth(layout[id], handle.current);
			if (nextWidth === undefined) return;
			if (nextWidth === 0) {
				onClose();
				return;
			}
			const preferred = Math.max(widths.min, Math.min(widths.max, nextWidth));
			setWidth(preferred);
			storeWidth(widths, preferred);
		},
		[id, onClose, open, widths],
	);
	return (
		<Resizable
			orientation="horizontal"
			elementRef={group}
			onLayoutChanged={handleSettled}
			style={GROUP_STYLE}
			data-sliding={slide.moving ? "" : undefined}
			className="min-w-0 flex-1"
		>
			<Resizable.Panel
				id={props.id}
				panelRef={panel}
				collapsible
				collapsedSize={0}
				minSize={widths.min}
				maxSize={widths.max}
				defaultSize={open ? initialWidth : 0}
				groupResizeBehavior="preserve-pixel-size"
				inert={!open}
				style={COLUMN_STYLE}
				className="before:bg-border relative z-20 flex h-full justify-end before:absolute before:inset-y-0 before:left-0 before:z-50 before:w-px"
			>
				<ColumnSlide open={open} moving={slide.moving} width={width}>
					{props.content}
				</ColumnSlide>
			</Resizable.Panel>
			<Resizable.Handle
				elementRef={handle}
				withHandle
				disabled={!open}
				aria-label={props.label}
				className={cn(
					"bg-sidebar data-[separator=disabled]:bg-sidebar",
					!props.keepsHandle && "data-[separator=disabled]:w-0",
				)}
			/>
			<Resizable.Panel
				id={`${props.id}-beyond`}
				minSize={minBeyond}
				className="flex h-full min-w-0 flex-col"
			>
				{props.children}
			</Resizable.Panel>
		</Resizable>
	);
}

export { SideColumn, SIDE_COLUMN_HANDLE_WIDTH };
