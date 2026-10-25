import type { WorkbenchThreadProfile } from "#runtime/protocol/host/instructions.ts";
import type { ThreadId } from "@archboard/codex-app-server/identity";
import {
	COORDINATOR_IDENTITY,
	COORDINATOR_THREAD_CONFIG,
} from "#runtime/protocol/coordinator-tool-contract/contracts.ts";
import type { CodexSession, SessionParams } from "@archboard/codex-app-server/session";
import {
	CodexCoordinatorError,
	type CoordinatorModel,
	type CoordinatorSettingsUpdateParams,
	type CoordinatorThreadStartParams,
} from "#runtime/protocol/coordinator/contract.ts";

const COORDINATOR_MODEL = COORDINATOR_IDENTITY.model;
const COORDINATOR_EFFORT = COORDINATOR_IDENTITY.effort;
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

/**
 * The authored coordinator thread/start body. The priority service tier is only named when the
 * account advertises it, because naming a tier the account does not have is refused by Codex.
 * @param workingDirectory - The directory of its own the coordinator works in, which is no checkout.
 * @param serviceTier - The advertised priority tier, or null.
 * @returns The thread/start parameters.
 * @param profile The host policy for this operation.
 */
function createCoordinatorThreadStartParams(
	workingDirectory: string,
	serviceTier: "priority" | null,
	profile: WorkbenchThreadProfile,
): CoordinatorThreadStartParams {
	if (serviceTier === "priority") {
		return {
			model: COORDINATOR_MODEL,
			allowProviderModelFallback: false,
			serviceTier: "priority",
			cwd: workingDirectory,
			runtimeWorkspaceRoots: [workingDirectory],
			config: COORDINATOR_THREAD_CONFIG,
			serviceName: profile.serviceName,
			developerInstructions: profile.instructions.text,
			ephemeral: false,
			historyMode: "paginated",
			sessionStartSource: "startup",
			threadSource: profile.threadSource,
			dynamicTools: [...profile.dynamicTools],
			experimentalRawEvents: false,
		} satisfies SessionParams<"thread/start">;
	}
	return {
		model: COORDINATOR_MODEL,
		allowProviderModelFallback: false,
		cwd: workingDirectory,
		runtimeWorkspaceRoots: [workingDirectory],
		config: COORDINATOR_THREAD_CONFIG,
		serviceName: profile.serviceName,
		developerInstructions: profile.instructions.text,
		ephemeral: false,
		historyMode: "paginated",
		sessionStartSource: "startup",
		threadSource: profile.threadSource,
		dynamicTools: [...profile.dynamicTools],
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
