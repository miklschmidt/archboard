"use client";

import { Tooltip as TooltipPrimitive } from "@base-ui/react/tooltip";
import { cn } from "#ui/rules/class-names.ts";

function TooltipProvider({ delay = 0, ...props }: TooltipPrimitive.Provider.Props) {
	return <TooltipPrimitive.Provider data-slot="tooltip-provider" delay={delay} {...props} />;
}

function Tooltip({ ...props }: TooltipPrimitive.Root.Props) {
	return <TooltipPrimitive.Root data-slot="tooltip" {...props} />;
}

function TooltipTrigger({ ...props }: TooltipPrimitive.Trigger.Props) {
	return <TooltipPrimitive.Trigger data-slot="tooltip-trigger" {...props} />;
}

/**
 * Archboard: how a tooltip looks. A label is a few words on the inverted
 * surface; a card is a small panel on the popover surface, for a tip that
 * explains a part of the picture in sentences.
 */
const LOOKS = {
	label: {
		popup: "bg-foreground text-background shadow-float max-w-xs rounded-md px-3 py-1.5",
		arrow: "bg-foreground fill-foreground",
		arrowPadding: 5,
	},
	card: {
		// Clear of the card's rounded corner when the card is pushed against an edge of the screen.
		arrowPadding: 14,
		popup:
			"bg-popover text-popover-foreground border-border max-h-(--available-height) max-w-[min(24rem,calc(var(--available-width)-1rem))] rounded-lg border px-3.5 py-3 shadow-float",
		arrow:
			"bg-popover fill-popover border-border data-[side=bottom]:border-t data-[side=bottom]:border-l data-[side=left]:border-t data-[side=left]:border-r data-[side=right]:border-b data-[side=right]:border-l data-[side=top]:border-r data-[side=top]:border-b",
	},
} as const;

function TooltipContent({
	className,
	side = "top",
	sideOffset = 4,
	align = "center",
	alignOffset = 0,
	anchor,
	look = "label",
	children,
	...props
}: TooltipPrimitive.Popup.Props &
	Pick<
		TooltipPrimitive.Positioner.Props,
		"align" | "alignOffset" | "anchor" | "side" | "sideOffset"
	> & { readonly look?: keyof typeof LOOKS }) {
	return (
		<TooltipPrimitive.Portal>
			<TooltipPrimitive.Positioner
				// Archboard: a tooltip with no trigger, such as one over a part of a
				// drawn picture, is placed against the element it explains.
				anchor={anchor}
				// Archboard: fixed, so a tooltip never makes the page larger than the
				// window. Its arrow can hang past the edge for a frame while a control it
				// points at is still moving into view, as the agent dock's are.
				positionMethod="fixed"
				align={align}
				alignOffset={alignOffset}
				side={side}
				sideOffset={sideOffset}
				arrowPadding={LOOKS[look].arrowPadding}
				// Archboard: a tooltip never intercepts the pointer, so one that is still
				// closing, or open on focus, cannot swallow a click meant for a neighbour.
				className="pointer-events-none isolate z-50"
			>
				<TooltipPrimitive.Popup
					data-slot="tooltip-content"
					className={cn(
						LOOKS[look].popup,
						// Archboard: a word longer than the tooltip breaks rather than
						// running out past its edge.
						"data-[side=bottom]:slide-in-from-top-2 data-[side=inline-end]:slide-in-from-left-2 data-[side=inline-start]:slide-in-from-right-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 data-[state=delayed-open]:animate-in data-[state=delayed-open]:fade-in-0 data-[state=delayed-open]:zoom-in-95 data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95 text-body z-50 inline-flex w-fit origin-(--transform-origin) items-center gap-1.5 [overflow-wrap:anywhere] has-data-[slot=kbd]:pr-1.5 **:data-[slot=kbd]:relative **:data-[slot=kbd]:isolate **:data-[slot=kbd]:z-50 **:data-[slot=kbd]:rounded-sm",
						className,
					)}
					{...props}
				>
					{children}
					<TooltipPrimitive.Arrow
						className={cn(
							LOOKS[look].arrow,
							"rounded-chip z-50 size-2.5 translate-y-[calc(-50%-2px)] rotate-45 data-[side=bottom]:top-1 data-[side=inline-end]:top-1/2! data-[side=inline-end]:-left-1 data-[side=inline-end]:-translate-y-1/2 data-[side=inline-start]:top-1/2! data-[side=inline-start]:-right-1 data-[side=inline-start]:-translate-y-1/2 data-[side=left]:top-1/2! data-[side=left]:-right-1 data-[side=left]:-translate-y-1/2 data-[side=right]:top-1/2! data-[side=right]:-left-1 data-[side=right]:-translate-y-1/2 data-[side=top]:-bottom-2.5",
						)}
					/>
				</TooltipPrimitive.Popup>
			</TooltipPrimitive.Positioner>
		</TooltipPrimitive.Portal>
	);
}

export { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider };
