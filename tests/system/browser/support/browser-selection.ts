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

const ALL_BROWSER_TEST_PATHS = [...BROWSER_TEST_PATHS, ...OPT_IN_BROWSER_TEST_PATHS] as const;
const PATH_INDEX = new Map<string, number>(
	ALL_BROWSER_TEST_PATHS.map((file, index) => [file, index]),
);

function selectionError(message: string): never {
	throw new Error(
		`${message}\nUse the complete package command or ` +
			`bun ${BROWSER_ADAPTER_PATH} [--opt-in] --focus <canonical test path> [--test-name <exact test name>].`,
	);
}

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
		if (selected.length !== 1) {
			selectionError("--test-name requires exactly one focused browser owner.");
		}
	}
	if (focused && selected.length === 0) {
		selectionError("Focused browser lane is empty.");
	}
	if (selected.some((token) => token.startsWith("-"))) {
		selectionError("Browser lane accepts no extra flags.");
	}
	const indices = selected.map((file) => PATH_INDEX.get(file));
	const unknown = selected.find((_, index) => indices[index] === undefined);
	if (unknown) {
		selectionError(`Browser lane names unknown path \`${unknown}\`.`);
	}
	const duplicate = selected.find((file, index) => selected.indexOf(file) !== index);
	if (duplicate) {
		selectionError(`Browser lane repeats \`${duplicate}\`.`);
	}
	const inventory = optIn ? OPT_IN_BROWSER_TEST_PATHS : BROWSER_TEST_PATHS;
	if (selected.some((file) => !inventory.includes(file as never))) {
		selectionError(
			`${optIn ? "Opt-in" : "Normal"} browser lane names a path from the other inventory.`,
		);
	}
	for (let index = 1; index < indices.length; index += 1) {
		if ((indices[index - 1] ?? -1) >= (indices[index] ?? -1)) {
			selectionError("Focused browser paths are not in canonical relative order.");
		}
	}
	if (
		!focused &&
		(selected.length !== inventory.length ||
			selected.some((file, index) => file !== inventory[index]))
	) {
		selectionError(
			`${optIn ? "Opt-in" : "Package"} browser lane must name all ${inventory.length} canonical paths in order.`,
		);
	}
	return { mode, files: selected as BrowserTestPath[], ...(testName ? { testName } : {}) };
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
