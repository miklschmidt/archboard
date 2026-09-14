import { expect, test } from "bun:test";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { DEFAULT_SEMANTIC_POLICY } from "@/shared/semantic-policy/index";

import { createJsonRequester } from "../support/http.ts";
import { startOwnedCanvas } from "../support/owned-canvas.ts";
import {
	browserTestRoots,
	canvasTestEnvironment,
	createAgentBrowser,
	pollUntil,
	registerCanvasBase,
	type AgentBrowserSession,
} from "./support/agent-browser.ts";
import { serverPath } from "./support/navigator-support.ts";

/** How long any one thing here is waited for. */
const WAIT = { timeoutMs: 6_000 } as const;

/** The stage one semantic pane draws into. */
const STAGE = "[data-slot='semantic-board-stage']";

/** The element the camera moves. */
const SURFACE = "[data-slot='semantic-board-surface']";

/** The panel beside the diagram. */
const INSPECTOR = "[data-slot='semantic-inspector']";

/**
 * Which of the pane's states is on screen.
 * @param browser The page.
 * @returns The `data-state`, or null before the pane is there.
 */
const stageState = (browser: AgentBrowserSession): Promise<string | null> =>
	browser.eval<string | null>(
		`document.querySelector("${STAGE}")?.getAttribute("data-state") ?? null`,
	);

/**
 * What the browser actually paints one relationship with: the ink of the line,
 * of the band behind it, of the arrowhead it references, and of its dots.
 *
 * Computed styles and a resolved marker, not attributes, because the question
 * is what a person sees — an attribute a stylesheet overrode would pass a
 * reading of the markup and fail the reader.
 * @param browser The page.
 * @param id The relationship's semantic id.
 * @returns The four inks, each as the browser resolves it.
 */
const edgeInks = (
	browser: AgentBrowserSession,
	id: string,
): Promise<{ line: string; band: string; head: string; streams: string[] }> =>
	browser.eval(
		`(() => {` +
			` const group = document.querySelector("${SURFACE} [data-semantic-id='${id}']");` +
			` const paths = [...group.querySelectorAll(":scope > path")];` +
			` const line = paths.find((path) => path.getAttribute("marker-end") !== null);` +
			` const band = paths.find((path) => path !== line && !path.classList.contains("ab-halo") && !path.classList.contains("ab-pulse"));` +
			` const marker = "#" + line.getAttribute("marker-end").slice(5, -1);` +
			` const head = document.querySelector(marker + " path");` +
			` return {` +
			`  line: getComputedStyle(line).stroke,` +
			`  band: getComputedStyle(band).stroke,` +
			`  head: getComputedStyle(head).fill === "none"` +
			`   ? getComputedStyle(head).stroke : getComputedStyle(head).fill,` +
			`  streams: [...group.querySelectorAll("path.ab-pulse")].map((path) => getComputedStyle(path).stroke),` +
			` }; })()`,
	);

/**
 * The ink one card's icon tile is drawn in, or null while the card is not there.
 *
 * Null rather than a throw, because the surface is remounted whenever a new
 * picture arrives — a render that lands between a click and this question would
 * otherwise fail the owner for a reason that has nothing to do with what it is
 * about. `iconInk` waits for the card instead.
 * @param browser The page.
 * @param name What the card says.
 * @returns The tile's stroke as the browser resolves it, or null.
 */
const drawnIconInk = (browser: AgentBrowserSession, name: string): Promise<string | null> =>
	browser.eval<string | null>(
		`(() => {` +
			` const card = [...document.querySelectorAll("${SURFACE} [data-semantic-kind='node']")]` +
			`  .find((group) => group.textContent.includes(${JSON.stringify(name)}));` +
			` if (card === undefined) { return null; }` +
			` const tile = [...card.querySelectorAll("rect")].find((rect) => rect.getAttribute("rx") === "5");` +
			` return tile === undefined ? null : getComputedStyle(tile).stroke; })()`,
	);

/**
 * The same, waited for.
 * @param browser The page.
 * @param name What the card says.
 * @returns The ink.
 */
const iconInk = async (browser: AgentBrowserSession, name: string): Promise<string> => {
	const ink = await pollUntil(
		() => drawnIconInk(browser, name),
		(found) => found !== null,
		`the icon on the card for "${name}" to be drawn`,
		WAIT,
	);
	return ink ?? "";
};

/**
 * Whether a subject's group carries the warning badge, and whether the reader's
 * own ring is lit on it.
 * @param browser The page.
 * @param id The subject's semantic id.
 * @returns The two, read off the same group.
 */
