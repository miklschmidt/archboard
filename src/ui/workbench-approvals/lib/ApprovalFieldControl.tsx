import { useCallback, useId, type ChangeEvent, type ReactNode } from "react";

import { cn } from "../../ui-classnames/index.js";
import type { WorkbenchApprovalField, WorkbenchApprovalFormEvent } from "../contract.js";
import { formFlag, formSelection, formValue } from "./form.js";
import type { WorkbenchApprovalFormState } from "../contract.js";

const CONTROL_CLASSES =
	"min-h-touch-target w-full rounded-control border border-border bg-surface-raised px-control py-compact font-sans text-body text-foreground outline-none focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-2 focus-visible:outline-ring";
const LABEL_CLASSES = "font-sans text-body font-medium text-foreground";
const HINT_CLASSES = "m-0 font-sans text-body text-muted-foreground";
const ERROR_CLASSES = "m-0 font-sans text-body text-destructive";
const CHECKBOX_CLASSES =
	"size-grid-tight m-0 outline-none focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-2 focus-visible:outline-ring";

const INPUT_TYPES = {
	text: "text",
	secret: "password",
	number: "number",
	integer: "number",
	url: "url",
	email: "email",
	date: "date",
	date_time: "datetime-local",
	lines: "text",
} as const;

export interface ApprovalFieldControlProps {
	readonly cardKey: string;
	readonly field: WorkbenchApprovalField;
	readonly form: WorkbenchApprovalFormState;
	readonly error: string | null;
	readonly onChange: (cardKey: string, event: WorkbenchApprovalFormEvent) => void;
	readonly onFocusCard: (cardKey: string) => void;
}

export function ApprovalFieldControl({
	cardKey,
	field,
	form,
	error,
	onChange,
	onFocusCard,
}: ApprovalFieldControlProps): ReactNode {
	const controlId = useId();
	const hintId = useId();
	const errorId = useId();
	const name = field.name;
	const handleValue = useCallback(
		(event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
			onChange(cardKey, { kind: "value", name, value: event.target.value });
		},
		[cardKey, name, onChange],
	);
	const handleFlag = useCallback(
		(event: ChangeEvent<HTMLInputElement>) => {
			onChange(cardKey, { kind: "flag", name, value: event.target.checked });
		},
		[cardKey, name, onChange],
	);
	const handleSelection = useCallback(
		(event: ChangeEvent<HTMLSelectElement>) => {
			const selected = [...event.target.selectedOptions].map((option) => option.value);
			onChange(cardKey, { kind: "selection", name, value: selected });
		},
		[cardKey, name, onChange],
	);
	const handleFocus = useCallback(() => {
		onFocusCard(cardKey);
	}, [cardKey, onFocusCard]);
	const described = [field.description === null ? null : hintId, error === null ? null : errorId]
		.filter((value) => value !== null)
		.join(" ");
	const describedBy = described.length === 0 ? undefined : described;
	const selectedValues = formSelection(form, name);
	const options = field.options ?? [];
	return (
		<div
			className="min-w-0 border-t border-border-subtle py-control first:border-t-0"
			data-approval-field={field.name}
			data-approval-field-control={field.control}
			data-approval-field-secret={field.secret ? "true" : "false"}
		>
			<label className={LABEL_CLASSES} htmlFor={controlId}>
				{field.label}
				{field.required ? <span aria-hidden="true"> *</span> : null}
			</label>
			{field.description === null ? null : (
				<p className={HINT_CLASSES} id={hintId}>
					{field.description}
				</p>
			)}
			{field.control === "boolean" ? (
				<input
					aria-describedby={describedBy}
					checked={formFlag(form, name)}
					className={CHECKBOX_CLASSES}
					id={controlId}
					onChange={handleFlag}
					onFocus={handleFocus}
					type="checkbox"
				/>
			) : field.control === "enum" ? (
				<select
					aria-describedby={describedBy}
					className={CONTROL_CLASSES}
					id={controlId}
					onChange={handleValue}
					onFocus={handleFocus}
					required={field.required}
					value={formValue(form, name)}
				>
					<option value="">Choose one</option>
					{options.map((option) => (
						<option key={option.label} value={option.label}>
							{option.description === null
								? option.label
								: `${option.label} — ${option.description}`}
						</option>
					))}
				</select>
			) : field.control === "multi_enum" ? (
				<select
					aria-describedby={describedBy}
					className={CONTROL_CLASSES}
					id={controlId}
					multiple={true}
					onChange={handleSelection}
					onFocus={handleFocus}
					value={selectedValues}
				>
					{options.map((option) => (
						<option key={option.label} value={option.label}>
							{option.description === null
								? option.label
								: `${option.label} — ${option.description}`}
						</option>
					))}
				</select>
			) : field.control === "multiline" ? (
				<textarea
					aria-describedby={describedBy}
					className={CONTROL_CLASSES}
					id={controlId}
					onChange={handleValue}
					onFocus={handleFocus}
					required={field.required}
					rows={4}
					value={formValue(form, name)}
				/>
			) : field.secret ? (
				<input
					aria-describedby={describedBy}
					autoComplete="off"
					className={CONTROL_CLASSES}
					id={controlId}
					onChange={handleValue}
					onFocus={handleFocus}
					required={field.required}
					spellCheck={false}
					type="password"
				/>
			) : (
				<input
					aria-describedby={describedBy}
					className={CONTROL_CLASSES}
					id={controlId}
					max={field.maximum ?? undefined}
					maxLength={field.maxLength ?? undefined}
					min={field.minimum ?? undefined}
					onChange={handleValue}
					onFocus={handleFocus}
					required={field.required}
					type={INPUT_TYPES[field.control as keyof typeof INPUT_TYPES]}
					value={formValue(form, name)}
				/>
			)}
			{field.allowsOther && field.control === "multi_enum" ? (
				<input
					aria-label={`${field.label}: another answer`}
					className={cn(CONTROL_CLASSES, "mt-control")}
					onChange={handleValue}
					onFocus={handleFocus}
					type="text"
					value={formValue(form, name)}
				/>
			) : null}
			{error === null ? null : (
				<p className={ERROR_CLASSES} id={errorId} role="alert">
					{error}
				</p>
			)}
		</div>
	);
}
