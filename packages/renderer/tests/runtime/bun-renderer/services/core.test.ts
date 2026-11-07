import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { installation } from "@archboard/workspace/installation";
import {
	CoreBuildError,
	loadCore,
	type CoreInstallation,
} from "#runtime/bun-renderer/services/core.ts";
import { CORE_BUILD_DIRECTORY, coreSourceHash } from "#runtime/store/core-sources.ts";

/** The core a test runs, which every release fixture below is a copy of. */
const GLUE = "archboard_renderer_wasm.js";
const WASM = "archboard_renderer_wasm_bg.wasm";
const CORE_GUARD = join(import.meta.dir, "../../../../src/shared/render/rules/core-guard.ts");

let scratch = "";

beforeEach(() => {
	scratch = mkdtempSync(join(tmpdir(), "archboard-core-build-"));
});

afterEach(() => {
	rmSync(scratch, { recursive: true, force: true });
});

/**
 * Make a release that holds a copy of the core and no Rust source.
 * @param marker The source hash its marker records.
 * @param wasm The WebAssembly of its core; the checkout's own by default.
 * @returns What the loader needs of the installation.
 */
function release(
	marker: string,
	wasm: Uint8Array = readFileSync(join(CORE_BUILD_DIRECTORY, WASM)),
): CoreInstallation {
	const root = join(scratch, "release");
	const coreDirectory = join(root, "core");
	mkdirSync(coreDirectory, { recursive: true });
	// The build's glue reaches the panic guard through the package imports of the renderer.
	writeFileSync(
		join(coreDirectory, GLUE),
		readFileSync(join(CORE_BUILD_DIRECTORY, GLUE), "utf8").replace(
			"#shared/render/rules/core-guard.ts",
			CORE_GUARD,
		),
	);
	writeFileSync(join(coreDirectory, WASM), wasm);
	return { mode: "release", root, coreDirectory, coreHash: { kind: "marker", hash: marker } };
}

/**
 * The refusal of a load.
 * @param load The load to run.
 * @returns The build error it threw.
 */
function refusal(load: () => unknown): CoreBuildError {
	try {
		load();
	} catch (error) {
		if (error instanceof CoreBuildError) return error;
		throw error;
	}
	throw new Error("The core loaded, but the test expected a refusal.");
}

describe("the renderer core under Bun", () => {
	test("a checkout loads the build of its sources and answers from it", () => {
		expect(installation().mode).toBe("checkout");
		expect(loadCore().sourceHash()).toBe(coreSourceHash());
	});

	test("a checkout refuses a build of other sources and names how to build", () => {
		const refused = refusal(() => loadCore("0000000000000000"));
		expect(refused.code).toBe("CORE_BUILD_STALE");
		expect(refused.message).toContain("bun run build:core");
	});

	test("a release loads the core whose hash its marker records, without Rust sources", () => {
		const recorded = loadCore().sourceHash();
		const loaded = loadCore(undefined, release(recorded));
		expect(loaded.sourceHash()).toBe(recorded);
	});

	test("a release refuses a core of another hash and names reinstalling", () => {
		const refused = refusal(() => loadCore(undefined, release("0000000000000000")));
		expect(refused.code).toBe("CORE_BUILD_STALE");
		expect(refused.message).toMatch(/reinstall/i);
		expect(refused.message).not.toContain("bun run build:core");
	});

	test("an interrupted core build is refused with a repairable build error", () => {
		const truncated = new Uint8Array([0, 97, 115, 109]);
		const refused = refusal(() => loadCore(undefined, release("unused", truncated)));
		expect(refused.code).toBe("CORE_BUILD_INVALID");
		expect(refused.message).toMatch(/reinstall/i);
	});

	test("a release without a core is refused as missing", () => {
		const missing = { ...release("unused"), coreDirectory: join(scratch, "nowhere") };
		expect(refusal(() => loadCore(undefined, missing)).code).toBe("CORE_BUILD_MISSING");
	});
});
