// Validating the reviewed answers against exactly the fields that were
// rendered, before a decision that reads them is sent.

import type {
	WorkbenchApprovalField,
	WorkbenchApprovalFieldError,
	WorkbenchApprovalFormState,
} from "@/ui/workbench-approvals/contracts";
import { formSelection, formValue } from "@/ui/workbench-approvals/lib/form";
import { safeHttpUrl } from "@/ui/workbench-approvals/lib/safe-url";

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/u;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@.]+(?:\.[^\s@.]+)+$/u;

type Errors = readonly WorkbenchApprovalFieldError[];

/** One text format: what it accepts, and the words when it does not. */
interface Format {
	readonly accepts: (raw: string) => boolean;
	readonly message: string;
}

const FORMATS: Partial<Record<WorkbenchApprovalField["control"], Format>> = {
	url: {
		/**
		 * Only http and https.
		 * @param raw The answer.
		 * @returns True for a safe URL.
		 */
		accepts: (raw) => safeHttpUrl(raw) !== null,
		message: "must be an http or https URL.",
	},
	email: {
		/**
		 * An address with a dotted domain.
		 * @param raw The answer.
		 * @returns True for an address.
		 */
		accepts: (raw) => EMAIL_PATTERN.test(raw),
		message: "must be an email address.",
	},
	date: {
		/**
		 * A YYYY-MM-DD date.
		 * @param raw The answer.
		 * @returns True for a date.
		 */
		accepts: (raw) => DATE_PATTERN.test(raw),
		message: "must be a YYYY-MM-DD date.",
	},
	date_time: {
		/**
		 * Anything the platform parses as a date and time.
		 * @param raw The answer.
		 * @returns True when it parses.
		 */
		accepts: (raw) => !Number.isNaN(Date.parse(raw)),
		message: "must be a date and time.",
	},
};

/**
 * One error.
 * @param item The field.
 * @param message What is wrong.
 * @returns The error list.
 */
function failure(item: WorkbenchApprovalField, message: string): Errors {
	return [{ name: item.name, message: `${item.label} ${message}` }];
}

/**
 * The option labels a field offers.
 * @param item The field.
 * @returns The labels.
 */
function optionLabels(item: WorkbenchApprovalField): ReadonlySet<string> {
	return new Set((item.options ?? []).map((option) => option.label));
}

/**
 * Whether a parsed number sits inside the field's bounds.
 * @param item The field.
 * @param parsed The number.
 * @returns The bound error, or none.
 */
function rangeErrors(item: WorkbenchApprovalField, parsed: number): Errors {
	if (item.minimum !== null && parsed < item.minimum) {
		return failure(item, `must be at least ${item.minimum}.`);
	}
	if (item.maximum !== null && parsed > item.maximum) {
		return failure(item, `must be at most ${item.maximum}.`);
	}
	return [];
}

/**
 * A number field's errors.
 * @param item The field.
 * @param raw The answer.
 * @returns The errors.
 */
function numberErrors(item: WorkbenchApprovalField, raw: string): Errors {
	const parsed = Number(raw);
	if (raw.trim().length === 0 || Number.isNaN(parsed)) {
		return failure(item, "must be a number.");
	}
	if (item.control === "integer" && !Number.isInteger(parsed)) {
		return failure(item, "must be a whole number.");
	}
	return rangeErrors(item, parsed);
}

/**
 * A text field's length errors.
 * @param item The field.
 * @param raw The answer.
 * @returns The errors.
 */
function lengthErrors(item: WorkbenchApprovalField, raw: string): Errors {
	if (item.minLength !== null && raw.length < item.minLength) {
		return failure(item, `needs at least ${item.minLength} characters.`);
	}
	if (item.maxLength !== null && raw.length > item.maxLength) {
		return failure(item, `allows at most ${item.maxLength} characters.`);
	}
	return [];
}

/**
 * A formatted text field's errors.
 * @param item The field.
 * @param raw The answer.
 * @returns The errors.
 */
