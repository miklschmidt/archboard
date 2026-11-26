import type { RoleModelSelection } from "@archboard/codex-realtime-voice/server";
import type {
	CodexWorkbenchDomainScope,
	CodexWorkbenchWorkhorseComponents,
} from "#runtime/voice/protocol/extension.ts";
import {
	authStateFromSnapshot,
	effectiveDefaults,
	needsAccountRefresh,
	pendingLoginState,
	processAuthState,
	validateRoleSelection,
	type CodexSettingsStartupState,
} from "#server/codex-settings/rules/codex-auth-state.ts";
import {
	readCodexModelPreferences,
	resetCodexModelPreferences,
	saveCodexModelPreferences,
	type CodexModelConfigResult,
} from "#server/codex-settings/store/configuration.ts";
import type {
	CodexAuthState,
	CodexModelOption,
	CodexModelPreferences,
	CodexSettingsFailureCode,
	CodexSettingsLoginRequest,
	CodexSettingsReply,
	CodexSettingsSaveRequest,
} from "#shared/codex-settings/schemas/codex-settings.ts";

const MODEL_PAGE_LIMIT = 100 as const;

type CodexSettingsResult =
	| { readonly ok: true; readonly reply: CodexSettingsReply }
	| { readonly ok: false; readonly code: CodexSettingsFailureCode; readonly error: string };

/** Narrow scope contract required by the Codex settings service (and injectable in tests). */
type CodexSettingsScope = Pick<
	CodexWorkbenchDomainScope,
	"account" | "epoch" | "session" | "sessions" | "publish" | "assertCurrent"
>;
type AccountSnapshot = ReturnType<CodexSettingsScope["account"]["snapshot"]>;
type WorkhorseSnapshot = ReturnType<CodexWorkbenchWorkhorseComponents["workhorse"]["snapshot"]>;

interface CodexSettingsStorePort {
	readonly read: () => CodexModelConfigResult;
	readonly save: (selection: CodexModelPreferences) => CodexModelConfigResult;
	readonly reset: () => CodexModelConfigResult;
}

interface CodexSettingsServiceDependencies {
	readonly getScope: () => CodexSettingsScope | null;
	readonly getStartupState: () => CodexSettingsStartupState;
	readonly store?: CodexSettingsStorePort;
}

/**
 * Narrow an error value into a concise user-facing message.
 * @param error The thrown value.
 * @param fallback Message used when the value carries no message.
 * @returns The diagnostic text.
 */
function errorMessage(error: unknown, fallback: string): string {
	return error instanceof Error && error.message.length > 0 ? error.message : fallback;
}

/**
 * Refresh the generation account snapshot when requested and unknown/failed.
 * @param scope Active Codex generation scope.
 * @param refreshIfNeeded Whether to trigger account/read.
 * @returns Latest account snapshot.
 */
async function readCurrentSnapshot(scope: CodexSettingsScope, refreshIfNeeded: boolean) {
	const initial = scope.account.snapshot();
	if (
		!refreshIfNeeded ||
		processAuthState(initial.process) !== null ||
		initial.login.state === "pending" ||
		!needsAccountRefresh(initial)
	) {
		return initial;
	}
	try {
		await scope.account.read();
	} catch {
		// Failed account read is reflected in the snapshot below.
	}
	return scope.account.snapshot();
}

/**
 * Project the process and account facts from the same generation snapshot.
 * @param snapshot The generation's account and process facts.
 * @returns The state of Codex authentication.
 */
function resolveAuthState(snapshot: AccountSnapshot): CodexAuthState {
	return (
		processAuthState(snapshot.process) ??
		pendingLoginState(snapshot.login) ??
		authStateFromSnapshot(snapshot)
	);
}

/**
 * Derive the unavailable or starting auth state when no generation scope is attached.
 * @param startup Current workbench startup state.
 * @returns The matching startup auth state.
 */
function startupAuthState(startup: CodexSettingsStartupState): CodexAuthState {
	return startup.state === "starting"
		? { state: "starting", reason: startup.reason }
		: { state: "unavailable", reason: startup.reason };
}

/**
 * Map one raw model/list item into a settings option.
 * @param item Raw model/list entry.
 * @returns Mapped model option.
 */
