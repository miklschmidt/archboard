import { createVoiceToolset } from "#runtime/rules/host/toolset.ts";
import type { CodexWorkbenchStorage } from "#server/protocol/generation/host.ts";
import type { ApprovalSnapshot } from "#runtime/services/approvals/contract.ts";
import type { ThreadId } from "@archboard/codex-app-server/identity";
import type {
	CodexWorkbenchComponents,
	CodexWorkbenchGenerationInput,
	ProductionCodexWorkbenchBindings,
} from "#server/services/generation/workbench.ts";
import {
	cancelTabSessionApprovals,
	tabSessionLink,
	workhorseApprovalLink,
} from "#server/services/actions/ordinary-approvals.ts";
import { publishProjection, type GenerationOwners } from "#server/services/generation/owners.ts";
import { domainScope } from "#server/services/generation/domain.ts";
import { createGatewayBinding } from "#server/services/generation/gateway-binding.ts";
import {
	createSessionBindings,
	createWorkhorseBindings,
} from "#server/services/sessions/bindings.ts";
import type { CodexWorkbenchSessions } from "#server/services/sessions/sessions.ts";
import type { CodexWorkbenchServer } from "#server/protocol/generation/host.ts";

/** What building one generation's bindings needs from around it. */
interface BindingContext {
	readonly server: CodexWorkbenchServer;
	readonly leaseLedger: import("#server/protocol/gateway/contract.ts").BrowserLeaseLedger;
	readonly storage: CodexWorkbenchStorage;
	readonly input: CodexWorkbenchGenerationInput;
	readonly owners: GenerationOwners;
}

/**
 * The bindings the storage-shaped owners are built from: where Codex writes,
 * which child this generation runs against, and the directory of its own it runs in.
 * @param context What the generation provides.
 * @returns Those bindings.
 */
function storageBindings(
	context: BindingContext,
): Pick<ProductionCodexWorkbenchBindings, "epoch" | "transport" | "session" | "threadLink"> {
	const { storage, input } = context;
	return {
		/**
		 * Where this installation keeps its epoch manifest and Codex storage.
		 * @returns The epoch binding.
		 */
		epoch: () => ({
			rootDirectory: storage.epochRoot,
			codexHome: storage.codexHome,
			sqliteHome: storage.sqliteHome,
		}),
		/**
		 * The child this generation's transport speaks to.
		 * @returns The transport binding.
		 */
		transport: () => ({ child: input.child }),
		/**
		 * Where the session's own storage and configuration live.
		 * @returns The session binding.
		 */
		session: () => ({
			storage: {
				codexHome: storage.codexHome,
				sqliteHome: storage.sqliteHome,
				configPath: storage.configPath,
			},
			workingDirectory: storage.coordinatorDirectory,
			lifecycle: input.child.lifecycle,
		}),
		/**
		 * How the thread-link owner reads the epoch a link must belong to.
		 * @param created What the graph has built so far.
		 * @returns The thread-link binding.
		 */
		threadLink: (created) => ({
			threadSource: context.server.host.instructions.workhorse.identity.threadSource,
			/**
			 * The epoch now active, which a link is only valid within.
			 * @returns The epoch, or null before one is started.
			 */
			currentEpoch: () => created.epoch?.snapshot().manifest.activeEpoch ?? null,
		}),
	};
}

/**
 * Who an approval on one thread is shown to: the panes of the checkout of the workhorse that
 * asked, or every pane of the tab when its coordinator asked. A session that is ending holds
 * nothing an approval could be shown on.
 * @param sessions The generation's tab sessions, once they are built.
 * @param threadId The thread the approval was asked on.
 * @returns The link, or none when no tab session holds the thread.
 */
function approvalLink(
	sessions: CodexWorkbenchSessions | undefined,
	threadId: ThreadId,
): { readonly link: string | null } {
	const session = sessions?.forThread(threadId) ?? null;
	if (sessions === undefined || session === null) {
		return { link: null };
	}
	const workhorse = sessions.workhorseForThread(threadId);
	return {
		link:
			workhorse === null
				? tabSessionLink(session.id)
				: workhorseApprovalLink(session.id, workhorse.checkout),
	};
}

/**
 * Cancel an approval nobody can be shown, because no live tab session holds the
 * thread that asked: a running turn must never wait on nobody. Once cancelled
 * it is retired, since no browser will show its terminal either.
 * @param approvals The broker, once it is built.
 * @param snapshot The approval as the broker just published it.
 */
