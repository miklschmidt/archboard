import { describe, expect, test } from "bun:test";
import fs from "node:fs";
import { createElement, type ComponentType } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import type { DoingEntry, LockHolder } from "../../types/index.ts";
import {
	claimFromLockHolder,
	projectWorkbenchBoardStatus,
	type WorkbenchBoardClaim,
	type WorkbenchBoardConnectionState,
	type WorkbenchSemanticContextState,
	type WorkbenchTakeBackState,
} from "../adapter.ts";
import type { WorkbenchBoardStatusProps } from "../contract.ts";

const loadedModule: unknown = await import(new URL("../index.tsx", import.meta.url).href);
if (typeof loadedModule !== "object" || loadedModule === null) {
	throw new Error("Workbench board status module did not load as an object.");
}
const WorkbenchBoardStatus = (loadedModule as Readonly<Record<string, unknown>>)
	.WorkbenchBoardStatus as ComponentType<WorkbenchBoardStatusProps>;
if (typeof WorkbenchBoardStatus !== "function") {
	throw new TypeError("WorkbenchBoardStatus export is not a component.");
}

const CONNECTION_STATES = [
	"disconnected",
	"reconnecting",
	"connected",
] as const satisfies readonly WorkbenchBoardConnectionState[];
const TAKE_BACK_STATES = [
	"idle",
	"available",
	"pending",
	"success",
	"failure",
] as const satisfies readonly WorkbenchTakeBackState[];
const SEMANTIC_STATES = [
	{ state: "unavailable" },
	{ state: "fresh", detail: "Delivered to the linked workhorse." },
	{ state: "stale", reason: "The board cursor moved after capture." },
	{ state: "ambiguous", reasons: ["Two loaded thread matches."] },
	{ state: "refused", reason: "The linked thread is not loaded." },
	{ state: "outcome_unknown", reason: "The response was lost after send." },
] as const satisfies readonly WorkbenchSemanticContextState[];

const CLAIM = Object.freeze({
	state: "claimed",
	holderId: "agent-7",
	holderKind: "agent",
	claimedAt: "2026-08-31T15:00:00.000Z",
	reason: "Rerouting the payment campaign",
}) satisfies WorkbenchBoardClaim;
const UNCLAIMED = Object.freeze({ state: "unclaimed" }) satisfies WorkbenchBoardClaim;
const DOING = Object.freeze([
	Object.freeze({
		doing: "Moving the queue edge",
		at: "2026-08-31T15:01:00.000Z",
		by: "agent-7",
		kind: "agent",
		claimed: true,
	}),
	Object.freeze({
		doing: "Relabelling the checkout boundary",
		at: "2026-08-31T15:02:00.000Z",
		by: "agent-7",
		kind: "agent",
		claimed: true,
	}),
]) satisfies readonly DoingEntry[];

function project(options?: {
	connection?: WorkbenchBoardConnectionState;
	claim?: WorkbenchBoardClaim;
	semanticContext?: WorkbenchSemanticContextState;
	takeBack?: WorkbenchTakeBackState;
}) {
	return projectWorkbenchBoardStatus({
		paneLabel: "Pane B",
		connection: options?.connection ?? "connected",
		claim: options?.claim ?? CLAIM,
		doing: DOING,
		takeBack: options?.takeBack ?? "available",
		semanticContext: options?.semanticContext ?? SEMANTIC_STATES[1],
	});
}

function render(options?: {
	connection?: WorkbenchBoardConnectionState;
	claim?: WorkbenchBoardClaim;
	semanticContext?: WorkbenchSemanticContextState;
	takeBackState?: WorkbenchTakeBackState;
}) {
	return renderToStaticMarkup(
		createElement(WorkbenchBoardStatus, {
			paneLabel: "Pane B",
			connection: options?.connection ?? "connected",
			claim: options?.claim ?? CLAIM,
			doing: DOING,
			semanticContext: options?.semanticContext ?? SEMANTIC_STATES[1],
			takeBackState: options?.takeBackState ?? "available",
			onTakeBack: async () => ({ outcome: "success" as const }),
		}),
	);
}