const marksOn = (
	browser: AgentBrowserSession,
	id: string,
): Promise<{ warned: boolean; attended: boolean }> =>
	browser.eval(
		`(() => {` +
			` const groups = [...document.querySelectorAll("${SURFACE} [data-semantic-id='${id}']")];` +
			` return {` +
			`  warned: groups.some((group) => group.querySelector("path[d^='M0,-5.2']") !== null),` +
			`  attended: groups.some((group) => group.classList.contains("is-selected")),` +
			` }; })()`,
	);

/**
 * Pick a subject out of the diagram the way a person does: press on the shape,
 * release and click on the viewport, because a browser retargets a click to
 * whichever element holds the pointer.
 * @param browser The page.
 * @param id The semantic id to pick.
 * @returns Settles once the click has been delivered.
 */
const pick = (browser: AgentBrowserSession, id: string): Promise<unknown> =>
	browser.eval(
		`(() => {` +
			` const card = document.querySelector("${SURFACE} [data-semantic-id='${id}']");` +
			` const view = document.querySelector("[data-slot='semantic-board-viewport']");` +
			` const at = card.getBoundingClientRect();` +
			` const where = { pointerId: 1, isPrimary: true, button: 0, bubbles: true,` +
			`   clientX: Math.round(at.x + at.width / 2), clientY: Math.round(at.y + at.height / 2) };` +
			` card.dispatchEvent(new PointerEvent("pointerdown", where));` +
			` view.dispatchEvent(new PointerEvent("pointerup", where));` +
			` view.dispatchEvent(new MouseEvent("click", where)); })()`,
	);

/**
 * Whether the words on one relationship are on top of every dot on the page,
 * as the browser itself resolves it.
 *
 * Every dot, not only the ones riding this relationship: routes cross, and a
 * picture where each relationship carried its own words would decide a crossing
 * by whichever of the two was drawn second. `compareDocumentPosition` answers
 * the painting order, and `elementFromPoint` answers what a person's pointer
 * would find over the words.
 * @param browser The page.
 * @param id The relationship's or message's semantic id.
 * @returns What is hit at the centre of the pill, how many traffic marks there are, and whether all are painted first.
 */
const overThePill = (
	browser: AgentBrowserSession,
	id: string,
): Promise<{ hit: string; traffic: number; trafficFirst: boolean }> =>
	browser.eval(
		`(() => {` +
			` const pill = [...document.querySelectorAll("${SURFACE} [data-semantic-id='${id}'] rect")]` +
			`  .find((rect) => !rect.classList.contains("ab-halo"));` +
			` const traffic = [...document.querySelectorAll("${SURFACE} .ab-pulse")];` +
			` const at = pill.getBoundingClientRect();` +
			` const under = document.elementFromPoint(` +
			`   Math.round(at.x + at.width / 2), Math.round(at.y + at.height / 2));` +
			` return {` +
			`  hit: under === null ? "nothing" : under.tagName.toLowerCase() +` +
			`   (under.classList.contains("ab-pulse") ? ".ab-pulse" : ""),` +
			`  traffic: traffic.length,` +
			`  trafficFirst: traffic.length > 0 && traffic.every((mark) =>` +
			`   (pill.compareDocumentPosition(mark) & Node.DOCUMENT_POSITION_PRECEDING) !== 0),` +
			` }; })()`,
	);

