// Three live demonstrations over the same small source repository. The terminal summarizes
// actual CLI answers. The browser shows the product's own findings, interfaces and history in the
// Right panel of the reader.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";

import { CodeCheckAnswerSchema } from "@archboard/code-intel/code-check";
import { ArchitectureHistoryResultSchema } from "@archboard/code-intel/history";

// oxlint-disable-next-line archboard/absolute-imports -- scripts/ has no # imports; sibling imports stay relative
import { prepareEvidenceFixture, prepareEvidenceSource } from "./evidence-fixture.ts";
// oxlint-disable-next-line archboard/absolute-imports -- scripts/ has no # imports; sibling imports stay relative
import { modelResult, showModel } from "./model-authoring.ts";
import {
	Terminal,
	attachmentFile,
	encodeTake,
	filmTogether,
	fit,
	moment,
	readmeFile,
	restPointer,
	scratch,
	withTake,
	type Browser,
	type Page,
	type Producer,
	type TakeServer,
	// oxlint-disable-next-line archboard/absolute-imports -- scripts/ has no # imports; sibling imports stay relative
} from "./kit.ts";

type Fixture = Awaited<ReturnType<typeof prepareEvidenceFixture>>;
type Scene = (server: TakeServer, browser: Browser, fixture: Fixture) => Promise<void>;

/**
 * The shell beside the terminal. A reader pane narrower than 900 px hides its Right panel until a
 * module is selected, so the shell keeps 1440 px and the terminal the rest of the 1920.
 */
const PANE = { width: 1440, height: 1080 } as const;
const TERMINAL = { width: 480, path: "~/checkout" } as const;
const PANEL = "[data-slot='model-panel']";
const WARNINGS = `${PANEL} [data-slot='code-warning-count']`;
const FINDINGS = `${PANEL} [data-slot='semantic-inspector-findings']`;
const CHANGES_WITH = `${PANEL} [data-slot='model-panel-changes-with']`;
/**
 * The shell with two panes and a Right panel in each. At 1920 px a pane is 735 px wide, and its
 * header cuts the state's name and lets its crumb and its buttons overprint each other, so the
 * two-pane clip films a wider shell, and encodes it at the width it films.
 */
const TWO_PANES = { width: 2560, height: 1080 } as const;
/** Where the shell sits in the stacked clip: right of the terminal. */
const SHELL_AT = { x: TERMINAL.width, y: 0 } as const;

/**
 * Open the example in the actual shell, fitted to its pane.
 * @param server The isolated server.
 * @param browser The private browser.
 * @param model The canonical model identity.
 * @param width The window's width.
 * @param scope The explicit module whose internals the scene shows.
 * @returns The ready page.
 */
async function openModel(
	server: TakeServer,
	browser: Browser,
	model: string,
	width: number,
	scope?: string,
) {
	const page = await browser.open({
		url: `${server.url}/?modelA=${model}${scope === undefined ? "" : `&scopeA=${encodeURIComponent(scope)}`}`,
		theme: "light",
		width,
		height: PANE.height,
		cursor: true,
	});
	await page.atRest();
	await fit(page);
	return page;
}

/**
 * Select one part through its drawn title, including when it contains other parts.
 * @param page The shell.
 * @param id The CLI-minted part id.
 * @param pane The pane to select in.
 */
async function selectPart(page: Page, id: string, pane = "A"): Promise<void> {
	await page.click(
		`[data-slot='pane-stage'][data-pane='${pane}'] [data-slot='canvas-surface'] [data-semantic-id='${id}'] text`,
	);
	await Bun.sleep(900);
}

/**
 * Wait for an element of the page to exist.
 * @param page The shell.
 * @param selector The element.
 * @param label What is waited for.
 */
async function appears(page: Page, selector: string, label: string): Promise<void> {
	await page.waitFor(`document.querySelector(${JSON.stringify(selector)}) !== null`, label);
}

/**
 * Run the code check in the terminal and require the example's resolved missing-call warning.
 * @param server The take's server.
 * @param terminal The filmed terminal.
 * @param fixture The sample's names and files.
 * @returns The source line that supports the warning.
 * @throws {Error} When the example does not produce the warning.
 */
