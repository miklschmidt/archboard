import {
	BROWSER_PERMISSION_FILE_ACCESS,
	type BrowserApproval,
} from "../../../shared/codex-browser-model/index.js";
import type {
	ApprovalOwnerView,
	CommandApprovalRequest,
	PermissionsApprovalRequest,
} from "../../../runtime/codex-approvals/index.js";

type PermissionFileSystem = PermissionsApprovalRequest["params"]["permissions"]["fileSystem"];
type CodexFileAccess = NonNullable<NonNullable<PermissionFileSystem>["entries"]>[number]["access"];
const BROWSER_FILE_ACCESS_BY_CODEX_ACCESS = BROWSER_PERMISSION_FILE_ACCESS satisfies Record<
	CodexFileAccess,
	string
>;

function isRecord(value: unknown): value is Record<string, unknown> {
	return value !== null && typeof value === "object" && !Array.isArray(value);
}

function fieldType(value: unknown): "string" | "number" | "integer" | "boolean" | "enum" | null {
	if (!isRecord(value)) return null;
	if (Array.isArray(value.enum) && value.enum.every((entry) => typeof entry === "string"))
		return "enum";
	if (
		Array.isArray(value.oneOf) &&
		value.oneOf.every((entry) => isRecord(entry) && typeof entry.const === "string")
	)
		return "enum";
	if (value.type === "array" && isRecord(value.items)) {
		if (
			Array.isArray(value.items.enum) &&
			value.items.enum.every((entry) => typeof entry === "string")
		)
			return "enum";
		if (
			Array.isArray(value.items.anyOf) &&
			value.items.anyOf.every((entry) => isRecord(entry) && typeof entry.const === "string")
		)
			return "enum";
	}
	return value.type === "string" ||
		value.type === "number" ||
		value.type === "integer" ||
		value.type === "boolean"
		? value.type
		: null;
}

function stringValue(value: unknown): string | null {
	return typeof value === "string" ? value : null;
}

function numberValue(value: unknown): number | null {
	return typeof value === "number" ? value : null;
}

function enumOptions(definition: Record<string, unknown>): readonly string[] | null {
	if (Array.isArray(definition.enum) && definition.enum.every((entry) => typeof entry === "string"))
		return definition.enum;
	if (Array.isArray(definition.oneOf))
		return definition.oneOf.flatMap((entry) =>
			isRecord(entry) && typeof entry.const === "string" ? [entry.const] : [],
		);
	if (definition.type === "array" && isRecord(definition.items)) {
		if (
			Array.isArray(definition.items.enum) &&
			definition.items.enum.every((entry) => typeof entry === "string")
		)
			return definition.items.enum;
		if (Array.isArray(definition.items.anyOf))
			return definition.items.anyOf.flatMap((entry) =>
				isRecord(entry) && typeof entry.const === "string" ? [entry.const] : [],
			);
	}
	return null;
}

interface ProjectedElicitationField {
	readonly name: string;
	readonly type: "string" | "number" | "integer" | "boolean" | "enum";
	readonly required: boolean;
	readonly secret: boolean;
	readonly title: string | null;
	readonly description: string | null;
	readonly format: "email" | "uri" | "date" | "date-time" | null;
	readonly minimum: number | null;
	readonly maximum: number | null;
	readonly minLength: number | null;
	readonly maxLength: number | null;
	readonly minimumItems: number | null;
	readonly maximumItems: number | null;
	readonly options: readonly string[] | null;
	readonly defaultValue: unknown;
}

function formFields(schema: unknown): readonly ProjectedElicitationField[] | null {
	if (!isRecord(schema) || !isRecord(schema.properties)) return null;
	const required = new Set(
		Array.isArray(schema.required) && schema.required.every((entry) => typeof entry === "string")
			? schema.required
			: [],
	);
	const fields: ProjectedElicitationField[] = [];
	for (const [name, definition] of Object.entries(schema.properties)) {
		const type = fieldType(definition);
		if (type === null || !isRecord(definition) || name.length === 0 || name.includes("\0"))
			return null;
		const secret = definition.secret === true;
		const format =
			definition.format === "email" ||
			definition.format === "uri" ||
			definition.format === "date" ||
			definition.format === "date-time"
				? definition.format
				: null;
		fields.push({
			name,
			type,
			required: required.has(name),
			secret,
			title: stringValue(definition.title),
			description: stringValue(definition.description),
			format,
			minimum: numberValue(definition.minimum),
			maximum: numberValue(definition.maximum),
			minLength: numberValue(definition.minLength),
			maxLength: numberValue(definition.maxLength),
			minimumItems: numberValue(definition.minItems),
			maximumItems: numberValue(definition.maxItems),
			options: enumOptions(definition),
			defaultValue: secret ? null : (definition.default ?? null),
		});
	}
	return fields;
}

