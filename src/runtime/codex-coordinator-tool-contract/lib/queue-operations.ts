import {
	CODEX_PROTOCOL_VERSION,
	ThreadQueueAddParamsSchema,
	ThreadQueueDeleteParamsSchema,
	ThreadQueueListParamsSchema,
	ThreadQueueReorderParamsSchema,
	ThreadQueueStartParamsSchema,
	ThreadQueueUpdateParamsSchema,
	type ThreadQueueAddParams,
	type ThreadQueueDeleteParams,
	type ThreadQueueListParams,
	type ThreadQueueReorderParams,
	type ThreadQueueStartParams,
	type ThreadQueueUpdateParams,
} from "@/runtime/codex-protocol";
import { deepFreeze } from "@/runtime/codex-coordinator-tool-contract/lib/manifest";
import type { QueueOperation } from "@/runtime/codex-coordinator-tool-contract/lib/tool-inputs";

const CODEX_QUEUE_PARAMETER_SCHEMAS = Object.freeze({
	list: ThreadQueueListParamsSchema,
	add: ThreadQueueAddParamsSchema,
	update: ThreadQueueUpdateParamsSchema,
	delete: ThreadQueueDeleteParamsSchema,
	reorder: ThreadQueueReorderParamsSchema,
	start: ThreadQueueStartParamsSchema,
});

interface QueueOperationContract {
	readonly operation: QueueOperation;
	readonly rpc: `thread/queue/${QueueOperation}`;
	readonly toolFields: readonly string[];
	readonly protocolFields: readonly string[];
	readonly protocolRequiredFields: readonly string[];
	readonly protocolOptionalNullableFields: readonly string[];
	readonly hostSuppliedFields: readonly string[];
	readonly fieldMapping: Readonly<Record<string, string>>;
}

const CODEX_QUEUE_OPERATION_CONTRACTS = deepFreeze([
	{
		operation: "list",
		rpc: "thread/queue/list",
		toolFields: ["operation"],
		protocolFields: ["threadId", "cursor", "limit"],
		protocolRequiredFields: ["threadId"],
		protocolOptionalNullableFields: ["cursor", "limit"],
		hostSuppliedFields: ["threadId", "cursor", "limit"],
		fieldMapping: {},
	},
	{
		operation: "add",
		rpc: "thread/queue/add",
		toolFields: ["operation", "prompt"],
		protocolFields: ["threadId", "input", "clientUserMessageId"],
		protocolRequiredFields: ["threadId", "input", "clientUserMessageId"],
		protocolOptionalNullableFields: [],
		hostSuppliedFields: ["threadId", "clientUserMessageId"],
		fieldMapping: { prompt: "input", clientUserMessageId: "host_minted" },
	},
	{
		operation: "update",
		rpc: "thread/queue/update",
		toolFields: ["operation", "submissionId", "prompt"],
		protocolFields: ["threadId", "queuedSubmissionId", "input"],
		protocolRequiredFields: ["threadId", "queuedSubmissionId", "input"],
		protocolOptionalNullableFields: [],
		hostSuppliedFields: ["threadId"],
		fieldMapping: { submissionId: "queuedSubmissionId", prompt: "input" },
	},
	{
		operation: "delete",
		rpc: "thread/queue/delete",
		toolFields: ["operation", "submissionId"],
		protocolFields: ["threadId", "queuedSubmissionId"],
		protocolRequiredFields: ["threadId", "queuedSubmissionId"],
		protocolOptionalNullableFields: [],
		hostSuppliedFields: ["threadId"],
		fieldMapping: { submissionId: "queuedSubmissionId" },
	},
	{
		operation: "reorder",
		rpc: "thread/queue/reorder",
		toolFields: ["operation", "orderedSubmissionIds"],
		protocolFields: ["threadId", "queuedSubmissionIds"],
		protocolRequiredFields: ["threadId", "queuedSubmissionIds"],
		protocolOptionalNullableFields: [],
		hostSuppliedFields: ["threadId"],
		fieldMapping: { orderedSubmissionIds: "queuedSubmissionIds" },
	},
	{
		operation: "start",
		rpc: "thread/queue/start",
		toolFields: ["operation", "submissionId"],
		protocolFields: ["threadId", "queuedSubmissionId"],
		protocolRequiredFields: ["threadId"],
		protocolOptionalNullableFields: ["queuedSubmissionId"],
		hostSuppliedFields: ["threadId"],
		fieldMapping: { submissionId: "queuedSubmissionId" },
	},
] satisfies readonly QueueOperationContract[]);

const CODEX_QUEUE_OPERATION_NAMES = Object.freeze(
	CODEX_QUEUE_OPERATION_CONTRACTS.map(({ operation }) => operation),
);

const CODEX_QUEUE_PROTOCOL = Object.freeze({
	protocol: "codex-app-server",
	version: CODEX_PROTOCOL_VERSION,
	operations: CODEX_QUEUE_OPERATION_NAMES,
});

export {
	ThreadQueueAddParamsSchema,
	ThreadQueueDeleteParamsSchema,
	ThreadQueueListParamsSchema,
	ThreadQueueReorderParamsSchema,
	ThreadQueueStartParamsSchema,
	ThreadQueueUpdateParamsSchema,
	type ThreadQueueAddParams,
	type ThreadQueueDeleteParams,
	type ThreadQueueListParams,
	type ThreadQueueReorderParams,
	type ThreadQueueStartParams,
	type ThreadQueueUpdateParams,
	CODEX_QUEUE_PARAMETER_SCHEMAS,
	type QueueOperationContract,
	CODEX_QUEUE_OPERATION_CONTRACTS,
	CODEX_QUEUE_OPERATION_NAMES,
	CODEX_QUEUE_PROTOCOL,
};