function toModelOption(
	item: Awaited<ReturnType<CodexSettingsScope["session"]["modelList"]>>["data"][number],
): CodexModelOption {
	return {
		id: item.id,
		model: item.model,
		displayName: item.displayName,
		description: item.description,
		isDefault: item.isDefault,
		supportedReasoningEfforts: item.supportedReasoningEfforts.map((entry) => ({
			reasoningEffort: entry.reasoningEffort,
			description: entry.description,
		})),
		defaultReasoningEffort: item.defaultReasoningEffort,
		serviceTiers: item.serviceTiers.map((tier) => ({
			id: tier.id,
			name: tier.name,
			description: tier.description,
		})),
		defaultServiceTier: item.defaultServiceTier,
	};
}

/**
 * Advance pagination cursor while guarding against repeated cursors.
 * @param nextCursor Cursor returned by Codex.
 * @param currentCursor Cursor requested for the current page.
 * @param seenCursors Previously visited cursors.
 * @returns Next cursor, or null when exhausted.
 */
function advanceModelCursor(
	nextCursor: string | null,
	currentCursor: string | null,
	seenCursors: Set<string>,
): string | null {
	if (nextCursor === null) return null;
	if (nextCursor === currentCursor || seenCursors.has(nextCursor)) {
		throw new Error("Codex model/list repeated a pagination cursor.");
	}
	seenCursors.add(nextCursor);
	return nextCursor;
}

/**
 * Exhaust model/list from the authenticated Codex app-server and return visible models.
 * @param session The active Codex session.
 * @returns Non-hidden models advertised by the app-server.
 */
async function listAvailableModels(
	session: CodexSettingsScope["session"],
): Promise<readonly CodexModelOption[]> {
	const models: CodexModelOption[] = [];
	const seenCursors = new Set<string>();
	let cursor: string | null = null;
	do {
		// oxlint-disable-next-line no-await-in-loop -- pagination cursor comes from the preceding page
		const page = await session.modelList({ cursor, limit: MODEL_PAGE_LIMIT });
		for (const item of page.data) {
			if (!item.hidden) models.push(toModelOption(item));
		}
		cursor = advanceModelCursor(page.nextCursor, cursor, seenCursors);
	} while (cursor !== null);
	return models;
}

/**
 * Extract the epoch identity fields from a ready workhorse snapshot when all are populated.
 * @param snapshot The workhorse's start facts.
 * @returns The complete epoch identity, or null if incomplete.
 */
function workhorseEpochIdentity(snapshot: WorkhorseSnapshot) {
	const { childId, epoch, operationId, threadId } = snapshot;
	if (childId === null || epoch === null || operationId === null || threadId === null) {
		return null;
	}
	return { childId, epoch, operationId, threadId };
}

/**
 * Check that a ready workhorse still has a delivered start in the current child epoch.
 * @param epoch The generation's epoch store.
 * @param snapshot The ready workhorse's start facts.
 * @returns The thread ID when the epoch store proves the start is current.
 */
function currentWorkhorseThread(epoch: CodexSettingsScope["epoch"], snapshot: WorkhorseSnapshot) {
	const identity = workhorseEpochIdentity(snapshot);
	if (identity === null) return null;
	try {
		epoch.assertCurrent(identity);
		return identity.threadId;
	} catch {
		return null;
	}
}

/**
 * Best-effort apply updated workhorse settings to every ready workhorse thread in the generation.
 * @param scope Active Codex generation scope.
 * @param selection Target workhorse model, reasoning effort, and service tier.
 */
async function applyToLiveWorkhorses(
	scope: CodexSettingsScope,
	selection: RoleModelSelection,
): Promise<void> {
	const updates: Promise<unknown>[] = [];
	for (const session of scope.sessions.list()) {
		for (const workhorse of session.workhorses.values()) {
			const snapshot = workhorse.components.workhorse.snapshot();
			if (snapshot.state !== "ready") continue;
			const threadId = currentWorkhorseThread(scope.epoch, snapshot);
			if (threadId === null) continue;
			updates.push(
				scope.session
					.threadSettingsUpdate({
						threadId,
						model: selection.model,
						effort: selection.effort,
						serviceTier: selection.serviceTier,
					})
					.catch(() => undefined),
			);
		}
	}
	if (updates.length > 0) {
		await Promise.allSettled(updates);
		scope.publish();
	}
}

