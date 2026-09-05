// The reviewed fields a decision reads, projected from the request exactly as
// the host published it. A secret default is never projected, so it can never
// be echoed either.

import type { BrowserApproval } from "@/shared/codex-browser-model";
import type {
	WorkbenchApprovalControl,
	WorkbenchApprovalField,
	WorkbenchApprovalOption,
} from "@/ui/workbench-approvals/contracts";

type Elicitation = Extract<BrowserApproval, { readonly approvalKind: "elicitation" }>;
type ElicitationField = NonNullable<Elicitation["fields"]>[number];
type UserInput = Extract<BrowserApproval, { readonly approvalKind: "user_input" }>;
type Permissions = Extract<BrowserApproval, { readonly approvalKind: "permissions" }>;

const QUESTION_PREFIX = "question:";
const ELICITATION_PREFIX = "field:";
const PERMISSION_NETWORK = "permission:network";
const PERMISSION_SCOPE = "permission:scope";
const PERMISSION_STRICT_REVIEW = "permission:strict_auto_review";
const DECLINE_REASON = "decline_reason";

const STRING_FORMATS = {
	email: "email",
	uri: "url",
	date: "date",
	"date-time": "date_time",
} as const satisfies Record<NonNullable<ElicitationField["format"]>, WorkbenchApprovalControl>;

const TYPED_CONTROLS = {
	boolean: "boolean",
	number: "number",
	integer: "integer",
} as const satisfies Partial<Record<ElicitationField["type"], WorkbenchApprovalControl>>;

/** A field's optional facts. */
type FieldSeed = Pick<WorkbenchApprovalField, "name" | "label" | "control"> &
	Partial<Omit<WorkbenchApprovalField, "name" | "label" | "control">>;

const FIELD_DEFAULTS: Omit<WorkbenchApprovalField, "name" | "label" | "control"> = {
	description: null,
	required: false,
	secret: false,
	options: null,
	allowsOther: false,
	minimum: null,
	maximum: null,
	minLength: null,
	maxLength: null,
	minimumItems: null,
	maximumItems: null,
	defaultValue: null,
};

/**
 * One reviewed field, frozen.
 * @param seed The field's facts.
 * @returns The field; a secret never carries a default.
 */
function field(seed: FieldSeed): WorkbenchApprovalField {
	const merged = { ...FIELD_DEFAULTS, ...seed };
	return Object.freeze({
		...merged,
		defaultValue: merged.secret ? null : merged.defaultValue,
	});
}

/**
 * A default value as text, when it can be shown.
 * @param value The host's default.
 * @returns The text, or null.
 */
function jsonText(value: unknown): string | null {
	if (value === null || value === undefined) {
		return null;
	}
	return typeof value === "string" ? value : JSON.stringify(value);
}

/**
 * The options of one question.
 * @param question The question.
 * @returns The options, or null for free text.
 */
function questionOptions(
	question: UserInput["questions"][number],
): readonly WorkbenchApprovalOption[] | null {
	if (question.options === null) {
		return null;
	}
	return question.options.map((option) =>
		Object.freeze({ label: option.label, description: option.description }),
	);
}

/**
 * The control a question needs.
 * @param question The question.
 * @param options Its options, or null.
 * @returns Secret, free text, or a multiple choice.
 */
function questionControl(
	question: UserInput["questions"][number],
	options: readonly WorkbenchApprovalOption[] | null,
): WorkbenchApprovalControl {
	if (question.isSecret) {
		return "secret";
	}
	return options === null ? "text" : "multi_enum";
}

/**
 * The fields of a user-input request: one per question.
 * @param approval The request.
 * @returns The fields.
 */
function questionFields(approval: UserInput): readonly WorkbenchApprovalField[] {
	return approval.questions.map((question) => {
		const options = questionOptions(question);
		return field({
			name: `${QUESTION_PREFIX}${question.id}`,
			label: question.header,
			description: question.question,
			control: questionControl(question, options),
			required: true,
			secret: question.isSecret,
			options,
			allowsOther: question.isOther,
		});
	});
}

/**
 * The control of a string-typed elicitation field.
 * @param source The host's field.
 * @returns A format control, multiline for long text, else text.
 */
function stringControl(source: ElicitationField): WorkbenchApprovalControl {
	if (source.format !== null) {
		return STRING_FORMATS[source.format];
	}
	return (source.maxLength ?? 0) > 512 ? "multiline" : "text";
}

/**
 * The control an elicitation field needs.
 * @param source The host's field.
 * @returns The control.
 */
