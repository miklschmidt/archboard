// The custom opener command's two fields: the executable and its arguments.

import { useCallback, useId, type ChangeEvent, type JSX } from "react";

import { LINE_TOKEN, PATH_TOKEN } from "#shared/schemas/opener-settings.ts";
import {
	Field,
	FieldDescription,
	FieldLabel,
	Input,
	InputGroup,
	InputGroupAddon,
	InputGroupText,
	InputGroupTextarea,
} from "@archboard/ui-kit/controls";
import { FieldIssues, Technical } from "@archboard/ui-kit/dialog-parts";
import type {
	CustomCommandDraft,
	CustomCommandIssues,
} from "#ui/state/opener-settings-contracts.ts";

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
function CustomCommandFields(props: CustomCommandFieldsProps): JSX.Element {
	const { draft, onDraft } = props;
	const executableId = useId();
	const argvId = useId();
	const handleExecutable = useCallback(
		(event: ChangeEvent<HTMLInputElement>) => onDraft({ ...draft, executable: event.target.value }),
		[draft, onDraft],
	);
	const handleArgv = useCallback(
		(event: ChangeEvent<HTMLTextAreaElement>) =>
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
							One argument per line. Exactly one must hold <Technical>{PATH_TOKEN}</Technical>,
							which becomes the file to open. <Technical>{LINE_TOKEN}</Technical> becomes the line
							where the bound symbol is defined, or 1.
						</InputGroupText>
					</InputGroupAddon>
				</InputGroup>
				<FieldIssues messages={argvIssues} />
			</Field>
		</>
	);
}

export { CustomCommandFields, type CustomCommandFieldsProps };