async function checkCode(server: TakeServer, terminal: Terminal, fixture: Fixture) {
	await terminal.command("archboard check code");
	const checked = await server.attempt(["check", "code"]);
	const answer = z.object({ code: CodeCheckAnswerSchema }).parse(JSON.parse(checked.stdout)).code;
	const finding = answer.findings.find((one) => one.code === "RELATIONSHIP_UNDRAWN");
	const evidence = finding?.evidence?.find(
		(one) =>
			one.resolution === "resolved" &&
			one.from === fixture.nodes.place &&
			one.to === fixture.nodes.save,
	);
	if (checked.status !== 1 || finding === undefined || evidence === undefined)
		throw new Error(
			`The example did not produce its resolved missing-call warning: ${checked.stderr}`,
		);
	await terminal.done(finding.code, finding.message, `${evidence.path}:${evidence.line}`);
	return evidence;
}

/**
 * Print the source lines that end at the call a warning rests on.
 * @param terminal The filmed terminal.
 * @param fixture The sample's names and files.
 * @param evidence The call's file and line.
 * @param evidence.path The file, from the source root.
 * @param evidence.line The call's line, counted from one.
 */
async function showSource(
	terminal: Terminal,
	fixture: Fixture,
	evidence: { readonly path: string; readonly line: number },
): Promise<void> {
	const source = readFileSync(join(fixture.sourceRoot, evidence.path), "utf8");
	const start = Math.max(0, evidence.line - 3);
	await terminal.say("The source supports the warning:");
	await terminal.done(
		...source
			.split("\n")
			.slice(start, evidence.line + 1)
			.map((line, index) => `${index + start + 1}  ${line}`),
	);
}

/**
 * Film a missing call: the warning counted in the Right panel, the finding and its source line
 * under Against the code once it is selected, and the real source line in the terminal.
 * @param server The take's server.
 * @param browser The private browser.
 * @param fixture The sample's names and files.
 */
async function filmCode(server: TakeServer, browser: Browser, fixture: Fixture): Promise<void> {
	const terminal = await Terminal.open(browser, "light", PANE.height, TERMINAL);
	const page = await openModel(server, browser, fixture.model, PANE.width, fixture.nodes.orders);
	await terminal.say("Find a call that the map leaves out.\nAn example checkout. Live results.");
	const take = await filmTogether("code-evidence", [terminal.page, page], async () => {
		await Bun.sleep(1400);
		const evidence = await checkCode(server, terminal, fixture);
		await page.waitFor(
			`document.querySelector(${JSON.stringify(WARNINGS)})?.getAttribute('data-count') === '1'`,
			"one code warning counted in the Right panel",
		);
		await Bun.sleep(2200);
		await page.click(WARNINGS);
		await appears(page, FINDINGS, "the finding in the Right panel");
		await restPointer(page);
		await Bun.sleep(1800);
		await showSource(terminal, fixture, evidence);
		await page.screenshot(join(scratch("takes", "code-evidence"), "evidence.png"));
		const still = await moment(
			page,
			[
				"[data-slot='module-details'] > header > h3",
				FINDINGS,
				`[data-semantic-kind='node'][data-semantic-id='${fixture.nodes.save}']`,
			],
			720,
			SHELL_AT,
		);
		await Bun.sleep(4500);
		return still;
	});
	await encodeTake(take, {
		clip: attachmentFile("code-evidence.webp"),
		width: 1440,
		thumbnail: readmeFile("idx-code-evidence.webp"),
	});
}

/**
 * Select Orders in one pane, and wait for its interface in that pane's Right panel.
 * @param page The shell.
 * @param fixture The sample's names and files.
 * @param pane The pane.
 * @param measure The interface count that the pane must show.
 * @param count What the count must be.
 */
async function openInterface(
	page: Page,
	fixture: Fixture,
	pane: string,
	measure: string,
	count: number,
): Promise<void> {
	const stage = `[data-slot='pane-stage'][data-pane='${pane}']`;
	await selectPart(page, fixture.nodes.orders, pane);
	await page.waitFor(
		`document.querySelector("${stage} ${PANEL} [data-measure='${measure}']")?.getAttribute('data-count') === '${count}'`,
		`${count} ${measure} in the interface of pane ${pane}`,
	);
}

