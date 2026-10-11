import type { ProductionCodexWorkbenchBindings } from "@/server/archboard/lib/codex-workbench";
import { createServerBrowserGatewayOptions } from "@/server/archboard/lib/codex-workbench-browser-gateway";
import {
	createServerBrowserProjectionBudget,
	createServerTimelineOwner,
} from "@/server/archboard/lib/codex-workbench-timeline";
import { requireCreated } from "@/server/archboard/lib/codex-workbench-generation-owners";
import {
	requireDynamicOwners,
	type DynamicOwnerContext,
} from "@/server/archboard/lib/codex-workbench-dynamic-owners";
import type { BindingContext } from "@/server/archboard/lib/codex-workbench-bindings";
import { publishProjection } from "@/server/archboard/lib/codex-workbench-bindings";

/** What the voice coordinator's turns may take in a snapshot, beside the workhorse's own. */
const COORDINATOR_TIMELINE_BUDGET = { maxBytes: 65_536, maxTurns: 40 } as const;

/**
 * How this generation serves browsers: one gateway over the component graph and its tab sessions,
 * the timeline it publishes, and the owned process as its change source.
 *
 * Child lifecycle transitions change readiness without any browser command, so
 * the owned process — not a command result — is what the gateway watches.
 * @param context What the generation provides.
 * @returns The gateway binding.
 */
function createGatewayBinding(
	context: BindingContext,
): ProductionCodexWorkbenchBindings["gateway"] {
	const { server, owners, input } = context;
	const dynamicContext: DynamicOwnerContext = {
		server,
		waitGraph: context.waitGraph,
		input,
		owners,
	};
	return (created) => {
		const dynamic = requireDynamicOwners(dynamicContext, created).approval;
		const budget = createServerBrowserProjectionBudget();
		const timelineOptions = {
			session: requireCreated(created, "session"),
			identity: requireCreated(created, "identity").identity.decoder,
			approvals: requireCreated(created, "approvals"),
			/** Publish what the timeline changed. */
			onChange: () => {
				publishProjection(owners);
			},
		};
		owners.timeline ??= createServerTimelineOwner({ ...timelineOptions, budget });
		owners.coordinatorTimeline ??= createServerTimelineOwner({
			...timelineOptions,
			budget: createServerBrowserProjectionBudget(COORDINATOR_TIMELINE_BUDGET),
		});
		const options = createServerBrowserGatewayOptions({
			components: created,
			sessions: requireCreated(created, "sessions"),
			dynamicApprovals: dynamic,
			timeline: owners.timeline,
			coordinatorTimeline: owners.coordinatorTimeline,
			budget,
			state: owners.browserState,
			leaseLedger: server.browserLeaseLedger,
			/**
			 * What the owned Codex process reports, which browser readiness is
			 * partly derived from.
			 * @returns The process snapshot.
			 */
			process: () => input.process.snapshot(),
			/**
			 * The canonical context one browser command runs under, captured
			 * against the pane and link the command was leased under.
			 * @param commandContext The lease's authority.
			 * @param operation The operation the command is.
			 * @returns The context.
			 */
			contextForOperation: (commandContext, operation) => {
				const threadId = commandContext.link.threadId;
				if (threadId === null) {
					throw new Error("A browser command has no executable thread link.");
				}
				return server.contextForOperation(
					{
						tabSessionId: commandContext.tabSessionId,
						clientId: commandContext.browserId,
						childId: commandContext.childId,
						epoch: commandContext.epoch,
						threadId,
						linkRevision: commandContext.linkRevision,
					},
					operation,
				);
			},
			/**
			 * Watch what the browser is shown.
			 * @param listener What to tell.
			 * @returns Unsubscribes.
			 */
			onChange: (listener) => {
				owners.projectionListeners.add(listener);
				return () => {
					owners.projectionListeners.delete(listener);
				};
			},
			/**
			 * Watch the account notifications the browser's account arm is built from.
			 * @param listener What to tell.
			 * @returns Unsubscribes.
			 */
			onAccountNotification: (listener) => {
				owners.accountListeners.add(listener);
				return () => {
					owners.accountListeners.delete(listener);
				};
			},
		});
		return {
			...options,
			lifecycle: {
				/**
				 * The owned process is the gateway's change source.
				 * @param listener What to tell.
				 * @returns Unsubscribes.
				 */
				onChange: (listener) => input.process.subscribe(() => listener()),
			},
		};
	};
}

export { createGatewayBinding };
