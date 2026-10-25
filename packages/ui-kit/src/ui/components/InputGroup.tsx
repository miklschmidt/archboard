// A text input with what sits beside it, its parts on it: `InputGroup.Textarea` and
// `InputGroup.Addon`, which holds `InputGroup.Text`. The parts are the official shadcn ones, so
// the markup stays the registry's.

import {
	InputGroupAddon,
	InputGroup as InputGroupRoot,
	InputGroupText,
	InputGroupTextarea,
} from "#ui/components/shadcn/input-group.tsx";

/** A text input with its addons, as its parts. */
const InputGroup = Object.assign(InputGroupRoot, {
	Addon: InputGroupAddon,
	Text: InputGroupText,
	Textarea: InputGroupTextarea,
});

export { InputGroup };
