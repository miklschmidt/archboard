// A select with its parts on it: `Select.Trigger` shows `Select.Value` and opens
// `Select.Content`, which holds `Select.Item`. The parts are the official shadcn ones, so the
// markup stays the registry's.

import {
	SelectContent,
	SelectItem,
	Select as SelectRoot,
	SelectTrigger,
	SelectValue,
} from "#ui/components/shadcn/select.tsx";

/** A select, with its trigger, its value, its content and its items as its parts. */
const Select = Object.assign(SelectRoot, {
	Content: SelectContent,
	Item: SelectItem,
	Trigger: SelectTrigger,
	Value: SelectValue,
});

export { Select };
