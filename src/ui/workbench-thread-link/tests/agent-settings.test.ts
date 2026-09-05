// The behaviour the archived rendered owner asserted through the old panel,
// re-targeted at the panel projection and the adapters that now feed the
// committed workbench header and agent settings dialog: the two connection
// choices, rows before binding, the create prerequisite, the account arms,
// and the dialog's busy, error and callback inputs.

import { describe, expect, test } from "bun:test";

import {
	agentSettingsBusy,
	agentSettingsCallbacks,
	agentSettingsErrors,
	createThreadLinkController,
	projectThreadLinkPanel,
	workbenchThreadLinkActions,
} from "@/ui/workbench-thread-link";
import type {
	ThreadLinkActionSnapshot,
	ThreadLinkPanelSnapshot,
} from "@/ui/workbench-thread-link/contracts";
import type { WorkbenchTransportState } from "@/ui/workbench-thread-link/transport-port";
import {
	capabilities,
	connected,
	executableLink,
	FakeTransport,
	listed,
	loginA,
	capturing,
	record,
	snapshot,
	threadA,
	threadB,
} from "@/ui/workbench-thread-link/tests/fixtures";

const IDLE: ThreadLinkActionSnapshot = { state: "idle", revision: 0 };

/**
 * The panel for one state.
 * @param state The transport state.
 * @param action The published action.
 * @returns The panel.
 */
function panel(
	state: WorkbenchTransportState,
	action: ThreadLinkActionSnapshot = IDLE,
): ThreadLinkPanelSnapshot {
	return projectThreadLinkPanel({
		paneId: "pane-a",
		state,
		capabilities: capabilities(),
		hostRecoveryIntents: [],
		action,
	});
}

/**
 * Let every queued task run.
 * @returns After the task queue drains.
 */
function settle(): Promise<void> {
	return new Promise((resolve) => {
		setTimeout(resolve, 0);
	});
}

describe("thread-link panel projection", () => {
	test("offers two connection choices on a ready, unbound pane", () => {
		const projected = panel(connected());
		expect(projected.readiness.arm).toBe("thread_capable");
		expect(projected.create).toMatchObject({
			label: "Start agent",
			enabled: true,
			blockedReason: null,
		});
		expect(projected.selection.state).toBe("unknown");
		expect(projected.selection.recovery.intent).toBe("refresh_inventory");
		expect(projected.currentLink.label).toBe("No agent connected");
	});

	test("projects one row per joined record with every disclosed fact before binding", () => {
		const projected = panel(
			connected(
				snapshot({
					threadCandidates: listed([
						record({ selectionId: "first" }),
						record({
							selectionId: "second",
							threadId: threadB,
							state: "inspect_only",
							reason: "prior_epoch",
						}),
					]),
				}),
			),
		);
		expect(
			projected.selection.rows.map((row) => [row.selectionId, row.intent, row.outcome]),
		).toEqual([
			["first", "attach", "executable"],
			["second", "attach", "inspect_only"],
		]);
		expect(projected.selection.rows[1]?.reasonLabel).toBe(
			"This conversation belongs to an earlier agent session.",
		);
		expect(projected.selection.summary).toBe("2 conversations.");
	});

	test("names the pane already holding a link rather than offering it again", () => {
		const projected = panel(
			connected(
				snapshot({
					threadLink: executableLink(threadA),
					threadCandidates: listed([record()]),
				}),
			),
		);
		expect(projected.currentLink).toMatchObject({
			state: "executable",
			label: "Agent connected",
			detail: "This conversation can work on the board.",
			threadId: threadA,
		});
		expect(projected.selection.rows[0]?.intent).toBe("current");
		expect(projected.selection.rows[0]?.blockedReason).toBe(
			"This conversation is already connected.",
		);
	});

	test("disables create with a stated reason before the pane is ready", () => {
		const signedOut = projectThreadLinkPanel({
			paneId: "pane-a",
			state: connected(snapshot({ readiness: { kind: "readiness", state: "signed_out" } })),
			capabilities: capabilities({ supported: [] }),
			hostRecoveryIntents: [],
			action: IDLE,
		});
		expect(signedOut.create.enabled).toBe(false);
		expect(signedOut.create.blockedReason).toBe("Sign in below to start an agent.");
		const ready = projectThreadLinkPanel({
			paneId: "pane-a",
			state: connected(),
			capabilities: capabilities({ supported: [] }),
			hostRecoveryIntents: [],
			action: IDLE,
		});
		expect(ready.create.blockedReason).toBe("Refresh the connection and try again.");
	});
});

