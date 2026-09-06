import type { ThreadId } from "@/shared/codex-workbench-identity";
import {
	ARCHBOARD_VOICE_NAMESPACE,
	ARCHBOARD_WORKHORSE_NAMESPACE,
} from "@/runtime/codex-coordinator-tool-contract";
import { COORDINATOR_DEVELOPER_INSTRUCTIONS } from "@/runtime/codex-instructions";
import type { CanonicalNamespace } from "@/runtime/codex-coordinator-tool-contract";
import type { CodexSession, SessionParams } from "@/runtime/codex-session";
import {
	CodexCoordinatorError,
	type CoordinatorModel,
	type CoordinatorSettingsUpdateParams,
	type CoordinatorThreadStartParams,
} from "@/runtime/codex-coordinator/lib/contract";

const COORDINATOR_MODEL = "gpt-5.6-luna" as const;
const COORDINATOR_EFFORT = "medium" as const;
const COORDINATOR_MODEL_PAGE_LIMIT = 100 as const;

interface CoordinatorModelSelection {
	readonly model: CoordinatorModel;
	readonly configuredServiceTier: "priority" | null;
}

type ModelSessionPort = Pick<CodexSession, "modelList">;

/** Exhaust the authoritative model pages before making a selection. */
async function listCoordinatorModels(
	session: ModelSessionPort,
): Promise<readonly CoordinatorModel[]> {
	const models: CoordinatorModel[] = [];
	const seenCursors = new Set<string>();
	let cursor: string | null = null;
	while (true) {
		let page: Awaited<ReturnType<ModelSessionPort["modelList"]>>;
		try {
			page = await session.modelList({ cursor, limit: COORDINATOR_MODEL_PAGE_LIMIT });
		} catch (error) {
			throw new CodexCoordinatorError(
				"model_list_failed",
				"The coordinator could not exhaust model/list.",
				error,
			);
		}
		if (
			!Array.isArray(page.data) ||
			(page.nextCursor !== null && typeof page.nextCursor !== "string")
		) {
			throw new CodexCoordinatorError(
				"model_list_failed",
				"model/list returned an invalid page before exhaustion.",
			);
		}
		models.push(...page.data);
		const nextCursor = page.nextCursor;
		if (nextCursor === null) {
			return Object.freeze([...models]);
		}
		if (nextCursor === cursor || seenCursors.has(nextCursor)) {
			throw new CodexCoordinatorError(
				"repeated_cursor",
				`model/list repeated cursor ${JSON.stringify(nextCursor)} before exhaustion.`,
			);
		}
		seenCursors.add(nextCursor);
		cursor = nextCursor;
	}
}

/**
 *
 */
function selectCoordinatorModel(models: readonly CoordinatorModel[]): CoordinatorModelSelection {
	const matches = models.filter((model) => model.model === COORDINATOR_MODEL);
	if (matches.length === 0) {
		throw new CodexCoordinatorError(
			"model_unavailable",
			`The coordinator requires ${COORDINATOR_MODEL}, but model/list did not advertise it.`,
		);
	}
	if (matches.length !== 1) {
		throw new CodexCoordinatorError(
			"model_ambiguous",
			`model/list advertised ${COORDINATOR_MODEL} more than once; selection is refused.`,
		);
	}
	const model = matches[0];
	if (model === undefined) {
		throw new CodexCoordinatorError(
			"model_unavailable",
			`model/list did not return the advertised ${COORDINATOR_MODEL}.`,
		);
	}
	if (
		!model.supportedReasoningEfforts.some((option) => option.reasoningEffort === COORDINATOR_EFFORT)
	) {
		throw new CodexCoordinatorError(
			"unsupported_effort",
			`${COORDINATOR_MODEL} does not advertise ${COORDINATOR_EFFORT} reasoning effort.`,
		);
	}
	return Object.freeze({
		model,
		configuredServiceTier: model.serviceTiers.some((tier) => tier.id === "priority")
			? "priority"
			: null,
	});
}

type ThreadStartDynamicTool = NonNullable<CoordinatorThreadStartParams["dynamicTools"]>[number];
type ThreadStartNamespace = Extract<ThreadStartDynamicTool, { type: "namespace" }>;
type CoordinatorJsonValue =
	| null
	| boolean
	| number
	| string
	| CoordinatorJsonValue[]
	| { readonly [key: string]: CoordinatorJsonValue };

