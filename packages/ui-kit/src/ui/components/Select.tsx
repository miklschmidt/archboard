// A select with its parts on it: `Select.Trigger` shows `Select.Value` and opens `Select.Content`,
// which holds `Select.Item`, in a `Select.Group` under a `Select.Label` where the choices fall into
// groups. The parts are the official shadcn ones, so the markup stays the registry's. Every select
// of the shell is this popover: it opens under its trigger, and it arrives and leaves as a menu does.

import type { Select as SelectPrimitive } from "@base-ui/react/select";
import type { ComponentProps, JSX } from "react";

import {
	SelectContent,
	SelectGroup,
	SelectItem,
	SelectLabel,
	Select as SelectRegistryRoot,
	SelectTrigger,
	SelectValue,
} from "#ui/components/shadcn/select.tsx";
import { cn } from "#ui/rules/class-names.ts";

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

/**
 * The popover. It stands under its trigger, because a list laid over the trigger cannot show where
 * it came from, and the registry's list over the trigger does not animate.
 * @param props The content's props.
 * @param props.align Which end of the trigger the popover keeps.
 * @returns The popover.
 */
function SelectPopover({
	align = "start",
	...props
}: Omit<ComponentProps<typeof SelectContent>, "alignItemWithTrigger">): JSX.Element {
	return <SelectContent {...props} align={align} alignItemWithTrigger={false} />;
}

/** Inputs for a choice. */
interface SelectChoiceProps extends ComponentProps<typeof SelectItem> {
	/** One line under the name that says what the choice is for. */
	readonly description?: string | undefined;
}

/**
 * One choice, with what it is for under its name.
 * @param props The choice.
 * @param props.description What it is for.
 * @param props.children Its name.
 * @returns The choice.
 */
function SelectChoice({ description, children, ...props }: SelectChoiceProps): JSX.Element {
	if (description === undefined) return <SelectItem {...props}>{children}</SelectItem>;
	return (
		<SelectItem {...props} className={cn("items-start py-1.5", props.className)}>
			<span className="flex min-w-0 flex-1 flex-col gap-0.5">
				<span className="whitespace-normal">{children}</span>
				<span
					data-slot="select-description"
					className="text-body text-muted-foreground font-normal whitespace-normal"
				>
					{description}
				</span>
			</span>
		</SelectItem>
	);
}

/** A select, with its trigger, its value, its content and its items as its parts. */
const Select = Object.assign(SelectRoot, {
	Content: SelectPopover,
	Group: SelectGroup,
	Item: SelectChoice,
	Label: SelectLabel,
	Trigger: SelectTrigger,
	Value: SelectValue,
});

export { Select };
