import { semanticChangeFeed } from "#server/services/panes/change-feed.ts";
import { canonicalContext } from "#server/projections/semantic-context/canonical-context.ts";
import type {
	CodexWorkbenchSessionComponents,
	CodexWorkbenchWorkhorseComponents,
} from "#runtime/protocol/voice/extension.ts";
import type { CodexWorkbenchDomainScope as CodexWorkbenchComponents } from "#runtime/protocol/voice/extension.ts";
import type { PaneRegistration } from "@archboard/server-lifecycle/panes";
import {
	ArchboardContextSchema,
	type ArchboardContext,
} from "#runtime/rules/instructions/context.ts";
import type {
	SemanticContextInput,
	SettledSemanticChangeEvent,
} from "#runtime/schemas/semantic-context-types.ts";
import { checkoutOfVault } from "@archboard/workspace/vault";
type FreshBrief = import("#runtime/schemas/semantic-context-types.ts").FreshSemanticBrief;

/**
 * The variant a context names: the brief's, without the predecessor it is
 * measured against, which is a fact about the comparison rather than about
 * which state the pane is reading.
 * @param variant The brief's variant, or null before anything is drawn.
 * @returns The context's variant.
 */
function contextVariant(
	variant: FreshBrief["architecture"]["variant"],
): ArchboardContext["variant"] {
	return variant === null
		? null
		: { id: variant.id, name: variant.name, lifecycle: variant.lifecycle };
}

/**
 * The canonical Codex context a semantic brief becomes, for one pane and one
 * operation.
 * @param brief The settled or fresh brief.
 * @param paneId The pane the context is for.
 * @param operation The operation the context describes.
 * @returns The validated context.
 */
function canonicalContextFromBrief(
	brief: SettledSemanticChangeEvent | FreshBrief,
	paneId: string,
	operation: ArchboardContext["operation"],
): ArchboardContext {
	if (brief.child.id === null || brief.child.epoch === null) {
		throw new Error("Canonical Codex context requires the active child epoch.");
	}
	return ArchboardContextSchema.parse({
		schema: 1,
		paneId,
		board: {
			name: brief.board.name,
			key: brief.board.key,
			version: brief.version ?? 0,
			cursor: brief.cursor === null ? null : `${brief.cursor.feedId}:${brief.cursor.sequence}`,
		},
		threadLink: brief.threadLink,
		child: { id: brief.child.id, epoch: brief.child.epoch },
		workhorse: brief.workhorse,
		coordinator: brief.coordinator,
		semantic: {
			brief: brief.brief,
			capturedAtMs: brief.freshness.capturedAtMs,
			freshUntilMs: brief.freshness.freshUntilMs,
			truncated: brief.truncated,
		},
		focus: {
			paneId: brief.pane.focused ? brief.pane.paneId : null,
			capturedAtMs: brief.freshness.capturedAtMs,
		},
		variant: contextVariant(brief.architecture.variant),
		view: brief.architecture.view,
		selection: {
			count: brief.architecture.selection.count,
			subjects: brief.architecture.selection.subjects,
			capturedAtMs: brief.freshness.capturedAtMs,
		},
		// The summary, not the fitted list: a brief that had to drop its issues
		// still says there are some, and an agent told `required` reads the board.
		reconciliation: {
			required: brief.architecture.reconciliation.required,
			count: brief.architecture.reconciliation.count,
			blockedBy: brief.architecture.reconciliation.blockedBy,
			issues: brief.architecture.reconciliation.issues,
		},
		claim: brief.claim,
		ambiguity: brief.ambiguity,
		operation,
	});
}

interface ContextPane {
	readonly paneId: string;
	readonly clientId: string | null;
	readonly focused?: boolean;
}
type ThreadLinkOf = ReturnType<CodexWorkbenchComponents["threadLink"]["read"]>["link"];
type ExecutableLink = Extract<ThreadLinkOf, { state: "executable" }>;
type WorkhorseSnapshot = ReturnType<CodexWorkbenchWorkhorseComponents["workhorse"]["snapshot"]>;
type CoordinatorSnapshot = ReturnType<CodexWorkbenchSessionComponents["coordinator"]["snapshot"]>;
/**
 * What a context's identities are read from: the tab session's coordinator and voice, and the
 * workhorse the context is told to, with its thread link; that workhorse is null when there is
 * none, as before voice starts or in a checkout with no workhorse yet.
 */
type SemanticInputOwners = Pick<CodexWorkbenchComponents, "threadLink"> &
	Pick<CodexWorkbenchSessionComponents, "coordinator" | "realtime"> & {
		readonly workhorse: {
			readonly start: CodexWorkbenchWorkhorseComponents["workhorse"];
			/** Its thread-link key. */
			readonly key: string;
		} | null;
	};
type LinkedIdentities = Required<
	Pick<SemanticContextInput, "child" | "threadLink" | "workhorse" | "coordinator">
>;

/** The pieces of the active graph a pane's identities are read from. */
interface GraphView {
	active: SemanticInputOwners | null;
	link: ThreadLinkOf | null;
	executable: ExecutableLink | null;
	workhorse: WorkhorseSnapshot | null;
	coordinator: CoordinatorSnapshot | null;
}

