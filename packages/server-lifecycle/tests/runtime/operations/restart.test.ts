// What a restart does to the frontend bundle: a release builds nothing (ADR 0075).

import { expect, spyOn, test } from "bun:test";
import { bundleToServe } from "#runtime/operations/restart.ts";

test("a release restart runs no build", async () => {
	const spawn = spyOn(Bun, "spawn");
	try {
		await bundleToServe("release");
		expect(spawn).not.toHaveBeenCalled();
	} finally {
		spawn.mockRestore();
	}
});
