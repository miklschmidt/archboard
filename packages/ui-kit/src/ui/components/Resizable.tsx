import type { JSX } from "react";
import * as ResizablePrimitive from "react-resizable-panels";

import { cn } from "#ui/rules/class-names.ts";

/**
 * A row (or, vertically, a column) of panels that share its space.
 * @param props The group's props.
 * @param props.className Added to the group's classes.
 * @returns The group.
 */
function ResizablePanelGroup({ className, ...props }: ResizablePrimitive.GroupProps): JSX.Element {
	return (
		<ResizablePrimitive.Group
			data-slot="resizable-panel-group"
			className={cn("flex h-full w-full aria-[orientation=vertical]:flex-col", className)}
			{...props}
		/>
	);
}

/**
 * One panel of a group.
 * @param props The panel's props.
 * @returns The panel.
 */
function ResizablePanel({ ...props }: ResizablePrimitive.PanelProps): JSX.Element {
	return <ResizablePrimitive.Panel data-slot="resizable-panel" {...props} />;
}

/**
 * The line between two panels, and the way to move it. Its target is wider than
 * the line it draws, and sits above the panels beside it, so a press near the line
 * lands on it and not on what is underneath. The line takes the ink on hover and
 * the gold of a choice while it is dragged, and the grip says it can be.
 * @param props The separator's props.
 * @param props.withHandle Whether to draw a grip on the line.
 * @param props.className Added to the line's classes.
 * @returns The handle.
 */
function ResizableHandle({
	withHandle,
	className,
	...props
}: ResizablePrimitive.SeparatorProps & {
	withHandle?: boolean;
}): JSX.Element {
	return (
		<ResizablePrimitive.Separator
			data-slot="resizable-handle"
			className={cn(
				"group/handle bg-border relative z-10 flex w-px shrink-0 items-center justify-center outline-hidden transition-colors",
				"after:absolute after:inset-y-0 after:left-1/2 after:w-3 after:-translate-x-1/2",
				"data-[separator=hover]:bg-foreground/30 data-[separator=active]:bg-primary-mark focus-visible:bg-ring",
				"data-[separator=disabled]:pointer-events-none data-[separator=disabled]:bg-transparent",
				"aria-[orientation=horizontal]:h-px aria-[orientation=horizontal]:w-full aria-[orientation=horizontal]:after:left-0 aria-[orientation=horizontal]:after:h-3 aria-[orientation=horizontal]:after:w-full aria-[orientation=horizontal]:after:translate-x-0 aria-[orientation=horizontal]:after:-translate-y-1/2",
				className,
			)}
			{...props}
		>
			{withHandle && (
				<span
					aria-hidden="true"
					className="bg-card border-border shadow-raised group-data-[separator=active]/handle:border-primary-mark group-data-[separator=hover]/handle:border-foreground/40 pointer-events-none z-10 flex h-8 w-1.5 shrink-0 rounded-full border transition-[border-color,opacity] group-data-[separator=disabled]/handle:opacity-0"
				/>
			)}
		</ResizablePrimitive.Separator>
	);
}

/** A row (or, vertically, a column) of panels that share its space, with the panel and the line between two as its parts. */
const Resizable = Object.assign(ResizablePanelGroup, {
	Handle: ResizableHandle,
	Panel: ResizablePanel,
});

export { Resizable };
