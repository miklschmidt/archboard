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

/** One page of the model list, as the session reports it. */
type ModelListPage = Awaited<ReturnType<ModelSessionPort["modelList"]>>;

/**
 * Read one page of the model list, refusing a page whose shape cannot be trusted: a selection
 * made from a partial list could pick a model the account cannot actually use.
 * @param session - The session port.
 * @param cursor - The page to read, or null for the first.
 * @returns The page.
 * @throws {CodexCoordinatorError} When the page cannot be read or is not a valid page.
 */
async function readModelPage(
	session: ModelSessionPort,
	cursor: string | null,
): Promise<ModelListPage> {
	let page: ModelListPage;
	try {
		page = await session.modelList({ cursor, limit: COORDINATOR_MODEL_PAGE_LIMIT });
	} catch (error) {
		throw new CodexCoordinatorError(
			"model_list_failed",
			"The coordinator could not exhaust model/list.",
			error,
		);
	}
	if (page.nextCursor !== null && typeof page.nextCursor !== "string") {
		throw new CodexCoordinatorError(
			"model_list_failed",
			"model/list returned an invalid page before exhaustion.",
		);
	}
	return page;
}

/**
 * The cursor to read next, refusing one already followed so a list that keeps handing back the
 * same page cannot page forever.
 * @param nextCursor - The cursor the page carried.
 * @param cursor - The cursor that produced the page.
 * @param seenCursors - The cursors already followed.
 * @returns The next cursor, or null when the list is exhausted.
 * @throws {CodexCoordinatorError} When the cursor repeats.
 */
function nextModelCursor(
	nextCursor: string | null,
	cursor: string | null,
	seenCursors: Set<string>,
): string | null {
	if (nextCursor === null) {
		return null;
	}
	if (nextCursor === cursor || seenCursors.has(nextCursor)) {
		throw new CodexCoordinatorError(
			"repeated_cursor",
			`model/list repeated cursor ${JSON.stringify(nextCursor)} before exhaustion.`,
		);
	}
	seenCursors.add(nextCursor);
	return nextCursor;
}

/**
 * Exhaust the authoritative model pages before making a selection. The whole list is read because
 * the coordinator's model must be advertised exactly once, which a partial read cannot establish.
 * @param session - The session port.
 * @returns Every advertised model, in list order.
 * @throws {CodexCoordinatorError} When the list cannot be exhausted.
 */
async function listCoordinatorModels(
	session: ModelSessionPort,
): Promise<readonly CoordinatorModel[]> {
	const models: CoordinatorModel[] = [];
	const seenCursors = new Set<string>();
	let cursor: string | null = null;
	do {
		// oxlint-disable-next-line no-await-in-loop -- pagination is sequential by contract: each page's cursor comes from the one before it
		const page = await readModelPage(session, cursor);
		models.push(...page.data);
		cursor = nextModelCursor(page.nextCursor, cursor, seenCursors);
	} while (cursor !== null);
	return Object.freeze([...models]);
}

/**
 * Choose the coordinator's model from the advertised list. The reviewed model must be advertised
 * exactly once and must support the reviewed reasoning effort; anything else is refused rather
 * than substituted, because the coordinator's behaviour is what was reviewed.
 * @param models - Every advertised model.
 * @returns The model and whether the priority service tier is available.
 * @throws {CodexCoordinatorError} When the model is missing, ambiguous or lacks the effort.
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
 * The reviewed catalogue is immutable; the generated request shape requires a mutable tools
 * array. Copy only that structural boundary while retaining the exact reviewed values and order.
 * @param namespace - The reviewed namespace.
 * @returns The namespace as thread/start accepts it.
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
 * Copy one reviewed tool schema as a plain JSON value the generated request type accepts. A
 * non-finite number or a value JSON cannot hold is refused: the schema Codex is given must be the
 * reviewed one, not an approximation of it.
 * @param value - The reviewed schema value.
 * @returns The same value as plain JSON.
 * @throws {TypeError} When the schema holds something JSON cannot represent.
 */
function coordinatorJsonValue(value: unknown): CoordinatorJsonValue {
	if (value === null || JSON_SCALARS.has(typeof value)) {
		return jsonScalar(value);
	}
	if (Array.isArray(value)) {
		return value.map(coordinatorJsonValue);
	}
	if (typeof value === "object") {
		return Object.fromEntries(
			Object.entries(value).map(([key, child]) => [key, coordinatorJsonValue(child)]),
		);
	}
	throw new TypeError("Coordinator tool schemas must contain JSON values.");
}

/** The scalar types a JSON schema value may be. */
const JSON_SCALARS: ReadonlySet<string> = new Set(["boolean", "string", "number"]);

/**
 * One scalar schema value, refusing a number JSON cannot hold.
 * @param value - The scalar, already known to be null or a JSON scalar type.
 * @returns The same value.
 * @throws {TypeError} When the value is a non-finite number.
 */
function jsonScalar(value: unknown): null | boolean | number | string {
	if (typeof value === "number") {
		return finiteJsonNumber(value);
	}
	// oxlint-disable-next-line typescript/no-unsafe-type-assertion -- the caller has already established that the value is null or one of the JSON scalar types, which TypeScript cannot follow through a Set lookup on typeof
	return value as null | boolean | string;
}

/**
 * A number that JSON can hold, refusing the ones it cannot.
 * @param value - The number.
 * @returns The same number.
 * @throws {TypeError} When the number is not finite.
 */
function finiteJsonNumber(value: number): number {
	if (Number.isFinite(value)) {
		return value;
	}
	throw new TypeError("Coordinator tool schemas must contain finite JSON numbers.");
}

/**
 * The two reviewed tool namespaces a coordinator thread is started with, in reviewed order.
 * @returns The dynamic tools for thread/start.
 */
function coordinatorDynamicTools(): NonNullable<CoordinatorThreadStartParams["dynamicTools"]> {
	return [
		namespaceForThreadStart(ARCHBOARD_WORKHORSE_NAMESPACE),
		namespaceForThreadStart(ARCHBOARD_VOICE_NAMESPACE),
	];
}

/**
 * The authored coordinator thread/start body. The priority service tier is only named when the
 * account advertises it, because naming a tier the account does not have is refused by Codex.
 * @param checkoutRoot - The canonical checkout root the coordinator works in.
 * @param serviceTier - The advertised priority tier, or null.
 * @returns The thread/start parameters.
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
 * The settings update that puts an adopted coordinator thread onto the reviewed model, effort and
 * service tier.
 * @param threadId - The coordinator thread.
 * @param serviceTier - The advertised priority tier, or null.
 * @returns The settings/update parameters.
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
