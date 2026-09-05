import { readFileSync } from "node:fs";

import { expect } from "bun:test";

import { latestState, type RealtimeHarness, waitFor } from "../fixtures/codex-realtime-process.ts";
import {
	parseRealtimeCorrelationId,
	parseRealtimeSessionId,
} from "../../../../src/shared/codex-realtime-host/index.ts";

function browserCorrelation(suffix = "") {
	return {
		sessionId: parseRealtimeSessionId(`process-browser-session${suffix}`),
		correlationId: parseRealtimeCorrelationId(`process-browser-correlation${suffix}`),
	};
}

function readRecords(harness: RealtimeHarness): Record<string, unknown>[] {
	return readFileSync(harness.logPath, "utf8")
		.split("\n")
		.filter(Boolean)
		.map((line) => JSON.parse(line) as Record<string, unknown>);
}

function requestParams(harness: RealtimeHarness, method: string): Record<string, unknown>[] {
	return readRecords(harness)
		.filter((entry) => entry["kind"] === "request" && entry["method"] === method)
		.map((entry) => entry["params"] as Record<string, unknown>);
}

function expectPendingOffer(harness: RealtimeHarness, settled: boolean): void {
	expect(settled).toBeFalse();
	expect(latestState(harness)).toEqual({ phase: "negotiating", reason: "offer_created" });
}

async function waitForDiagnostic(harness: RealtimeHarness, count: number): Promise<void> {
	await waitFor(
		() => harness.events.filter((event) => event.kind === "diagnostic").length === count,
	);
}

export { browserCorrelation, readRecords, requestParams, expectPendingOffer, waitForDiagnostic };
