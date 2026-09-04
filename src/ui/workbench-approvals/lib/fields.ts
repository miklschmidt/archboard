import type { BrowserApproval } from "../../../shared/codex-browser-model/index.js";
import type {
	WorkbenchApprovalControl,
	WorkbenchApprovalField,
	WorkbenchApprovalOption,
} from "../contract.js";

type Elicitation = Extract<BrowserApproval, { readonly approvalKind: "elicitation" }>;
type ElicitationField = NonNullable<Elicitation["fields"]>[number];
type UserInput = Extract<BrowserApproval, { readonly approvalKind: "user_input" }>;
type Permissions = Extract<BrowserApproval, { readonly approvalKind: "permissions" }>;

export const QUESTION_PREFIX = "question:";
export const ELICITATION_PREFIX = "field:";
export const PERMISSION_NETWORK = "permission:network";
export const PERMISSION_SCOPE = "permission:scope";
export const PERMISSION_STRICT_REVIEW = "permission:strict_auto_review";
export const DECLINE_REASON = "decline_reason";

const STRING_FORMATS = {
	email: "email",
	uri: "url",
	date: "date",
	"date-time": "date_time",
} as const satisfies Record<NonNullable<ElicitationField["format"]>, WorkbenchApprovalControl>;

function field(value: {
	readonly name: string;
	readonly label: string;
	readonly description?: string | null;
	readonly control: WorkbenchApprovalControl;
	readonly required?: boolean;
	readonly secret?: boolean;
	readonly options?: readonly WorkbenchApprovalOption[] | null;
	readonly allowsOther?: boolean;
	readonly minimum?: number | null;
	readonly maximum?: number | null;
	readonly minLength?: number | null;
	readonly maxLength?: number | null;
	readonly minimumItems?: number | null;
	readonly maximumItems?: number | null;
	readonly defaultValue?: string | null;
}): WorkbenchApprovalField {
	return Object.freeze({
		name: value.name,
		label: value.label,
		description: value.description ?? null,
		control: value.control,
		required: value.required ?? false,
		secret: value.secret ?? false,
		options: value.options ?? null,
		allowsOther: value.allowsOther ?? false,
		minimum: value.minimum ?? null,
		maximum: value.maximum ?? null,
		minLength: value.minLength ?? null,
		maxLength: value.maxLength ?? null,
		minimumItems: value.minimumItems ?? null,
		maximumItems: value.maximumItems ?? null,
		// A secret default is never projected, so it can never be echoed either.
		defaultValue: value.secret === true ? null : (value.defaultValue ?? null),
	});
}

function jsonText(value: unknown): string | null {
	if (value === null || value === undefined) return null;
	if (typeof value === "string") return value;
	if (typeof value === "number" || typeof value === "boolean") return String(value);
	try {
		return JSON.stringify(value);
	} catch {
		return null;
	}
}

function questionFields(approval: UserInput): readonly WorkbenchApprovalField[] {
	return approval.questions.map((question) => {
		const options =
			question.options === null
				? null
				: question.options.map((option) =>
						Object.freeze({ label: option.label, description: option.description }),
					);
		const control: WorkbenchApprovalControl = question.isSecret
			? "secret"
			: options === null
				? "text"
				: "multi_enum";
		return field({
			name: `${QUESTION_PREFIX}${question.id}`,
			label: question.header,
			description: question.question,
			control,
			required: true,
			secret: question.isSecret,
			options,
			allowsOther: question.isOther,
		});
	});
}

function elicitationControl(source: ElicitationField): WorkbenchApprovalControl {
	if (source.secret) return "secret";
	if (source.type === "boolean") return "boolean";
	if (source.type === "number") return "number";
	if (source.type === "integer") return "integer";
	if (source.options !== null) return (source.maximumItems ?? 1) > 1 ? "multi_enum" : "enum";
	if (source.format !== null) return STRING_FORMATS[source.format];
	return (source.maxLength ?? 0) > 512 ? "multiline" : "text";
}

function elicitationFields(approval: Elicitation): readonly WorkbenchApprovalField[] {
	if (approval.mode === "url" || approval.fields === null) return [];
	return approval.fields.map((source) =>
		field({
			name: `${ELICITATION_PREFIX}${source.name}`,
			label: source.title ?? source.name,
			description: source.description,
			control: elicitationControl(source),
			required: source.required,
			secret: source.secret,
			options:
				source.options === null
					? null
					: source.options.map((option) => Object.freeze({ label: option, description: null })),
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
 * The browser contract publishes which file-access modes were requested but no
 * paths, and a granted path list is never invented here. Network access is the
 * only permission this surface can actually grant, so a request that does not
 * name it has nothing to review and nothing to submit.
 */
export function permissionsAreGrantable(approval: BrowserApproval): boolean {
	return approval.approvalKind === "permissions" && approval.requestedScope.network !== null;
}

function permissionFields(approval: Permissions): readonly WorkbenchApprovalField[] {
	if (!permissionsAreGrantable(approval)) return [];
	const fields: WorkbenchApprovalField[] = [
		field({
			name: PERMISSION_NETWORK,
			label: "Grant network access",
			description:
				approval.requestedScope.network === true
					? "The agent asked for network access."
					: "The agent asked for network access to be withheld.",
			control: "boolean",
			defaultValue: approval.requestedScope.network === true ? "true" : "false",
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
	return fields;
}

const DECLINE_REASON_FIELD = field({
	name: DECLINE_REASON,
	label: "Decline reason",
	description: "Optional. Sent with a decline so the agent can read why.",
	control: "text",
});

export function approvalFields(approval: BrowserApproval): readonly WorkbenchApprovalField[] {
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
		case "command_execution":
		case "file_change":
			return [];
	}
}
