import type { RoleModelSelection } from "@archboard/codex-realtime-voice/server";
import type { CodexWorkbenchDomainScope } from "#runtime/voice/protocol/extension.ts";
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
	"account" | "session" | "sessions" | "publish"
>;

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
	if (!refreshIfNeeded || !needsAccountRefresh(initial)) {
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
 * Derive the current Codex authentication state from the live generation scope.
 * @param scope The active Codex generation scope, or null while unavailable.
 * @param startup The workbench startup state when no scope is attached yet.
 * @param refreshIfNeeded Whether to call account.read() when account state is unknown or failed.
 * @returns The derived authentication state.
 */
async function resolveAuthState(
	scope: CodexSettingsScope | null,
	startup: CodexSettingsStartupState,
	refreshIfNeeded: boolean,
): Promise<CodexAuthState> {
	if (scope === null) {
		return startup.state === "starting"
			? { state: "starting", reason: startup.reason }
			: { state: "unavailable", reason: startup.reason };
	}
	const initial = scope.account.snapshot();
	const processState = processAuthState(initial.process);
	if (processState !== null) return processState;
	const pendingBefore = pendingLoginState(initial.login);
	if (pendingBefore !== null) return pendingBefore;
	const snap = await readCurrentSnapshot(scope, refreshIfNeeded);
	return pendingLoginState(snap.login) ?? authStateFromSnapshot(snap);
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
			const snap = workhorse.components.workhorse.snapshot();
			if (snap.state === "ready" && snap.threadId !== null) {
				updates.push(
					scope.session
						.threadSettingsUpdate({
							threadId: snap.threadId,
							model: selection.model,
							effort: selection.effort,
							serviceTier: selection.serviceTier,
						})
						.catch(() => undefined),
				);
			}
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
	input: CodexSettingsSaveRequest,
	models: readonly CodexModelOption[],
): string | null {
	return (
		validateRoleSelection("Orchestrator", input.orchestrator, models) ??
		validateRoleSelection("Workhorse", input.workhorse, models)
	);
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
	 * Build a complete settings reply from the current scope and persisted selection.
	 * @param selection Persisted preferences to report.
	 * @param refreshIfNeeded Whether to trigger account/read if account state is unknown/failed.
	 * @returns The settings reply or a structured failure.
	 */
	async function buildReply(
		selection: CodexModelPreferences,
		refreshIfNeeded: boolean,
	): Promise<CodexSettingsResult> {
		const scope = dependencies.getScope();
		const auth = await resolveAuthState(scope, dependencies.getStartupState(), refreshIfNeeded);
		let models: readonly CodexModelOption[] = [];
		if (auth.state === "authenticated" && scope !== null) {
			try {
				models = await listAvailableModels(scope.session);
			} catch (error) {
				return {
					ok: false,
					code: "MODEL_LIST_FAILED",
					error: errorMessage(error, "Could not read available models from Codex."),
				};
			}
		}
		return {
			ok: true,
			reply: {
				success: true,
				auth,
				models: [...models],
				selection,
				defaults: effectiveDefaults(models),
			},
		};
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
		return stored.ok ? buildReply(stored.selection, false) : stored;
	}

	/**
	 * Load authenticated models for a write operation, refusing unauthenticated or unavailable state.
	 * @param scope Live generation scope.
	 * @returns Auth state and live models, or a structured refusal.
	 */
	async function requireAuthenticatedModels(scope: CodexSettingsScope) {
		const auth = await resolveAuthState(scope, dependencies.getStartupState(), true);
		if (auth.state !== "authenticated") {
			return {
				ok: false as const,
				code: "CODEX_UNAUTHENTICATED" as const,
				error: "Sign in to Codex before choosing models.",
			};
		}
		try {
			return { ok: true as const, auth, models: await listAvailableModels(scope.session) };
		} catch (error) {
			return {
				ok: false as const,
				code: "MODEL_LIST_FAILED" as const,
				error: errorMessage(error, "Could not read available models from Codex."),
			};
		}
	}

	return Object.freeze({
		/**
		 * Read current Codex authentication state, available models (when authenticated), and saved preferences.
		 * @returns The settings snapshot or failure.
		 */
		readSettings: async (): Promise<CodexSettingsResult> => {
			const stored = store.read();
			return stored.ok ? buildReply(stored.selection, true) : stored;
		},
		/**
		 * Validate orchestrator and workhorse selections against live model/list, persist them, and apply to live workhorses.
		 * @param input Requested orchestrator and workhorse model selections.
		 * @returns The updated settings snapshot or failure.
		 */
		saveSettings: async (input: CodexSettingsSaveRequest): Promise<CodexSettingsResult> => {
			const scope = dependencies.getScope();
			if (scope === null) {
				return {
					ok: false,
					code: "CODEX_UNAVAILABLE",
					error: dependencies.getStartupState().reason,
				};
			}
			const loaded = await requireAuthenticatedModels(scope);
			if (!loaded.ok) return loaded;
			const validationError = validateBothRoles(input, loaded.models);
			if (validationError !== null) {
				return { ok: false, code: "MODEL_SELECTION_INVALID", error: validationError };
			}
			const saved = store.save({
				version: 1,
				orchestrator: input.orchestrator,
				workhorse: input.workhorse,
			});
			if (!saved.ok) return saved;
			await applyToLiveWorkhorses(scope, input.workhorse);
			return {
				ok: true,
				reply: {
					success: true,
					auth: loaded.auth,
					models: [...loaded.models],
					selection: saved.selection,
					defaults: effectiveDefaults(loaded.models),
				},
			};
		},
		/**
		 * Reset persisted model selections to defaults and apply default workhorse settings if authenticated.
		 * @returns The updated settings snapshot or failure.
		 */
		resetSettings: async (): Promise<CodexSettingsResult> => {
			const reset = store.reset();
			if (!reset.ok) return reset;
			const result = await buildReply(reset.selection, false);
			if (!result.ok) return result;
			const scope = dependencies.getScope();
			if (
				scope !== null &&
				result.reply.auth.state === "authenticated" &&
				validateRoleSelection("Workhorse", result.reply.defaults.workhorse, result.reply.models) ===
					null
			) {
				await applyToLiveWorkhorses(scope, result.reply.defaults.workhorse);
			}
			return result;
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
