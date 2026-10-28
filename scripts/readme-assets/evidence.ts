// Three live demonstrations over the same small source repository. The terminal summarizes
// actual CLI answers. The browser shows the product's own findings, interfaces and history.

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
	foldSidebars,
	moment,
	readmeFile,
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
const PANE = { width: 1320, height: 1080 } as const;
const FINDINGS = "[data-slot='semantic-inspector-findings']";
const PARTNERS = "[data-slot='semantic-inspector-partners']";

/**
 * Open the example in the actual shell, with the inspector initially folded.
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
	await foldSidebars(page);
	await fit(page);
	return page;
}

/**
 * Scroll a real inspector section into view, without altering its content.
 * @param page The shell.
 * @param selector The section.
 */
async function reveal(page: Page, selector: string): Promise<void> {
	await page.waitFor(`document.querySelector(${JSON.stringify(selector)}) !== null`, selector);
	await page.evaluate(
		`document.querySelector(${JSON.stringify(selector)}).scrollIntoView({block: "center", behavior: "smooth"})`,
	);
	await Bun.sleep(1000);
}

/**
 * Select one part through its drawn title, including when it contains other parts.
 * @param page The shell.
 * @param id The CLI-minted part id.
 * @param pane The pane to select in.
 */
async function selectPart(page: Page, id: string, pane = "A"): Promise<void> {
	await page.click(
		`[data-slot='pane-stage'][data-pane='${pane}'] [data-slot='semantic-board-surface'] [data-semantic-id='${id}'] text`,
	);
	await Bun.sleep(900);
}

/**
 * Pin a floating inspector so the diagram fits beside it.
 * @param page The shell.
 * @param pane The pane that owns the inspector.
 */
async function pinInspector(page: Page, pane = "A"): Promise<void> {
	const control = `[data-slot='pane-stage'][data-pane='${pane}'] [data-slot='semantic-sidebar-pin']`;
	if (await page.evaluate(`document.querySelector(${JSON.stringify(control)}) !== null`)) {
		await page.click(control);
	}
	await Bun.sleep(500);
	await fit(page);
	await Bun.sleep(900);
}

/**
 * Film a missing call and the real source line that supports the finding.
 * @param server The take's server.
 * @param browser The private browser.
 * @param fixture The sample's names and files.
 */
