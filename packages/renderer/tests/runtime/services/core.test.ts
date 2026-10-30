import { describe, expect, test } from "bun:test";
import { cpSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import { CoreBuildError, loadCore } from "#runtime/services/core.ts";
import { CHECKOUT, CORE_BUILD_DIRECTORY, coreSourceHash } from "#runtime/store/core-sources.ts";

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

	test("an interrupted core build is refused with a repairable build error", () => {
		const checkout = mkdtempSync(join(tmpdir(), "archboard-core-build-"));
		const renderer = join(checkout, "packages/renderer");
		try {
			for (const file of [
				"package.json",
				"src/runtime/services/core.ts",
				"src/runtime/store/core-sources.ts",
				"src/shared/rules/render/core-guard.ts",
			]) {
				const target = join(renderer, file);
				mkdirSync(dirname(target), { recursive: true });
				cpSync(join(CHECKOUT, "packages/renderer", file), target);
			}
			const build = join(renderer, "src/shared/protocol/generated/core");
			cpSync(CORE_BUILD_DIRECTORY, build, { recursive: true });
			writeFileSync(
				join(build, "archboard_renderer_wasm_bg.wasm"),
				new Uint8Array([0, 97, 115, 109]),
			);
			// A fresh process must instantiate the truncated build, rather than
			// reuse the core wasm-bindgen already loaded for this test process.
			const script = `
				import { loadCore, CoreBuildError } from ${JSON.stringify(join(renderer, "src/runtime/services/core.ts"))};
				try {
					loadCore("unused");
					process.exitCode = 1;
				} catch (error) {
					if (!(error instanceof CoreBuildError)) throw error;
					console.log(error.code);
				}
			`;
			const result = Bun.spawnSync([process.execPath, "--eval", script], {
				cwd: checkout,
				stdout: "pipe",
				stderr: "pipe",
			});
			expect(result.exitCode).toBe(0);
			expect(result.stdout.toString().trim()).toBe("CORE_BUILD_INVALID");
		} finally {
			rmSync(checkout, { recursive: true, force: true });
		}
	});
});