/**
 * Read the workhorse's link and the snapshots of it and the tab's coordinator once.
 * @param active The session's owners, or null while none are installed.
 * @returns The view.
 */
function graphView(active: SemanticInputOwners | null): GraphView {
	if (active === null) {
		return { active, link: null, executable: null, workhorse: null, coordinator: null };
	}
	return {
		active,
		...workhorseView(active),
		coordinator: active.coordinator.snapshot(),
	};
}

/**
 * Read the link and the snapshot of the workhorse a context is told to.
 * @param active The session's owners.
 * @returns Its link, that link when it can run turns, and its snapshot; all null without one.
 */
function workhorseView(
	active: SemanticInputOwners,
): Pick<GraphView, "link" | "executable" | "workhorse"> {
	if (active.workhorse === null) {
		return { link: null, executable: null, workhorse: null };
	}
	const { link } = active.threadLink.read(active.workhorse.key);
	return {
		link,
		executable: link.state === "executable" ? link : null,
		workhorse: active.workhorse.start.snapshot(),
	};
}

/**
 * The first value that is neither null nor undefined.
 * @param values The candidates, in order of preference.
 * @returns The first present value, or null.
 */
function firstPresent<T>(values: readonly (T | null | undefined)[]): T | null {
	for (const value of values) {
		if (value !== null && value !== undefined) {
			return value;
		}
	}
	return null;
}

/**
 * The child a pane's context runs under: the executable link's, else the
 * workhorse's, else the coordinator's.
 * @param view The graph view.
 * @returns The child identity.
 */
function childIdentity(view: GraphView): LinkedIdentities["child"] {
	if (view.executable !== null) {
		return { id: view.executable.childId, epoch: view.executable.epoch };
	}
	return {
		id: firstPresent([view.workhorse?.childId, view.coordinator?.childId]),
		epoch: firstPresent([view.workhorse?.epoch, view.coordinator?.epoch]),
	};
}

/**
 * The thread this context is about: the one the executable link of its workhorse
 * names, which is the thread that workhorse started. Read from the link, whose
 * state the context reports anyway.
 *
 * The child and the epoch are reported separately, from the graph, and the
 * delivery's own capability check is what proves them. This is identity, not
 * capability.
 * @param view The graph view.
 * @returns The thread, or null when the session has no executable link.
 */
function boundWorkhorseThread(view: GraphView): WorkhorseSnapshot["threadId"] | null {
	return view.executable === null ? null : view.executable.threadId;
}

/**
 * The coordinator identity, named only when the pane has a thread to be about.
 * @param view The graph view.
 * @returns The coordinator identity.
 */
function coordinatorIdentity(view: GraphView): LinkedIdentities["coordinator"] {
	if (boundWorkhorseThread(view) === null || view.active === null) {
		return { threadId: null, realtimeSessionId: null };
	}
	const realtime = view.active.realtime.generation();
	return {
		threadId: view.coordinator === null ? null : view.coordinator.threadId,
		realtimeSessionId: realtime === null ? null : realtime.wireSessionId,
	};
}

/**
 * The child, thread link, workhorse and coordinator identities a pane's
 * semantic context names, taken from its tab session.
 * @param active The session's owners, or null while none are installed.
 * @returns The identities.
 */
function linkedIdentities(active: SemanticInputOwners | null): LinkedIdentities {
	const view = graphView(active);
	const linked = boundWorkhorseThread(view);
	return {
		child: childIdentity(view),
		threadLink: {
			state: view.link === null ? "unbound" : view.link.state,
			reason: view.link === null ? null : view.link.reason,
		},
		workhorse: { threadId: linked, turnId: null },
		coordinator: coordinatorIdentity(view),
	};
}

/**
 * Build local agent input from canonical authority or its explicit migration refusal.
 * @param active The session owners.
 * @param vault The addressed vault.
 * @param _contextBoard The retained presentation address.
 * @param cursor The current feed cursor.
 * @param pane The reporting pane.
 * @returns Canonical facts and session identities.
 */
function semanticInputFor(
	active: SemanticInputOwners | null,
	vault: string,
	_contextBoard: string,
	cursor: SemanticContextInput["cursor"],
	pane: ContextPane,
): SemanticContextInput {
	semanticChangeFeed.follow(vault);
	const reading = canonicalContext(vault, pane.clientId);
	return {
		repository: checkoutOfVault(vault),
		...linkedIdentities(active),
		...reading,
		pane: { paneId: pane.paneId, focused: pane.focused ?? false },
		claim: { holder: "none", doing: null },
		doing: null,
		cursor,
	};
}
/**
 * Read local agent context for the exact pane.
 * @param owners The session owners.
 * @param pane The reporting pane.
 * @returns Its canonical context or recovery route.
 */
function fullInputFor(
	owners: SemanticInputOwners | null,
	pane: PaneRegistration,
): SemanticContextInput {
	return semanticInputFor(owners, pane.vault, "architecture", null, pane);
}
export type { SemanticInputOwners };
export { canonicalContextFromBrief, semanticInputFor, fullInputFor, type ContextPane };
