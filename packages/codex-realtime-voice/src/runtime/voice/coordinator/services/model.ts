import type { WorkbenchThreadProfile } from "#runtime/host/protocol/instructions.ts";
import { defaultVoiceAgentModels, type RoleModelSelection } from "#runtime/host/protocol/models.ts";
import type { ThreadId } from "@archboard/codex-app-server/identity";
import { deepFreeze } from "#runtime/voice/coordinator/tools-and-work/tool-contract/protocol/manifest.ts";
import type { CodexSession } from "@archboard/codex-app-server/session";
import {
	CodexCoordinatorError,
	type CoordinatorModel,
	type CoordinatorSettingsUpdateParams,
	type CoordinatorThreadStartParams,
} from "#runtime/voice/coordinator/protocol/contract.ts";

/** The reviewed default model and reasoning effort a coordinator turn carries. */
const COORDINATOR_MODEL = defaultVoiceAgentModels().coordinator.model;
const COORDINATOR_EFFORT = defaultVoiceAgentModels().coordinator.effort;

/**
 * The Codex configuration every coordinator thread starts with.
 *
 * `project_doc_max_bytes: 0` stops Codex loading the checkout's `AGENTS.md` into the coordinator.
 * That file is written for an agent doing work in the repository: it tells every request to
 * begin with project procedure. The coordinator is a voice front desk whose whole brief is the
 * instructions the host gives it, and in a first narrative that procedure cost eight seconds of
 * silence before it presented a step. The workhorse, which does
 * work in the repository, still reads the file.
 */
const COORDINATOR_THREAD_CONFIG = deepFreeze({
	features: { realtime_conversation: true },
	project_doc_max_bytes: 0,
} as const);
const COORDINATOR_MODEL_PAGE_LIMIT = 100 as const;

interface CoordinatorModelSelection {
	readonly model: CoordinatorModel;
	readonly configuredEffort: string;
	readonly configuredServiceTier: string | null;
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
 * Find the single advertised model matching the target name, refusing missing or duplicate entries.
 * @param models - Every advertised model.
 * @param targetModel - Model name to locate.
 * @returns The matching model entry.
 */
function findUniqueCoordinatorModel(
	models: readonly CoordinatorModel[],
	targetModel: string,
): CoordinatorModel {
	const matches = models.filter((model) => model.model === targetModel);
	if (matches.length === 0) {
		throw new CodexCoordinatorError(
			"model_unavailable",
			`The coordinator requires ${targetModel}, but model/list did not advertise it.`,
		);
	}
	if (matches.length !== 1 || matches[0] === undefined) {
		throw new CodexCoordinatorError(
			"model_ambiguous",
			`model/list advertised ${targetModel} more than once; selection is refused.`,
		);
	}
	return matches[0];
}

/**
 * Resolve the coordinator's service tier for a matched model, validating explicit requests against
 * what the model advertises.
 * @param model - The matched model entry.
 * @param requested - Explicit host selection, or null for reviewed default behaviour.
 * @returns The configured service tier, or null.
 */
function resolveCoordinatorServiceTier(
	model: CoordinatorModel,
	requested: RoleModelSelection | null,
): string | null {
	if (requested === null) {
		return model.serviceTiers.some((tier) => tier.id === "priority") ? "priority" : null;
	}
	if (
		requested.serviceTier !== null &&
		!model.serviceTiers.some((tier) => tier.id === requested.serviceTier)
	) {
		throw new CodexCoordinatorError(
			"unsupported_service_tier",
			`${model.model} does not advertise ${requested.serviceTier} service tier.`,
		);
	}
	return requested.serviceTier;
}

/**
 * Verify a model advertises the requested reasoning effort.
 * @param model - The matched model entry.
 * @param effort - The reasoning effort to require.
 */
function assertSupportedEffort(model: CoordinatorModel, effort: string): void {
	if (!model.supportedReasoningEfforts.some((option) => option.reasoningEffort === effort)) {
		throw new CodexCoordinatorError(
			"unsupported_effort",
			`${model.model} does not advertise ${effort} reasoning effort.`,
		);
	}
}

/**
 * Choose the coordinator's model from the advertised list. The target model must be advertised
 * exactly once and must support the chosen reasoning effort and service tier; anything else is
 * refused rather than substituted.
 * @param models - Every advertised model.
 * @param requested - An explicit host selection, or null to use the reviewed default.
 * @returns The model, configured effort, and configured service tier.
 * @throws {CodexCoordinatorError} When the model is missing, ambiguous, or lacks the effort or tier.
 */
function selectCoordinatorModel(
	models: readonly CoordinatorModel[],
	requested: RoleModelSelection | null = null,
): CoordinatorModelSelection {
	const targetModel = requested?.model ?? COORDINATOR_MODEL;
	const targetEffort = requested?.effort ?? COORDINATOR_EFFORT;
	const model = findUniqueCoordinatorModel(models, targetModel);
	assertSupportedEffort(model, targetEffort);
	return Object.freeze({
		model,
		configuredEffort: targetEffort,
		configuredServiceTier: resolveCoordinatorServiceTier(model, requested),
	});
}

/**
 * The authored coordinator thread/start body. An explicit null chooses Standard even when the
 * Codex configuration supplies a different tier.
 * @param workingDirectory - The directory of its own the coordinator works in, which is no checkout.
 * @param serviceTier - The advertised service tier, or null.
 * @param profile - The host policy for this operation.
 * @param model - The selected model id.
 * @returns The thread/start parameters.
 */
function createCoordinatorThreadStartParams(
	workingDirectory: string,
	serviceTier: string | null,
	profile: WorkbenchThreadProfile,
	model: string = COORDINATOR_MODEL,
): CoordinatorThreadStartParams {
	return {
		model,
		allowProviderModelFallback: false,
		serviceTier,
		cwd: workingDirectory,
		runtimeWorkspaceRoots: [workingDirectory],
		config: COORDINATOR_THREAD_CONFIG,
		serviceName: profile.identity.serviceName,
		developerInstructions: profile.instructions.text,
		ephemeral: false,
		historyMode: "paginated",
		sessionStartSource: "startup",
		threadSource: profile.identity.threadSource,
		dynamicTools: [...profile.dynamicTools],
		experimentalRawEvents: false,
	};
}

/**
 * The settings update that puts an adopted coordinator thread onto the selected model, effort and
 * service tier.
 * @param threadId - The coordinator thread.
 * @param serviceTier - The advertised service tier, or null.
 * @param model - The selected model id.
 * @param effort - The selected reasoning effort.
 * @returns The settings/update parameters.
 */
function createCoordinatorSettingsUpdateParams(
	threadId: ThreadId,
	serviceTier: string | null,
	model: string = COORDINATOR_MODEL,
	effort: string = COORDINATOR_EFFORT,
): CoordinatorSettingsUpdateParams {
	return {
		threadId,
		model,
		serviceTier,
		effort,
	};
}

export {
	type CoordinatorModelSelection,
	listCoordinatorModels,
	selectCoordinatorModel,
	createCoordinatorThreadStartParams,
	createCoordinatorSettingsUpdateParams,
};