function safeUrl(value: string): string {
	const parsed = new URL(value);
	if (parsed.protocol !== "http:" && parsed.protocol !== "https:")
		throw new Error("The approval URL is not safe for browser presentation.");
	return value;
}

type CommandDecision = NonNullable<CommandApprovalRequest["params"]["availableDecisions"]>[number];
const DEFAULT_COMMAND_DECISIONS: readonly CommandDecision[] = ["accept", "decline", "cancel"];

function effectiveCommandDecisions(request: CommandApprovalRequest): readonly CommandDecision[] {
	return request.params.availableDecisions ?? DEFAULT_COMMAND_DECISIONS;
}

function fileSystemAccesses(value: PermissionFileSystem): readonly CodexFileAccess[] {
	if (value === null) return [];
	const requested = new Set<CodexFileAccess>();
	if (value.read !== null) requested.add(BROWSER_FILE_ACCESS_BY_CODEX_ACCESS.read);
	if (value.write !== null) requested.add(BROWSER_FILE_ACCESS_BY_CODEX_ACCESS.write);
	for (const entry of value.entries ?? []) requested.add(entry.access);
	return Object.values(BROWSER_FILE_ACCESS_BY_CODEX_ACCESS).filter((access) =>
		requested.has(access),
	);
}

function projectLifecycle(view: ApprovalOwnerView): BrowserApproval["lifecycle"] {
	const { state, decision, outcome, reason } = view.snapshot;
	if (state === "staged" || state === "pending")
		return { state, decision: null, outcome: null, reason: null };
	if (state === "outcome_unknown")
		return {
			state,
			decision: decision ?? "cancelled",
			outcome: state,
			reason: reason ?? "The approval outcome is unknown.",
		};
	if (state === "settled")
		return {
			state,
			decision: decision ?? "cancelled",
			outcome: outcome === "outcome_unknown" ? null : outcome,
			reason: reason ?? "The approval settled.",
		};
	return {
		state,
		decision: "cancelled",
		outcome: outcome === "outcome_unknown" ? null : outcome,
		reason: reason ?? "The approval ended without an effect.",
	};
}

export function projectApproval(view: ApprovalOwnerView): unknown {
	const request = view.request;
	const envelope = {
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
	switch (request.family) {
		case "command_execution":
			return {
				...envelope,
				approvalKind: request.family,
				reason: request.params.reason ?? null,
				command: request.params.command ?? null,
				cwd: request.params.cwd ?? null,
				availableDecisions: effectiveCommandDecisions(request),
			};
		case "file_change":
			return {
				...envelope,
				approvalKind: request.family,
				reason: request.params.reason ?? null,
				grantRoot: request.params.grantRoot ?? null,
				availableDecisions: ["accept", "acceptForSession", "decline", "cancel"],
			};
		case "user_input":
			return { ...envelope, approvalKind: request.family, questions: request.params.questions };
		case "elicitation":
			return {
				...envelope,
				approvalKind: request.family,
				serverName: request.params.serverName,
				mode: request.params.mode,
				message: request.params.message,
				url: request.params.mode === "url" ? safeUrl(request.params.url) : null,
				fields: request.params.mode === "url" ? null : formFields(request.params.requestedSchema),
			};
		case "permissions":
			return {
				...envelope,
				approvalKind: request.family,
				reason: request.params.reason,
				requestedScope: {
					network: request.params.permissions.network?.enabled ?? null,
					fileAccess: fileSystemAccesses(request.params.permissions.fileSystem),
				},
			};
		case "apply_patch":
			return {
				...envelope,
				approvalKind: request.family,
				reason: request.params.reason,
				grantRoot: request.params.grantRoot,
				fileCount: Object.keys(request.params.fileChanges).length,
			};
		case "exec_command":
			return {
				...envelope,
				approvalKind: request.family,
				reason: request.params.reason,
				command: request.params.command,
				cwd: request.params.cwd,
			};
	}
}