/**
 * Film the same module in two proposals, with both real interfaces in their Right panels.
 * @param server The take's server.
 * @param browser The private browser.
 * @param fixture The sample's names and files.
 */
async function filmInterfaces(
	server: TakeServer,
	browser: Browser,
	fixture: Fixture,
): Promise<void> {
	const page = await openModel(server, browser, fixture.model, TWO_PANES.width);
	await server.cli(["browser", "open"]);
	await showModel(server, "module-interfaces", "A", {
		model: fixture.model,
		state: fixture.proposals.wide,
		scope: fixture.nodes.orders,
	});
	await showModel(server, "module-interfaces", "B", {
		model: fixture.model,
		state: fixture.proposals.narrow,
		scope: fixture.nodes.orders,
	});
	await page.atRest(0);
	await page.atRest(1);
	await fit(page);
	const take = await filmTogether("module-interfaces", [page], async () => {
		await Bun.sleep(2200);
		await openInterface(page, fixture, "A", "entryPoints", 3);
		await Bun.sleep(3500);
		await openInterface(page, fixture, "B", "hiddenParts", 2);
		await fit(page);
		await Bun.sleep(2200);
		await page.screenshot(join(scratch("takes", "module-interfaces"), "comparison.png"));
		const still = await moment(
			page,
			["[data-slot='model-panel-interface']", "[data-slot='model-panel-implementation']"],
			960,
		);
		await Bun.sleep(5000);
		return still;
	});
	await encodeTake(take, {
		clip: attachmentFile("module-interfaces.webp"),
		width: TWO_PANES.width,
		thumbnail: readmeFile("idx-module-interfaces.webp"),
	});
}

/**
 * Run `model locality` in the terminal and require the example's pair that changes together with
 * no relationship between them.
 * @param server The take's server.
 * @param terminal The filmed terminal.
 * @param fixture The sample's names and files.
 * @throws {Error} When the example has no such pair.
 */
async function reportPair(server: TakeServer, terminal: Terminal, fixture: Fixture): Promise<void> {
	await terminal.command("archboard model locality");
	const locality = ArchitectureHistoryResultSchema.options[0].parse(
		modelResult(await server.cli(["model", "locality"])),
	);
	const pair = locality.coupling.find(
		(one) =>
			one.unjoined &&
			one.subjects.every((subject) =>
				[fixture.nodes.validate, fixture.nodes.save].includes(subject.id),
			),
	);
	if (pair === undefined) throw new Error("The example has no unjoined pair that changes together");
	await terminal.done(
		pair.subjects.map((one) => one.name).join(" + "),
		`${pair.shared} shared commits · ${pair.degree}% of their changes`,
		"No authored relationship joins them.",
	);
}

/**
 * Run `model footprint` against the proposal and require all three of its categories.
 * @param server The take's server.
 * @param terminal The filmed terminal.
 * @param fixture The sample's names and files.
 * @throws {Error} When the example no longer shows all three.
 */
async function reportFootprint(
	server: TakeServer,
	terminal: Terminal,
	fixture: Fixture,
): Promise<void> {
	const args = ["model", "footprint", "--base", fixture.base, "--state", fixture.proposals.narrow];
	await terminal.command(
		`archboard model footprint --base ${fixture.base} --state "${fixture.proposals.narrow}"`,
	);
	const footprint = z
		.union([ArchitectureHistoryResultSchema.options[1], ArchitectureHistoryResultSchema.options[2]])
		.parse(modelResult(await server.cli(args)));
	if (footprint.proposal === null) throw new Error("The example footprint has no proposal");
	if (
		!footprint.namedAndChanged.some((one) => one.subject.id === fixture.nodes.save) ||
		!footprint.changedNotNamed.some((one) => one.subject.id === fixture.nodes.validate) ||
		!footprint.namedNotChanged.some((one) => one.subject.id === fixture.nodes.replay)
	)
		throw new Error("The example branch no longer demonstrates all three footprint categories");
	await terminal.done(
		`Planned and changed: ${footprint.namedAndChanged.map((one) => one.subject.name).join(", ")}`,
		`Changed outside the plan: ${footprint.changedNotNamed.map((one) => one.subject.name).join(", ")}`,
		`Planned, no code change: ${footprint.namedNotChanged.map((one) => one.subject.name).join(", ")}`,
	);
}