/**
 * The reviewed catalogue is immutable; the generated request shape requires a
 * mutable tools array. Copy only that structural boundary while retaining the
 * exact reviewed values and order.
 */
function namespaceForThreadStart(namespace: CanonicalNamespace): ThreadStartNamespace {
	return {
		type: "namespace",
		name: namespace.name,
		description: namespace.description,
		tools: namespace.tools.map((tool) => ({
			type: "function",
			name: tool.name,
			description: tool.description,
			inputSchema: coordinatorJsonValue(tool.inputSchema),
			deferLoading: tool.deferLoading,
		})),
	};
}

/**
 *
 */
function coordinatorJsonValue(value: unknown): CoordinatorJsonValue {
	if (value === null) {
		return null;
	}
	if (typeof value === "boolean" || typeof value === "string") {
		return value;
	}
	if (typeof value === "number") {
		if (Number.isFinite(value)) {
			return value;
		}
		throw new TypeError("Coordinator tool schemas must contain finite JSON numbers.");
	}
	if (Array.isArray(value)) {
		return value.map(coordinatorJsonValue);
	}
	if (typeof value === "object") {
		const object: { [key: string]: CoordinatorJsonValue } = {};
		for (const [key, child] of Object.entries(value)) {
			object[key] = coordinatorJsonValue(child);
		}
		return object;
	}
	throw new TypeError("Coordinator tool schemas must contain JSON values.");
}

/**
 *
 */
function coordinatorDynamicTools(): NonNullable<CoordinatorThreadStartParams["dynamicTools"]> {
	return [
		namespaceForThreadStart(ARCHBOARD_WORKHORSE_NAMESPACE),
		namespaceForThreadStart(ARCHBOARD_VOICE_NAMESPACE),
	];
}

/**
 *
 */
function createCoordinatorThreadStartParams(
	checkoutRoot: string,
	serviceTier: "priority" | null,
): CoordinatorThreadStartParams {
	if (serviceTier === "priority") {
		return {
			model: COORDINATOR_MODEL,
			allowProviderModelFallback: false,
			serviceTier: "priority",
			cwd: checkoutRoot,
			runtimeWorkspaceRoots: [checkoutRoot],
			config: { features: { realtime_conversation: true } },
			serviceName: "archboard",
			developerInstructions: COORDINATOR_DEVELOPER_INSTRUCTIONS,
			ephemeral: false,
			historyMode: "paginated",
			sessionStartSource: "startup",
			threadSource: "archboard",
			dynamicTools: coordinatorDynamicTools(),
			experimentalRawEvents: false,
		} satisfies SessionParams<"thread/start">;
	}
	return {
		model: COORDINATOR_MODEL,
		allowProviderModelFallback: false,
		cwd: checkoutRoot,
		runtimeWorkspaceRoots: [checkoutRoot],
		config: { features: { realtime_conversation: true } },
		serviceName: "archboard",
		developerInstructions: COORDINATOR_DEVELOPER_INSTRUCTIONS,
		ephemeral: false,
		historyMode: "paginated",
		sessionStartSource: "startup",
		threadSource: "archboard",
		dynamicTools: coordinatorDynamicTools(),
		experimentalRawEvents: false,
	} satisfies SessionParams<"thread/start">;
}

/**
 *
 */
function createCoordinatorSettingsUpdateParams(
	threadId: ThreadId,
	serviceTier: "priority" | null,
): CoordinatorSettingsUpdateParams {
	if (serviceTier === "priority") {
		return {
			threadId,
			model: COORDINATOR_MODEL,
			serviceTier: "priority",
			effort: COORDINATOR_EFFORT,
		} satisfies SessionParams<"thread/settings/update">;
	}
	return {
		threadId,
		model: COORDINATOR_MODEL,
		effort: COORDINATOR_EFFORT,
	} satisfies SessionParams<"thread/settings/update">;
}

export {
	COORDINATOR_MODEL,
	COORDINATOR_EFFORT,
	COORDINATOR_MODEL_PAGE_LIMIT,
	type CoordinatorModelSelection,
	listCoordinatorModels,
	selectCoordinatorModel,
	createCoordinatorThreadStartParams,
	createCoordinatorSettingsUpdateParams,
};
