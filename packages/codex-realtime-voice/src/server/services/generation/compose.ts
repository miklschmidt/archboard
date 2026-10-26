import { CODEX_SESSION_CONTROL } from "@archboard/codex-app-server/session";
import {
	createCodexWorkbenchGenerationLifecycle,
	type CodexWorkbenchComponents,
	type CodexWorkbenchGeneration,
} from "#server/services/owner/lifecycle.ts";
import type {
	CodexWorkbenchComponentFactories,
	ComposeCodexWorkbenchGenerationOptions,
} from "#server/protocol/generation/contract.ts";

/** The graph while it is still being built, each component filled in as it is made. */
type MutableComponents = {
	-readonly [Name in keyof CodexWorkbenchComponents]?: CodexWorkbenchComponents[Name];
};

/** What one built component needs undone if a later one fails to build. */
type ConstructionCleanup = () => Promise<unknown> | void;

/**
 * Build and activate the one complete child-generation graph.
 * @param options The factories, the ledger, the hooks, and whether this
 * generation owns its transport and is activated as it is built.
 * @returns The generation, activated unless the caller asked otherwise.
 */
async function composeCodexWorkbenchGeneration(
	options: ComposeCodexWorkbenchGenerationOptions,
): Promise<CodexWorkbenchGeneration> {
	const created: MutableComponents = {};
	const constructionCleanups: ConstructionCleanup[] = [];
	let components: CodexWorkbenchComponents;
	try {
		components = constructComponents(
			options.factories,
			options.ownsTransport !== false,
			created,
			constructionCleanups,
		);
	} catch (error) {
		throw await unwoundFailure(constructionCleanups, error);
	}
	const source = createCodexWorkbenchGenerationLifecycle({
		components,
		identityLedger: options.identityLedger,
		hooks: options.hooks,
		assertActivationCurrent: options.assertActivationCurrent ?? (() => undefined),
	});
	if (options.activate !== false) {
		await source.activate();
	}
	return source;
}

/**
 * Build every component in dependency order, recording as it goes what each
 * one needs undone: the order here is the graph, and each factory reads the
 * components built before it out of `created`.
 * @param factories One factory per component.
 * @param ownsTransport Whether this generation owns the transport it uses, and
 * so must shut it down; a generation over a kernel's transport does not.
 * @param created Filled in as each component is built, for the factories to read.
 * @param cleanups Appended to as each component that needs unwinding is built.
 * @returns Every component, frozen.
 */
function constructComponents(
	factories: CodexWorkbenchComponentFactories,
	ownsTransport: boolean,
	created: MutableComponents,
	cleanups: ConstructionCleanup[],
): CodexWorkbenchComponents {
	const identity = factories.identity(created);
	created.identity = identity;
	const epoch = factories.epoch(created);
	created.epoch = epoch;
	cleanups.push(() => epoch.close());
	const transport = factories.transport(created);
	created.transport = transport;
	if (ownsTransport) {
		cleanups.push(() => transport.shutdown());
	}
	const session = factories.session(created);
	created.session = session;
	cleanups.push(() => session[CODEX_SESSION_CONTROL].dispose());
	const threadLink = factories.threadLink(created);
	created.threadLink = threadLink;
	const approvals = factories.approvals(created);
	created.approvals = approvals;
	cleanups.push(() => approvals.dispose());
	const dynamicTools = factories.dynamicTools(created);
	created.dynamicTools = dynamicTools;
	cleanups.push(() => dynamicTools?.dispose());
	const sessions = factories.sessions(created);
	created.sessions = sessions;
	cleanups.push(async () => {
		try {
			await sessions.stop();
		} finally {
			await sessions.dispose();
		}
	});
	const gateway = factories.gateway(created);
	created.gateway = gateway;
	cleanups.push(() => gateway.dispose());
	return Object.freeze({
		identity,
		epoch,
		transport,
		session,
		threadLink,
		approvals,
		dynamicTools,
		sessions,
		gateway,
	} satisfies CodexWorkbenchComponents);
}

/**
 * Undo a half-built graph and say what to throw: whatever failed, joined with
 * anything that then failed to unwind, so no failure is swallowed.
 * @param cleanups What each built component needs undone, in build order.
 * @param error What construction failed with.
 * @returns The error to throw.
 */
async function unwoundFailure(
	cleanups: readonly ConstructionCleanup[],
	error: unknown,
): Promise<Error> {
	let failure = error instanceof Error ? error : new Error(String(error));
	for (const cleanup of cleanups.toReversed()) {
		try {
			// oxlint-disable-next-line no-await-in-loop -- unwinding is strictly reverse construction order; a component must be gone before the one it was built on
			await cleanup();
		} catch (cleanupError) {
			const next = cleanupError instanceof Error ? cleanupError : new Error(String(cleanupError));
			failure = new AggregateError([failure, next], "Codex construction cleanup failed.");
		}
	}
	return failure;
}

export { composeCodexWorkbenchGeneration };
