// A row of toggles, with each toggle on it as `ToggleGroup.Item`. The parts are the official
// shadcn ones, so the markup stays the registry's.

import {
	ToggleGroupItem,
	ToggleGroup as ToggleGroupRoot,
} from "#ui/components/shadcn/toggle-group.tsx";

/** A row of toggles, with its toggles as its parts. */
const ToggleGroup = Object.assign(ToggleGroupRoot, { Item: ToggleGroupItem });

export { ToggleGroup };
