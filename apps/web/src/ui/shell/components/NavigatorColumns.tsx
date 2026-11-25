// The navigator and everything beside it, with a handle on the line between them. The handle drags
// the navigator wider, so long names in its lists read whole, or narrower, between its narrowest
// and its widest. A double click puts it back to the shell's own width. Its width is the person's,
// kept in this browser.

import { useCallback, useState, type CSSProperties, type JSX, type ReactNode } from "react";
import { usePanelRef } from "react-resizable-panels";

import { shellLength } from "@archboard/renderer/shell-geometry";
import { Resizable } from "@archboard/ui-kit/components";
import { storedWidth, storeWidth, type ColumnWidths } from "#ui/shell/clients/column-width.ts";

/** What the navigator can be. */
const NAVIGATOR: ColumnWidths = {
	key: "archboard.navigator.width",
	min: 240,
	max: 520,
	initial: shellLength("navigator"),
};

/**
 * The column clips what it holds: its lists scroll in their own viewports, and the library gives
 * a panel `overflow: auto` in its style, which no class overrides.
 */
const COLUMN_STYLE: CSSProperties = { overflow: "clip" };

/**
 * The handle's own box is the grab zone: 8px wide on the navigator's side of the line, over the
 * gutter its rows keep, and pulled left so it adds 1px to the layout, the line. The library grows a
 * box narrower than its target size on both sides, so the target size is the box's width and no
 * press inside the picture reaches the handle. The line is the box's right edge: the chrome's tone
 * at rest, then the colours of the kit's handle under the pointer, while dragged and with focus.
 */
const HANDLE = [
	"z-40 -ml-[7px] w-2 bg-transparent after:hidden",
	"bg-[linear-gradient(var(--sidebar),var(--sidebar))] bg-right bg-no-repeat [background-size:1px_100%]",
	"data-[separator=hover]:bg-transparent data-[separator=hover]:bg-[linear-gradient(color-mix(in_oklch,var(--foreground)_30%,transparent),color-mix(in_oklch,var(--foreground)_30%,transparent))]",
	"data-[separator=active]:bg-transparent data-[separator=active]:bg-[linear-gradient(var(--primary-mark),var(--primary-mark))]",
	"focus-visible:bg-transparent focus-visible:bg-[linear-gradient(var(--ring),var(--ring))]",
].join(" ");

/** The library's target size: the handle's own width, so it grows the target by nothing. */
const TARGET_SIZE = { coarse: 8, fine: 8 } as const;

/** Inputs for the columns. */
interface NavigatorColumnsProps {
	/** The navigator. */
	readonly navigator: ReactNode;
	/** Everything beside it. */
	readonly children: ReactNode;
}

/**
 * The navigator and what stands beside it, with the handle between them. The line keeps the
 * chrome's tone at rest, so the navigator and the pane's header stay one plane, and it shows
 * under the pointer and while it is dragged.
 * @param props The navigator and what stands beside it.
 * @returns The columns.
 */
function NavigatorColumns(props: NavigatorColumnsProps): JSX.Element {
	const panelRef = usePanelRef();
	const [initialWidth] = useState(() => storedWidth(NAVIGATOR));
	// A double click goes back to the shell's own width, not to the width the column started at,
	// and keeps it, because the library reports the layout settled before the panel takes it.
	const reset = useCallback((): void => {
		panelRef.current?.resize(NAVIGATOR.initial);
		storeWidth(NAVIGATOR, NAVIGATOR.initial);
	}, [panelRef]);
	// The width is kept when a drag settles, never on the way, and read from the panel then, so it
	// is the width the column settled at.
	const handleSettled = useCallback((): void => {
		const width = panelRef.current?.getSize().inPixels;
		if (width !== undefined) storeWidth(NAVIGATOR, width);
	}, [panelRef]);
	return (
		<Resizable
			orientation="horizontal"
			resizeTargetMinimumSize={TARGET_SIZE}
			onLayoutChanged={handleSettled}
			className="min-w-0 flex-1"
		>
			<Resizable.Panel
				id="navigator"
				panelRef={panelRef}
				minSize={NAVIGATOR.min}
				maxSize={NAVIGATOR.max}
				defaultSize={initialWidth}
				groupResizeBehavior="preserve-pixel-size"
				style={COLUMN_STYLE}
				className="relative z-30 flex h-full"
			>
				{props.navigator}
			</Resizable.Panel>
			<Resizable.Handle
				aria-label="Navigator width"
				title="Drag to resize. Double-click for the usual width."
				disableDoubleClick
				onDoubleClick={reset}
				className={HANDLE}
			/>
			<Resizable.Panel id="beside" className="flex h-full min-w-0">
				{props.children}
			</Resizable.Panel>
		</Resizable>
	);
}

export { NavigatorColumns };
