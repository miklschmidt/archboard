import { safeHttpUrl } from "../../workbench-timeline/index.js";
import type {
	WorkbenchApprovalField,
	WorkbenchApprovalFieldError,
	WorkbenchApprovalFormEvent,
	WorkbenchApprovalFormState,
} from "../contract.js";

export const EMPTY_APPROVAL_FORM: WorkbenchApprovalFormState = Object.freeze({
	values: Object.freeze({}),
	selections: Object.freeze({}),
	flags: Object.freeze({}),
});

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/u;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@.]+(?:\.[^\s@.]+)+$/u;

export function initialApprovalForm(
	fields: readonly WorkbenchApprovalField[],
): WorkbenchApprovalFormState {
	const values: Record<string, string> = {};
	const flags: Record<string, boolean> = {};
	for (const item of fields) {
		if (item.control === "boolean") flags[item.name] = item.defaultValue === "true";
		else if (item.defaultValue !== null) values[item.name] = item.defaultValue;
	}
	return Object.freeze({
		values: Object.freeze(values),
		selections: Object.freeze({}),
		flags: Object.freeze(flags),
	});
}

export function applyApprovalFormEvent(
	state: WorkbenchApprovalFormState,
	event: WorkbenchApprovalFormEvent,
): WorkbenchApprovalFormState {
	if (event.kind === "value")
		return Object.freeze({
			...state,
			values: Object.freeze({ ...state.values, [event.name]: event.value }),
		});
	if (event.kind === "flag")
		return Object.freeze({
			...state,
			flags: Object.freeze({ ...state.flags, [event.name]: event.value }),
		});
	return Object.freeze({
		...state,
		selections: Object.freeze({
			...state.selections,
			[event.name]: Object.freeze([...event.value]),
		}),
	});
}

export function formValue(state: WorkbenchApprovalFormState, name: string): string {
	return state.values[name] ?? "";
}

export function formFlag(state: WorkbenchApprovalFormState, name: string): boolean {
	return state.flags[name] ?? false;
}

export function formSelection(state: WorkbenchApprovalFormState, name: string): readonly string[] {
	return state.selections[name] ?? [];
}

function numberErrors(
	item: WorkbenchApprovalField,
	raw: string,
): readonly WorkbenchApprovalFieldError[] {
	const parsed = Number(raw);
	if (raw.trim().length === 0 || Number.isNaN(parsed))
		return [{ name: item.name, message: `${item.label} must be a number.` }];
	if (item.control === "integer" && !Number.isInteger(parsed))
		return [{ name: item.name, message: `${item.label} must be a whole number.` }];
	if (item.minimum !== null && parsed < item.minimum)
		return [{ name: item.name, message: `${item.label} must be at least ${item.minimum}.` }];
	if (item.maximum !== null && parsed > item.maximum)
		return [{ name: item.name, message: `${item.label} must be at most ${item.maximum}.` }];
	return [];
}

function textErrors(
	item: WorkbenchApprovalField,
	raw: string,
): readonly WorkbenchApprovalFieldError[] {
	if (item.minLength !== null && raw.length < item.minLength)
		return [
			{ name: item.name, message: `${item.label} needs at least ${item.minLength} characters.` },
		];
	if (item.maxLength !== null && raw.length > item.maxLength)
		return [
			{ name: item.name, message: `${item.label} allows at most ${item.maxLength} characters.` },
		];
	if (item.control === "url" && safeHttpUrl(raw) === null)
		return [{ name: item.name, message: `${item.label} must be an http or https URL.` }];
	if (item.control === "email" && !EMAIL_PATTERN.test(raw))
		return [{ name: item.name, message: `${item.label} must be an email address.` }];
	if (item.control === "date" && !DATE_PATTERN.test(raw))
		return [{ name: item.name, message: `${item.label} must be a YYYY-MM-DD date.` }];
	if (item.control === "date_time" && Number.isNaN(Date.parse(raw)))
		return [{ name: item.name, message: `${item.label} must be a date and time.` }];
	return [];
}

function selectionErrors(
	item: WorkbenchApprovalField,
	selected: readonly string[],
	other: string,
): readonly WorkbenchApprovalFieldError[] {
	const optionLabels = new Set((item.options ?? []).map((option) => option.label));
	const unknown = selected.find((entry) => !optionLabels.has(entry));
	if (unknown !== undefined)
		return [{ name: item.name, message: `${item.label} does not offer "${unknown}".` }];
	const total = selected.length + (item.allowsOther && other.trim().length > 0 ? 1 : 0);
	if (item.minimumItems !== null && total < item.minimumItems)
		return [
			{ name: item.name, message: `${item.label} needs at least ${item.minimumItems} answers.` },
		];
	if (item.maximumItems !== null && total > item.maximumItems)
		return [
			{ name: item.name, message: `${item.label} allows at most ${item.maximumItems} answers.` },
		];
	if (item.required && total === 0)
		return [{ name: item.name, message: `${item.label} needs an answer.` }];
	return [];
}

function fieldErrors(
	item: WorkbenchApprovalField,
	state: WorkbenchApprovalFormState,
): readonly WorkbenchApprovalFieldError[] {
	if (item.control === "boolean") return [];
	if (item.control === "multi_enum")
		return selectionErrors(item, formSelection(state, item.name), formValue(state, item.name));
	const raw = formValue(state, item.name);
	if (raw.length === 0)
		return item.required ? [{ name: item.name, message: `${item.label} needs an answer.` }] : [];
	if (item.control === "enum") {
		const optionLabels = new Set((item.options ?? []).map((option) => option.label));
		return optionLabels.has(raw)
			? []
			: [{ name: item.name, message: `${item.label} does not offer "${raw}".` }];
	}
	if (item.control === "number" || item.control === "integer") return numberErrors(item, raw);
	return textErrors(item, raw);
}

export function validateApprovalForm(
	fields: readonly WorkbenchApprovalField[],
	state: WorkbenchApprovalFormState,
): readonly WorkbenchApprovalFieldError[] {
	return Object.freeze(fields.flatMap((item) => fieldErrors(item, state)));
}
