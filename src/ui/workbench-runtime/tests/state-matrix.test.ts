import { describe, expect, test } from "bun:test";
import type { BrowserWorkbenchState } from "../../workbench-transport/index.js";
import { mountProvider, MutableTransport, snapshot } from "./mounted-support.js";

interface StateCase {
	readonly name: string;
	readonly state: BrowserWorkbenchState;
	readonly projectedState: string;
	readonly reason: string;
	readonly recovery: string;
	readonly messages: number;
}

const retained = snapshot();
const connectionCases: readonly StateCase[] = [
	{
		name: "stopped without snapshot",
		state: {
			kind: "connection",
			state: "stopped",
			connection: "stopped",
			snapshot: null,
			sequence: null,
			reason: "Stopped exactly.",
		},
		projectedState: "stopped",
		reason: "Stopped exactly.",
		recovery: "Restart the Codex workbench, then retry.",
		messages: 0,
	},
	{
		name: "incompatible without snapshot",
		state: {
			kind: "connection",
			state: "incompatible_contract",
			connection: "stopped",
			snapshot: null,
			sequence: null,
			reason: "Protocol mismatch exactly.",
		},
		projectedState: "incompatible_contract",
		reason: "Protocol mismatch exactly.",
		recovery: "Update Archboard or Codex so their workbench protocol versions match.",
		messages: 0,
	},
	...([null, retained] as const).map((value, index) => ({
		name: `backoff ${value === null ? "without" : "with"} snapshot`,
		state: {
			kind: "connection",
			state: "backoff",
			connection: "reconnecting",
			snapshot: value,
			sequence: value === null ? null : 1,
			retryAtMs: 10,
			reason: "Backoff exactly.",
		} as BrowserWorkbenchState,
		projectedState: "backoff",
		reason: "Backoff exactly.",
		recovery: "Wait until Codex retries, or restart the Codex workbench.",
		messages: index,
	})),
	...([null, retained] as const).map((value, index) => ({
		name: `reconnecting ${value === null ? "without" : "with"} snapshot`,
		state: {
			kind: "connection",
			state: "reconnecting",
			connection: "reconnecting",
			snapshot: value,
			sequence: value === null ? null : 1,
			reason: "Reconnect exactly.",
		} as BrowserWorkbenchState,
		projectedState: "reconnecting",
		reason: "Reconnect exactly.",
		recovery: "Wait for Codex to reconnect. This history remains available for inspection.",
		messages: index,
	})),
	...([null, retained] as const).map((value, index) => ({
		name: `stale ${value === null ? "without" : "with"} snapshot`,
		state: {
			kind: "stream",
			state: "stale_snapshot",
			connection: "connected",
			snapshot: value,
			sequence: value === null ? null : 1,
			expectedSequence: 2,
			receivedSequence: 3,
			reason: "Stale exactly.",
		} as BrowserWorkbenchState,
		projectedState: "stale",
		reason: "Stale exactly.",
		recovery: "Wait for a fresh Codex snapshot before sending another command.",
		messages: index,
	})),
];

function readinessCase(
	state: Exclude<
		BrowserWorkbenchState["state"],
		"stale_snapshot" | "thread_capable" | "reconnecting"
	>,
	reason: string,
	recovery: string,
): StateCase {
	const base = snapshot();
	const reasonBearing = new Set([
		"stopped",
		"backoff",
		"storage_mismatch",
		"incompatible_contract",
	]);
	const readiness = reasonBearing.has(state)
		? ({
				kind: "readiness",
				state,
				reason,
				...(state === "backoff" ? { retryAtMs: 10 } : {}),
			} as typeof base.readiness)
		: state === "login_pending"
			? ({ kind: "readiness", state, loginId: "login-1" } as typeof base.readiness)
			: ({ kind: "readiness", state } as typeof base.readiness);
	const value = { ...base, readiness } as typeof base;
	return {
		name: `readiness ${state}`,
		state: { kind: "readiness", state, connection: "connected", snapshot: value, sequence: 1 },
		projectedState: state,
		reason: reasonBearing.has(state)
			? reason
			: `Codex is ${state.replaceAll("_", " ")}; direct workhorse input is unavailable.`,
		recovery,
		messages: 1,
	};
}

const readinessCases = [
	readinessCase(
		"stopped",
		"Readiness stopped exactly.",
		"Restart the Codex workbench, then retry.",
	),
	readinessCase(
		"backoff",
		"Readiness backoff exactly.",
		"Wait until Codex retries, or restart the Codex workbench.",
	),
	readinessCase(
		"storage_mismatch",
		"Storage mismatch exactly.",
		"Correct the Codex storage configuration, then restart the workbench.",
	),
	readinessCase(
		"incompatible_contract",
		"Readiness protocol mismatch exactly.",
		"Update Archboard or Codex so their workbench protocol versions match.",
	),
	readinessCase(
		"initialized",
		"",
		"Wait for Codex to finish preparing a thread-capable workhorse.",
	),
	readinessCase(
		"account_ready",
		"",
		"Wait for Codex to finish preparing a thread-capable workhorse.",
	),
	readinessCase("login_capable", "", "Sign in to Codex before selecting an executable workhorse."),
	readinessCase("signed_out", "", "Sign in to Codex before selecting an executable workhorse."),
	readinessCase(
		"login_pending",
		"",
		"Complete or cancel the pending Codex sign-in before continuing.",
	),
] as const;

describe("mounted workbench state matrix", () => {
	for (const entry of [...connectionCases, ...readinessCases]) {
		test(entry.name, async () => {
			const transport = new MutableTransport(entry.state);
			const mounted = await mountProvider();
			try {
				await mounted.render(transport);
				const context = mounted.contexts.at(-1);
				expect(context?.mode).toBe("readonly");
				expect(context?.view).toMatchObject({ state: entry.projectedState, reason: entry.reason });
				expect(context?.view.messages).toHaveLength(entry.messages);
				expect(context?.assistantRuntime).toBeNull();
				expect(mounted.observations).toHaveLength(0);
				expect(mounted.container.queryByRole("status")?.textContent).toBe(
					`${entry.reason} ${entry.recovery}`,
				);
			} finally {
				await mounted.close();
			}
		});
	}
});
