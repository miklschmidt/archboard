// The opener choice as a radio group, and the custom command's fields.

import { useCallback, useId } from "react";

import { PATH_TOKEN, type OpenerCommand, type OpenerSettingsReply } from "@/shared/code-target";
import { FieldIssues, Technical } from "@/ui/board-dialogs";
import { Badge } from "@/ui/components/badge";
import {
	Field,
	FieldContent,
	FieldDescription,
	FieldLabel,
	FieldLegend,
	FieldSet,
} from "@/ui/components/field";
import { Input } from "@/ui/components/input";
import {
	InputGroup,
	InputGroupAddon,
	InputGroupText,
	InputGroupTextarea,
} from "@/ui/components/input-group";
import { RadioGroup, RadioGroupItem } from "@/ui/components/radio-group";
import type {
	CustomCommandDraft,
	CustomCommandIssues,
	OpenerChoice,
} from "@/ui/opener-settings/lib/contracts";
import { choiceOfSelection, presetChoice } from "@/ui/opener-settings/lib/custom-command";

/**
 * A command on one line, for the mono face.
 * @param command The executable and its argv.
 * @returns The command as it would be typed.
 */
function formatCommand(command: OpenerCommand): string {
	return [command.executable, ...command.argv].join(" ");
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
function AvailabilityBadge(props: AvailabilityBadgeProps): React.JSX.Element {
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
function OpenerOption(props: OpenerOptionProps): React.JSX.Element {
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

/** Inputs for the choice group. */
interface OpenerChoiceGroupProps {
	settings: OpenerSettingsReply;
	choice: OpenerChoice;
	disabled: boolean;
	onChoice: (choice: OpenerChoice) => void;
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

/**
 * The opener choice: platform default, each preset, or a custom command.
 * @param props The settings, the current choice and the change handler.
 * @returns A radio group inside a field set.
 */
function OpenerChoiceGroup(props: OpenerChoiceGroupProps): React.JSX.Element {
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

const PRESET_LABELS: Readonly<Record<OpenerSettingsReply["presets"][number]["preset"], string>> = {
	vscode: "Visual Studio Code",
	cursor: "Cursor",
	zed: "Zed",
};

/** Inputs for the custom command fields. */
interface CustomCommandFieldsProps {
	draft: CustomCommandDraft;
	disabled: boolean;
	/** Messages to show, or null before the first attempt. */
	issues: CustomCommandIssues | null;
	onDraft: (draft: CustomCommandDraft) => void;
}

const NO_ISSUES: readonly string[] = [];

/**
 * The executable and its arguments.
 * @param props The draft, its issues and the change handler.
 * @returns Two fields.
 */
function CustomCommandFields(props: CustomCommandFieldsProps): React.JSX.Element {
	const { draft, onDraft } = props;
	const executableId = useId();
	const argvId = useId();
	const handleExecutable = useCallback(
		(event: React.ChangeEvent<HTMLInputElement>) =>
			onDraft({ ...draft, executable: event.target.value }),
		[draft, onDraft],
	);
	const handleArgv = useCallback(
		(event: React.ChangeEvent<HTMLTextAreaElement>) =>
			onDraft({ ...draft, argvText: event.target.value }),
		[draft, onDraft],
	);
	const executableIssues = props.issues?.executable ?? NO_ISSUES;
	const argvIssues = props.issues?.argv ?? NO_ISSUES;
	return (
		<>
			<Field data-invalid={executableIssues.length > 0}>
				<FieldLabel htmlFor={executableId}>Executable</FieldLabel>
				<Input
					id={executableId}
					value={draft.executable}
					onChange={handleExecutable}
					disabled={props.disabled}
					aria-invalid={executableIssues.length > 0}
					className="font-mono"
					autoComplete="off"
					spellCheck={false}
				/>
				<FieldDescription>A command name on PATH, or an absolute path.</FieldDescription>
				<FieldIssues messages={executableIssues} />
			</Field>
			<Field data-invalid={argvIssues.length > 0}>
				<FieldLabel htmlFor={argvId}>Arguments</FieldLabel>
				<InputGroup>
					<InputGroupTextarea
						id={argvId}
						value={draft.argvText}
						onChange={handleArgv}
						disabled={props.disabled}
						aria-invalid={argvIssues.length > 0}
						className="font-mono"
						rows={3}
						spellCheck={false}
					/>
					<InputGroupAddon align="block-end">
						<InputGroupText>
							One argument per line. Exactly one must be <Technical>{PATH_TOKEN}</Technical>, which
							becomes the file to open.
						</InputGroupText>
					</InputGroupAddon>
				</InputGroup>
				<FieldIssues messages={argvIssues} />
			</Field>
		</>
	);
}

export { CustomCommandFields, OpenerChoiceGroup, formatCommand };
