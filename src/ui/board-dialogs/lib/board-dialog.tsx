// The board dialog: open a persisted board, create one, or save the current
// one under another address. It reports a typed request and shows whatever
// the host answers with; it never guesses the outcome (ADR 0012).

import { useCallback, useId, useMemo, useState } from "react";

import {
	boardDialogCopy,
	buildBoardDialogRequest,
	buildOpenRequest,
	draftHasBoardName,
	issuesFor,
} from "@/ui/board-dialogs/lib/board-request";
import type {
	BoardDialogDraft,
	BoardDialogIssue,
	BoardDialogProps,
} from "@/ui/board-dialogs/lib/contracts";
import {
	BusyText,
	DialogErrorAlert,
	FieldIssues,
	OUTLINE_BUTTON_CLASS,
} from "@/ui/board-dialogs/lib/dialog-parts";
import { Button } from "@/ui/components/button";
import {
	Combobox,
	ComboboxContent,
	ComboboxEmpty,
	ComboboxInput,
	ComboboxItem,
	ComboboxList,
} from "@/ui/components/combobox";
import {
	Dialog,
	DialogClose,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/ui/components/dialog";
import { Field, FieldDescription, FieldLabel } from "@/ui/components/field";
import { Input } from "@/ui/components/input";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/ui/components/select";

/** Inputs shared by both forms: the dialog's props, passed through whole. */
interface FormProps {
	dialog: BoardDialogProps;
}

/** Inputs for the footer. */
interface FormFooterProps {
	busy: boolean;
	busyText: string;
	canSubmit: boolean;
	submitLabel: string;
	issues: readonly BoardDialogIssue[];
	error: BoardDialogProps["error"];
}

/**
 * Form-level issues, the host's error, progress text and the two actions.
 * @param props The submission state.
 * @returns The footer block.
 */
function FormFooter(props: FormFooterProps): React.JSX.Element {
	const formIssues = issuesFor(props.issues, "form");
	return (
		<>
			<FieldIssues messages={formIssues} />
			<DialogErrorAlert error={props.error} />
			<BusyText busy={props.busy} text={props.busyText} />
			<DialogFooter>
				<DialogClose className={OUTLINE_BUTTON_CLASS} disabled={props.busy}>
					Cancel
				</DialogClose>
				<Button type="submit" disabled={!props.canSubmit}>
					{props.submitLabel}
				</Button>
			</DialogFooter>
		</>
	);
}

/**
 * The open form: a combobox over the persisted boards. The request carries
 * the chosen entry's identity, never a key string parsed back apart.
 * @param props The dialog's props.
 * @returns The form.
 */
function OpenBoardForm(props: FormProps): React.JSX.Element {
	const { dialog } = props;
	const copy = boardDialogCopy("open");
	const inputId = useId();
	const [selectedKey, setSelectedKey] = useState<string | null>(null);
	const keys = useMemo(
		() => dialog.boards?.boards.map((entry) => entry.key) ?? [],
		[dialog.boards],
	);
	const request = buildOpenRequest(dialog.boards, selectedKey);
	const handleSelect = useCallback((value: string | null) => setSelectedKey(value), []);
	const handleSubmit = useCallback(
		(event: React.FormEvent<HTMLFormElement>) => {
			event.preventDefault();
			if (request && !dialog.busy) {
				dialog.onSubmit(request);
			}
		},
		[dialog, request],
	);
	const renderItem = useCallback(
		(key: string) => (
			<ComboboxItem key={key} value={key}>
				{key}
			</ComboboxItem>
		),
		[],
	);
	const boardIssues = issuesFor(dialog.issues, "board");
	return (
		<form className="grid gap-4" onSubmit={handleSubmit}>
			<Field data-invalid={boardIssues.length > 0}>
				<FieldLabel htmlFor={inputId}>Board</FieldLabel>
				<Combobox items={keys} value={selectedKey} onValueChange={handleSelect}>
					<ComboboxInput id={inputId} placeholder="Board name" showClear disabled={dialog.busy} />
					<ComboboxContent>
						<ComboboxEmpty>No persisted board matches.</ComboboxEmpty>
						<ComboboxList>{renderItem}</ComboboxList>
					</ComboboxContent>
				</Combobox>
				<FieldDescription>
					{dialog.boards
						? `${dialog.boards.boards.length} boards in ${dialog.boards.vault}`
						: "Listing the vault…"}
				</FieldDescription>
				<FieldIssues messages={boardIssues} />
			</Field>
			<FormFooter
				busy={dialog.busy}
				busyText={copy.busyText}
				canSubmit={request !== null && !dialog.busy}
				submitLabel={copy.submitLabel}
				issues={dialog.issues}
				error={dialog.error}
			/>
		</form>
	);
}

/** Inputs for the level select. */
interface LevelFieldProps {
	levels: readonly string[];
	value: string | null;
	disabled: boolean;
	issues: readonly BoardDialogIssue[];
	onChange: (level: string | null) => void;
}

/**
 * The level select, offered only when the host knows any level.
 * @param props The levels, the chosen one and the change handler.
 * @returns The field, or nothing when there is no level to choose.
 */
function LevelField(props: LevelFieldProps): React.JSX.Element | null {
	const levelId = useId();
	const messages = issuesFor(props.issues, "level");
	if (props.levels.length === 0) {
		return null;
	}
	return (
		<Field data-invalid={messages.length > 0}>
			<FieldLabel htmlFor={levelId}>Level</FieldLabel>
			<Select value={props.value} onValueChange={props.onChange} disabled={props.disabled}>
				<SelectTrigger id={levelId} className="w-full">
					<SelectValue placeholder="No level" />
				</SelectTrigger>
				<SelectContent>
					<SelectItem value={null}>No level</SelectItem>
					{props.levels.map((level) => (
						<SelectItem key={level} value={level}>
							{level}
						</SelectItem>
					))}
				</SelectContent>
			</Select>
			<FieldIssues messages={messages} />
		</Field>
	);
}

/** Inputs for one text field of the named form. */
interface TextFieldProps {
	label: string;
	description: string;
	value: string;
	disabled: boolean;
	messages: readonly string[];
	onChange: (value: string) => void;
}

/**
 * One labelled text input with its description and issues.
 * @param props The label, value, messages and change handler.
 * @returns The field.
 */
function TextField(props: TextFieldProps): React.JSX.Element {
	const id = useId();
	const { onChange } = props;
	const handleChange = useCallback(
		(event: React.ChangeEvent<HTMLInputElement>) => onChange(event.target.value),
		[onChange],
	);
	return (
		<Field data-invalid={props.messages.length > 0}>
			<FieldLabel htmlFor={id}>{props.label}</FieldLabel>
			<Input
				id={id}
				value={props.value}
				onChange={handleChange}
				disabled={props.disabled}
				aria-invalid={props.messages.length > 0}
				autoComplete="off"
				spellCheck={false}
			/>
			<FieldDescription>{props.description}</FieldDescription>
			<FieldIssues messages={props.messages} />
		</Field>
	);
}

/**
 * The create and save-as form: a board name, an optional variant and an
 * optional level. Empty optional fields are dropped from the request.
 * @param props The dialog's props.
 * @returns The form.
 */
function NamedBoardForm(props: FormProps): React.JSX.Element {
	const { dialog } = props;
	const copy = boardDialogCopy(dialog.mode);
	const [draft, setDraft] = useState<BoardDialogDraft>(dialog.initial);
	const setBoard = useCallback((board: string) => setDraft((prior) => ({ ...prior, board })), []);
	const setVariant = useCallback(
		(variant: string) => setDraft((prior) => ({ ...prior, variant })),
		[],
	);
	const setLevel = useCallback(
		(level: string | null) => setDraft((prior) => ({ ...prior, level })),
		[],
	);
	const canSubmit = draftHasBoardName(draft) && !dialog.busy;
	const handleSubmit = useCallback(
		(event: React.FormEvent<HTMLFormElement>) => {
			event.preventDefault();
			if (canSubmit) {
				dialog.onSubmit(buildBoardDialogRequest(dialog.mode, draft));
			}
		},
		[canSubmit, dialog, draft],
	);
	return (
		<form className="grid gap-4" onSubmit={handleSubmit}>
			<TextField
				label="Board"
				description="The note's name in the vault."
				value={draft.board}
				disabled={dialog.busy}
				messages={issuesFor(dialog.issues, "board")}
				onChange={setBoard}
			/>
			<TextField
				label="Variant"
				description="Leave empty for the current architecture; name one to branch a proposal."
				value={draft.variant}
				disabled={dialog.busy}
				messages={issuesFor(dialog.issues, "variant")}
				onChange={setVariant}
			/>
			<LevelField
				levels={dialog.levels}
				value={draft.level}
				disabled={dialog.busy}
				issues={dialog.issues}
				onChange={setLevel}
			/>
			<FormFooter
				busy={dialog.busy}
				busyText={copy.busyText}
				canSubmit={canSubmit}
				submitLabel={copy.submitLabel}
				issues={dialog.issues}
				error={dialog.error}
			/>
		</form>
	);
}

/**
 * The board dialog. The form mounts with the dialog, so the draft starts from
 * `initial` every time it opens.
 * @param props The mode, listing, state and callbacks.
 * @returns The dialog.
 */
function BoardDialog(props: BoardDialogProps): React.JSX.Element {
	const copy = boardDialogCopy(props.mode);
	return (
		<Dialog open={props.open} onOpenChange={props.onOpenChange}>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>{copy.title}</DialogTitle>
					<DialogDescription>{copy.description}</DialogDescription>
				</DialogHeader>
				{props.mode === "open" ? (
					<OpenBoardForm dialog={props} />
				) : (
					<NamedBoardForm dialog={props} />
				)}
			</DialogContent>
		</Dialog>
	);
}

export { BoardDialog };
