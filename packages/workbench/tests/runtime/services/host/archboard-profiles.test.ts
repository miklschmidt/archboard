import { expect, test } from "bun:test";

import { archboardProfiles } from "#tests/runtime/support/archboard-profiles.ts";

const ARCHBOARD_INSTRUCTIONS = archboardProfiles();

// Codex reuses a retained coordinator or workhorse only while its profile bytes are unchanged, so
// a drift here silently strands every Archboard thread started before it. The digests were taken
// before the voice agent's identity became a host option (TASK-530.01). The names are pinned too:
// the voice package fills its tool manifests and spoken-approval prompt with them, and pins those
// templates' bytes filled with a neutral host's names (TASK-530.05), so these names and its pins
// together hold the bytes Archboard's calls carry. The record prefix spells every identity its stored
// records hold, so it is pinned with the names.
test("Archboard's thread profiles keep the bytes its existing Codex threads were started with", () => {
	const { coordinator, workhorse } = ARCHBOARD_INSTRUCTIONS;

	expect(coordinator.identity).toEqual({
		serviceName: "archboard",
		threadSource: "archboard",
		productName: "Archboard",
		toolNamespaces: {
			workhorse: "archboard_workhorse",
			voice: "archboard_voice",
			coordinator: "archboard_coordinator",
		},
		recordPrefix: "archboard",
	});
	expect(workhorse.identity).toEqual(coordinator.identity);
	expect([coordinator.manifestHash, coordinator.instructions.sha256]).toEqual([
		"e7f6bef3f5533f3707d399ce6a90b61ca3d17395316c424b4ad11b1db83bd13e",
		"67baf9487973ac3e1cdafc173e4049f1d4a7eac8ad235d58bb3dcc439a819879",
	]);
	expect([workhorse.manifestHash, workhorse.instructions.sha256]).toEqual([
		"37326757673a96f4818180bb530d803c04719df8a61d5439c87bf72989a973f1",
		"2b0005b5c90d0d5b8480b7a94532eaa42ede2e2b02433d994ae68e564e6833d4",
	]);
});