/**
 * Film a pair that changes together, in the Right panel and in the terminal, and the branch
 * against its proposal.
 * @param server The take's server.
 * @param browser The private browser.
 * @param fixture The sample's names and files.
 */
async function filmHistory(server: TakeServer, browser: Browser, fixture: Fixture): Promise<void> {
	const terminal = await Terminal.open(browser, "light", PANE.height, TERMINAL);
	const page = await openModel(server, browser, fixture.model, PANE.width, fixture.nodes.orders);
	await terminal.say(
		"Read changes through the architecture.\nAn example checkout and its Git history.",
	);
	const take = await filmTogether("git-history", [terminal.page, page], async () => {
		await Bun.sleep(1400);
		await selectPart(page, fixture.nodes.validate);
		await appears(page, CHANGES_WITH, "Changes with in the Right panel");
		await reportPair(server, terminal, fixture);
		await appears(page, `${CHANGES_WITH} [data-unjoined='true']`, "the pair in Changes with");
		await Bun.sleep(3200);
		await page.click(`${CHANGES_WITH} [data-part='${fixture.nodes.save}']`);
		await restPointer(page);
		await Bun.sleep(1600);
		await page.screenshot(join(scratch("takes", "git-history"), "history.png"));
		const still = await moment(
			page,
			[
				"[data-slot='module-details'] > header > h3",
				CHANGES_WITH,
				`[data-semantic-kind='node'][data-semantic-id='${fixture.nodes.validate}']`,
				`[data-semantic-kind='node'][data-semantic-id='${fixture.nodes.save}']`,
			],
			720,
			SHELL_AT,
		);
		await reportFootprint(server, terminal, fixture);
		await showModel(server, "git-history", "A", {
			model: fixture.model,
			state: fixture.proposals.narrow,
			scope: fixture.nodes.orders,
		});
		await page.atRest();
		await fit(page);
		await terminal.say("The branch changed Validate order, but the proposal did not name it.");
		await Bun.sleep(5000);
		await page.screenshot(join(scratch("takes", "git-history"), "footprint.png"));
		return still;
	});
	await encodeTake(take, {
		clip: attachmentFile("git-history.webp"),
		width: 1440,
		thumbnail: readmeFile("idx-git-history.webp"),
	});
}

/**
 * Register one scene with the existing filming and attachment workflow.
 * @param name Its manifest name.
 * @param description What the scene demonstrates.
 * @param scene The live browser actions.
 * @returns The producer.
 */
function evidenceProducer(name: string, description: string, scene: Scene): Producer {
	return {
		kind: "clip",
		codex: false,
		files: [readmeFile(`idx-${name}.webp`)],
		attachments: [attachmentFile(`${name}.webp`)],
		needs: ["chromium", "ffmpeg"],
		plan: [
			"Create a synthetic TypeScript checkout with fixed Git commits in the scratch directory. Author its canonical model through the CLI on an isolated server.",
			description,
			"Film the live shell, encode a lossless WebP, and cut an index still from the demonstrated result. No Codex session runs.",
		],
		/**
		 * Run this take on isolated source and canonical inputs.
		 * @returns Once its clip and still are written.
		 */
		make: async () => {
			const directory = await prepareEvidenceSource(name);
			await withTake(name, { directory }, false, async (server, browser) => {
				const fixture = await prepareEvidenceFixture(server, name);
				await scene(server, browser, fixture);
			});
		},
	};
}

const codeEvidence = evidenceProducer(
	"code-evidence",
	"Run check code beside the shell, count its missing-call warning in the Right panel, select it, and read the finding and the real source line.",
	filmCode,
);
const moduleInterfaces = evidenceProducer(
	"module-interfaces",
	"Show two proposals side by side. Select Orders in both to compare three entry points with one entry point and two hidden parts in their Right panels.",
	filmInterfaces,
);
const gitHistory = evidenceProducer(
	"git-history",
	"Select a part, read the parts that change with it in the Right panel, then run model locality and model footprint to compare the branch with its proposal.",
	filmHistory,
);

export { codeEvidence, moduleInterfaces, gitHistory };