function elicitationControl(source: ElicitationField): WorkbenchApprovalControl {
	if (source.secret) {
		return "secret";
	}
	if (source.type === "boolean" || source.type === "number" || source.type === "integer") {
		return TYPED_CONTROLS[source.type];
	}
	return source.options === null ? stringControl(source) : choiceControl(source);
}

/**
 * The control of an enumerated elicitation field.
 * @param source The host's field.
 * @returns Multiple choice when more than one item may be chosen, else single.
 */
function choiceControl(source: ElicitationField): WorkbenchApprovalControl {
	return (source.maximumItems ?? 1) > 1 ? "multi_enum" : "enum";
}

/**
 * The options of an elicitation field.
 * @param source The host's field.
 * @returns The options, or null.
 */
function elicitationOptions(source: ElicitationField): readonly WorkbenchApprovalOption[] | null {
	if (source.options === null) {
		return null;
	}
	return source.options.map((option) => Object.freeze({ label: option, description: null }));
}

/**
 * The fields of a form-mode elicitation.
 * @param approval The request.
 * @returns The fields; none for URL mode or an unpublished form.
 */
function elicitationFields(approval: Elicitation): readonly WorkbenchApprovalField[] {
	if (approval.mode === "url" || approval.fields === null) {
		return [];
	}
	return approval.fields.map((source) =>
		field({
			name: `${ELICITATION_PREFIX}${source.name}`,
			label: source.title ?? source.name,
			description: source.description,
			control: elicitationControl(source),
			required: source.required,
			secret: source.secret,
			options: elicitationOptions(source),
			minimum: source.minimum,
			maximum: source.maximum,
			minLength: source.minLength,
			maxLength: source.maxLength,
			minimumItems: source.minimumItems,
			maximumItems: source.maximumItems,
			defaultValue: jsonText(source.defaultValue),
		}),
	);
}

/**
 * The browser contract publishes which file-access modes were requested but
 * no paths, and a granted path list is never invented here. Network access is
 * the only permission this surface can actually grant, so a request that does
 * not name it has nothing to review and nothing to submit.
 * @param approval The request.
 * @returns True when a grant can be composed.
 */
function permissionsAreGrantable(approval: BrowserApproval): boolean {
	return approval.approvalKind === "permissions" && approval.requestedScope.network !== null;
}

/**
 * The reviewed fields of a permissions request.
 * @param approval The request.
 * @returns Network access, grant scope and strict review; none when nothing is grantable.
 */
function permissionFields(approval: Permissions): readonly WorkbenchApprovalField[] {
	if (!permissionsAreGrantable(approval)) {
		return [];
	}
	const requested = approval.requestedScope.network === true;
	return [
		field({
			name: PERMISSION_NETWORK,
			label: "Grant network access",
			description: requested
				? "The agent asked for network access."
				: "The agent asked for network access to be withheld.",
			control: "boolean",
			defaultValue: requested ? "true" : "false",
		}),
		field({
			name: PERMISSION_SCOPE,
			label: "Grant scope",
			description: "A session grant lasts beyond this turn and is never spoken-eligible.",
			control: "enum",
			required: true,
			options: [
				Object.freeze({ label: "turn", description: "This turn only." }),
				Object.freeze({ label: "session", description: "The rest of this session." }),
			],
			defaultValue: "turn",
		}),
		field({
			name: PERMISSION_STRICT_REVIEW,
			label: "Review every later command in this turn",
			description: "Every subsequent command is reviewed before normal sandboxed execution.",
			control: "boolean",
			defaultValue: "false",
		}),
	];
}

const DECLINE_REASON_FIELD = field({
	name: DECLINE_REASON,
	label: "Decline reason",
	description: "Optional. Sent with a decline so the agent can read why.",
	control: "text",
});

/**
 * The reviewed fields a decision on this request reads.
 * @param approval The request.
 * @returns The fields; none for a command execution or file change.
 */
function approvalFields(approval: BrowserApproval): readonly WorkbenchApprovalField[] {
	switch (approval.approvalKind) {
		case "user_input":
			return questionFields(approval);
		case "elicitation":
			return elicitationFields(approval);
		case "permissions":
			return permissionFields(approval);
		case "apply_patch":
		case "exec_command":
			return [DECLINE_REASON_FIELD];
		default:
			return [];
	}
}

export {
	DECLINE_REASON,
	ELICITATION_PREFIX,
	PERMISSION_NETWORK,
	PERMISSION_SCOPE,
	PERMISSION_STRICT_REVIEW,
	QUESTION_PREFIX,
	approvalFields,
	permissionsAreGrantable,
};
