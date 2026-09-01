import { describe, expect, test } from "bun:test";
import type {
	BrowserReadiness,
	BrowserSnapshot,
} from "../../../shared/codex-browser-model/index.js";
import { createCodexBrowserModel } from "../../../shared/codex-browser-model/index.js";
import { createIdentityAuthority } from "../../../shared/codex-workbench-identity/index.js";
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
const snapshotVariants: readonly (BrowserSnapshot | null)[] = [null, retained];
const identity = createIdentityAuthority();
const loginId = createCodexBrowserModel(identity).LoginIdSchema.parse(
	identity.decoder.adoptLoginId("matrix-login"),
);

function retainedConnectionCase(
	state: "backoff" | "reconnecting" | "stale_snapshot",
	value: BrowserSnapshot | null,
	index: number,
): StateCase {
	if (state === "backoff") {
		return {
			name: `backoff ${value === null ? "without" : "with"} snapshot`,
			state: {
				kind: "connection",
				state,
				connection: "reconnecting",
				snapshot: value,
				sequence: value === null ? null : 1,
				retryAtMs: 10,
				reason: "Backoff exactly.",
			},
			projectedState: "backoff",
			reason: "Backoff exactly.",
			recovery: "Wait until Codex retries, or restart the Codex workbench.",
			messages: index,
		};
	}
	if (state === "reconnecting") {
		return {
			name: `reconnecting ${value === null ? "without" : "with"} snapshot`,
			state: {
				kind: "connection",
				state,
				connection: "reconnecting",
				snapshot: value,
				sequence: value === null ? null : 1,
				reason: "Reconnect exactly.",
			},
			projectedState: "reconnecting",
			reason: "Reconnect exactly.",
			recovery: "Wait for Codex to reconnect. This history remains available for inspection.",
			messages: index,
		};
	}
	return {
		name: `stale ${value === null ? "without" : "with"} snapshot`,
		state: {
			kind: "stream",
			state,
			connection: "connected",
			snapshot: value,
			sequence: value === null ? null : 1,
			expectedSequence: 2,
			receivedSequence: 3,
			reason: "Stale exactly.",
		},
		projectedState: "stale",
		reason: "Stale exactly.",
		recovery: "Wait for a fresh Codex snapshot before sending another command.",
		messages: index,
	};
}

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
	...snapshotVariants.map((value, index) => retainedConnectionCase("backoff", value, index)),
	...snapshotVariants.map((value, index) => retainedConnectionCase("reconnecting", value, index)),
	...snapshotVariants.map((value, index) => retainedConnectionCase("stale_snapshot", value, index)),
];

type MatrixReadiness = Exclude<
	BrowserReadiness,
	{ readonly state: "thread_capable" | "incompatible_contract" }
>;

function readinessCase(readiness: MatrixReadiness, recovery: string): StateCase {
	const base = snapshot();
	const value: BrowserSnapshot = { ...base, readiness };
	const reason =
		"reason" in readiness
			? readiness.reason
			: `Codex is ${readiness.state.replaceAll("_", " ")}; direct workhorse input is unavailable.`;
	return {
		name: `readiness ${readiness.state}`,
		state: {
			kind: "readiness",
			state: readiness.state,
			connection: "connected",
			snapshot: value,
			sequence: 1,
		},
		projectedState: readiness.state,
		reason,
		recovery,
		messages: 1,
	};
}

const readinessCases = [
	readinessCase(
		{ kind: "readiness", state: "stopped", reason: "Readiness stopped exactly." },
		"Restart the Codex workbench, then retry.",
	),
	readinessCase(
		{ kind: "readiness", state: "backoff", retryAtMs: 10, reason: "Readiness backoff exactly." },
		"Wait until Codex retries, or restart the Codex workbench.",
	),
	readinessCase(
		{ kind: "readiness", state: "storage_mismatch", reason: "Storage mismatch exactly." },
		"Correct the Codex storage configuration, then restart the workbench.",
	),
	readinessCase(
		{ kind: "readiness", state: "reconnecting", reason: "Readiness reconnect exactly." },
		"Wait for Codex to reconnect. This history remains available for inspection.",
	),
	readinessCase(
		{ kind: "readiness", state: "initialized" },
		"Wait for Codex to finish preparing a thread-capable workhorse.",
	),
	readinessCase(
		{ kind: "readiness", state: "account_ready" },
		"Wait for Codex to finish preparing a thread-capable workhorse.",
	),
	readinessCase(
		{ kind: "readiness", state: "login_capable" },
		"Sign in to Codex before selecting an executable workhorse.",
	),
	readinessCase(
		{ kind: "readiness", state: "signed_out" },
		"Sign in to Codex before selecting an executable workhorse.",
	),
	readinessCase(
		{ kind: "readiness", state: "login_pending", loginId },
		"Complete or cancel the pending Codex sign-in before continuing.",
	),
];

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
