import type { BrowserWorkbenchActions } from "@/server/codex-workbench";
import type { TransportServerNotification } from "@/runtime/codex-transport";
import type { SessionLoginParams } from "@/runtime/codex-session";
import { createCodexBrowserModel } from "@/shared/codex-browser-model";
import type { CanvasBrowserBindingState } from "@/server/canvas/lib/codex-workbench-browser-gateway";
import type { CodexWorkbenchComponents } from "@/server/canvas/lib/codex-workbench";

/**
 *
 */
function sessionLoginParams(
	login: Parameters<BrowserWorkbenchActions["account"]["login"]>[0]["login"],
): SessionLoginParams {
	switch (login.type) {
		case "apiKey":
			return { type: login.type, apiKey: login.apiKey };
		case "chatgpt":
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
		case "amazonBedrock":
			return { type: login.type, apiKey: login.apiKey, region: login.region };
		case "amazonBedrockAccessKeys":
			return {
				type: login.type,
				accessKeyId: login.accessKeyId,
				secretAccessKey: login.secretAccessKey,
				...(login.sessionToken === undefined ? {} : { sessionToken: login.sessionToken }),
				region: login.region,
			};
	}
}

/** Account facts and sign-in continuations belong to this private child generation. */
export function createCanvasBrowserAccountOwner(input: {
	readonly components: Omit<CodexWorkbenchComponents, "gateway">;
	readonly state: CanvasBrowserBindingState;
	readonly clearQueue: () => void;
	readonly onNotification: (listener: (event: TransportServerNotification) => void) => () => void;
}) {
	const { components, state } = input;
	const { identity } = components;
	const model = createCodexBrowserModel(identity);
	let revision = 0;
	let readRevision = 0;
	let disposed = false;
	let listener: (() => void) | null = null;
	/**
	 *
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
	 *
	 */
	const refresh = async (expectedRevision: number): Promise<void> => {
		const request = ++readRevision;
		const pending = state.login;
		/**
		 *
		 */
		const current = () => !disposed && revision === expectedRevision && request === readRevision;
		try {
			const response = await components.session.accountRead();
			if (!current()) return;
			readFailure = null;
			state.account = { kind: "codex_account_response", response };
			if (response.account !== null && pending.state === "pending" && state.login === pending)
				state.login = { kind: "login", state: "completed", loginId: pending.loginId };
			publish();
			if (response.account !== null) {
				// Account authentication remains true even when coordinator startup fails.
				try {
					await components.coordinator.ensure({
						operationId: identity.operation.issuer.mintOperationId(),
					});
				} catch {
					// The coordinator publishes its own failure state and recovery reason.
				}
				if (current()) publish();
			}
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
	 *
	 */
	const onNotification = (event: TransportServerNotification): void => {
		if (
			disposed ||
			cancelling ||
			loggingOut ||
			event.correlation.child !== identity.identity.validator.childId ||
			event.correlation.epoch !== identity.identity.validator.epoch
		)
			return;
		if (event.notification.method === "account/login/completed") {
			if (starting) {
				earlyCompletion = event;
				return;
			}
			if (
				state.login.state !== "pending" ||
				event.notification.params.loginId === null ||
				identity.identity.decoder.adoptLoginId(event.notification.params.loginId) !==
					state.login.loginId
			)
				return;
			const loginId = state.login.loginId;
			revision += 1;
			state.login = event.notification.params.success
				? { kind: "login", state: "completed", loginId }
				: {
						kind: "login",
						state: "failed",
						loginId,
						reason: "ChatGPT sign-in did not complete. Start sign-in again when ready.",
					};
			state.account = {
				kind: "account",
				state: "unknown",
				reason: "Refreshing the Codex account.",
			};
			publish();
			void refresh(revision);
		} else if (event.notification.method === "account/updated" && !starting) {
			void refresh(revision);
		}
	};

	const actions: BrowserWorkbenchActions["account"] = {
		/**
		 *
		 */
		read: async () => {
			await refresh(revision);
			if (state.account.kind === "account" && state.account.state === "failed") {
				throw readFailure ?? new Error(state.account.reason);
			}
			return { outcome: "delivered" };
		},
		/**
		 *
		 */
		login: async (command) => {
			const attempt = ++revision;
			starting = true;
			earlyCompletion = null;
			try {
				const result = await components.session.accountLogin(sessionLoginParams(command.login));
				if (disposed || attempt !== revision) return { outcome: "delivered" };
				starting = false;
				if ("loginId" in result) {
					const pending = model.BrowserLoginSchema.safeParse({
						kind: "login",
						state: "pending",
						loginId: result.loginId,
						variant: command.login.type,
						authUrl: result.type === "chatgpt" ? result.authUrl : null,
					});
					if (!pending.success)
						throw new Error("Codex returned an unsupported sign-in continuation URL.");
					state.login = pending.data;
					state.account = {
						kind: "account",
						state: "login_pending",
						loginId: result.loginId,
						variant: command.login.type,
					};
					if (earlyCompletion !== null) onNotification(earlyCompletion);
				} else {
					state.login = { kind: "login", state: "idle" };
					await refresh(attempt);
				}
				return { outcome: "delivered" };
			} catch (error) {
				if (!disposed && attempt === revision) {
					state.login = {
						kind: "login",
						state: "failed",
						loginId: null,
						reason: "The Codex sign-in could not be started. Try signing in again.",
					};
				}
				throw error;
			} finally {
				if (attempt === revision) {
					starting = false;
					earlyCompletion = null;
				}
			}
		},
		/**
		 *
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
				if (!disposed && attempt === revision && state.login === pending) {
					state.login =
						result.status === "canceled"
							? { kind: "login", state: "cancelled", loginId: command.loginId }
							: {
									kind: "login",
									state: "failed",
									loginId: command.loginId,
									reason:
										"This sign-in was no longer pending when cancellation reached Codex. Refresh the account.",
								};
					state.account = {
						kind: "account",
						state: "unknown",
						reason: "Refresh the account after cancelling sign-in.",
					};
				}
			} finally {
				cancelling = false;
			}
			return { outcome: "delivered" };
		},
		/**
		 *
		 */
		logout: async () => {
			const attempt = ++revision;
			loggingOut = true;
			try {
				await components.session.accountLogout();
				if (!disposed && attempt === revision) {
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
		 *
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
