// The opener choice as a radio group: platform default, each preset, or a
// custom command, with the saved selection's availability on its own option.

import { useCallback, useId, type JSX } from "react";

import type { OpenerCommand, OpenerSettingsReply } from "@/shared/code-target";
import { Badge } from "@/ui/components/badge";
import {
	Field,
	FieldContent,
	FieldDescription,
	FieldLabel,
	FieldLegend,
	FieldSet,
} from "@/ui/components/field";
import { RadioGroup, RadioGroupItem } from "@/ui/components/radio-group";
import { Technical } from "@/ui/dialog-parts";
import { choiceOfSelection, presetChoice } from "@/ui/opener-settings/lib/custom-command";
import { formatCommand } from "@/ui/opener-settings/lib/format-command";
import type { OpenerChoice } from "@/ui/opener-settings/types/contracts";

/** Inputs for the choice group. */
interface OpenerChoiceGroupProps {
	settings: OpenerSettingsReply;
	choice: OpenerChoice;
	disabled: boolean;
	onChoice: (choice: OpenerChoice) => void;
}

/**
 * The opener choice: platform default, each preset, or a custom command.
 * @param props The settings, the current choice and the change handler.
 * @returns A radio group inside a field set.
 */
function OpenerChoiceGroup(props: OpenerChoiceGroupProps): JSX.Element {
	const { settings, onChoice } = props;
	const handleChange = useCallback((value: OpenerChoice) => onChoice(value), [onChoice]);
	return (
		<FieldSet>
			<FieldLegend variant="label">Opener</FieldLegend>
			<RadioGroup value={props.choice} onValueChange={handleChange} disabled={props.disabled}>
				<OpenerOption
					value="platform"
					label="Platform default"
					command={settings.platformDefault}
					availability={availabilityFor(settings, "platform")}
					disabled={settings.platformDefault === null}
				/>
				{settings.presets.map((entry) => (
					<OpenerOption
						key={entry.preset}
						value={presetChoice(entry.preset)}
						label={PRESET_LABELS[entry.preset]}
						command={entry.command}
						availability={availabilityFor(settings, presetChoice(entry.preset))}
						disabled={false}
					/>
				))}
				<OpenerOption
					value="custom"
					label="Custom command"
					command={settings.selection.kind === "custom" ? settings.selection : null}
					availability={availabilityFor(settings, "custom")}
					disabled={false}
				/>
			</RadioGroup>
		</FieldSet>
	);
}

/** Inputs for one opener option. */
interface OpenerOptionProps {
	value: OpenerChoice;
	label: string;
	/** The command this option runs, or null when the platform has none. */
	command: OpenerCommand | null;
	/** The saved selection's availability, shown on the option it names. */
	availability: OpenerSettingsReply["availability"] | null;
	disabled: boolean;
}

/**
 * One radio option: its name, its command, and its availability when it is
 * the saved one.
 * @param props The option.
 * @returns A horizontal field.
 */
function OpenerOption(props: OpenerOptionProps): JSX.Element {
	const id = useId();
	return (
		<Field orientation="horizontal">
			<RadioGroupItem id={id} value={props.value} disabled={props.disabled} />
			<FieldContent>
				<FieldLabel htmlFor={id} className="items-center gap-2">
					{props.label}
					{props.availability !== null && <AvailabilityBadge availability={props.availability} />}
				</FieldLabel>
				<FieldDescription>
					{props.command ? (
						<Technical>{formatCommand(props.command)}</Technical>
					) : (
						"No opener is known for this platform."
					)}
				</FieldDescription>
			</FieldContent>
		</Field>
	);
}

/** Inputs for the availability badge. */
interface AvailabilityBadgeProps {
	availability: OpenerSettingsReply["availability"];
}

/**
 * Whether the saved opener can run, as the server last checked. An opener
 * that cannot run is a warning with a choice beside it, not a failure.
 * @param props The availability.
 * @returns A badge.
 */
function AvailabilityBadge(props: AvailabilityBadgeProps): JSX.Element {
	const { availability } = props;
	if (availability.available) {
		return <Badge variant="outline">Available</Badge>;
	}
	return (
		<Badge variant="outline" size="technical" className="border-warning/60 text-warning-foreground">
			{availability.code}
		</Badge>
	);
}

/**
 * The availability to show on one option: the saved selection's, on the
 * option that is the saved selection.
 * @param settings The settings reply.
 * @param value The option being rendered.
 * @returns The availability, or null on every other option.
 */
function availabilityFor(
	settings: OpenerSettingsReply,
	value: OpenerChoice,
): OpenerSettingsReply["availability"] | null {
	return choiceOfSelection(settings.selection) === value ? settings.availability : null;
}

const PRESET_LABELS: Readonly<Record<OpenerSettingsReply["presets"][number]["preset"], string>> = {
	vscode: "Visual Studio Code",
	cursor: "Cursor",
	zed: "Zed",
};

export { OpenerChoiceGroup, type OpenerChoiceGroupProps };
