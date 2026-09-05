// The reviewed answers as state: seeded from published defaults, never a
// secret, and changed one event at a time.

import type {
	WorkbenchApprovalField,
	WorkbenchApprovalFormEvent,
	WorkbenchApprovalFormState,
} from "@/ui/workbench-approvals/contracts";

const EMPTY_APPROVAL_FORM: WorkbenchApprovalFormState = Object.freeze({
	values: Object.freeze({}),
	selections: Object.freeze({}),
	flags: Object.freeze({}),
});

/**
 * The form seeded from the fields' published defaults.
 * @param fields The reviewed fields.
 * @returns The form; a secret is never seeded.
 */
function initialApprovalForm(
	fields: readonly WorkbenchApprovalField[],
): WorkbenchApprovalFormState {
	const values: Record<string, string> = {};
	const flags: Record<string, boolean> = {};
	for (const item of fields) {
		if (item.control === "boolean") {
			flags[item.name] = item.defaultValue === "true";
		} else if (item.defaultValue !== null) {
			values[item.name] = item.defaultValue;
		}
	}
	return Object.freeze({
		values: Object.freeze(values),
		selections: Object.freeze({}),
		flags: Object.freeze(flags),
	});
}

/**
 * The form after one event.
 * @param state The form.
 * @param event The change.
 * @returns A new form; the others are untouched.
 */
function applyApprovalFormEvent(
	state: WorkbenchApprovalFormState,
	event: WorkbenchApprovalFormEvent,
): WorkbenchApprovalFormState {
	if (event.kind === "value") {
		return Object.freeze({
			...state,
			values: Object.freeze({ ...state.values, [event.name]: event.value }),
		});
	}
	if (event.kind === "flag") {
		return Object.freeze({
			...state,
			flags: Object.freeze({ ...state.flags, [event.name]: event.value }),
		});
	}
	return Object.freeze({
		...state,
		selections: Object.freeze({
			...state.selections,
			[event.name]: Object.freeze([...event.value]),
		}),
	});
}

/**
 * One text answer.
 * @param state The form.
 * @param name The field.
 * @returns The value, or empty.
 */
function formValue(state: WorkbenchApprovalFormState, name: string): string {
	return state.values[name] ?? "";
}

/**
 * One boolean answer.
 * @param state The form.
 * @param name The field.
 * @returns The flag, or false.
 */
function formFlag(state: WorkbenchApprovalFormState, name: string): boolean {
	return state.flags[name] ?? false;
}

/**
 * One multiple-choice answer.
 * @param state The form.
 * @param name The field.
 * @returns The selection, or none.
 */
function formSelection(state: WorkbenchApprovalFormState, name: string): readonly string[] {
	return state.selections[name] ?? [];
}

export {
	EMPTY_APPROVAL_FORM,
	applyApprovalFormEvent,
	formFlag,
	formSelection,
	formValue,
	initialApprovalForm,
};
