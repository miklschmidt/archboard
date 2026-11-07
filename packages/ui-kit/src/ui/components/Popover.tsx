// A popover with its parts on it: `Popover.Trigger` opens `Popover.Content` under itself. The parts
// are the official shadcn ones.

import {
	PopoverContent,
	Popover as PopoverRoot,
	PopoverTrigger,
} from "#ui/shadcn/components/popover.tsx";

/** A popover, with its trigger and its content as its parts. */
const Popover = Object.assign(PopoverRoot, { Content: PopoverContent, Trigger: PopoverTrigger });

export { Popover };
