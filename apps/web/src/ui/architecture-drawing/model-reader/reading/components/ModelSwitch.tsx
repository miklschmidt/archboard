import { useCallback, useMemo, type JSX } from "react";
import { ToggleGroup } from "@archboard/ui-kit/components";

/** Inputs for a switch between two ways of reading. */
interface ModelSwitchProps<Choice extends string> {
	readonly label: string;
	readonly slot: string;
	readonly choices: readonly { readonly value: Choice; readonly label: string }[];
	readonly value: Choice;
	readonly onChange: (value: Choice) => void;
}

/**
 * One of a few ways of reading the same thing, always one of them on.
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
			variant="outline"
			spacing={0}
			value={pressed}
			onValueChange={change}
		>
			{choices.map((choice) => (
				<ToggleGroup.Item
					key={choice.value}
					value={choice.value}
					data-choice={choice.value}
					className="text-muted-foreground aria-pressed:bg-tray-tab aria-pressed:text-foreground aria-pressed:shadow-raised"
				>
					{choice.label}
				</ToggleGroup.Item>
			))}
		</ToggleGroup>
	);
}

export { ModelSwitch };