function formatErrors(item: WorkbenchApprovalField, raw: string): Errors {
	const format = FORMATS[item.control];
	if (format === undefined || format.accepts(raw)) {
		return [];
	}
	return failure(item, format.message);
}

/**
 * A text field's errors.
 * @param item The field.
 * @param raw The answer.
 * @returns The errors.
 */
function textErrors(item: WorkbenchApprovalField, raw: string): Errors {
	const length = lengthErrors(item, raw);
	return length.length > 0 ? length : formatErrors(item, raw);
}

/**
 * How many answers a multiple-choice field holds, counting a free-text other.
 * @param item The field.
 * @param selected The chosen options.
 * @param other The free text.
 * @returns The count.
 */
function answerCount(
	item: WorkbenchApprovalField,
	selected: readonly string[],
	other: string,
): number {
	const extra = item.allowsOther && other.trim().length > 0 ? 1 : 0;
	return selected.length + extra;
}

/**
 * A multiple-choice field's count errors.
 * @param item The field.
 * @param total How many answers it holds.
 * @returns The errors.
 */
function countErrors(item: WorkbenchApprovalField, total: number): Errors {
	if (item.minimumItems !== null && total < item.minimumItems) {
		return failure(item, `needs at least ${item.minimumItems} answers.`);
	}
	if (item.maximumItems !== null && total > item.maximumItems) {
		return failure(item, `allows at most ${item.maximumItems} answers.`);
	}
	return requiredError(item, total);
}

/**
 * The error of a required field with no answer.
 * @param item The field.
 * @param total How many answers it holds.
 * @returns The error, or none.
 */
function requiredError(item: WorkbenchApprovalField, total: number): Errors {
	return item.required && total === 0 ? failure(item, "needs an answer.") : [];
}

/**
 * A multiple-choice field's errors.
 * @param item The field.
 * @param selected The chosen options.
 * @param other The free text.
 * @returns The errors.
 */
function selectionErrors(
	item: WorkbenchApprovalField,
	selected: readonly string[],
	other: string,
): Errors {
	const offered = optionLabels(item);
	const unknown = selected.find((label) => !offered.has(label));
	if (unknown !== undefined) {
		return failure(item, `does not offer "${unknown}".`);
	}
	return countErrors(item, answerCount(item, selected, other));
}

/**
 * A single-choice field's errors.
 * @param item The field.
 * @param raw The answer.
 * @returns The errors.
 */
function enumErrors(item: WorkbenchApprovalField, raw: string): Errors {
	return optionLabels(item).has(raw) ? [] : failure(item, `does not offer "${raw}".`);
}

/**
 * A text-carrying field's errors, by control.
 * @param item The field.
 * @param raw The answer.
 * @returns The errors.
 */
function valueErrors(item: WorkbenchApprovalField, raw: string): Errors {
	if (item.control === "enum") {
		return enumErrors(item, raw);
	}
	if (item.control === "number" || item.control === "integer") {
		return numberErrors(item, raw);
	}
	return textErrors(item, raw);
}

/**
 * One field's errors.
 * @param item The field.
 * @param state The form.
 * @returns The errors.
 */
function fieldErrors(item: WorkbenchApprovalField, state: WorkbenchApprovalFormState): Errors {
	if (item.control === "boolean") {
		return [];
	}
	if (item.control === "multi_enum") {
		return selectionErrors(item, formSelection(state, item.name), formValue(state, item.name));
	}
	const raw = formValue(state, item.name);
	if (raw.length === 0) {
		return item.required ? failure(item, "needs an answer.") : [];
	}
	return valueErrors(item, raw);
}

/**
 * Every error across the reviewed fields.
 * @param fields The fields that were rendered.
 * @param state The form.
 * @returns The errors, in field order.
 */
function validateApprovalForm(
	fields: readonly WorkbenchApprovalField[],
	state: WorkbenchApprovalFormState,
): Errors {
	return Object.freeze(fields.flatMap((item) => fieldErrors(item, state)));
}

export { validateApprovalForm };
