// A command palette with its parts on it: `Command.Input`, `Command.List`, `Command.Empty` and
// `Command.Item` lay out what it finds. The parts are the official shadcn ones, on cmdk.

import {
	CommandEmpty,
	CommandInput,
	CommandItem,
	CommandList,
	Command as CommandRoot,
} from "#ui/shadcn/components/command.tsx";

/** A command palette, with its field, its list and its rows as its parts. */
const Command = Object.assign(CommandRoot, {
	Empty: CommandEmpty,
	Input: CommandInput,
	Item: CommandItem,
	List: CommandList,
});

export { Command };