describe("agent settings inputs", () => {
	test("marks the dialog's one busy action from the pending snapshot", () => {
		const target = { paneId: "pane-a", intent: "refresh_snapshot" } as const;
		const login: ThreadLinkActionSnapshot = {
			state: "pending",
			revision: 1,
			action: "login",
			target,
			announcement: "Starting sign-in…",
		};
		expect(agentSettingsBusy(login)).toEqual({
			signIn: true,
			cancelLogin: false,
			link: false,
			unlink: false,
		});
		expect(agentSettingsBusy({ ...login, action: "attach" }).link).toBe(true);
		expect(agentSettingsBusy({ ...login, action: "cancel_login" }).cancelLogin).toBe(true);
		expect(agentSettingsBusy(IDLE)).toEqual({
			signIn: false,
			cancelLogin: false,
			link: false,
			unlink: false,
		});
	});

	test("routes a failed action's words to the section it belongs to", () => {
		const target = { paneId: "pane-a", intent: "refresh_snapshot" } as const;
		const failed: ThreadLinkActionSnapshot = {
			state: "failed",
			revision: 1,
			action: "login",
			target,
			announcement: "Codex rejected the sign-in.",
			recovery: null,
		};
		expect(agentSettingsErrors(failed)).toEqual({
			account: { title: "The action failed", message: "Codex rejected the sign-in." },
			threadLink: null,
			coordinator: null,
		});
		const unconfirmed = agentSettingsErrors({ ...failed, state: "inspect_only", action: "create" });
		expect(unconfirmed.account).toBeNull();
		expect(unconfirmed.threadLink?.title).toBe("The outcome is unconfirmed");
		expect(agentSettingsErrors(IDLE)).toEqual({
			account: null,
			threadLink: null,
			coordinator: null,
		});
	});

	test("the dialog's callbacks run the controller's commands", async () => {
		const transport = new FakeTransport(
			connected(snapshot({ threadCandidates: listed([record({ selectionId: "listed-a" })]) })),
		);
		const controller = createThreadLinkController({ capturePane: capturing(transport) });
		const callbacks = agentSettingsCallbacks(controller);

		callbacks.onSignIn("chatgpt");
		await settle();
		callbacks.onCancelLogin(loginA);
		await settle();
		callbacks.onLinkThread("listed-a");
		await settle();
		callbacks.onUnlinkThread();
		await settle();

		expect(transport.commands.map((entry) => entry.draft)).toEqual([
			{ command: "accountLogin", login: { type: "chatgpt" } },
			{ command: "accountLoginCancel", loginId: loginA },
			{ command: "threadLinkAttach", selectionId: "listed-a", threadId: threadA },
		]);
		expect(controller.snapshot().state).toBe("failed");
	});

	test("a credential form cannot start from the dialog without its fields", async () => {
		const transport = new FakeTransport();
		const controller = createThreadLinkController({ capturePane: capturing(transport) });

		agentSettingsCallbacks(controller).onSignIn("apiKey");
		await settle();
		agentSettingsCallbacks(controller, { apiKey: "sk-test" }).onSignIn("apiKey");
		await settle();

		expect(transport.commands.map((entry) => entry.draft)).toEqual([
			{ command: "accountLogin", login: { type: "apiKey", apiKey: "sk-test" } },
		]);
	});

	test("the header's actions create, refresh and open the chooser", async () => {
		const transport = new FakeTransport();
		const controller = createThreadLinkController({ capturePane: capturing(transport) });
		const chooser = { opened: 0 };
		/**
		 * Count one opening.
		 */
		function openChooser(): void {
			chooser.opened += 1;
		}
		const actions = workbenchThreadLinkActions(controller, { openChooser });

		actions.link();
		await settle();
		actions.refresh();
		await settle();
		actions.choose();

		expect(transport.commands.map((entry) => entry.draft.command)).toEqual([
			"threadLinkCreate",
			"threadLinkRefresh",
		]);
		expect(chooser.opened).toBe(1);
	});
});
