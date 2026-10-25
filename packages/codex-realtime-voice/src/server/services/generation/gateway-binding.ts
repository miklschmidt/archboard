import type { ProductionCodexWorkbenchBindings } from "#server/services/generation/workbench.ts";
import { createServerBrowserGatewayOptions } from "#server/services/actions/browser-gateway.ts";
import {
	createServerBrowserProjectionBudget,
	createServerTimelineOwner,
} from "#server/projections/timeline/timeline.ts";
import { publishProjection, requireCreated } from "#server/services/generation/owners.ts";
import type { BindingContext } from "#server/services/generation/bindings.ts";

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

	return (created) => {
		const dynamic = owners.domain?.approvals ?? null;
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
			...(server.host.narrative === undefined ? {} : { narrative: server.host.narrative }),
			timeline: owners.timeline,
			coordinatorTimeline: owners.coordinatorTimeline,
			budget,
			state: owners.browserState,
			leaseLedger: context.leaseLedger,
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
			contextCodec: server.host.contextCodec,
			/**
			 * Read context for the exact operation and execution authority supplied by the core.
			 * @param commandContext The browser command lease and its exact target.
			 * @param operation The pending operation identity.
			 * @returns The canonical context of this exact operation.
			 */
			contextForOperation: (commandContext, operation) => {
				const threadId = commandContext.link.threadId;
				if (threadId === null) {
					throw new Error("A browser command has no executable thread link.");
				}
				return server.host.contextForOperation(
					{
						tabSessionId: commandContext.tabSessionId,
						checkout: commandContext.checkout,
						clientId: commandContext.browserId,
						childId: commandContext.childId,
						epoch: commandContext.epoch,
						threadId,
						linkRevision: commandContext.linkRevision,
					},
					operation,
				);
			},
			checkoutLabel: server.host.checkoutLabel,
			/**
			 * Watch what the browser is shown, which a change of a tab's shown conversation changes
			 * too: every pane of the tab shows that checkout's workhorse (ADR 0050).
			 * @param listener What to tell.
			 * @returns Unsubscribes.
			 */
			onChange: (listener) => {
				owners.projectionListeners.add(listener);
				const stopHearingShown = server.host.onShownChange(listener);
				return () => {
					stopHearingShown();
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
			checkoutOf: server.host.shownCheckoutOf,
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