async function filmCode(server: TakeServer, browser: Browser, fixture: Fixture): Promise<void> {
	const terminal = await Terminal.open(browser, "light", PANE.height);
	const page = await openModel(server, browser, fixture.model, PANE.width, fixture.nodes.orders);
	await terminal.say(
		"Find a call that the map leaves out.\nSynthetic checkout example. Live results.",
	);
	const take = await filmTogether("code-evidence", [terminal.page, page], async () => {
		await Bun.sleep(1400);
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
		await page.click("[data-pane='A'] [data-slot='semantic-sidebar-toggle']");
		await page.waitFor(
			"document.querySelector('[data-slot=code-warning-count]')?.getAttribute('data-count') === '1'",
			"one visible code warning",
		);
		await Bun.sleep(2200);
		await page.click("[data-slot='code-warning-count']");
		await reveal(page, FINDINGS);
		await Bun.sleep(1800);
		await pinInspector(page);
		const source = readFileSync(join(fixture.sourceRoot, evidence.path), "utf8");
		const start = Math.max(0, evidence.line - 3);
		await terminal.say("The source supports the warning:");
		await terminal.done(
			...source
				.split("\n")
				.slice(start, evidence.line + 1)
				.map((line, index) => `${index + start + 1}  ${line}`),
		);
		await page.screenshot(join(scratch("takes", "code-evidence"), "evidence.png"));
		const still = await moment(
			page,
			[FINDINGS, `[data-semantic-kind='node'][data-semantic-id='${fixture.nodes.save}']`],
			720,
			{ x: 600, y: 0 },
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
 * Film the same module in two proposals, with both real interface inspectors open.
 * @param server The take's server.
 * @param browser The private browser.
 * @param fixture The sample's names and files.
 */
async function filmInterfaces(
	server: TakeServer,
	browser: Browser,
	fixture: Fixture,
): Promise<void> {
	const page = await openModel(server, browser, fixture.model, 1920);
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
	await foldSidebars(page);
	await fit(page);
	const take = await filmTogether("module-interfaces", [page], async () => {
		await Bun.sleep(2200);
		await page.click("[data-pane='A'] [data-slot='semantic-sidebar-toggle']");
		const left = "[data-slot='pane-stage'][data-pane='A']";
		const right = "[data-slot='pane-stage'][data-pane='B']";
		await page.waitFor(
			`document.querySelector("${left} [data-slot='semantic-inspector-entry-points']")?.getAttribute('data-count') === '3'`,
			"three entry points in Entry per job",
		);
		await reveal(page, `${left} [data-slot='semantic-inspector-interface']`);
		await pinInspector(page, "A");
		await Bun.sleep(3500);
		await page.click("[data-pane='B'] [data-slot='semantic-sidebar-toggle']");
		await page.waitFor(
			`document.querySelector("${right} [data-slot='semantic-inspector-hidden-parts']")?.getAttribute('data-count') === '2'`,
			"two hidden parts in One entry point",
		);
		await reveal(page, `${right} [data-slot='semantic-inspector-interface']`);
		await pinInspector(page, "B");
		await Bun.sleep(2200);
		await page.screenshot(join(scratch("takes", "module-interfaces"), "comparison.png"));
		const still = await moment(page, ["[data-slot='semantic-inspector-interface']"], 960);
		await Bun.sleep(5000);
		return still;
	});
	await encodeTake(take, {
		clip: attachmentFile("module-interfaces.webp"),
		width: 1440,
		thumbnail: readmeFile("idx-module-interfaces.webp"),
	});
}

/**
 * Film recent commits, a pair that changes together, and the branch against its proposal.
 * @param server The take's server.
 * @param browser The private browser.
 * @param fixture The sample's names and files.
 */
async function filmHistory(server: TakeServer, browser: Browser, fixture: Fixture): Promise<void> {
	const terminal = await Terminal.open(browser, "light", PANE.height);
	const page = await openModel(server, browser, fixture.model, PANE.width, fixture.nodes.orders);
	await terminal.say(
		"Read changes through the architecture.\nSynthetic checkout and example Git history.",
	);
	const take = await filmTogether("git-history", [terminal.page, page], async () => {
		await Bun.sleep(1400);
		await selectPart(page, fixture.nodes.validate);
		await reveal(page, PARTNERS);
		await pinInspector(page);
		await terminal.command(`archboard model locality`);
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
		if (pair === undefined)
			throw new Error("The example has no unjoined pair that changes together");
		await terminal.done(
			pair.subjects.map((one) => one.name).join(" + "),
			`${pair.shared} shared commits · ${pair.degree}% of their changes`,
			"No authored relationship joins them.",
		);
		await page.waitFor(
			"document.querySelector('[data-slot=semantic-inspector-partner][data-unjoined=true]') !== null",
			"the pair in the history inspector",
		);
		await Bun.sleep(3200);
		await page.click(`[data-slot='semantic-inspector-partner'][data-part='${fixture.nodes.save}']`);
		await reveal(page, PARTNERS);
		await Bun.sleep(2000);
		await page.screenshot(join(scratch("takes", "git-history"), "history.png"));
		const still = await moment(page, [PARTNERS], 720, { x: 600, y: 0 });
		await terminal.command(
			`archboard model footprint --base ${fixture.base} --state "${fixture.proposals.narrow}"`,
		);
		const footprint = z
			.union([
				ArchitectureHistoryResultSchema.options[1],
				ArchitectureHistoryResultSchema.options[2],
			])
			.parse(
				modelResult(
					await server.cli([
						"model",
						"footprint",
						"--base",
						fixture.base,
						"--state",
						fixture.proposals.narrow,
					]),
				),
			);
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
		await showModel(server, "git-history", "A", {
			model: fixture.model,
			state: fixture.proposals.narrow,
			scope: fixture.nodes.orders,
		});
		await page.atRest();
		await foldSidebars(page);
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
			"Film the live shell, encode a 1440 px lossless WebP, and cut an index still from the demonstrated result. No Codex session runs.",
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
	"Run check code, select its missing-call warning, and read the real source line beside the finding.",
	filmCode,
);
const moduleInterfaces = evidenceProducer(
	"module-interfaces",
	"Show two proposals side by side. Open Orders in both to compare three entry points with one entry point and two hidden parts.",
	filmInterfaces,
);
const gitHistory = evidenceProducer(
	"git-history",
	"Read recent commits and parts that change together, then run model footprint to compare the branch with its proposal.",
	filmHistory,
);

export { codeEvidence, moduleInterfaces, gitHistory };
