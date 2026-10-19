// The hero clip: a person asks for a change, and an agent claims the board, branches a proposal,
// writes the change, compares it with today and shows it, while the pane beside its terminal
// redraws on every write. Every command the terminal shows ran against the server as shown.
//
// The change is hero-change.json, written as an agent writes one: a part, relationship, sequence
// or step that continues names its id, read from the proposal it branched. Here each such id is
// a placeholder, filled in from `semantic show`: @N:<node>, @E:<relationship label>,
// @F:<sequence> and @S:<sequence>:<step label>.

import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";

import { messagesOf } from "@archboard/board/flow-steps";
import { type VariantContent } from "@archboard/board/content";

import {
	Terminal,
	encodeTake,
	filmTogether,
	present,
	readBoard,
	attachmentFile,
	scratch,
	withTake,
	type Producer,
	type TakeServer,
	// oxlint-disable-next-line archboard/absolute-imports -- scripts/ has no alias root; @/ resolves only into src/
} from "./kit.ts";

const BOARD = "Web shop";
const PROPOSAL = "Off the request path";
const REQUEST =
	"Checkout waits on stock, the card and the receipt email. Propose taking fulfilment off the request path, and show me.";
const CLIP = attachmentFile("hero.webp");
const PANE = { width: 1320, height: 1080 } as const;
const PLACEHOLDER = /^@[NEFS]:/;

/**
 * The subjects of a variant a placeholder can name, by kind: a list of name and id pairs.
 * @param content The variant's content.
 * @param kind The placeholder's kind.
 * @param key What it names.
 * @returns The subjects it matches.
 */
function matches(content: VariantContent, kind: string, key: string): readonly { id: string }[] {
	if (kind === "N") return content.nodes.filter((node) => node.name === key);
	if (kind === "E") return content.edges.filter((edge) => edge.label === key);
	if (kind === "F") return content.flows.filter((flow) => flow.name === key);
	const split = key.indexOf(":");
	const flow = content.flows.find((one) => one.name === key.slice(0, split));
	return messagesOf(flow?.steps ?? []).filter((step) => step.label === key.slice(split + 1));
}

/**
 * The id one placeholder names in a variant.
 * @param placeholder The placeholder, such as `@N:Place order`.
 * @param content The variant the change lands on.
 * @returns The id.
 * @throws {Error} When it names no subject, or more than one.
 */
function idOf(placeholder: string, content: VariantContent): string {
	const found = matches(content, placeholder.charAt(1), placeholder.slice(3));
	const [only, ...more] = found;
	if (only === undefined || more.length > 0) {
		throw new Error(`${placeholder} names ${found.length} subjects of the proposal, not one.`);
	}
	return only.id;
}

/**
 * Fill each id placeholder of a change with the id it names in a variant.
 * @param value The change, or a part of it.
 * @param content The variant the change lands on.
 * @returns The change with ids.
 */
function filled(value: unknown, content: VariantContent): unknown {
	if (Array.isArray(value)) return value.map((item: unknown) => filled(item, content));
	if (typeof value === "object" && value !== null) {
		return Object.fromEntries(
			Object.entries(value).map(([key, item]) => [key, filled(item, content)]),
		);
	}
	return typeof value === "string" && PLACEHOLDER.test(value) ? idOf(value, content) : value;
}

/** What a board write answers: the board, at its new version. */
const WriteAnswerSchema = z.object({ board: z.object({ version: z.number() }) });

/**
 * The version a write answered with.
 * @param answer The answer.
 * @returns The board's version.
 */
function versionOf(answer: unknown): number {
	return WriteAnswerSchema.parse(answer).board.version;
}

/**
 * Write the change an agent would write to the proposal it just branched, and say where it is.
 * @param server The take's server.
 * @returns The change's file.
 * @throws {Error} When the proposal is not there.
 */
async function writeChange(server: TakeServer): Promise<string> {
	const board = await readBoard(server, BOARD);
	const proposal = board.variants.find((variant) => variant.name === PROPOSAL);
	if (proposal === undefined) throw new Error(`${BOARD} has no proposal named ${PROPOSAL}.`);
	const template: unknown = JSON.parse(
		readFileSync(join(import.meta.dir, "hero-change.json"), "utf8"),
	);
	const file = join(scratch("takes", "hero"), "change.json");
	writeFileSync(file, `${JSON.stringify(filled(template, proposal.content), null, "\t")}\n`);
	return file;
}

/** How `semantic compare` starts the line that counts what it found besides the interfaces. */
const OTHER_CHANGES = "Other changes: ";

/**
 * The parts and relationships clauses of the counts `semantic compare` says after its
 * interface lines.
 * @param said What the command said on stderr.
 * @returns The clauses, one line each.
 * @throws {Error} When the command said no counts.
 */
