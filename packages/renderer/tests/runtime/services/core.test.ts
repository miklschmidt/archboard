import { describe, expect, test } from "bun:test";
import { CoreBuildError, loadCore } from "#runtime/services/core.ts";
import { coreSourceHash } from "#runtime/store/core-sources.ts";

describe("the renderer core under Bun", () => {
	test("loads the build of the checkout's sources and answers from it", () => {
		expect(loadCore().sourceHash()).toBe(coreSourceHash());
	});

	test("refuses a build of other sources", () => {
		let refused: unknown;
		try {
			loadCore("0000000000000000");
		} catch (error) {
			refused = error;
		}
		expect(refused).toBeInstanceOf(CoreBuildError);
		expect((refused as CoreBuildError).code).toBe("CORE_BUILD_STALE");
	});
});