describe("workbench board status adapter", () => {
	test("projects every closed connection, take-back, and semantic state by name", () => {
		for (const connection of CONNECTION_STATES) {
			const snapshot = project({ connection });
			expect(snapshot.connection.state).toBe(connection);
			expect(snapshot.connection.label.toLowerCase()).toBe(connection);
			expect(snapshot.legacyState).toBe(connection === "connected" ? "working" : "offline");
		}

		for (const takeBack of TAKE_BACK_STATES) {
			const snapshot = project({ takeBack });
			expect(snapshot.takeBack.state).toBe(takeBack);
			expect(snapshot.takeBack.label.length).toBeGreaterThan(0);
			expect(Object.isFrozen(snapshot.takeBack)).toBe(true);
		}

		for (const semanticContext of SEMANTIC_STATES) {
			const snapshot = project({ semanticContext });
			expect(snapshot.semanticContext.state).toBe(semanticContext.state);
			expect(snapshot.semanticContext.label.length).toBeGreaterThan(0);
			expect(snapshot.semanticContext.description.length).toBeGreaterThan(0);
		}
	});

	test("keeps campaign claim and per-write doing as separate immutable values", () => {
		const snapshot = project();
		expect(snapshot.claim).toMatchObject({
			state: "claimed",
			reason: "Rerouting the payment campaign",
		});
		expect(snapshot.doing.current?.doing).toBe("Relabelling the checkout boundary");
		expect(snapshot.doing.history.map((entry) => entry.doing)).toEqual([
			"Moving the queue edge",
			"Relabelling the checkout boundary",
		]);
		expect(Object.isFrozen(snapshot)).toBe(true);
		expect(Object.isFrozen(snapshot.claim)).toBe(true);
		expect(Object.isFrozen(snapshot.doing)).toBe(true);
		expect(Object.isFrozen(snapshot.doing.history)).toBe(true);
		expect(snapshot.doing.history).not.toBe(DOING);
		expect(DOING[0]?.doing).toBe("Moving the queue edge");
	});

	test("adapts only durable claims and retains their holder identity and reason", () => {
		const ordinaryWrite: LockHolder = {
			id: "agent-write",
			kind: "agent",
			since: "2026-08-31T14:00:00.000Z",
			until: "2026-08-31T14:00:01.000Z",
			process: "canvas",
			reason: "one write",
		};
		const durableClaim: LockHolder = { ...ordinaryWrite, claimed: true, reason: "campaign" };

		expect(claimFromLockHolder(null)).toEqual({ state: "unclaimed" });
		expect(claimFromLockHolder(ordinaryWrite)).toEqual({ state: "unclaimed" });
		expect(claimFromLockHolder(durableClaim)).toEqual({
			state: "claimed",
			holderId: "agent-write",
			holderKind: "agent",
			claimedAt: "2026-08-31T14:00:00.000Z",
			reason: "campaign",
		});
	});

	test("does not accept Codex execution state as board-status input", () => {
		const keys = Object.keys({
			paneLabel: "Pane B",
			connection: "connected",
			claim: CLAIM,
			doing: DOING,
			takeBack: "available",
			semanticContext: SEMANTIC_STATES[1],
		}).toSorted();
		expect(keys).toEqual([
			"claim",
			"connection",
			"doing",
			"paneLabel",
			"semanticContext",
			"takeBack",
		]);
		for (const forbidden of ["approval", "coordinator", "queue", "thread", "turn", "voice"])
			expect(keys).not.toContain(forbidden);
	});
});

describe("workbench board status view", () => {
	test("renders every named semantic and take-back state with accessible status text", () => {
		for (const semanticContext of SEMANTIC_STATES) {
			const markup = render({ semanticContext });
			expect(markup).toContain(`data-semantic="${semanticContext.state}"`);
			expect(markup).toContain(`data-semantic-state="${semanticContext.state}"`);
			expect(markup).toContain("Semantic context");
		}

		for (const takeBackState of TAKE_BACK_STATES) {
			const markup = render({ takeBackState });
			expect(markup).toContain(`data-take-back="${takeBackState}"`);
			if (takeBackState === "pending") {
				expect(markup).toContain("Taking back control");
				expect(markup).toContain('role="status"');
			}
			if (takeBackState === "failure") {
				expect(markup).toContain("Try Take back control again");
				expect(markup).toContain('role="alert"');
			}
		}
	});

	test("preserves TASK-140 selectors, native keyboard controls, and live announcements", () => {
		const markup = render();
		expect(markup).toContain('class="agent-workbench agent-rail"');
		expect(markup).toContain('class="workbench-toggle"');
		expect(markup).toContain('aria-expanded="false"');
		expect(markup).toContain("aria-controls=");
		expect(markup).toContain('class="pane-claim-take take-back"');
		expect(markup.match(/type="button"/g)).toHaveLength(2);
		expect(markup).not.toContain('tabindex="-1"');
		expect(markup).toContain('aria-live="polite"');
		expect(markup).toContain("Rerouting the payment campaign");
		expect(markup).toContain("Relabelling the checkout boundary");
	});

	test("uses one semantic-token composition in light and dark themes", () => {
		const status = createElement(WorkbenchBoardStatus, {
			paneLabel: "Pane A",
			connection: "connected",
			claim: UNCLAIMED,
			doing: [],
			semanticContext: SEMANTIC_STATES[4],
		});
		const light = renderToStaticMarkup(createElement("div", { "data-theme": "light" }, status));
		const dark = renderToStaticMarkup(createElement("div", { "data-theme": "dark" }, status));
		expect(light.replace('data-theme="light"', 'data-theme="theme"')).toBe(
			dark.replace('data-theme="dark"', 'data-theme="theme"'),
		);
		expect(light).toContain("text-destructive");
		expect(light).not.toMatch(/#[0-9a-f]{3,8}|rgb\(/i);
	});

	test("rendering is presentation-only and exposes no board-note write capability", () => {
		let takeBackCalls = 0;
		renderToStaticMarkup(
			createElement(WorkbenchBoardStatus, {
				paneLabel: "Pane A",
				connection: "connected",
				claim: CLAIM,
				doing: DOING,
				onTakeBack: async () => {
					takeBackCalls += 1;
					return { outcome: "success" as const };
				},
			}),
		);
		expect(takeBackCalls).toBe(0);

		const moduleSource = [
			"../index.tsx",
			"../adapter.ts",
			"../contract.ts",
			"../lib/contract.ts",
			"../lib/projection.ts",
			"../lib/WorkbenchBoardStatus.tsx",
		]
			.map((path) => fs.readFileSync(new URL(path, import.meta.url), "utf8"))
			.join("\n");
		for (const forbidden of ["board-io", "atomic-write", "/api/elements", "/api/boards/save"])
			expect(moduleSource).not.toContain(forbidden);
	});
});
