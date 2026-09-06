const BROWSER_ADAPTER_PATH = "tests/system/browser/run-browser-lane.ts";

const BROWSER_TEST_PATHS = [
	"tests/system/browser/fixed-point-document.test.ts",
	"tests/system/browser/malformed-geometry-recovery.test.ts",
	"tests/system/browser/pane-telemetry-recovery.test.ts",
	"tests/system/browser/arrow-binding-differential.test.ts",
	"tests/system/browser/shell-layout.test.ts",
	"tests/system/browser/board-navigator.test.ts",
	"tests/system/browser/fullscreen-presentation.test.ts",
	"tests/system/browser/typed-text.test.ts",
	"tests/system/browser/server-update-ordering.test.ts",
	"tests/system/browser/hold-generation.test.ts",
	"tests/system/browser/human-hold-persistence.test.ts",
	"tests/system/browser/claim-interaction.test.ts",
	"tests/system/browser/human-version-refusal.test.ts",
	"tests/system/browser/selection-inspector.test.ts",
	"tests/system/browser/connected-path-focus.test.ts",
	"tests/system/browser/opener-settings.test.ts",
	"tests/system/browser/code-target-activation.test.ts",
	"tests/system/browser/codex-text-workbench.test.ts",
	"tests/system/browser/codex-live-voice.test.ts",
] as const;

const OPT_IN_BROWSER_TEST_PATHS = [
	"tests/system/browser/human-edit-performance.test.ts",
	"tests/system/browser/live-session-convergence.test.ts",
] as const;

type BrowserTestPath =
	| (typeof BROWSER_TEST_PATHS)[number]
	| (typeof OPT_IN_BROWSER_TEST_PATHS)[number];
const HUMAN_PERFORMANCE_BROWSER_OWNER = OPT_IN_BROWSER_TEST_PATHS[0];
const CI_EXCLUDED_BROWSER_OWNERS_ENV = "ARCHBOARD_CI_EXCLUDED_BROWSER_OWNERS";
const CI_EXCLUDED_BROWSER_OWNERS_VALUE = "all";
interface BrowserSelection {
	mode: "package" | "opt-in" | "focus" | "opt-in-focus";
	files: BrowserTestPath[];
	testName?: string;
}

function selectionError(message: string): never {
	throw new Error(
		`${message}\nUse the complete package command or ` +
			`bun ${BROWSER_ADAPTER_PATH} [--opt-in] --focus <test path>... [--test-name <exact test name>].`,
	);
}

/**
 * What the lane runs. The package command runs the whole inventory; `--focus`
 * runs any subset of it, in the order given, deduplicated. Only what protects
 * against a typo silently running the whole lane is refused: a path that is
 * not an owner, a flag the runner does not know, or `--test-name` without
 * exactly one owner to apply it to (TASK-153).
 */
function validateBrowserSelection(argv: readonly string[]): BrowserSelection {
	if (argv[0] !== "bun" || argv[1] !== BROWSER_ADAPTER_PATH) {
		selectionError(`Browser lane must start with \`bun ${BROWSER_ADAPTER_PATH}\`.`);
	}
	const tail = argv.slice(2);
	const optIn = tail[0] === "--opt-in";
	const scoped = optIn ? tail.slice(1) : tail;
	const focused = scoped[0] === "--focus";
	const mode = focused ? (optIn ? "opt-in-focus" : "focus") : optIn ? "opt-in" : "package";
	const focusArguments = focused ? scoped.slice(1) : scoped;
	const testNameIndex = focusArguments.indexOf("--test-name");
	let selected = focusArguments;
	let testName: string | undefined;
	if (testNameIndex !== -1) {
		if (!focused) {
			selectionError("--test-name is valid only with --focus.");
		}
		if (focusArguments.lastIndexOf("--test-name") !== testNameIndex) {
			selectionError("Focused browser lane repeats --test-name.");
		}
		if (testNameIndex + 2 !== focusArguments.length) {
			selectionError("--test-name requires one exact test name as the final argument.");
		}
		testName = focusArguments[testNameIndex + 1];
		if (!testName || testName.startsWith("-")) {
			selectionError("--test-name requires a non-empty exact test name.");
		}
		selected = focusArguments.slice(0, testNameIndex);
	}
	const unknownFlag = selected.find((token) => token.startsWith("-"));
	if (unknownFlag) {
		selectionError(`Browser lane does not know \`${unknownFlag}\`.`);
	}
	const inventory: readonly string[] = optIn ? OPT_IN_BROWSER_TEST_PATHS : BROWSER_TEST_PATHS;
	const unknown = selected.find((file) => !inventory.includes(file));
	if (unknown) {
		selectionError(
			`\`${unknown}\` is not ${optIn ? "an opt-in" : "a normal"} browser owner. The ${
				optIn ? "opt-in" : "normal"
			} inventory is:\n${inventory.join("\n")}`,
		);
	}
	const files = focused ? Array.from(new Set(selected)) : [...inventory];
	if (focused && files.length === 0) {
		selectionError("Focused browser lane is empty.");
	}
	if (testName && files.length !== 1) {
		selectionError("--test-name requires exactly one focused browser owner.");
	}
	return { mode, files: files as BrowserTestPath[], ...(testName ? { testName } : {}) };
}

function browserOwnerCommandArguments(file: BrowserTestPath, testName?: string): string[] {
	const exactPattern = testName
		? `^${testName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`
		: undefined;
	return [
		"test",
		"--no-orphans",
		"--isolate",
		"--max-concurrency=1",
		...(exactPattern ? ["--test-name-pattern", exactPattern] : []),
		file,
	];
}

function applyCiBrowserOwnerExclusion(
	selection: BrowserSelection,
	environment: Readonly<Record<string, string | undefined>>,
): BrowserSelection {
	const excluded = environment[CI_EXCLUDED_BROWSER_OWNERS_ENV];
	if (excluded === undefined) {
		return selection;
	}
	if (environment["CI"] !== "true") {
		selectionError(`${CI_EXCLUDED_BROWSER_OWNERS_ENV} requires CI=true.`);
	}
	if (selection.mode !== "package") {
		selectionError(`${CI_EXCLUDED_BROWSER_OWNERS_ENV} is valid only for the package browser lane.`);
	}
	if (excluded !== CI_EXCLUDED_BROWSER_OWNERS_VALUE) {
		selectionError(`${CI_EXCLUDED_BROWSER_OWNERS_ENV} cannot exclude \`${excluded}\`.`);
	}
	return {
		...selection,
		files: [],
	};
}

export {
	BROWSER_ADAPTER_PATH,
	BROWSER_TEST_PATHS,
	OPT_IN_BROWSER_TEST_PATHS,
	type BrowserTestPath,
	HUMAN_PERFORMANCE_BROWSER_OWNER,
	CI_EXCLUDED_BROWSER_OWNERS_ENV,
	type BrowserSelection,
	validateBrowserSelection,
	browserOwnerCommandArguments,
	applyCiBrowserOwnerExclusion,
};
