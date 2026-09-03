import { z } from "zod";

import { FileChangeSchema } from "./item-schemas.js";
import { CodexSafeI64Schema, JsonValueSchema, NonNegativeIntegerSchema } from "./scalars.js";

const NonNegativeCodexSafeI64Schema = CodexSafeI64Schema.refine((value) => value >= 0, {
	message: "Expected a non-negative safe i64",
});

const PermissionDecisionSchema = z.enum(["allow", "deny"]);

export const NetworkApprovalProtocolSchema = z.enum(["http", "https", "socks5Tcp", "socks5Udp"]);
export const NetworkApprovalContextSchema = z.strictObject({
	host: z.string(),
	protocol: NetworkApprovalProtocolSchema,
});

export const NetworkPolicyAmendmentSchema = z.strictObject({
	host: z.string(),
	action: PermissionDecisionSchema,
});
export const ExecPolicyAmendmentSchema = z.array(z.string());

export const CommandExecutionApprovalDecisionSchema = z.union([
	z.enum(["accept", "acceptForSession", "decline", "cancel"]),
	z.strictObject({
		acceptWithExecpolicyAmendment: z.strictObject({
			execpolicy_amendment: ExecPolicyAmendmentSchema,
		}),
	}),
	z.strictObject({
		applyNetworkPolicyAmendment: z.strictObject({
			network_policy_amendment: NetworkPolicyAmendmentSchema,
		}),
	}),
]);

export const AdditionalNetworkPermissionsSchema = z.strictObject({
	enabled: z.boolean().nullable(),
});

const FileSystemAccessModeSchema = z.enum(["read", "write", "deny"]);
const FileSystemSpecialPathSchema = z.discriminatedUnion("kind", [
	z.strictObject({ kind: z.literal("root") }),
	z.strictObject({ kind: z.literal("minimal") }),
	z.strictObject({ kind: z.literal("project_roots"), subpath: z.string().nullable() }),
	z.strictObject({ kind: z.literal("tmpdir") }),
	z.strictObject({ kind: z.literal("slash_tmp") }),
	z.strictObject({ kind: z.literal("unknown"), path: z.string(), subpath: z.string().nullable() }),
]);
const FileSystemPathSchema = z.discriminatedUnion("type", [
	z.strictObject({ type: z.literal("path"), path: z.string() }),
	z.strictObject({ type: z.literal("glob_pattern"), pattern: z.string() }),
	z.strictObject({ type: z.literal("special"), value: FileSystemSpecialPathSchema }),
]);
const FileSystemSandboxEntrySchema = z.strictObject({
	path: FileSystemPathSchema,
	access: FileSystemAccessModeSchema,
});
export const AdditionalFileSystemPermissionsSchema = z.strictObject({
	read: z.array(z.string()).nullable(),
	write: z.array(z.string()).nullable(),
	globScanMaxDepth: NonNegativeIntegerSchema.optional(),
	entries: z.array(FileSystemSandboxEntrySchema).optional(),
});

const PermissionProfileShape = {
	network: AdditionalNetworkPermissionsSchema.nullable(),
	fileSystem: AdditionalFileSystemPermissionsSchema.nullable(),
};
export const AdditionalPermissionProfileSchema = z.strictObject(PermissionProfileShape);
export const RequestPermissionProfileSchema = z.strictObject(PermissionProfileShape);