/**
 * Validate both orchestrator and workhorse selections against live available models.
 * @param input Requested selections.
 * @param models Live available models.
 * @returns First validation error message, or null when both are valid.
 */
function validateBothRoles(
	input: Pick<CodexSettingsSaveRequest, "orchestrator" | "workhorse">,
	models: readonly CodexModelOption[],
): string | null {
	return (
		validateRoleSelection("Orchestrator", input.orchestrator, models) ??
		validateRoleSelection("Workhorse", input.workhorse, models)
	);
}

/**
 * Report the account, its model options, any model-list error, and persisted selections together.
 * @param selection Saved preferences.
 * @param auth The current Codex authentication state.
 * @param models Models listed for the authenticated account.
 * @param modelError Why the model catalogue could not be read, if applicable.
 * @returns The complete settings reply.
 */
function settingsReply(
	selection: CodexModelPreferences,
	auth: CodexAuthState,
	models: readonly CodexModelOption[] = [],
	modelError: string | null = null,
): CodexSettingsResult {
	return {
		ok: true,
		reply: {
			success: true,
			auth,
			models: [...models],
			modelError,
			selection,
			defaults: effectiveDefaults(models),
		},
	};
}

/**
 * Build the Codex settings service backed by the active generation scope and model preferences store.
 * @param dependencies Scope reader, startup status reader, and optional store override for tests.
 * @returns Read, save, reset, login, cancel-login, and logout operations.
 */
