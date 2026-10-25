// A select with its parts on it: `Select.Trigger` shows `Select.Value` and opens
// `Select.Content`, which holds `Select.Item`. The parts are the official shadcn ones, so the
// markup stays the registry's.

import type { Select as SelectPrimitive } from "@base-ui/react/select";
import type { JSX } from "react";

import {
	SelectContent,
	SelectItem,
	Select as SelectRegistryRoot,
	SelectTrigger,
	SelectValue,
} from "#ui/components/shadcn/select.tsx";

/**
 * The select's root. The registry's root is Base UI's own `Select.Root`, so the composite puts its
 * parts on this function of the package's and leaves the library's export as it is.
 * @param props The root's props, generic in the value and in whether it holds several.
 * @returns The root.
 */
function SelectRoot<Value, Multiple extends boolean | undefined = false>(
	props: SelectPrimitive.Root.Props<Value, Multiple>,
): JSX.Element {
	return <SelectRegistryRoot {...props} />;
}

/** A select, with its trigger, its value, its content and its items as its parts. */
const Select = Object.assign(SelectRoot, {
	Content: SelectContent,
	Item: SelectItem,
	Trigger: SelectTrigger,
	Value: SelectValue,
});

export { Select };
