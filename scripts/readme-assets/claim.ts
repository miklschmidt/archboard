// Film a subject claim as the shell shows it: the marks arrive with the agent's claim, the selected
// subject says Claimed, and the marks leave when the agent releases the claim after its edit.

import { writeFileSync } from "node:fs";
import { join } from "node:path";
import {
	ArchitectureClaimResultSchema,
	ArchitectureModuleEditResultSchema,
} from "@archboard/model/contract";

import {
	Terminal,
	encodeTake,
	filmTogether,
	moment,
	attachmentFile,
	readmeFile,
	restPointer,
	scratch,
	withTake,
	type Page,
	type Producer,
	type TakeServer,
	// oxlint-disable-next-line archboard/absolute-imports -- scripts/ has no # imports; sibling imports stay relative
} from "./kit.ts";
// oxlint-disable-next-line archboard/absolute-imports -- scripts/ has no # imports; sibling imports stay relative
import { readModel, modelResult } from "./model-authoring.ts";

const MODEL = "Shop";
const SUBJECT = "Checkout API";
/** What the agent plans to change, as it says it when it claims the subject and when it edits. */
const REASON = "Say when Checkout API answers the shopper";
const REQUEST = "Make Checkout API's responsibility say when it answers the shopper.";
/** The responsibility the edit writes: the Right panel's head shows it under the module's name. */
const RESPONSIBILITY = "Takes an order, charges it and answers the shopper once it is saved";
/** The folder the terminal names, and the short names of the inputs the commands read there. */
const FOLDER = "~/shop";
const CLIP = attachmentFile("claim.webp");
const THUMBNAIL = readmeFile("idx-claim.webp");
const TERMINAL_WIDTH = 600;
const PANE = { width: 1320, height: 1080 } as const;
const MARK = "[data-slot='claim-mark']";
const BADGE = "[data-slot='claim-badge']";

/**
 * Whether the shell marks the claim: on the model in the repository menu, on the subject's row in
 * the left column and, when a selection is asked for, in the Right panel's head.
 * @param row The subject's row in the left column.
 * @param badge Whether the head says Claimed.
 * @returns An expression that is true once every mark is on screen.
 */
function marked(row: string, badge: boolean): string {
	const marks = [`[data-slot='repository-switcher'] ${MARK}`, `${row} ${MARK}`];
	const all = badge ? [...marks, BADGE] : marks;
	return all.map((selector) => `!!document.querySelector("${selector}")`).join(" && ");
}

/**
 * Claim the subject through the CLI, and write the inputs of its edit and its release.
 * @param server The isolated take server.
 * @param terminal The filmed command output.
 * @returns The subject, and the inputs of the edit and the release.
 */
async function claimSubject(server: TakeServer, terminal: Terminal) {
	const model = await readModel(server);
	const subject = model.modules.find((module) => module.name === SUBJECT);
	if (subject === undefined) throw new Error(`The example has no ${SUBJECT} module.`);
	const target = { model: model.manifest.id, state: model.manifest.current?.id ?? null };
	const writer = "readme-agent";
	const inputs = scratch("takes", "claim");
	const claimFile = join(inputs, "claim.json");
	writeFileSync(
		claimFile,
		JSON.stringify({
			target,
			writer,
			reason: REASON,
			// An edit of current architecture changes the state and the proposals that inherit from
			// it, so the claim holds them with the module.
			subjects: [
				subject.id,
				...(target.state === null ? [] : [target.state]),
				...model.proposals.map(({ id }) => id),
			],
		}),
	);
	await terminal.command("archboard model claim --input claim.json");
	const claimed = ArchitectureClaimResultSchema.parse(
		modelResult(await server.cli(["model", "claim", "--input", claimFile])),
	);
	if (!claimed.success) throw new Error(JSON.stringify(claimed));
	await terminal.done(`Claimed ${SUBJECT}`);
	const edit = join(inputs, "edit.json");
	writeFileSync(
		edit,
		JSON.stringify({
			target,
			expectedRevision: model.revision,
			operationId: crypto.randomUUID(),
			writer,
			claim: claimed.claim.id,
			changes: [
				{ type: "edit-module", subject: subject.id, set: { responsibility: RESPONSIBILITY } },
			],
		}),
	);
	const release = join(inputs, "release.json");
	writeFileSync(release, JSON.stringify({ claim: claimed.claim.id, writer }));
	return { id: subject.id, edit, release };
}