function createCodexSettingsService(dependencies: CodexSettingsServiceDependencies) {
	const store: CodexSettingsStorePort = dependencies.store ?? {
		read: readCodexModelPreferences,
		save: saveCodexModelPreferences,
		reset: resetCodexModelPreferences,
	};

	/**
	 * Stop a request from using model pages obtained under a replaced account or child.
	 * @param scope The generation asked for its models.
	 * @param snapshot The account and child that authorized the request.
	 * @returns A failure if the model pages no longer describe the current account.
	 */
	function staleCatalogue(scope: CodexSettingsScope, snapshot: AccountSnapshot) {
		const current = scope.account.snapshot();
		const sameAccount = current.account === snapshot.account && current.login === snapshot.login;
		if (scope === dependencies.getScope() && sameAccount) {
			try {
				scope.assertCurrent();
				return null;
			} catch {
				// The scope no longer owns the child or its transport.
			}
		}
		return {
			ok: false as const,
			code: "CODEX_UNAVAILABLE" as const,
			error: "The Codex account or app-server changed. Refresh Settings and try again.",
		};
	}

	/**
	 * Read models for the account that supplied the Settings auth state.
	 * @param scope The generation asked for its models.
	 * @param snapshot The authenticated account snapshot.
	 * @returns Models from the same live account, or a failure.
	 */
	async function readCatalogue(scope: CodexSettingsScope, snapshot: AccountSnapshot) {
		const stale = staleCatalogue(scope, snapshot);
		if (stale !== null) return stale;
		try {
			const models = await listAvailableModels(scope.session);
			const afterStale = staleCatalogue(scope, snapshot);
			return afterStale ?? { ok: true as const, models };
		} catch (error) {
			const afterStale = staleCatalogue(scope, snapshot);
			if (afterStale !== null) return afterStale;
			return {
				ok: false as const,
				code: "MODEL_LIST_FAILED" as const,
				error: errorMessage(error, "Could not read available models from Codex."),
			};
		}
	}

	/**
	 * Build a complete settings reply from the current scope and persisted selection.
	 * Preserves the signed-in account state and reports modelError when model/list fails.
	 * @param selection Persisted preferences to report.
	 * @param refreshIfNeeded Whether to trigger account/read if account state is unknown/failed.
	 * @param scope The generation the request started with.
	 * @returns The settings reply or a structured failure.
	 */
	async function buildReply(
		selection: CodexModelPreferences,
		refreshIfNeeded: boolean,
		scope: CodexSettingsScope | null,
	): Promise<CodexSettingsResult> {
		if (scope === null) {
			return settingsReply(selection, startupAuthState(dependencies.getStartupState()));
		}
		const snapshot = await readCurrentSnapshot(scope, refreshIfNeeded);
		const auth = resolveAuthState(snapshot);
		if (auth.state !== "authenticated") return settingsReply(selection, auth);
		const listed = await readCatalogue(scope, snapshot);
		if (!listed.ok) {
			return listed.code === "MODEL_LIST_FAILED"
				? settingsReply(selection, auth, [], listed.error)
				: listed;
		}
		return settingsReply(selection, auth, listed.models);
	}

	/**
	 * Run an account mutation against the active scope and return a fresh settings reply.
	 * @param code Failure code if the mutation rejects.
	 * @param fallback Default error message.
	 * @param action Mutation callback given the live scope.
	 * @returns Updated settings snapshot or failure.
	 */
	async function runAccountAction(
		code: "LOGIN_FAILED" | "LOGOUT_FAILED",
		fallback: string,
		action: (scope: CodexSettingsScope) => Promise<void>,
	): Promise<CodexSettingsResult> {
		const scope = dependencies.getScope();
		if (scope === null) {
			return { ok: false, code: "CODEX_UNAVAILABLE", error: dependencies.getStartupState().reason };
		}
		try {
			await action(scope);
		} catch (error) {
			return { ok: false, code, error: errorMessage(error, fallback) };
		}
		const stored = store.read();
		return stored.ok ? buildReply(stored.selection, false, scope) : stored;
	}

	/**
	 * Load authenticated models for a write operation, refusing unauthenticated, stale, or unavailable state.
	 * @returns Generation scope, auth state, and live models, or a structured refusal.
	 */
	async function requireAuthenticatedModels() {
		const scope = dependencies.getScope();
		if (scope === null) {
			return {
				ok: false as const,
				code: "CODEX_UNAVAILABLE" as const,
				error: dependencies.getStartupState().reason,
			};
		}
		const snapshot = await readCurrentSnapshot(scope, true);
		const auth = resolveAuthState(snapshot);
		if (auth.state !== "authenticated") {
			return {
				ok: false as const,
				code: "CODEX_UNAUTHENTICATED" as const,
				error: "Sign in to Codex before choosing models.",
			};
		}
		const listed = await readCatalogue(scope, snapshot);
		return listed.ok ? { ...listed, scope, auth, snapshot } : listed;
	}

	/**
	 * Return the validated write snapshot, or refresh current state if the account changed during workhorse updates.
	 * @param loaded Authenticated scope, snapshot, auth state, and models used for the write.
	 * @param loaded.scope Generation scope used for the write.
	 * @param loaded.snapshot Account snapshot captured when loading models.
	 * @param loaded.auth Authenticated state from the write.
	 * @param loaded.models Validated model catalogue from the write.
	 * @param selection Persisted preferences written to disk.
	 * @returns Current settings reply without returning a stale authenticated catalogue.
	 */
	async function finishWriteReply(
		loaded: {
			readonly scope: CodexSettingsScope;
			readonly snapshot: AccountSnapshot;
			readonly auth: CodexAuthState;
			readonly models: readonly CodexModelOption[];
		},
		selection: CodexModelPreferences,
	): Promise<CodexSettingsResult> {
		return staleCatalogue(loaded.scope, loaded.snapshot) === null
			? settingsReply(selection, loaded.auth, loaded.models)
			: buildReply(selection, false, dependencies.getScope());
	}

	return Object.freeze({
		/**
		 * Read current Codex authentication state, available models (when authenticated), and saved preferences.
		 * @returns The settings snapshot or failure.
		 */
		readSettings: async (): Promise<CodexSettingsResult> => {
			const stored = store.read();
			return stored.ok ? buildReply(stored.selection, true, dependencies.getScope()) : stored;
		},
		/**
		 * Validate orchestrator and workhorse selections against live model/list, persist them with the
		 * voice language, and apply them to live workhorses.
		 * @param input Requested orchestrator and workhorse model selections and voice language.
		 * @returns The updated settings snapshot or failure.
		 */
		saveSettings: async (input: CodexSettingsSaveRequest): Promise<CodexSettingsResult> => {
			const loaded = await requireAuthenticatedModels();
			if (!loaded.ok) return loaded;
			const validationError = validateBothRoles(input, loaded.models);
			if (validationError !== null) {
				return { ok: false, code: "MODEL_SELECTION_INVALID", error: validationError };
			}
			const stale = staleCatalogue(loaded.scope, loaded.snapshot);
			if (stale !== null) return stale;
			const saved = store.save({
				version: 1,
				orchestrator: input.orchestrator,
				workhorse: input.workhorse,
				voiceLanguage: input.voiceLanguage,
			});
			if (!saved.ok) return saved;
			await applyToLiveWorkhorses(loaded.scope, input.workhorse);
			return finishWriteReply(loaded, saved.selection);
		},
		/**
		 * Reset persisted selections after verifying that the authenticated catalogue supports both defaults.
		 * @returns The updated settings snapshot or failure.
		 */
		resetSettings: async (): Promise<CodexSettingsResult> => {
			const loaded = await requireAuthenticatedModels();
			if (!loaded.ok) return loaded;
			const defaults = effectiveDefaults(loaded.models);
			const validationError = validateBothRoles(defaults, loaded.models);
			if (validationError !== null) {
				return { ok: false, code: "MODEL_SELECTION_INVALID", error: validationError };
			}
			const stale = staleCatalogue(loaded.scope, loaded.snapshot);
			if (stale !== null) return stale;
			const reset = store.reset();
			if (!reset.ok) return reset;
			await applyToLiveWorkhorses(loaded.scope, defaults.workhorse);
			return finishWriteReply(loaded, reset.selection);
		},
		/**
		 * Start a Codex sign-in (ChatGPT OAuth or OpenAI API key) through the shared generation account owner.
		 * @param login Requested sign-in method.
		 * @returns The updated settings snapshot or failure.
		 */
		startLogin: (login: CodexSettingsLoginRequest): Promise<CodexSettingsResult> =>
			runAccountAction("LOGIN_FAILED", "Could not start Codex sign-in.", (scope) =>
				scope.account.login(login),
			),
		/**
		 * Cancel a pending Codex sign-in flow.
		 * @param loginId Pending login identifier.
		 * @returns The updated settings snapshot or failure.
		 */
		cancelLogin: (loginId: string): Promise<CodexSettingsResult> =>
			runAccountAction("LOGIN_FAILED", "Could not cancel Codex sign-in.", (scope) =>
				scope.account.loginCancel(loginId),
			),
		/**
		 * Sign out of the running Codex app-server.
		 * @returns The updated settings snapshot or failure.
		 */
		logout: (): Promise<CodexSettingsResult> =>
			runAccountAction("LOGOUT_FAILED", "Could not sign out of Codex.", (scope) =>
				scope.account.logout(),
			),
	});
}

