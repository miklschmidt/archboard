import { RiArrowDownSLine, RiCheckLine } from "@remixicon/react";
import { useCallback, useMemo, useState, type JSX } from "react";
import { cn, Command, Popover } from "@archboard/ui-kit/components";

/** One choice of a picker: the value it sends, what it shows, and a line under it. */
interface RefChoice {
	readonly value: string;
	readonly label: string;
	readonly detail?: string;
}

/** Inputs for a picker. */
interface RefPickerProps {
	/** What the picker chooses, as its label says it. */
	readonly label: string;
	/** The chosen value. */
	readonly value: string;
	/** What the trigger shows for the chosen value. */
	readonly shown: string;
	readonly choices: readonly RefChoice[];
	/** Whether a typed text that no choice matches can be chosen as it is. */
	readonly free: boolean;
	/** What the search field asks for. */
	readonly find: string;
	/** Whether the names are refs, which are set in mono, rather than names of states. */
	readonly mono?: boolean;
	readonly disabled?: boolean;
	readonly onChoose: (value: string) => void;
}

/**
 * A searchable list that chooses one ref or state: a trigger that names the choice, and a list
 * that a field filters. A typed text that no choice matches is offered as itself, so a reader can
 * name any ref that Git resolves, as the CLI can.
 * @param props What the picker chooses, its choices and what a choice does.
 * @returns The picker.
 */
function RefPicker(props: RefPickerProps): JSX.Element {
	const { label, value, shown, choices, free, find, disabled, onChoose } = props;
	const mono = props.mono ?? true;
	const [open, setOpen] = useState(false);
	const [query, setQuery] = useState("");
	const typed = query.trim();
	const listed = useMemo(() => offered(choices, typed, free), [choices, typed, free]);
	const choose = useCallback(
		(next: string): void => {
			onChoose(next);
			setOpen(false);
			setQuery("");
		},
		[onChoose],
	);
	return (
		<div data-slot="ref-picker" className="flex min-w-0 flex-col gap-1">
			<span className="text-body text-muted-foreground">{label}</span>
			<Popover open={open} onOpenChange={setOpen}>
				<Popover.Trigger
					disabled={disabled}
					aria-label={`${label}: ${shown}`}
					className={cn(
						"quiet-key text-control rounded-control flex h-8 max-w-80 min-w-48 items-center justify-between gap-2 px-2.5 disabled:opacity-60",
						mono && "font-mono",
					)}
				>
					<span className="truncate">{shown}</span>
					<RiArrowDownSLine aria-hidden="true" className="size-4 shrink-0 opacity-70" />
				</Popover.Trigger>
				<Popover.Content align="start" className="w-80 p-0">
					<Command label={label} shouldFilter={false}>
						<Command.Input value={query} onValueChange={setQuery} placeholder={find} />
						<Command.List>
							<Command.Empty>Nothing matches.</Command.Empty>
							{listed.map((choice) => (
								<Choice
									key={choice.value}
									choice={choice}
									chosen={choice.value === value}
									mono={mono}
									onChoose={choose}
								/>
							))}
						</Command.List>
					</Command>
				</Popover.Content>
			</Popover>
		</div>
	);
}

/**
 * One row of the list.
 * @param props The choice, whether it is chosen, and what choosing it does.
 * @param props.choice The choice.
 * @param props.chosen Whether it is the chosen one.
 * @param props.mono Whether the name is set in mono.
 * @param props.onChoose Choose it.
 * @returns The row.
 */
function Choice(props: {
	readonly choice: RefChoice;
	readonly chosen: boolean;
	readonly mono: boolean;
	readonly onChoose: (value: string) => void;
}): JSX.Element {
	const { choice, chosen, mono, onChoose } = props;
	const select = useCallback((): void => onChoose(choice.value), [choice.value, onChoose]);
	return (
		<Command.Item value={choice.value} onSelect={select} data-ref-choice={choice.value}>
			<span className="flex min-w-0 flex-1 flex-col">
				<span className={cn("truncate", mono && "font-mono")}>{choice.label}</span>
				{choice.detail !== undefined && (
					<span className="text-body text-muted-foreground truncate">{choice.detail}</span>
				)}
			</span>
			{chosen && <RiCheckLine aria-hidden="true" className="text-gold-mark size-4 shrink-0" />}
		</Command.Item>
	);
}

/**
 * The rows of the list: the typed text first, when a picker takes any ref and no choice is it,
 * then the choices that match it.
 * @param choices Every choice.
 * @param typed The typed text.
 * @param free Whether the picker takes any ref.
 * @returns The rows.
 */
function offered(
	choices: readonly RefChoice[],
	typed: string,
	free: boolean,
): readonly RefChoice[] {
	const matched = matching(choices, typed);
	const known = typed === "" || choices.some((one) => one.value === typed);
	return free && !known ? [{ value: typed, label: `Use "${typed}"` }, ...matched] : matched;
}

/**
 * The choices whose value or label holds the typed text, in their order.
 * @param choices Every choice.
 * @param typed The typed text.
 * @returns The matching choices.
 */
function matching(choices: readonly RefChoice[], typed: string): readonly RefChoice[] {
	const needle = typed.toLowerCase();
	if (needle === "") return choices;
	return choices.filter(
		(one) => one.value.toLowerCase().includes(needle) || one.label.toLowerCase().includes(needle),
	);
}

export { RefPicker, type RefChoice };
