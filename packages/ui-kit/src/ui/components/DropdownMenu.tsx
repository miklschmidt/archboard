// A dropdown menu with its parts on it: `DropdownMenu.Trigger` opens `DropdownMenu.Content`,
// which holds items, groups with labels, radio groups and separators. The parts are the
// official shadcn ones, so the markup stays the registry's.

import {
	DropdownMenuCheckboxItem,
	DropdownMenuContent,
	DropdownMenuGroup,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuRadioGroup,
	DropdownMenuRadioItem,
	DropdownMenu as DropdownMenuRoot,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "#ui/components/shadcn/dropdown-menu.tsx";

/** A dropdown menu, with its trigger, its content and what the content holds as its parts. */
const DropdownMenu = Object.assign(DropdownMenuRoot, {
	CheckboxItem: DropdownMenuCheckboxItem,
	Content: DropdownMenuContent,
	Group: DropdownMenuGroup,
	Item: DropdownMenuItem,
	Label: DropdownMenuLabel,
	RadioGroup: DropdownMenuRadioGroup,
	RadioItem: DropdownMenuRadioItem,
	Separator: DropdownMenuSeparator,
	Trigger: DropdownMenuTrigger,
});

export { DropdownMenu };
