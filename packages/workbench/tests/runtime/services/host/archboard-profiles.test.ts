import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { composeWorkbenchRoleInstructions } from "@archboard/codex-realtime-voice/runtime";

import { archboardProfiles } from "#tests/runtime/support/archboard-profiles.ts";

const ARCHBOARD_INSTRUCTIONS = archboardProfiles();

// Fresh profiles follow the authored canonical instructions. Retained coordinator reuse and
// captured profile bytes remain owned by codex-realtime-voice's coordinator/host-profile tests.
test("fresh Archboard profiles bind the authored canonical instructions and stable tool identity", () => {
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
	expect(coordinator.manifestHash).toBe(
		"e7f6bef3f5533f3707d399ce6a90b61ca3d17395316c424b4ad11b1db83bd13e",
	);
	expect(workhorse.manifestHash).toBe(
		"37326757673a96f4818180bb530d803c04719df8a61d5439c87bf72989a973f1",
	);
	for (const role of ["coordinator", "workhorse"] as const) {
		const domain = readFileSync(
			new URL(
				import.meta.resolve(`#runtime/rules/instructions/${role}-developer-instructions.txt`),
			),
			"utf8",
		);
		expect(ARCHBOARD_INSTRUCTIONS[role].instructions).toEqual(
			composeWorkbenchRoleInstructions(role, domain),
		);
	}
});
