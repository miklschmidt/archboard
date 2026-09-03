import { describe, expect, test } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
	BROWSER_ADAPTER_PATH,
	BROWSER_TEST_PATHS,
	OPT_IN_BROWSER_TEST_PATHS,
	validateBrowserSelection,
} from "../browser/run-browser-lane.ts";
import {
	discoverNativeTests,
	inspectTestInventory,
	type InventoryInput,
} from "./support/test-inventory.js";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const packageAdapter = `bun ${BROWSER_ADAPTER_PATH} ${BROWSER_TEST_PATHS.join(" ")}`;
const optInAdapter = `bun ${BROWSER_ADAPTER_PATH} --opt-in ${OPT_IN_BROWSER_TEST_PATHS.join(" ")}`;
const focusAdapter = (files: readonly string[]): string =>
	`bun ${BROWSER_ADAPTER_PATH} --focus ${files.join(" ")}`;

function input(overrides: Partial<InventoryInput> = {}): InventoryInput {
	return {
		repoRoot,
		scripts: {
			check: "bun run lint && bun run fmt:check && bun run test",
			test: "bun run test:modules && bun run test:system && bun run test:repository && bun run test:serial-browser",
			"test:modules": "bun test --isolate src",
			"test:system":
				"bun test --isolate --max-concurrency=1 tests/system/boards tests/system/label-geometry tests/system/cli tests/system/board-inspection tests/system/canvas-state tests/system/process-contracts tests/system/code-targets",
			"test:repository": "bun test --isolate tests/system/repository-policy",
			"test:serial-browser": packageAdapter,
			"test:opt-in:capacity": "bun test tests/opt-in/capacity.test.ts",
		},
		nativeTests: [
			"tests/system/repository-policy/skills.test.ts",
			"tests/system/repository-policy/test-inventory.test.ts",
			"tests/system/code-targets/activation-contract.test.ts",
			"tests/system/browser/opener-settings.test.ts",
			"tests/opt-in/capacity.test.ts",
		],
		...overrides,
	};
}

function expectInventoryError(fixture: InventoryInput, message: string): void {
	expect(inspectTestInventory(fixture).errors).toContain(message);
}

