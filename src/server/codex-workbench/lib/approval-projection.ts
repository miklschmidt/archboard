import {
	BROWSER_PERMISSION_FILE_ACCESS,
	type BrowserApproval,
	JsonValueSchema,
} from "@/shared/codex-browser-model";
import type { ApprovalOwnerView } from "@/runtime/codex-approvals";

type OwnerApprovalRequest = ApprovalOwnerView["request"];
type OwnerCommandRequest = Extract<OwnerApprovalRequest, { readonly family: "command_execution" }>;
type OwnerPermissionsRequest = Extract<OwnerApprovalRequest, { readonly family: "permissions" }>;
type OwnerInteractiveRequest = Extract<
	OwnerApprovalRequest,
	{ readonly family: "user_input" | "elicitation" | "permissions" }
>;
type OwnerSnapshot = ApprovalOwnerView["snapshot"];
type EndedLifecycleState = Exclude<
	OwnerSnapshot["state"],
	"staged" | "pending" | "outcome_unknown" | "settled"
>;
type PermissionFileSystem = OwnerPermissionsRequest["params"]["permissions"]["fileSystem"];
type CodexFileAccess = NonNullable<NonNullable<PermissionFileSystem>["entries"]>[number]["access"];
type BrowserElicitationField = NonNullable<
	Extract<BrowserApproval, { approvalKind: "elicitation" }>["fields"]
>[number];
type BrowserElicitationFieldType = NonNullable<BrowserElicitationField["type"]>;
type BrowserElicitationFormat = BrowserElicitationField["format"];
type BrowserCommandDecision = Extract<
	BrowserApproval,
	{ approvalKind: "command_execution" }
>["availableDecisions"][number];
const BROWSER_FILE_ACCESS_BY_CODEX_ACCESS = BROWSER_PERMISSION_FILE_ACCESS satisfies Record<
	CodexFileAccess,
	string
>;

const SCALAR_FIELD_TYPES: readonly BrowserElicitationFieldType[] = [
	"string",
	"number",
	"integer",
	"boolean",
];
const FIELD_FORMATS: readonly NonNullable<BrowserElicitationFormat>[] = [
	"email",
	"uri",
	"date",
	"date-time",
];

/**
 * Narrow an unknown value to a plain object with string keys.
 * @param value The value to inspect.
 * @returns True when the value is a non-null, non-array object.
 */
function isRecord(value: unknown): value is Record<string, unknown> {
	return value !== null && typeof value === "object" && !Array.isArray(value);
}

/**
 * Accept a JSON-schema `enum` list only when every entry is a string.
 * @param value The raw `enum` member of a schema definition.
 * @returns The string entries, or null when the value is not an all-string array.
 */
function allStrings(value: unknown): readonly string[] | null {
	if (!Array.isArray(value)) return null;
	const strings = value.filter((entry): entry is string => typeof entry === "string");
	return strings.length === value.length ? strings : null;
}

/**
 * Read the `const` string of each `oneOf`/`anyOf` alternative, skipping alternatives without one.
 * @param value The raw `oneOf` or `anyOf` member of a schema definition.
 * @returns The const strings found, or null when the value is not an array.
 */
function constStrings(value: unknown): readonly string[] | null {
	if (!Array.isArray(value)) return null;
	return value.flatMap((entry) =>
		isRecord(entry) && typeof entry["const"] === "string" ? [entry["const"]] : [],
	);
}

/**
 * Read `const` strings only when every alternative carries one; the field type
 * is `enum` solely for a schema that is entirely enumerable.
 * @param value The raw `oneOf` or `anyOf` member of a schema definition.
 * @returns The const strings, or null when any alternative lacks one.
 */
function allConstStrings(value: unknown): readonly string[] | null {
	if (!Array.isArray(value)) return null;
	const strings = constStrings(value);
	return strings !== null && strings.length === value.length ? strings : null;
}

/**
 * The `items` definition of an array-typed field, when it has one.
 * @param definition One property definition from the requested schema.
 * @returns The items record, or null for a non-array field.
 */
function arrayItems(definition: Record<string, unknown>): Record<string, unknown> | null {
	return definition["type"] === "array" && isRecord(definition["items"])
		? definition["items"]
		: null;
}

/**
 * The enumerable values a definition offers when it is entirely enumerable,
 * which is what makes its field type `enum`.
 * @param definition One property definition from the requested schema.
 * @returns The option strings, or null when the definition is not an enumeration.
 */
function strictEnumOptions(definition: Record<string, unknown>): readonly string[] | null {
	const direct = allStrings(definition["enum"]) ?? allConstStrings(definition["oneOf"]);
	if (direct !== null) return direct;
	const items = arrayItems(definition);
	if (items === null) return null;
	return allStrings(items["enum"]) ?? allConstStrings(items["anyOf"]);
}