/**
 * Write the edit under the claim, and require that it lands and that the Right panel shows it.
 * @param server The isolated take server.
 * @param terminal The filmed command output.
 * @param page The shell.
 * @param input The authored edit input.
 */
async function editSubject(server: TakeServer, terminal: Terminal, page: Page, input: string) {
	await terminal.command(`archboard model edit --input edit.json --doing "${REASON}"`);
	const result = ArchitectureModuleEditResultSchema.parse(
		modelResult(await server.cli(["model", "edit", "--input", input, "--doing", REASON])),
	);
	if (!result.success) throw new Error(JSON.stringify(result));
	await terminal.done(`Edited ${SUBJECT}`);
	await page.waitFor(
		`document.querySelector("[data-slot='model-panel']")?.textContent.includes(${JSON.stringify(RESPONSIBILITY)})`,
		"the new responsibility in the Right panel",
	);
}

/**
 * Select the subject's card, and wait for the Right panel to say that it is claimed.
 * @param page The shell.
 * @param row The subject's row in the left column.
 * @returns The card's selector.
 */
async function selectSubject(page: Page, row: string): Promise<string> {
	const card = await page.card(SUBJECT);
	await page.moveTo(await page.centreOf(card), 36);
	await page.click(card, 120);
	await page.waitFor(marked(row, true), `${SUBJECT} selected and marked Claimed`);
	await restPointer(page);
	return card;
}

const claim: Producer = {
	kind: "clip",
	codex: false,
	files: [THUMBNAIL],
	attachments: [CLIP],
	needs: ["chromium", "ffmpeg"],
	plan: [
		"Open the copied canonical shop beside a terminal in an isolated browser.",
		`Claim ${SUBJECT} through the CLI, require its mark in the repository menu and on its row, select it and require Claimed in the Right panel's head.`,
		"Edit its responsibility under the claim and require the Right panel to show it, release the claim, and require every mark to leave.",
		"Encode the two windows as a 1440 px WebP in scratch storage for attachment, and cut the thumbnail around the selected card and Claimed.",
	],
	/**
	 * Film the take and encode it.
	 * @returns Once the files are written.
	 */
	make: async () =>
		withTake("claim", "examples/web-shop", false, async (server, browser) => {
			const terminal = await Terminal.open(browser, "dark", PANE.height, { path: FOLDER });
			const page = await browser.open({
				url: `${server.url}/?modelA=${MODEL}`,
				theme: "dark",
				cursor: true,
				...PANE,
			});
			await page.atRest();
			await page.moveTo({ x: 1100, y: 900 }, 1);
			const take = await filmTogether("claim", [terminal.page, page], async () => {
				await terminal.you(REQUEST);
				const claimed = await claimSubject(server, terminal);
				// A take that fails leaves its claim in the copied vault, which the next take replaces.
				const row = `[data-module-row='${claimed.id}']`;
				await page.waitFor(marked(row, false), `the marks of the claim on ${SUBJECT}`);
				await Bun.sleep(1800);
				const card = await selectSubject(page, row);
				await Bun.sleep(600);
				const shot = await moment(page, [BADGE, card], 960, { x: TERMINAL_WIDTH, y: 0 });
				await Bun.sleep(1600);
				await editSubject(server, terminal, page, claimed.edit);
				await Bun.sleep(1600);
				await terminal.command("archboard model release --input release.json");
				await server.cli(["model", "release", "--input", claimed.release]);
				await terminal.done("Released the claim");
				await page.waitFor(`!document.querySelector("${MARK}, ${BADGE}")`, "the marks gone");
				await terminal.say(
					`${SUBJECT} now says when it answers the shopper. The claim is released, and its marks are gone.`,
				);
				await Bun.sleep(2600);
				return shot;
			});
			await encodeTake(take, {
				clip: CLIP,
				width: 1440,
				leadWithEnd: 1.6,
				hold: 0.8,
				thumbnail: THUMBNAIL,
			});
		}),
};

export { claim };