test("a reader sees what changed, what belongs together and what is unsettled", async () => {
	await using resources = new AsyncDisposableStack();
	const { ownerRoot } = browserTestRoots();
	const vault = join(ownerRoot, "semantic-legibility-vault");
	mkdirSync(join(vault, ".archboard"), { recursive: true });
	const policy = structuredClone(DEFAULT_SEMANTIC_POLICY);
	policy.nodeKinds["route"]!.color = "blue";
	policy.nodeKinds["queue"]!.color = "green";
	policy.nodeKinds["datastore"]!.color = "amber";
	policy.groups = { "write-path": { name: "the write path" }, payments: { name: "payments" } };
	writeFileSync(join(vault, ".archboard/config.yaml"), Bun.YAML.stringify(policy));
	const canvas = await startOwnedCanvas({ serverPath, vault, env: canvasTestEnvironment() });
	resources.defer(() => canvas.dispose());
	registerCanvasBase(canvas.base);
	const request = createJsonRequester(canvas);

	// The architecture as it stands: two parts of one effort, one of another,
	// one relationship carrying traffic with words on it, and one exchange.
	expect(
		(
			await request<{ success: boolean }>("/api/semantic-boards/create", {
				method: "POST",
				doing: "drawing the write path",
				body: {
					board: "legible",
					origin: "agent",
					create: {
						level: "system",
						variant: "As built",
						nodes: [
							{ name: "Gateway", kind: "route", groups: ["write-path"] },
							{
								name: "Writer",
								kind: "module",
								groups: ["write-path"],
								responsibility: "Takes the lease",
							},
							{ name: "Ledger", kind: "datastore", groups: ["payments"] },
						],
						edges: [
							{
								from: "Gateway",
								to: "Writer",
								kind: "call",
								label: "hands it over",
								emphasis: "hero",
								traffic: {},
							},
							{
								from: "Writer",
								to: "Ledger",
								kind: "data",
								label: "writes",
								traffic: {},
							},
						],
						flows: [
							{
								name: "One write",
								participants: ["Gateway", "Writer"],
								steps: [
									{ from: "Gateway", to: "Writer", label: "asks", kind: "sync" },
									{ from: "Writer", to: "Gateway", label: "the version", kind: "return" },
								],
							},
						],
						views: [
							{ name: "The parts", grammar: "architecture" },
							{ name: "In order", grammar: "data-flow" },
						],
					},
				},
			})
		).status,
	).toBe(200);

	/**
	 * The board's version right now, which every write has to state.
	 * @returns The version.
	 */
	const version = async (): Promise<number> => {
		const read = await request<{ board: { version: number } }>(
			"/api/semantic-boards/board?board=legible",
		);
		expect(read.status, "the board could not be read back").toBe(200);
		return read.body.board.version;
	};

	/**
	 * The id the board minted for the relationship carrying these words.
	 *
	 * Read back rather than assumed, which is what an agent does too: a write
	 * that names a subject names it by the id the board gave it.
	 * @param label What the relationship says.
	 * @returns Its semantic id.
	 */
	const edgeCalled = async (label: string): Promise<string> => {
		const read = await request<{
			board: { variants: { content: { edges: { id: string; label?: string }[] } }[] };
		}>("/api/semantic-boards/board?board=legible");
		const found = read.body.board.variants
			.flatMap((variant) => variant.content.edges)
			.find((edge) => edge.label === label);
		expect(found, `no relationship says "${label}"`).toBeDefined();
		return found!.id;
	};

	// A proposal, and three different things done to it: a part reworded, a part
	// added, a relationship dropped.
	expect(
		(
			await request(`/api/semantic-boards/branch?expectVersion=${await version()}`, {
				method: "POST",
				doing: "proposing a queue",
				body: { board: "legible", origin: "agent", branch: { from: "As built", name: "Proposed" } },
			})
		).status,
	).toBe(200);
	expect(
		(
			await request(`/api/semantic-boards/edit?expectVersion=${await version()}`, {
				method: "POST",
				doing: "putting a queue in front",
				body: {
					board: "legible",
					origin: "agent",
					edit: {
						variant: "Proposed",
						nodes: [
							{
								name: "Writer",
								kind: "module",
								groups: ["write-path"],
								responsibility: "Drains the queue",
							},
							{ name: "Queue", kind: "queue", groups: ["write-path"] },
						],
						edges: [
							{
								from: "Gateway",
								to: "Queue",
								kind: "queue",
								label: "enqueues",
								traffic: {},
							},
						],
						removeEdges: [await edgeCalled("writes")],
					},
				},
			})
		).status,
	).toBe(200);

	// And then the architecture it was derived from moves under it, in a way
	// nobody can settle automatically: the same part, reworded differently.
	expect(
		(
			await request(`/api/semantic-boards/edit?expectVersion=${await version()}`, {
				method: "POST",
				doing: "rewording the writer as built",
				body: {
					board: "legible",
					origin: "agent",
					edit: {
						variant: "As built",
						nodes: [
							{
								name: "Writer",
								kind: "module",
								groups: ["write-path"],
								responsibility: "Writes the note",
							},
						],
					},
				},
			})
		).status,
	).toBe(200);

	const browser = resources.use(await createAgentBrowser());
	await browser.run(["open", `${canvas.base}/?paneA=legible@Proposed`]);
	await browser.run(["set", "viewport", "1920", "1080"]);
	await pollUntil(
		() => stageState(browser),
		(state) => state === "drawn",
		"the proposal to be drawn in its pane",
		WAIT,
	);

	// The ids the board minted, found the way a viewer finds them.
	const ids = await browser.eval<Record<string, string>>(
		`(() => {` +
			` const found = {};` +
			` for (const group of document.querySelectorAll("${SURFACE} [data-semantic-id]")) {` +
			`   const words = group.textContent.trim();` +
			`   if (words.includes("Writer")) found.writer = group.dataset.semanticId;` +
			`   if (words.includes("Queue")) found.queue = group.dataset.semanticId;` +
			`   if (words === "hands it over") found.hero = group.dataset.semanticId;` +
			`   if (words === "enqueues") found.added = group.dataset.semanticId;` +
			`   if (words === "writes") found.gone = group.dataset.semanticId; }` +
			` return found; })()`,
	);
	expect(Object.keys(ids).toSorted()).toEqual(["added", "gone", "hero", "queue", "writer"]);

	// One ink from end to end. The band behind the line was already coloured;
	// what a reader could not see is that the line, its arrowhead and its dots
	// belonged to it rather than being grey scenery over the top.
	const added = await edgeInks(browser, ids["added"] ?? "");
	expect(added.line).toBe(added.band);
	expect(added.head).toBe(added.line);
	expect(added.streams.length).toBe(1);
	for (const stream of added.streams) {
		expect(stream).toBe(added.line);
	}
	// A relationship the proposal dropped is still drawn, in its own ink, and
	// sends nothing: a removed line that looked like live traffic would be the
	// picture claiming the proposal still has it.
	const gone = await edgeInks(browser, ids["gone"] ?? "");
	expect(gone.line).toBe(gone.band);
	expect(gone.head).toBe(gone.line);
	expect(gone.streams).toHaveLength(0);
	expect(gone.line).not.toBe(added.line);

	// The words on a relationship are on top of the dots crossing it.
	const words = await overThePill(browser, ids["hero"] ?? "");
	expect(words.traffic).toBeGreaterThan(0);
	expect(words.trafficFirst).toBe(true);
	expect(words.hit).not.toBe("path.ab-pulse");

	// Configured types keep distinct chips even when the nodes share a group.
	const writePath = await iconInk(browser, "Gateway");
	expect(await iconInk(browser, "Queue")).not.toBe(writePath);
	expect(await iconInk(browser, "Ledger")).not.toBe(writePath);

	// What nobody has decided is on the card, with nothing selected — and
	// picking that very card out shows both marks at once, which is the case a
	// single mark per subject used to lose.
	await pollUntil(
		() => marksOn(browser, ids["writer"] ?? ""),
		(marks) => marks.warned && !marks.attended,
		"the unsettled part to be badged before anybody picks anything",
		WAIT,
	);
	await pick(browser, ids["writer"] ?? "");
	await pollUntil(
		() => marksOn(browser, ids["writer"] ?? ""),
		(marks) => marks.warned && marks.attended,
		"the same part to be both badged and ringed once it is picked out",
		WAIT,
	);
	// And the badge is cashed in for words where the reader clicked.
	await pollUntil(
		() => browser.eval<string>(`document.querySelector("${INSPECTOR}")?.textContent ?? ""`),
		(said) => said.includes("Nobody has decided this yet") && said.includes("the write path"),
		"the inspector to explain the warning and name the group",
		WAIT,
	);

	// The other grammar, told in the same language: the plate is over the dots.
	await browser.eval(
		`[...document.querySelectorAll("[data-slot='semantic-view-choice']")]` +
			`.find((button) => button.textContent.trim() === "In order").click()`,
	);
	await pollUntil(
		() =>
			browser.eval<number>(
				`document.querySelectorAll("${SURFACE} [data-semantic-kind='step']").length`,
			),
		(steps) => steps > 0,
		"the exchange to be drawn",
		WAIT,
	);
	const stepId = await browser.eval<string>(
		`document.querySelector("${SURFACE} [data-semantic-kind='step']").dataset.semanticId`,
	);
	const message = await overThePill(browser, stepId);
	expect(message.traffic).toBeGreaterThan(0);
	expect(message.trafficFirst).toBe(true);
	expect(message.hit).not.toBe("circle.ab-pulse");

	// And all of it again on the other ground. The inks change, because they are
	// picked for the ground they are drawn on; what they say does not.
	const lightIcon = await iconInk(browser, "Gateway");
	await browser.eval(`document.querySelector("[aria-label='Switch to dark theme']").click()`);
	await pollUntil(
		() => iconInk(browser, "Gateway"),
		(ink) => ink !== lightIcon,
		"the picture to be redrawn on the dark ground",
		WAIT,
	);
	await browser.eval(
		`[...document.querySelectorAll("[data-slot='semantic-view-choice']")]` +
			`.find((button) => button.textContent.trim() === "The parts").click()`,
	);
	await pollUntil(
		() =>
			browser.eval<number>(
				`document.querySelectorAll("${SURFACE} [data-semantic-kind='edge']").length`,
			),
		(edges) => edges > 0,
		"the architecture to be drawn again",
		WAIT,
	);
	const darkAdded = await edgeInks(browser, ids["added"] ?? "");
	expect(darkAdded.line).toBe(darkAdded.band);
	expect(darkAdded.head).toBe(darkAdded.line);
	expect(darkAdded.line).not.toBe(added.line);
	const darkWritePath = await iconInk(browser, "Gateway");
	expect(await iconInk(browser, "Queue")).not.toBe(darkWritePath);
	expect(await iconInk(browser, "Ledger")).not.toBe(darkWritePath);

	await canvas.assertRunning();
}, 90_000);