/**
 * Narrow a raw JSON-schema `type` to one of the scalar field types the browser presents.
 * @param value The raw `type` member of a schema definition.
 * @returns True when the value names a presentable scalar type.
 */
function isScalarFieldType(value: unknown): value is BrowserElicitationFieldType {
	return SCALAR_FIELD_TYPES.some((entry) => entry === value);
}

/**
 * Classify a property definition into the browser's field vocabulary.
 * @param value One property definition from the requested schema.
 * @returns The field type, or null when the definition is not presentable.
 */
function fieldType(value: unknown): BrowserElicitationFieldType | null {
	if (!isRecord(value)) return null;
	if (strictEnumOptions(value) !== null) return "enum";
	const type = value["type"];
	return isScalarFieldType(type) ? type : null;
}

/**
 * Read a string member of a definition, or null when it is absent or not a string.
 * @param value The raw member value.
 * @returns The string, or null.
 */
function stringValue(value: unknown): string | null {
	return typeof value === "string" ? value : null;
}

/**
 * Read a numeric member of a definition, or null when it is absent or not a number.
 * @param value The raw member value.
 * @returns The number, or null.
 */
function numberValue(value: unknown): number | null {
	return typeof value === "number" ? value : null;
}

/**
 * The options a definition offers for presentation, taking any `const`
 * alternatives it lists even when the field itself is not purely enumerable.
 * @param definition One property definition from the requested schema.
 * @returns The option strings, or null when the definition lists none.
 */
function enumOptions(definition: Record<string, unknown>): readonly string[] | null {
	const direct = allStrings(definition["enum"]) ?? constStrings(definition["oneOf"]);
	if (direct !== null) return direct;
	const items = arrayItems(definition);
	if (items === null) return null;
	return allStrings(items["enum"]) ?? constStrings(items["anyOf"]);
}

/**
 * A fresh copy of the options a definition lists, or null when it lists none.
 * @param definition One property definition from the requested schema.
 * @returns The options to present.
 */
function fieldOptions(definition: Record<string, unknown>): string[] | null {
	return enumOptions(definition)?.slice() ?? null;
}

/**
 * Narrow a raw JSON-schema `format` to one the browser presents.
 * @param value The raw `format` member of a schema definition.
 * @returns The format, or null when it is absent or unsupported.
 */
function fieldFormat(value: unknown): BrowserElicitationFormat {
	return FIELD_FORMATS.find((entry) => entry === value) ?? null;
}

/**
 * The `required` names of a schema, when it lists them as strings.
 * @param schema The requested schema record.
 * @returns The set of required property names.
 */
function requiredNames(schema: Record<string, unknown>): ReadonlySet<string> {
	return new Set(allStrings(schema["required"]) ?? []);
}

/**
 * A property name the browser can present: non-empty and free of NUL bytes.
 * @param name The property name.
 * @returns True when the name is presentable.
 */
function isPresentableFieldName(name: string): boolean {
	return name.length > 0 && !name.includes("\0");
}

/**
 * Project one property definition into a browser form field.
 * @param name The property name.
 * @param definition The property's schema definition.
 * @param required Whether the schema lists the property as required.
 * @returns The form field, or null when the definition cannot be presented.
 */
function formField(
	name: string,
	definition: Record<string, unknown>,
	required: boolean,
): BrowserElicitationField | null {
	const type = fieldType(definition);
	if (type === null || !isPresentableFieldName(name)) return null;
	const secret = definition["secret"] === true;
	const defaultValue = JsonValueSchema.safeParse(definition["default"] ?? null);
	if (!defaultValue.success) return null;
	return {
		name,
		type,
		required,
		secret,
		title: stringValue(definition["title"]),
		description: stringValue(definition["description"]),
		format: fieldFormat(definition["format"]),
		minimum: numberValue(definition["minimum"]),
		maximum: numberValue(definition["maximum"]),
		minLength: numberValue(definition["minLength"]),
		maxLength: numberValue(definition["maxLength"]),
		minimumItems: numberValue(definition["minItems"]),
		maximumItems: numberValue(definition["maxItems"]),
		options: fieldOptions(definition),
		defaultValue: secret ? null : defaultValue.data,
	};
}

/**
 * Project an elicitation's requested JSON schema into browser form fields.
 * A schema with any property the browser cannot present yields no form at all.
 * @param schema The raw requested schema.
 * @returns The form fields, or null when the schema cannot be presented as a form.
 */
function formFields(schema: unknown): BrowserElicitationField[] | null {
	if (!isRecord(schema) || !isRecord(schema["properties"])) return null;
	const required = requiredNames(schema);
	const fields: BrowserElicitationField[] = [];
	for (const [name, definition] of Object.entries(schema["properties"])) {
		if (!isRecord(definition)) return null;
		const field = formField(name, definition, required.has(name));
		if (field === null) return null;
		fields.push(field);
	}
	return fields;
}

