import { useCallback, useId, type FormEvent, type JSX } from "react";
import { Button, Field, Input } from "@archboard/ui-kit/components";
import type { Destination } from "#ui/clients/architecture-model/publication.ts";

interface PublicationDestinationProps {
	destination: Destination | undefined;
	pending: boolean;
	onSave: (destination: Destination) => void;
	onCancel: () => void;
}

/**
 * A reader explicitly selects a configured Git remote and an archive branch.
 * @param props The saved destination and configuration action.
 * @returns The destination form, without an inferred remote or source branch.
 */
function PublicationDestination(props: PublicationDestinationProps): JSX.Element {
	const id = useId();
	const { onSave } = props;
	/**
	 * Capture the submitted destination independently of later reading changes.
	 * @param event The form submission.
	 */
	const submit = useCallback(
		(event: FormEvent<HTMLFormElement>): void => {
			event.preventDefault();
			const fields = new FormData(event.currentTarget);
			onSave({ remote: fieldText(fields, "remote"), ref: fieldText(fields, "ref") });
		},
		[onSave],
	);

	return (
		<form
			data-slot="publication-destination"
			onSubmit={submit}
			className="mt-4 flex max-w-3xl items-end gap-4"
		>
			<Field className="flex-1">
				<Field.Label htmlFor={`${id}-remote`}>Git remote name</Field.Label>
				<Input
					id={`${id}-remote`}
					name="remote"
					required
					defaultValue={props.destination?.remote ?? ""}
					placeholder="Remote name"
					disabled={props.pending}
				/>
			</Field>
			<Field className="flex-[2]">
				<Field.Label htmlFor={`${id}-ref`}>Archive branch ref</Field.Label>
				<Input
					id={`${id}-ref`}
					name="ref"
					required
					defaultValue={props.destination?.ref ?? ""}
					placeholder="refs/heads/architecture-history"
					disabled={props.pending}
				/>
			</Field>
			<Button type="submit" data-slot="publication-configure" disabled={props.pending}>
				{props.pending ? "Saving…" : "Save destination"}
			</Button>
			<Button type="button" variant="ghost" disabled={props.pending} onClick={props.onCancel}>
				Cancel
			</Button>
		</form>
	);
}

/**
 * Read only the text fields this form submits.
 * @param fields The browser form data.
 * @param name The field name.
 * @returns Its trimmed text, or an empty value for native validation.
 */
function fieldText(fields: FormData, name: string): string {
	const value = fields.get(name);
	return typeof value === "string" ? value.trim() : "";
}

export { PublicationDestination };
