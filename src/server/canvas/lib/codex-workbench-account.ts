import type { BrowserWorkbenchActions } from "@/server/codex-workbench";
import type { TransportServerNotification } from "@/runtime/codex-transport";
import type { ControlledCodexSession, SessionLoginParams } from "@/runtime/codex-session";
import { createCodexBrowserModel } from "@/shared/codex-browser-model";
import type { CanvasBrowserBindingState } from "@/server/canvas/lib/codex-workbench-browser-gateway";
import type { CodexWorkbenchComponents } from "@/server/canvas/lib/codex-workbench";

/** One sign-in as the browser asked for it. */
type BrowserLogin = Parameters<BrowserWorkbenchActions["account"]["login"]>[0]["login"];

/** One cancellation as the browser asked for it. */
type BrowserLoginCancel = Parameters<BrowserWorkbenchActions["account"]["loginCancel"]>[0];

/** What Codex answers a sign-in start with. */
type AccountLoginResult = Awaited<ReturnType<ControlledCodexSession["accountLogin"]>>;

/** The answer that hands back a continuation to finish sign-in in a browser. */
type PendingLoginResult = Extract<AccountLoginResult, Record<"loginId", unknown>>;

/** What Codex says when a sign-in it was hosting has finished. */
type LoginCompletedParams = Extract<
	TransportServerNotification["notification"],
	{ readonly method: "account/login/completed" }
>["params"];

/** What one account read answered. */
type AccountReadResponse = Awaited<ReturnType<ControlledCodexSession["accountRead"]>>;

/**
 * A ChatGPT sign-in as the session takes it, carrying only the options the
 * browser actually named.
 * @param login The sign-in.
 * @returns The session parameters.
 */
function chatgptLoginParams(login: Extract<BrowserLogin, { type: "chatgpt" }>): SessionLoginParams {
	return {
		type: login.type,
		...(login.codexStreamlinedLogin === undefined
			? {}
			: { codexStreamlinedLogin: login.codexStreamlinedLogin }),
		...(login.useHostedLoginSuccessPage === undefined
			? {}
			: { useHostedLoginSuccessPage: login.useHostedLoginSuccessPage }),
		...(login.appBrand === undefined ? {} : { appBrand: login.appBrand }),
	};
}

/**
 * A Bedrock access-key sign-in as the session takes it.
 * @param login The sign-in.
 * @returns The session parameters.
 */
function bedrockAccessKeyLoginParams(
	login: Extract<BrowserLogin, { type: "amazonBedrockAccessKeys" }>,
): SessionLoginParams {
	return {
		type: login.type,
		accessKeyId: login.accessKeyId,
		secretAccessKey: login.secretAccessKey,
		...(login.sessionToken === undefined ? {} : { sessionToken: login.sessionToken }),
		region: login.region,
	};
}

/**
 * Refuse a sign-in variant nothing here spells out. The parameter is `never`,
 * so a variant added to the browser vocabulary fails to compile until it has
 * an arm above.
 * @param login The sign-in.
 */
function unsupportedLogin(login: never): never {
	throw new TypeError(`Unsupported Codex sign-in: ${JSON.stringify(login)}`);
}

/**
 * One sign-in as the session takes it, whichever way the person is signing in.
 * @param login The sign-in the browser asked for.
 * @returns The session parameters.
 */
function sessionLoginParams(login: BrowserLogin): SessionLoginParams {
	switch (login.type) {
		case "apiKey":
			return { type: login.type, apiKey: login.apiKey };
		case "chatgpt":
			return chatgptLoginParams(login);
		case "amazonBedrock":
			return { type: login.type, apiKey: login.apiKey, region: login.region };
		case "amazonBedrockAccessKeys":
			return bedrockAccessKeyLoginParams(login);
		default:
			return unsupportedLogin(login);
	}
}