/**
 * Accept an elicitation URL only when a browser may open it.
 * @param value The URL the elicitation asks the person to visit.
 * @returns The same URL; a URL that is not http or https throws instead.
 */
function safeUrl(value: string): string {
	const parsed = new URL(value);
	if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
		throw new Error("The approval URL is not safe for browser presentation.");
	}
	return value;
}

type CommandDecision = NonNullable<OwnerCommandRequest["params"]["availableDecisions"]>[number];
const DEFAULT_COMMAND_DECISIONS: readonly CommandDecision[] = ["accept", "decline", "cancel"];

/**
 * The decisions a command approval offers, defaulting when Codex lists none.
 * @param request The command-execution approval request.
 * @returns The decisions to present.
 */
function effectiveCommandDecisions(request: OwnerCommandRequest): readonly CommandDecision[] {
	return request.params.availableDecisions ?? DEFAULT_COMMAND_DECISIONS;
}

/**
 * Copy one command decision into the browser vocabulary, cloning amendment payloads.
 * @param decision The Codex decision.
 * @returns The browser decision.
 */
function projectCommandDecision(decision: CommandDecision): BrowserCommandDecision {
	if (typeof decision === "string") {
		return decision;
	}
	if ("acceptWithExecpolicyAmendment" in decision) {
		return {
			acceptWithExecpolicyAmendment: {
				execpolicy_amendment: [...decision.acceptWithExecpolicyAmendment.execpolicy_amendment],
			},
		};
	}
	return {
		applyNetworkPolicyAmendment: {
			network_policy_amendment: {
				host: decision.applyNetworkPolicyAmendment.network_policy_amendment.host,
				action: decision.applyNetworkPolicyAmendment.network_policy_amendment.action,
			},
		},
	};
}

/**
 * The distinct file accesses a permissions request asks for, in the browser's fixed order.
 * @param value The requested file-system permissions.
 * @returns The requested accesses.
 */
function fileSystemAccesses(value: PermissionFileSystem): readonly CodexFileAccess[] {
	if (value === null) {
		return [];
	}
	const requested = new Set<CodexFileAccess>();
	if (value.read !== null) {
		requested.add(BROWSER_FILE_ACCESS_BY_CODEX_ACCESS.read);
	}
	if (value.write !== null) {
		requested.add(BROWSER_FILE_ACCESS_BY_CODEX_ACCESS.write);
	}
	for (const entry of value.entries ?? []) {
		requested.add(entry.access);
	}
	return Object.values(BROWSER_FILE_ACCESS_BY_CODEX_ACCESS).filter((access) =>
		requested.has(access),
	);
}

/**
 * The lifecycle of an approval whose outcome Codex never confirmed.
 * @param snapshot The owner's approval snapshot.
 * @returns The browser lifecycle.
 */
function unknownOutcomeLifecycle(snapshot: OwnerSnapshot): BrowserApproval["lifecycle"] {
	return {
		state: "outcome_unknown",
		decision: snapshot.decision ?? "cancelled",
		outcome: "outcome_unknown",
		reason: snapshot.reason ?? "The approval outcome is unknown.",
	};
}

/**
 * The lifecycle of an approval a person decided.
 * @param snapshot The owner's approval snapshot.
 * @returns The browser lifecycle.
 */
function settledLifecycle(snapshot: OwnerSnapshot): BrowserApproval["lifecycle"] {
	return {
		state: "settled",
		decision: snapshot.decision ?? "cancelled",
		outcome: snapshot.outcome === "outcome_unknown" ? null : snapshot.outcome,
		reason: snapshot.reason ?? "The approval settled.",
	};
}

/**
 * The lifecycle of an approval that ended without a decision.
 * @param state The terminal state the owner reached.
 * @param snapshot The owner's approval snapshot.
 * @returns The browser lifecycle.
 */
function endedLifecycle(
	state: EndedLifecycleState,
	snapshot: OwnerSnapshot,
): BrowserApproval["lifecycle"] {
	return {
		state,
		decision: "cancelled",
		outcome: snapshot.outcome === "outcome_unknown" ? null : snapshot.outcome,
		reason: snapshot.reason ?? "The approval ended without an effect.",
	};
}

/**
 * Project the owner's settlement state into the browser lifecycle arms.
 * @param view The owner's view of the approval.
 * @returns The browser lifecycle.
 */
function projectLifecycle(view: ApprovalOwnerView): BrowserApproval["lifecycle"] {
	const { snapshot } = view;
	const { state } = snapshot;
	if (state === "staged" || state === "pending") {
		return { state, decision: null, outcome: null, reason: null };
	}
	if (state === "outcome_unknown") return unknownOutcomeLifecycle(snapshot);
	if (state === "settled") return settledLifecycle(snapshot);
	return endedLifecycle(state, snapshot);
}