describe("test inventory policy", () => {
	test("accepts the final lanes", () => {
		expect(inspectTestInventory(input()).errors).toEqual([]);
	});

	test("rejects a missing final lane", () => {
		const fixture = input();
		fixture.scripts.test = fixture.scripts.test!.replace(" && bun run test:system", "");
		expectInventoryError(fixture, "package test lane `test:system` is absent from `check`");
	});

	test("rejects an orphaned native test", () => {
		const orphan = input({ nativeTests: ["tests/system/orphan.test.ts"] });
		expectInventoryError(
			orphan,
			"native test `tests/system/orphan.test.ts` belongs to no package lane",
		);
	});

	test("rejects one native test selected by two lanes", () => {
		const multiple = input();
		multiple.scripts["test:system"] += " tests/system/repository-policy/test-inventory.test.ts";
		expectInventoryError(
			multiple,
			"native test `tests/system/repository-policy/test-inventory.test.ts` runs 2 times from `check` through package lanes: test:system (1), test:repository (1)",
		);
	});

	test("rejects a native owner selected only by a non-lane command", () => {
		const unreachable = input({ nativeTests: ["tests/system/orphan.test.ts"] });
		unreachable.scripts["verify:orphan"] = "bun test tests/system/orphan.test.ts";
		expectInventoryError(
			unreachable,
			"native test `tests/system/orphan.test.ts` belongs to no package lane",
		);
	});

	test("rejects a lane reached twice from check", () => {
		const duplicate = input({ nativeTests: ["tests/system/verify.test.ts"] });
		duplicate.scripts["test:system"] = "bun test tests/system/verify.test.ts";
		duplicate.scripts.test += " && bun run test:system";
		expectInventoryError(
			duplicate,
			"native test `tests/system/verify.test.ts` runs 2 times from `check` through package lanes: test:system (2)",
		);
	});

	test("rejects an undeclared package lane", () => {
		const legacy = input();
		legacy.scripts["test:legacy"] = "bun scripts/non-native-command.ts";
		legacy.scripts.test += " && bun run test:legacy";
		expectInventoryError(
			legacy,
			"package test lane `test:legacy` is undeclared; classify it as a normal or explicit opt-in lane",
		);
	});

	test("keeps an explicit opt-in owner outside check", () => {
		const fixture = input();
		const result = inspectTestInventory(fixture);
		expect(result.errors).toEqual([]);
		expect(result.reachableScripts.get("test:opt-in:capacity") ?? 0).toBe(0);
		expect(result.nativeLanes.get("test:opt-in:capacity")).toEqual([
			"tests/opt-in/capacity.test.ts",
		]);
	});

	test("rejects an opt-in owner leaked into check", () => {
		const fixture = input();
		fixture.scripts.test += " && bun run test:opt-in:capacity";
		expectInventoryError(
			fixture,
			"opt-in test lane `test:opt-in:capacity` is reachable from `check`",
		);
	});

	test("rejects one owner in normal and opt-in inventories", () => {
		const fixture = input();
		fixture.scripts["test:modules"] += " tests/opt-in/capacity.test.ts";
		expectInventoryError(
			fixture,
			"native test `tests/opt-in/capacity.test.ts` belongs to both normal and opt-in lanes: test:modules, test:opt-in:capacity",
		);
	});

	test("scopes an ignore to its own Bun invocation", () => {
		const fixture = input();
		fixture.scripts["test:modules"] =
			"bun test --path-ignore-patterns tests/opt-in/capacity.test.ts tests/opt-in && bun test tests/opt-in/capacity.test.ts";
		expectInventoryError(
			fixture,
			"native test `tests/opt-in/capacity.test.ts` belongs to both normal and opt-in lanes: test:modules, test:opt-in:capacity",
		);
	});

	test("the real checkout reaches every native test exactly once", () => {
		const pkg = JSON.parse(fs.readFileSync(path.join(repoRoot, "package.json"), "utf8")) as {
			scripts: Record<string, string>;
		};
		const result = inspectTestInventory({
			repoRoot,
			scripts: pkg.scripts,
			nativeTests: discoverNativeTests(repoRoot),
		});
		expect(result.errors).toEqual([]);
		expect(
			Object.keys(pkg.scripts)
				.filter((name) => name.startsWith("test:"))
				.toSorted(),
		).toEqual([
			"test:modules",
			"test:opt-in:browser-performance",
			"test:opt-in:capacity",
			"test:opt-in:tooling",
			"test:opt-in:topology",
			"test:repository",
			"test:serial-browser",
			"test:system",
		]);
	});

	test("keeps the system and browser owners once", () => {
		const fixture = input();
		const system = fixture.scripts["test:system"]!;
		const browser = fixture.scripts["test:serial-browser"]!;
		expect(system.match(/tests\/system\/code-targets/g)).toHaveLength(1);
		expect(browser.match(/tests\/system\/browser\/opener-settings\.test\.ts/g)).toHaveLength(1);
		expect(inspectTestInventory(fixture).errors).toEqual([]);
	});

	test("rejects a missing system owner", () => {
		const missing = input();
		missing.scripts["test:system"] = missing.scripts["test:system"]!.replace(
			" tests/system/code-targets",
			"",
		);
		expectInventoryError(
			missing,
			"native test `tests/system/code-targets/activation-contract.test.ts` belongs to no package lane",
		);
	});

	test("rejects a system owner copied into another lane", () => {
		const duplicate = input();
		duplicate.scripts["test:modules"] += " tests/system/code-targets";
		expectInventoryError(
			duplicate,
			"native test `tests/system/code-targets/activation-contract.test.ts` runs 2 times from `check` through package lanes: test:modules (1), test:system (1)",
		);
	});

	test("rejects a reordered browser owner", () => {
		const reordered = input();
		reordered.scripts["test:serial-browser"] = packageAdapter.replace(
			"tests/system/browser/claim-interaction.test.ts tests/system/browser/selection-inspector.test.ts",
			"tests/system/browser/selection-inspector.test.ts tests/system/browser/claim-interaction.test.ts",
		);
		expect(inspectTestInventory(reordered).errors[0]).toContain(
			"Focused browser paths are not in canonical relative order.",
		);
	});

	test("rejects a browser owner copied into the system lane", () => {
		const wrongLane = input();
		wrongLane.scripts["test:system"] += " tests/system/browser/opener-settings.test.ts";
		expectInventoryError(
			wrongLane,
			"native test `tests/system/browser/opener-settings.test.ts` runs 2 times from `check` through package lanes: test:system (1), test:serial-browser (1)",
		);
	});
});

function adapterInput(
	command: string,
	nativeTests: string[] = [...BROWSER_TEST_PATHS],
): InventoryInput {
	return {
		repoRoot,
		scripts: {
			check: "bun run test",
			test: "bun run test:serial-browser",
			"test:serial-browser": command,
		},
		nativeTests,
	};
}