function cancelUnheld(
	approvals: CodexWorkbenchComponents["approvals"] | undefined,
	snapshot: ApprovalSnapshot,
): void {
	if (
		approvals === undefined ||
		snapshot.binding.link !== null ||
		(snapshot.state !== "staged" && snapshot.state !== "pending")
	) {
		return;
	}
	// After the broker has finished publishing the approval it is taking in.
	queueMicrotask(() => {
		void approvals
			.cancel(snapshot.requestId, "No browser tab holds the thread that asked.")
			.then(() => {
				if (approvals.get(snapshot.requestId) !== undefined) {
					approvals.acknowledge(snapshot.requestId);
				}
				return undefined;
			})
			// Something else settled it first; the broker reports its own write failures.
			.catch(() => undefined);
	});
}

/**
 * The bindings the approval and dynamic owners are built from.
 * @param context What the generation provides.
 * @returns Those bindings.
 */
function approvalBindings(
	context: BindingContext,
): Pick<ProductionCodexWorkbenchBindings, "approvals" | "dynamicTools" | "sessions"> {
	const { server, owners } = context;

	return {
		/**
		 * How ordinary approvals are linked to the pane that must answer them.
		 * @param created What the graph has built so far.
		 * @returns The approvals binding.
		 */
		approvals: (created) => ({
			onError: server.host.onFatal,
			/**
			 * The tab session one approval belongs to: the one that started the
			 * thread that asked.
			 * @param request The approval request.
			 * @returns The link, or none.
			 */
			getCurrentBinding: (request) => approvalLink(created.sessions, request.threadId),
			/**
			 * Cancel an approval no tab session holds, and publish what an approval changed.
			 * @param snapshot The approval as it now stands.
			 */
			onChange: (snapshot) => {
				cancelUnheld(created.approvals, snapshot);
				publishProjection(owners);
			},
		}),
		/**
		 * How an ended tab session's approvals are settled: its coordination
		 * approvals and its ordinary ones alike, since nobody is left to answer.
		 * @param created What the graph has built so far.
		 * @returns The sessions binding.
		 */
		sessions: (created) => ({
			shownConversationOf: context.server.host.shownConversationOf,
			resolveCheckout: context.server.host.resolveCheckout,
			/**
			 * Settle every approval an ended tab session was still to answer.
			 * @param id The tab session.
			 * @returns Resolves once they are settled.
			 */
			endApprovals: async (id) => {
				owners.domain?.endSession?.(id);
				if (created.approvals !== undefined) {
					await cancelTabSessionApprovals(created.approvals, id);
				}
			},
		}),
		/**
		 * Install the host domain tools under this generation's capabilities.
		 * @param created The components that the generation already built.
		 * @returns The installed domain, or null when the host supplies none.
		 */
		dynamicTools: (created) => {
			owners.domain = server.host.domainTools?.install(domainScope(context, created)) ?? null;
			return owners.domain;
		},
	};
}

/**
 * Compose production storage, binding readers, delivery and browser access.
 * @param context What the generation provides.
 * @returns The bindings.
 */
function createProductionBindings(context: BindingContext): ProductionCodexWorkbenchBindings {
	return {
		tools: createVoiceToolset(context.server.host.instructions.coordinator.identity),
		recordPrefix: context.server.host.instructions.coordinator.identity.recordPrefix,
		dynamicRegistrations: context.server.host.domainTools?.registrations ?? [],
		...storageBindings(context),
		...approvalBindings(context),
		/**
		 * What each owner of one tab session's coordinator and voice is configured with.
		 * @param scope The session's id, state and workhorses.
		 * @param shared The generation's components it runs over.
		 * @returns The session's bindings.
		 */
		tabSession: (scope, shared) =>
			createSessionBindings({
				scope,
				server: context.server,
				shared,
				coordinatorDirectory: context.storage.coordinatorDirectory,
				/** Tell every browser projection listener the session changed something it shows. */
				publishProjection: () => {
					publishProjection(context.owners);
				},
			}),
		/**
		 * What each owner of one workhorse is configured with.
		 * @param scope The workhorse's session, checkout and link key.
		 * @param shared The generation's components it runs over.
		 * @returns The workhorse's bindings.
		 */
		workhorse: (scope, shared) =>
			createWorkhorseBindings({ scope, server: context.server, shared }),
		gateway: createGatewayBinding(context),
	};
}

export { type BindingContext, createProductionBindings };