/** What one generation's account owner is closed over. */
interface CanvasAccountOwnerInput {
	readonly components: Omit<CodexWorkbenchComponents, "gateway">;
	readonly state: CanvasBrowserBindingState;
	readonly clearQueue: () => void;
	readonly onNotification: (listener: (event: TransportServerNotification) => void) => () => void;
}

/**
 * Account facts and sign-in continuations belong to this private child
 * generation.
 * @param input The runtime owners, the cached facts they fill in, how the queue
 * is cleared on sign-out, and how account notifications are listened for.
 * @returns The account actions and how to subscribe to them.
 */
export function createCanvasBrowserAccountOwner(input: CanvasAccountOwnerInput) {
	const { components, state } = input;
	const { identity } = components;
	const model = createCodexBrowserModel(identity);
	let revision = 0;
	let readRevision = 0;
	let disposed = false;
	let listener: (() => void) | null = null;
	/**
	 * Tell the gateway that what a pane would be shown has changed.
	 * @returns Nothing; the listener is called for its effect.
	 */
	const publish = () => listener?.();
	let starting = false;
	let cancelling = false;
	let loggingOut = false;
	let earlyCompletion: TransportServerNotification | null = null;
	// The transport error behind a failed read. A read Codex accepted but never
	// answered carries `outcome_unknown`; the browser must hear that, not a
	// generic failure, so the original error is what a reader throws.
	let readFailure: unknown = null;

	/**
	 * Whether one command has been overtaken: this owner is gone, or a later
	 * command has already claimed the account state.
	 * @param attempt The revision the command claimed.
	 * @returns True when the command must not write anything.
	 */
	const superseded = (attempt: number): boolean => disposed || attempt !== revision;
	/**
	 * Mark a pending sign-in complete, now that the account reads as signed in
	 * and that same sign-in is still the one outstanding.
	 * @param response What the account read answered.
	 * @param pending The sign-in as it stood when the read began.
	 */
	const completePendingLogin = (
		response: AccountReadResponse,
		pending: CanvasBrowserBindingState["login"],
	): void => {
		if (response.account === null || pending.state !== "pending" || state.login !== pending) {
			return;
		}
		state.login = { kind: "login", state: "completed", loginId: pending.loginId };
	};
	/**
	 * Start the coordinator, ignoring a failure: account authentication remains
	 * true even when coordinator startup fails, and the coordinator publishes
	 * its own failure state and recovery reason.
	 */
	const ensureCoordinator = async (): Promise<void> => {
		try {
			await components.coordinator.ensure({
				operationId: identity.operation.issuer.mintOperationId(),
			});
		} catch {
			// The coordinator publishes its own failure state and recovery reason.
		}
	};
	/**
	 * Read the account and publish it, along with anything that read settles.
	 * @param current Whether this read is still the one that counts.
	 * @param pending The sign-in as it stood when the read began.
	 */
	const readAccount = async (
		current: () => boolean,
		pending: CanvasBrowserBindingState["login"],
	): Promise<void> => {
		const response = await components.session.accountRead();
		if (!current()) return;
		readFailure = null;
		state.account = { kind: "codex_account_response", response };
		completePendingLogin(response, pending);
		publish();
		if (response.account === null) return;
		await ensureCoordinator();
		if (current()) publish();
	};

	/**
	 * Re-read the account for one revision of this owner's state, replacing what
	 * a pane is shown only while this read is still the newest one.
	 * @param expectedRevision The revision this read belongs to.
	 */
	const refresh = async (expectedRevision: number): Promise<void> => {
		const request = ++readRevision;
		const pending = state.login;
		/**
		 * Whether this read is still the one whose answer counts.
		 * @returns True while it is.
		 */
		const current = () => !disposed && revision === expectedRevision && request === readRevision;
		try {
			await readAccount(current, pending);
		} catch (error) {
			if (!current()) return;
			readFailure = error;
			state.account = {
				kind: "account",
				state: "failed",
				reason: "The Codex account could not be read. Refresh the account to try again.",
			};
			publish();
		}
	};

	/**
	 * Whether one notification is nothing to this owner: it has been disposed,
	 * it is itself mid-command, or the event belongs to another child epoch.
	 * @param event The notification.
	 * @returns True when the event is ignored.
	 */
	const ignoresEvent = (event: TransportServerNotification): boolean =>
		disposed ||
		cancelling ||
		loggingOut ||
		event.correlation.child !== identity.identity.validator.childId ||
		event.correlation.epoch !== identity.identity.validator.epoch;
	/**
	 * The outstanding sign-in one completion is about, if it is about the one
	 * this owner is waiting on.
	 * @param params What the completion named.
	 * @returns The pending sign-in, or null.
	 */
	const pendingLoginFor = (params: LoginCompletedParams) => {
		const login = state.login;
		if (login.state !== "pending" || params.loginId === null) {
			return null;
		}
		if (identity.identity.decoder.adoptLoginId(params.loginId) !== login.loginId) {
			return null;
		}
		return login;
	};
	/**
	 * Settle the outstanding sign-in the way Codex says it went, and re-read the
	 * account so what a pane is shown is the account, not the sign-in.
	 * @param params What the completion named.
	 */
	const onLoginCompleted = (params: LoginCompletedParams): void => {
		const pending = pendingLoginFor(params);
		if (pending === null) {
			return;
		}
		revision += 1;
		state.login = params.success
			? { kind: "login", state: "completed", loginId: pending.loginId }
			: {
					kind: "login",
					state: "failed",
					loginId: pending.loginId,
					reason: "ChatGPT sign-in did not complete. Start sign-in again when ready.",
				};
		state.account = {
			kind: "account",
			state: "unknown",
			reason: "Refreshing the Codex account.",
		};
		publish();
		void refresh(revision);
	};
	/**
	 * Take one sign-in completion, holding it back while the start command that
	 * would own it is still in flight.
	 * @param event The notification, kept whole so it can be replayed.
	 * @param params What the completion named.
	 */
	const onLoginNotification = (
		event: TransportServerNotification,
		params: LoginCompletedParams,
	): void => {
		if (starting) {
			earlyCompletion = event;
			return;
		}
		onLoginCompleted(params);
	};

	/**
	 * Take one account notification from this child epoch.
	 * @param event The notification.
	 */
	const onNotification = (event: TransportServerNotification): void => {
		if (ignoresEvent(event)) return;
		const notification = event.notification;
		if (notification.method === "account/login/completed") {
			onLoginNotification(event, notification.params);
			return;
		}
		if (notification.method === "account/updated" && !starting) {
			void refresh(revision);
		}
	};

	/**
	 * Present the sign-in continuation Codex handed back, and replay a
	 * completion that arrived while the start was still in flight.
	 * @param result What Codex answered the start with.
	 * @param variant Which way the person is signing in.
	 */
	const beginPendingLogin = (result: PendingLoginResult, variant: BrowserLogin["type"]): void => {
		const pending = model.BrowserLoginSchema.safeParse({
			kind: "login",
			state: "pending",
			loginId: result.loginId,
			variant,
			authUrl: result.type === "chatgpt" ? result.authUrl : null,
		});
		if (!pending.success) {
			throw new Error("Codex returned an unsupported sign-in continuation URL.");
		}
		state.login = pending.data;
		state.account = {
			kind: "account",
			state: "login_pending",
			loginId: result.loginId,
			variant,
		};
		if (earlyCompletion !== null) onNotification(earlyCompletion);
	};
	/**
	 * Say the sign-in could not be started, unless a later command has already
	 * claimed the state.
	 * @param attempt The revision the start claimed.
	 */
	const failLoginStart = (attempt: number): void => {
		if (superseded(attempt)) {
			return;
		}
		state.login = {
			kind: "login",
			state: "failed",
			loginId: null,
			reason: "The Codex sign-in could not be started. Try signing in again.",
		};
	};
	/**
	 * Record how a cancellation went, unless a later command has already claimed
	 * the state or the sign-in being cancelled has moved on.
	 * @param attempt The revision the cancellation claimed.
	 * @param pending The sign-in being cancelled.
	 * @param status What Codex answered.
	 * @param loginId The sign-in.
	 */
	const applyCancelResult = (
		attempt: number,
		pending: CanvasBrowserBindingState["login"],
		status: string,
		loginId: BrowserLoginCancel["loginId"],
	): void => {
		if (superseded(attempt) || state.login !== pending) {
			return;
		}
		state.login =
			status === "canceled"
				? { kind: "login", state: "cancelled", loginId }
				: {
						kind: "login",
						state: "failed",
						loginId,
						reason:
							"This sign-in was no longer pending when cancellation reached Codex. Refresh the account.",
					};
		state.account = {
			kind: "account",
			state: "unknown",
			reason: "Refresh the account after cancelling sign-in.",
		};
	};

	const actions: BrowserWorkbenchActions["account"] = {
		/**
		 * Read the account, telling the browser what actually failed when the read
		 * failed rather than a generic failure.
		 * @returns The browser outcome.
		 */
		read: async () => {
			await refresh(revision);
			if (state.account.kind === "account" && state.account.state === "failed") {
				throw readFailure ?? new Error(state.account.reason);
			}
			return { outcome: "delivered" };
		},
		/**
		 * Start one sign-in, presenting whatever continuation Codex hands back.
		 * @param command The sign-in the person asked for.
		 * @returns The browser outcome.
		 */
		login: async (command) => {
			const attempt = ++revision;
			starting = true;
			earlyCompletion = null;
			try {
				const result = await components.session.accountLogin(sessionLoginParams(command.login));
				if (superseded(attempt)) return { outcome: "delivered" };
				starting = false;
				if ("loginId" in result) {
					beginPendingLogin(result, command.login.type);
				} else {
					state.login = { kind: "login", state: "idle" };
					await refresh(attempt);
				}
				return { outcome: "delivered" };
			} catch (error) {
				failLoginStart(attempt);
				throw error;
			} finally {
				if (attempt === revision) {
					starting = false;
					earlyCompletion = null;
				}
			}
		},
		/**
		 * Cancel the sign-in that is outstanding, refusing to cancel any other.
		 * @param command Which sign-in.
		 * @returns The browser outcome.
		 */
		loginCancel: async (command) => {
			if (state.login.state !== "pending" || state.login.loginId !== command.loginId)
				throw new Error(
					"This sign-in is no longer pending. Refresh the account before cancelling.",
				);
			const pending = state.login;
			const attempt = ++revision;
			cancelling = true;
			try {
				const result = await components.session.accountLoginCancel({ loginId: command.loginId });
				applyCancelResult(attempt, pending, result.status, command.loginId);
			} finally {
				cancelling = false;
			}
			return { outcome: "delivered" };
		},
		/**
		 * Sign out, and drop the queue with the account: the submissions belonged
		 * to a thread this host can no longer act on.
		 * @returns The browser outcome.
		 */
		logout: async () => {
			const attempt = ++revision;
			loggingOut = true;
			try {
				await components.session.accountLogout();
				if (!superseded(attempt)) {
					state.account = { kind: "account", state: "signed_out" };
					state.login = { kind: "login", state: "idle" };
					input.clearQueue();
				}
			} finally {
				loggingOut = false;
			}
			return { outcome: "delivered" };
		},
	};
	return {
		actions,
		/**
		 * Say when the account facts a pane is shown have changed.
		 * @param onChange What to call.
		 * @returns How to stop listening, which also disposes this owner.
		 */
		subscribe: (onChange: () => void) => {
			listener = onChange;
			const unsubscribe = input.onNotification(onNotification);
			return () => {
				disposed = true;
				revision += 1;
				listener = null;
				earlyCompletion = null;
				unsubscribe();
			};
		},
	};
}
