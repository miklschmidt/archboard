// A choice of one, with its options on it as `RadioGroup.Item`. The parts are the official
// shadcn ones, so the markup stays the registry's.

import {
	RadioGroupItem,
	RadioGroup as RadioGroupRoot,
} from "#ui/components/shadcn/radio-group.tsx";

/** A choice of one, with its options as its parts. */
const RadioGroup = Object.assign(RadioGroupRoot, { Item: RadioGroupItem });

export { RadioGroup };