function comparedLines(said: string): readonly string[] {
	const counts = said.split("\n").find((line) => line.startsWith(OTHER_CHANGES));
	if (counts === undefined) throw new Error(`semantic compare said no counts: ${said.trim()}`);
	return counts.slice(OTHER_CHANGES.length).split("; ").slice(0, 2);
}

const hero: Producer = {
	kind: "clip",
	codex: false,
	files: [],
	attachments: [CLIP],
	needs: ["chromium", "ffmpeg"],
	plan: [
		`Start an Archboard server over a copy of examples/web-shop; open the agent's terminal page and the shell on ${BOARD}, presented, side by side in a private headless Chromium, dark.`,
		`Film the agent's commands: archboard claim, semantic branch "${PROPOSAL}", semantic edit with scripts/readme-assets/hero-change.json (its ids read from semantic show), semantic compare, browser show and release, while the pane redraws on each write.`,
		"Encode the two windows side by side as a 1280 px lossless WebP at 30 frames a second, opening on its last frame, in the scratch directory to attach by hand.",
	],
	/**
	 * Film the take and encode it.
	 * @returns Once the files are written.
	 */
	make: async () =>
		withTake("hero", "examples/web-shop", false, async (server, browser) => {
			const terminal = await Terminal.open(browser, "dark", PANE.height);
			const page = await browser.open({
				url: `${server.url}/?paneA=${encodeURIComponent(BOARD)}`,
				theme: "dark",
				...PANE,
			});
			await page.atRest();
			await present(page);
			await Bun.sleep(1200);
			const today = (await readBoard(server, BOARD)).version;
			const take = await filmTogether("hero", [terminal.page, page], async () => {
				await Bun.sleep(500);
				await terminal.you(REQUEST);
				await Bun.sleep(700);
				const reason = "proposing to take fulfilment off the request path";
				await terminal.command(`archboard claim --board "${BOARD}" --reason "${reason}"`);
				await server.cli(["claim", "--board", BOARD, "--reason", reason, "--for", "10m"]);
				await terminal.done(`claimed ${BOARD} · every pane now says so`);
				await Bun.sleep(1400);
				const doing = "branching a proposal";
				await terminal.command(
					`archboard semantic branch "${BOARD}" --as "${PROPOSAL}" --expect-version ${today} --doing "${doing}"`,
				);
				const branched = versionOf(
					await server.cli([
						"semantic",
						"branch",
						BOARD,
						"--as",
						PROPOSAL,
						"--expect-version",
						String(today),
						"--doing",
						doing,
					]),
				);
				await terminal.done(`draft "${PROPOSAL}" · version ${branched}`);
				await Bun.sleep(900);
				const change = await writeChange(server);
				const moving = "moving stock and the receipt to a worker";
				await terminal.command(
					`archboard semantic edit "${BOARD}" --variant "${PROPOSAL}" --expect-version ${branched} --doing "${moving}" --input change.json`,
				);
				const edited = versionOf(
					await server.cli([
						"semantic",
						"edit",
						BOARD,
						"--variant",
						PROPOSAL,
						"--expect-version",
						String(branched),
						"--doing",
						moving,
						"--input",
						change,
					]),
				);
				await terminal.done(`version ${edited} · the proposal is saved`);
				await Bun.sleep(500);
				await terminal.command(`archboard semantic compare "${BOARD}" --variant "${PROPOSAL}"`);
				const compared = await server.attempt([
					"semantic",
					"compare",
					BOARD,
					"--variant",
					PROPOSAL,
				]);
				if (compared.status !== 0) {
					throw new Error(`semantic compare exited ${compared.status}: ${compared.stderr.trim()}`);
				}
				await terminal.done(...comparedLines(compared.stderr));
				await Bun.sleep(1200);
				await terminal.command(`archboard browser show "${BOARD}@${PROPOSAL}"`);
				await server.cli(["browser", "show", `${BOARD}@${PROPOSAL}`, "--pane", "primary"]);
				await terminal.done("pane A shows the proposal against today");
				await Bun.sleep(3200);
				await terminal.command(`archboard release --board "${BOARD}"`);
				await server.cli(["release", "--board", BOARD]);
				await terminal.done("released");
				await Bun.sleep(500);
				await terminal.say(
					"Done. The proposal is on your screen, drawn against today: green is new, orange changed, red goes away. Nothing is built until you adopt it.",
				);
				await Bun.sleep(2600);
				return null;
			});
			await encodeTake(take, { clip: CLIP, width: 1280, leadWithEnd: 2.2, hold: 1.2 });
		}),
};

export { hero };
