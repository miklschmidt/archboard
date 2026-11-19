import { useCallback, useMemo, type JSX } from "react";
import { cn, ToggleGroup } from "@archboard/ui-kit/components";

/** Inputs for a switch between two ways of reading. */
interface ModelSwitchProps<Choice extends string> {
	readonly label: string;
	readonly slot: string;
	readonly choices: readonly { readonly value: Choice; readonly label: string }[];
	readonly value: Choice;
	readonly onChange: (value: Choice) => void;
	/**
	 * Whether the switch fills its row beside 32px keys, as tall as they are: each choice takes its
	 * words and an inset, and they share the rest.
	 */
	readonly wide?: boolean;
}

/**
 * One of a few ways of reading the same thing, always one of them on: the site's trough, with the
 * one on raised out of it.
 * @param props The choices and the one on.
 * @returns The switch.
 */
function ModelSwitch<Choice extends string>(props: ModelSwitchProps<Choice>): JSX.Element {
	const { choices, value, onChange } = props;
	const pressed = useMemo(() => [value], [value]);
	const change = useCallback(
		(values: readonly unknown[]): void => {
			const chosen = choices.find((choice) => choice.value === values[0]);
			if (chosen !== undefined) onChange(chosen.value);
		},
		[choices, onChange],
	);
	return (
		<ToggleGroup
			aria-label={props.label}
			data-slot={props.slot}
			size="sm"
			spacing={0.5}
			value={pressed}
			onValueChange={change}
			className={props.wide === true ? "trough w-full" : "trough"}
		>
			{choices.map((choice) => (
				<ToggleGroup.Item
					key={choice.value}
					value={choice.value}
					data-choice={choice.value}
					className={cn(
						"text-muted-foreground hover:text-foreground aria-pressed:text-foreground aria-pressed:chosen-face rounded-control aria-pressed:bg-face h-6 hover:bg-transparent",
						props.wide === true && "h-[26px] flex-auto px-3",
					)}
				>
					{choice.label}
				</ToggleGroup.Item>
			))}
		</ToggleGroup>
	);
}

export { ModelSwitch };