/**
 * The fields every browser approval shares, regardless of family.
 * @param view The owner's view of the approval.
 * @returns The common envelope.
 */
function approvalEnvelope(view: ApprovalOwnerView) {
	const request = view.request;
	return {
		kind: "approval" as const,
		requestId: request.requestId,
		threadId: request.threadId,
		turnId: request.turnId,
		itemId: request.itemId,
		approvalId: request.approvalId,
		expiresAtMs: request.expiresAtMs,
		lifecycle: projectLifecycle(view),
		binding: request.binding,
		spoken: view.spoken,
	};
}

type ApprovalEnvelope = ReturnType<typeof approvalEnvelope>;

/**
 * Fail at compile time when an approval family is left unprojected; at run
 * time the call always throws, naming the family.
 * @param family The family no arm handled.
 */
function unprojectedFamily(family: never): never {
	throw new Error(`the approval family ${String(family)} has no browser projection`);
}

/**
 * Project a command-execution approval with its offered decisions.
 * @param envelope The common approval fields.
 * @param request The owner's request.
 * @returns The browser approval.
 */
function projectCommandExecution(
	envelope: ApprovalEnvelope,
	request: OwnerCommandRequest,
): BrowserApproval {
	return {
		...envelope,
		approvalKind: request.family,
		reason: request.params.reason ?? null,
		command: request.params.command ?? null,
		availableDecisions: effectiveCommandDecisions(request).map(projectCommandDecision),
	};
}

/**
 * Project an MCP elicitation, as a URL to visit or as a form to fill.
 * @param envelope The common approval fields.
 * @param request The owner's request.
 * @returns The browser approval.
 */
function projectElicitation(
	envelope: ApprovalEnvelope,
	request: Extract<OwnerInteractiveRequest, { readonly family: "elicitation" }>,
): BrowserApproval {
	const { params } = request;
	return {
		...envelope,
		approvalKind: request.family,
		serverName: params.serverName,
		mode: params.mode,
		message: params.message,
		url: params.mode === "url" ? safeUrl(params.url) : null,
		fields: params.mode === "url" ? null : formFields(params.requestedSchema),
	};
}

/**
 * Project a permissions request as the scope it asks for.
 * @param envelope The common approval fields.
 * @param request The owner's request.
 * @returns The browser approval.
 */
function projectPermissions(
	envelope: ApprovalEnvelope,
	request: OwnerPermissionsRequest,
): BrowserApproval {
	return {
		...envelope,
		approvalKind: request.family,
		reason: request.params.reason,
		requestedScope: {
			network: request.params.permissions.network?.enabled ?? null,
			fileAccess: [...fileSystemAccesses(request.params.permissions.fileSystem)],
		},
	};
}

/**
 * Project the families that ask a person about something other than a command.
 * @param envelope The common approval fields.
 * @param request The owner's request.
 * @returns The browser approval.
 */
function projectInteractiveApproval(
	envelope: ApprovalEnvelope,
	request: OwnerInteractiveRequest,
): BrowserApproval {
	switch (request.family) {
		case "user_input":
			return {
				...envelope,
				approvalKind: request.family,
				questions: request.params.questions.map((question) => ({
					id: question.id,
					header: question.header,
					question: question.question,
					isOther: question.isOther,
					isSecret: question.isSecret,
					options:
						question.options?.map((option) => ({
							label: option.label,
							description: option.description,
						})) ?? null,
				})),
			};
		case "elicitation":
			return projectElicitation(envelope, request);
		case "permissions":
			return projectPermissions(envelope, request);
		default:
			return unprojectedFamily(request);
	}
}

/**
 * Project an owner's approval into the browser approval for its family.
 * @param view The owner's view of the approval.
 * @returns The browser approval.
 */
export function projectApproval(view: ApprovalOwnerView): BrowserApproval {
	const request = view.request;
	const envelope = approvalEnvelope(view);
	switch (request.family) {
		case "command_execution":
			return projectCommandExecution(envelope, request);
		case "file_change":
			return {
				...envelope,
				approvalKind: request.family,
				reason: request.params.reason ?? null,
				availableDecisions: ["accept", "acceptForSession", "decline", "cancel"],
			};
		case "apply_patch":
			return {
				...envelope,
				approvalKind: request.family,
				reason: request.params.reason,
				fileCount: Object.keys(request.params.fileChanges).length,
			};
		case "exec_command":
			return {
				...envelope,
				approvalKind: request.family,
				reason: request.params.reason,
				command: [...request.params.command],
			};
		default:
			return projectInteractiveApproval(envelope, request);
	}
}