describe("typed serial browser adapter selection", () => {
	test("accepts only the complete package form and ordered focused subsets", () => {
		expect(validateBrowserSelection(packageAdapter.split(" "))).toEqual({
			mode: "package",
			files: [...BROWSER_TEST_PATHS],
		});
		expect(validateBrowserSelection(optInAdapter.split(" "))).toEqual({
			mode: "opt-in",
			files: [...OPT_IN_BROWSER_TEST_PATHS],
		});
		expect(
			validateBrowserSelection(
				focusAdapter([BROWSER_TEST_PATHS[1], BROWSER_TEST_PATHS[5], BROWSER_TEST_PATHS[12]]).split(
					" ",
				),
			),
		).toEqual({
			mode: "focus",
			files: [BROWSER_TEST_PATHS[1], BROWSER_TEST_PATHS[5], BROWSER_TEST_PATHS[12]],
		});
	});

	test("keeps normal and opt-in browser focus modes disjoint", () => {
		expect(() =>
			validateBrowserSelection([
				"bun",
				BROWSER_ADAPTER_PATH,
				"--focus",
				OPT_IN_BROWSER_TEST_PATHS[0],
			]),
		).toThrow("Normal browser lane names a path from the other inventory.");
		expect(() =>
			validateBrowserSelection([
				"bun",
				BROWSER_ADAPTER_PATH,
				"--opt-in",
				"--focus",
				BROWSER_TEST_PATHS[0],
			]),
		).toThrow("Opt-in browser lane names a path from the other inventory.");
	});

	test.each([
		[
			"an incomplete package selection",
			`bun ${BROWSER_ADAPTER_PATH} ${BROWSER_TEST_PATHS.slice(0, -1).join(" ")}`,
		],
		["a repeated owner", focusAdapter([BROWSER_TEST_PATHS[0], BROWSER_TEST_PATHS[0]])],
		["a reordered owner", focusAdapter([BROWSER_TEST_PATHS[2], BROWSER_TEST_PATHS[1]])],
		["an unknown owner", focusAdapter(["tests/system/browser/not-an-owner.test.ts"])],
		["a directory selector", focusAdapter(["tests/system/browser"])],
		["a glob selector", focusAdapter(["tests/system/browser/**/*.test.ts"])],
		["an empty focused selection", `bun ${BROWSER_ADAPTER_PATH} --focus`],
		["a changed flag", focusAdapter([BROWSER_TEST_PATHS[0]]) + " --changed"],
		["a randomize flag", focusAdapter([BROWSER_TEST_PATHS[0]]) + " --randomize"],
		["a shard flag", focusAdapter([BROWSER_TEST_PATHS[0]]) + " --shard=1/2"],
		["an extra positional argument", focusAdapter([BROWSER_TEST_PATHS[0]]) + " extra"],
		[
			"a package-mode flag",
			`bun ${BROWSER_ADAPTER_PATH} --changed ${BROWSER_TEST_PATHS.join(" ")}`,
		],
	])("rejects %s", (_name, command) => {
		expect(() => validateBrowserSelection(command.split(" "))).toThrow();
	});

	test("inventory accepts every package adapter occurrence exactly once", () => {
		const result = inspectTestInventory(adapterInput(packageAdapter));
		expect(result.errors).toEqual([]);
		expect(result.nativeLanes.get("test:serial-browser")).toEqual([...BROWSER_TEST_PATHS]);
	});

	test("inventory rejects a missing package adapter argument", () => {
		const command = `bun ${BROWSER_ADAPTER_PATH} ${BROWSER_TEST_PATHS.slice(0, -1).join(" ")}`;
		expectInventoryError(
			adapterInput(command),
			`browser adapter lane \`test:serial-browser\` is invalid: Package browser lane must name all ${BROWSER_TEST_PATHS.length} canonical paths in order.`,
		);
	});

	test("inventory rejects a repeated focused adapter argument", () => {
		const duplicate = focusAdapter([BROWSER_TEST_PATHS[0], BROWSER_TEST_PATHS[0]]);
		expectInventoryError(
			adapterInput(duplicate, [BROWSER_TEST_PATHS[0]]),
			`browser adapter lane \`test:serial-browser\` is invalid: Browser lane repeats \`${BROWSER_TEST_PATHS[0]}\`.`,
		);
	});

	test("inventory rejects reordered focused adapter arguments", () => {
		const reordered = focusAdapter([BROWSER_TEST_PATHS[1], BROWSER_TEST_PATHS[0]]);
		expect(inspectTestInventory(adapterInput(reordered)).errors[0]).toContain(
			"Focused browser paths are not in canonical relative order.",
		);
	});

	test("inventory rejects an unknown focused adapter argument", () => {
		const unknown = focusAdapter(["tests/system/browser/unknown.test.ts"]);
		expect(inspectTestInventory(adapterInput(unknown)).errors[0]).toContain(
			"Browser lane names unknown path `tests/system/browser/unknown.test.ts`.",
		);
	});

	test("inventory rejects a focused owner outside a declared test lane", () => {
		const file = BROWSER_TEST_PATHS[3];
		const fixture = adapterInput("bun scripts/non-native.mjs", [file]);
		fixture.scripts["verify:browser"] = focusAdapter([file]);
		expectInventoryError(fixture, `native test \`${file}\` belongs to no package lane`);
	});

	test("inventory rejects a focused lane reached twice", () => {
		const file = BROWSER_TEST_PATHS[3];
		const duplicate = adapterInput(focusAdapter([file]), [file]);
		duplicate.scripts.test = "bun run test:serial-browser && bun run test:serial-browser";
		expectInventoryError(
			duplicate,
			`native test \`${file}\` runs 2 times from \`check\` through package lanes: test:serial-browser (2)`,
		);
	});

	test("inventory rejects an ordinary selector repeated in one lane", () => {
		const ordinary = "tests/system/example.test.ts";
		expectInventoryError(
			adapterInput(`bun test ${ordinary} ${ordinary}`, [ordinary]),
			`native test \`${ordinary}\` runs 2 times from \`check\` through package lanes: test:serial-browser (2)`,
		);
	});
});
