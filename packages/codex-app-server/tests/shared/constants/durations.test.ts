import { describe, expect, test } from "bun:test";

import {
	CODEX_PROCESS_MS,
	CODEX_SESSION_MS,
	codexRestartDelayMs,
} from "#shared/constants/durations.ts";

describe("Codex app-server durations", () => {
	test("keep the reviewed values, frozen", () => {
		expect(CODEX_PROCESS_MS).toEqual({
			restartBase: 1000,
			restartMax: 30_000,
			stdinEofGrace: 1000,
			termGrace: 5000,
			groupFreeze: 500,
			composedShutdown: 10_000,
		});
		expect(CODEX_SESSION_MS).toEqual({
			explanationTurnStart: 15_000,
			explanationText: 150,
			requestSettlement: 30_000,
			waitTargetPoll: 250,
			queueRereadFloor: 1000,
		});
		expect(Object.isFrozen(CODEX_PROCESS_MS)).toBe(true);
		expect(Object.isFrozen(CODEX_SESSION_MS)).toBe(true);
	});

	test("keep the authored relations", () => {
		const process = CODEX_PROCESS_MS;
		const session = CODEX_SESSION_MS;
		expect(process.restartBase).toBeLessThanOrEqual(process.restartMax);
		expect(session.requestSettlement).toBeLessThanOrEqual(process.restartMax);
		expect(session.requestSettlement % session.waitTargetPoll).toBe(0);
		expect(session.queueRereadFloor).toBeGreaterThanOrEqual(session.waitTargetPoll);
		expect(session.queueRereadFloor).toBeLessThan(session.requestSettlement);
		expect(process.stdinEofGrace).toBeGreaterThan(0);
	});

	test("double the restart delay per failed attempt up to the cap", () => {
		const { restartBase, restartMax } = CODEX_PROCESS_MS;
		expect(codexRestartDelayMs(0)).toBe(restartBase);
		expect(codexRestartDelayMs(1)).toBe(2 * restartBase);
		expect(codexRestartDelayMs(2)).toBe(4 * restartBase);
		expect(codexRestartDelayMs(1000)).toBe(restartMax);
	});
});
