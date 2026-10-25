// A tooltip with its parts on it: `Tooltip.Trigger` and `Tooltip.Content`, and
// `Tooltip.Provider`, which a page or a test wraps around every tooltip it draws. The parts are
// the official shadcn ones, so the markup stays the registry's.

import {
	TooltipContent,
	TooltipProvider,
	Tooltip as TooltipRoot,
	TooltipTrigger,
} from "#ui/components/shadcn/tooltip.tsx";

/** A tooltip, with its trigger, its content and the provider around tooltips as its parts. */
const Tooltip = Object.assign(TooltipRoot, {
	Content: TooltipContent,
	Provider: TooltipProvider,
	Trigger: TooltipTrigger,
});

export { Tooltip };