type CodexSettingsService = ReturnType<typeof createCodexSettingsService>;

let activeScope: CodexSettingsScope | null = null;
let startupState: CodexSettingsStartupState = {
	state: "unavailable",
	reason: "Codex app-server has not started yet.",
};

/**
 * Record the server's current Codex startup phase for settings requests arriving before a generation is ready.
 * @param state Startup phase.
 * @param reason Human-readable status message.
 */
function setCodexSettingsStartupState(
	state: CodexSettingsStartupState["state"],
	reason: string,
): void {
	startupState = { state, reason };
}

/**
 * Install the live generation scope for Codex settings routes, returning a cleanup that removes it.
 * @param scope Active Codex generation scope.
 * @returns Cleanup that uninstalls this exact scope.
 */
function installCodexSettingsScope(scope: CodexSettingsScope): () => void {
	activeScope = scope;
	startupState = { state: "ready", reason: "Codex app-server is ready." };
	return () => {
		if (activeScope === scope) {
			activeScope = null;
			startupState = { state: "unavailable", reason: "Codex app-server is not running." };
		}
	};
}

const defaultCodexSettingsService: CodexSettingsService = createCodexSettingsService({
	/**
	 * Read the currently installed generation scope.
	 * @returns The active scope, or null when no generation is live.
	 */
	getScope: () => activeScope,
	/**
	 * Read the current startup phase.
	 * @returns The startup phase and message.
	 */
	getStartupState: () => startupState,
});

export {
	createCodexSettingsService,
	defaultCodexSettingsService,
	installCodexSettingsScope,
	setCodexSettingsStartupState,
	type CodexSettingsResult,
	type CodexSettingsScope,
	type CodexSettingsService,
	type CodexSettingsStartupState,
};
