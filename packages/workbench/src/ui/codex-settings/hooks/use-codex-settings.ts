import { useCallback, useEffect, useRef, useState } from "react";
import type { DialogError } from "@archboard/ui-kit/components";
import type {
	CodexSettingsReply,
	CodexSettingsSaveRequest,
} from "#shared/codex-settings/schemas/codex-settings.ts";
import {
	cancelCodexLogin,
	fetchCodexSettings,
	logoutCodex,
	resetCodexSettings,
	saveCodexSettings,
	startCodexLogin,
	type CodexSettingsOutcome,
} from "#ui/codex-settings/clients/codex-settings-requests.ts";

const POLL_INTERVAL_MS = 1500;

interface CodexSettingsBusy {
	readonly login: boolean;
	readonly cancel: boolean;
	readonly logout: boolean;
	readonly save: boolean;
	readonly reset: boolean;
}

const IDLE_BUSY: CodexSettingsBusy = {
	login: false,
	cancel: false,
	logout: false,
	save: false,
	reset: false,
};

interface UseCodexSettingsOptions {
	readonly onSuccess: (message: string) => void;
}

/**
 * Open a blank browser tab synchronously inside a click handler so the OAuth URL can be loaded
 * once the server returns it without triggering popup blockers.
 * @returns The opened window handle, or null if blocked.
 */
function openPendingAuthTab(): Window | null {
	try {
		return window.open("about:blank", "_blank");
	} catch {
		return null;
	}
}

/**
 * Navigate an opened OAuth tab to the server-provided URL, or close it if sign-in did not yield one.
 * @param authTab Previously opened blank tab, or null if popup blocked.
 * @param reply Settings reply returned after starting ChatGPT login.
 */
function settleAuthTab(authTab: Window | null, reply: CodexSettingsReply | null): void {
	if (authTab === null || authTab.closed) return;
	if (reply?.auth.state === "login_pending" && reply.auth.authUrl !== null) {
		authTab.location.assign(reply.auth.authUrl);
		return;
	}
	authTab.close();
}

/**
 * Commit one settings response into React state when the hook is still mounted.
 * @param outcome Parsed server response.
 * @param title Error heading shown if the response failed.
 * @param mounted Ref indicating whether the hook is mounted.
 * @param mounted.current True while the hook remains mounted.
 * @param setError State setter for dialog errors.
 * @param setSettings State setter for the settings snapshot.
 * @returns The settings reply on success, or null.
 */
function commitSettingsOutcome(
	outcome: CodexSettingsOutcome,
	title: string,
	mounted: { readonly current: boolean },
	setError: (error: DialogError | null) => void,
	setSettings: (reply: CodexSettingsReply) => void,
): CodexSettingsReply | null {
	if (!mounted.current) return null;
	if (!outcome.success) {
		setError({ title, message: outcome.error });
		return null;
	}
	setError(null);
	setSettings(outcome);
	return outcome;
}

/**
 * Own loading, polling, authentication actions, and model preference persistence for the Codex settings tab.
 * @param options Callbacks for surfacing save/reset notices to the shell.
 * @returns Live settings state, busy flags, errors, and action callbacks.
 */
function useCodexSettings(options: UseCodexSettingsOptions) {
	const { onSuccess } = options;
	const [settings, setSettings] = useState<CodexSettingsReply | null>(null);
	const [busy, setBusy] = useState<CodexSettingsBusy>(IDLE_BUSY);
	const [error, setError] = useState<DialogError | null>(null);
	const mounted = useRef(true);
	const activeRead = useRef<AbortController | null>(null);
	const mutationInFlight = useRef(false);
	const anyBusy = Object.values(busy).some(Boolean);

	useEffect(() => {
		mounted.current = true;
		return () => {
			mounted.current = false;
			activeRead.current?.abort();
			activeRead.current = null;
		};
	}, []);

	const runBusy = useCallback(
		async (
			flag: keyof CodexSettingsBusy,
			title: string,
			request: () => Promise<CodexSettingsOutcome>,
		): Promise<CodexSettingsReply | null> => {
			if (mutationInFlight.current) return null;
			mutationInFlight.current = true;
			activeRead.current?.abort();
			activeRead.current = null;
			setError(null);
			setBusy((current) => ({ ...current, [flag]: true }));
			try {
				return commitSettingsOutcome(await request(), title, mounted, setError, setSettings);
			} finally {
				mutationInFlight.current = false;
				if (mounted.current) {
					setBusy((current) => ({ ...current, [flag]: false }));
				}
			}
		},
		[],
	);

	const refresh = useCallback(async (): Promise<CodexSettingsReply | null> => {
		if (mutationInFlight.current) return null;
		activeRead.current?.abort();
		const controller = new AbortController();
		activeRead.current = controller;
		try {
			const outcome = await fetchCodexSettings(controller.signal);
			if (controller.signal.aborted) return null;
			return commitSettingsOutcome(
				outcome,
				"Could not read Codex settings",
				mounted,
				setError,
				setSettings,
			);
		} finally {
			if (activeRead.current === controller) {
				activeRead.current = null;
			}
		}
	}, []);

	useEffect(() => {
		void refresh();
		return () => {
			activeRead.current?.abort();
		};
	}, [refresh]);

	const shouldPoll =
		settings?.auth.state === "login_pending" || settings?.auth.state === "starting";

	useEffect(() => {
		if (!shouldPoll || anyBusy) return undefined;
		const timer = window.setInterval(() => {
			if (activeRead.current === null) void refresh();
		}, POLL_INTERVAL_MS);
		return () => {
			window.clearInterval(timer);
		};
	}, [anyBusy, refresh, shouldPoll]);

	const pendingLoginId = settings?.auth.state === "login_pending" ? settings.auth.loginId : null;

	const signInChatgpt = useCallback(async (): Promise<void> => {
		const authTab = openPendingAuthTab();
		const reply = await runBusy("login", "Could not start ChatGPT sign-in", () =>
			startCodexLogin({ type: "chatgpt" }),
		);
		settleAuthTab(authTab, reply);
	}, [runBusy]);

	const signInApiKey = useCallback(
		async (apiKey: string): Promise<boolean> => {
			const reply = await runBusy("login", "Could not sign in with API key", () =>
				startCodexLogin({ type: "apiKey", apiKey }),
			);
			return reply?.auth.state === "authenticated";
		},
		[runBusy],
	);

	const cancelLogin = useCallback(async (): Promise<void> => {
		if (pendingLoginId === null) return;
		await runBusy("cancel", "Could not cancel sign-in", () => cancelCodexLogin(pendingLoginId));
	}, [pendingLoginId, runBusy]);

	const logout = useCallback(async (): Promise<void> => {
		await runBusy("logout", "Could not sign out", logoutCodex);
	}, [runBusy]);

	const save = useCallback(
		async (payload: CodexSettingsSaveRequest): Promise<void> => {
			const reply = await runBusy("save", "Could not save Codex settings", () =>
				saveCodexSettings(payload),
			);
			if (reply !== null) {
				onSuccess("Saved Codex settings.");
			}
		},
		[onSuccess, runBusy],
	);

	const reset = useCallback(async (): Promise<void> => {
		const reply = await runBusy("reset", "Could not reset Codex settings", resetCodexSettings);
		if (reply !== null) {
			onSuccess("Restored default Codex settings.");
		}
	}, [onSuccess, runBusy]);

	return {
		settings,
		busy,
		anyBusy,
		error,
		refresh,
		signInChatgpt,
		signInApiKey,
		cancelLogin,
		logout,
		save,
		reset,
	};
}

export { useCodexSettings, type CodexSettingsBusy };