const McpElicitationStringFormatSchema = z.enum(["email", "uri", "date", "date-time"]);
const McpElicitationConstOptionSchema = z.strictObject({ const: z.string(), title: z.string() });
const McpElicitationUntitledEnumItemsSchema = z.strictObject({
	type: z.literal("string"),
	enum: z.array(z.string()),
});
const McpElicitationTitledEnumItemsSchema = z.strictObject({
	anyOf: z.array(McpElicitationConstOptionSchema),
});
const McpElicitationEnumSchema = z.union([
	z.strictObject({
		type: z.literal("string"),
		title: z.string().optional(),
		description: z.string().optional(),
		enum: z.array(z.string()),
		enumNames: z.array(z.string()).optional(),
		default: z.string().optional(),
	}),
	z.strictObject({
		type: z.literal("string"),
		title: z.string().optional(),
		description: z.string().optional(),
		oneOf: z.array(McpElicitationConstOptionSchema),
		default: z.string().optional(),
	}),
	z.strictObject({
		type: z.literal("array"),
		title: z.string().optional(),
		description: z.string().optional(),
		minItems: NonNegativeCodexSafeI64Schema.optional(),
		maxItems: NonNegativeCodexSafeI64Schema.optional(),
		items: McpElicitationUntitledEnumItemsSchema,
		default: z.array(z.string()).optional(),
	}),
	z.strictObject({
		type: z.literal("array"),
		title: z.string().optional(),
		description: z.string().optional(),
		minItems: NonNegativeCodexSafeI64Schema.optional(),
		maxItems: NonNegativeCodexSafeI64Schema.optional(),
		items: McpElicitationTitledEnumItemsSchema,
		default: z.array(z.string()).optional(),
	}),
]);
const McpElicitationPrimitiveSchema = z.union([
	McpElicitationEnumSchema,
	z.strictObject({
		type: z.literal("string"),
		title: z.string().optional(),
		description: z.string().optional(),
		minLength: NonNegativeIntegerSchema.optional(),
		maxLength: NonNegativeIntegerSchema.optional(),
		format: McpElicitationStringFormatSchema.optional(),
		default: z.string().optional(),
	}),
	z.strictObject({
		type: z.enum(["number", "integer"]),
		title: z.string().optional(),
		description: z.string().optional(),
		minimum: z.number().optional(),
		maximum: z.number().optional(),
		default: z.number().optional(),
	}),
	z.strictObject({
		type: z.literal("boolean"),
		title: z.string().optional(),
		description: z.string().optional(),
		default: z.boolean().optional(),
	}),
]);
const McpElicitationSchema = z.strictObject({
	$schema: z.string().optional(),
	type: z.literal("object"),
	properties: z.record(z.string(), McpElicitationPrimitiveSchema),
	required: z.array(z.string()).optional(),
});

const McpElicitationBaseShape = {
	threadId: z.string(),
	turnId: z.string().nullable(),
	serverName: z.string(),
};
export const McpServerElicitationRequestParamsSchema = z.discriminatedUnion("mode", [
	z.strictObject({
		...McpElicitationBaseShape,
		mode: z.literal("form"),
		/** MCP metadata is an intentionally open JSON extension point. */
		_meta: JsonValueSchema.nullable(),
		message: z.string(),
		requestedSchema: McpElicitationSchema,
	}),
	z.strictObject({
		...McpElicitationBaseShape,
		mode: z.literal("openai/form"),
		/** OpenAI form schemas are forwarded as open JSON by the generated contract. */
		_meta: JsonValueSchema.nullable(),
		message: z.string(),
		requestedSchema: JsonValueSchema,
	}),
	z.strictObject({
		...McpElicitationBaseShape,
		mode: z.literal("url"),
		/** MCP metadata is an intentionally open JSON extension point. */
		_meta: JsonValueSchema.nullable(),
		message: z.string(),
		url: z.string(),
		elicitationId: z.string(),
	}),
]);

export const ParsedCommandSchema = z.discriminatedUnion("type", [
	z.strictObject({ type: z.literal("read"), cmd: z.string(), name: z.string(), path: z.string() }),
	z.strictObject({ type: z.literal("list_files"), cmd: z.string(), path: z.string().nullable() }),
	z.strictObject({
		type: z.literal("search"),
		cmd: z.string(),
		query: z.string().nullable(),
		path: z.string().nullable(),
	}),
	z.strictObject({ type: z.literal("unknown"), cmd: z.string() }),
]);

export const ApplyPatchApprovalParamsSchema = z.strictObject({
	conversationId: z.string(),
	callId: z.string(),
	/** File paths are generated map keys and are supplied by the approval request. */
	fileChanges: z.record(z.string(), FileChangeSchema),
	reason: z.string().nullable(),
	grantRoot: z.string().nullable(),
});

export const ExecCommandApprovalParamsSchema = z.strictObject({
	conversationId: z.string(),
	callId: z.string(),
	approvalId: z.string().nullable(),
	command: z.array(z.string()),
	cwd: z.string(),
	reason: z.string().nullable(),
	parsedCmd: z.array(ParsedCommandSchema),
});
