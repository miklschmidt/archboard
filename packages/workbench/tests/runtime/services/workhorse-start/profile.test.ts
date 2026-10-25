import { expect, test } from "bun:test";

import { ARCHBOARD_INSTRUCTIONS } from "#runtime/services/host/archboard.ts";
import { WORKHORSE_DEVELOPER_INSTRUCTIONS } from "#runtime/rules/instructions/authored.ts";
import { ARCHBOARD_APP_NAMESPACE } from "#runtime/protocol/thread-tools/manifest.ts";

test("keeps the reviewed instruction hash at the module boundary", () => {
	expect(ARCHBOARD_INSTRUCTIONS.workhorse.instructions.text).toEndWith(
		WORKHORSE_DEVELOPER_INSTRUCTIONS,
	);
});

test("the Archboard workhorse profile names Archboard and carries its app tools", () => {
	const profile = ARCHBOARD_INSTRUCTIONS.workhorse;

	expect(profile.serviceName).toBe("archboard");
	expect(profile.threadSource).toBe("archboard");
	expect(profile.dynamicTools[0]).toEqual(ARCHBOARD_APP_NAMESPACE);
});
