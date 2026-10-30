// Film a canonical subject claim, human take-back, and the former writer's refused edit.

import { writeFileSync } from "node:fs";
import { join } from "node:path";
import {
	ArchitectureClaimResultSchema,
	ArchitectureModuleEditResultSchema,
} from "@archboard/board/model";

import {
	Terminal,
	encodeTake,
	filmTogether,
	moment,
	present,
	attachmentFile,
	readmeFile,
	scratch,
	withTake,
	type Producer,
	type TakeServer,
	// oxlint-disable-next-line archboard/absolute-imports -- scripts/ has no # imports; sibling imports stay relative
} from "./kit.ts";
// oxlint-disable-next-line archboard/absolute-imports -- scripts/ has no # imports; sibling imports stay relative
import { readModel, modelResult } from "./model-authoring.ts";

const MODEL = "Shop";
const REASON = "Explain the checkout responsibility";
const CLIP = attachmentFile("take-back.webp");
const THUMBNAIL = readmeFile("idx-safety.webp");
const TERMINAL_WIDTH = 600;
const PANE = { width: 1320, height: 1080 } as const;
const BANNER = "[data-slot='model-claim']";

/**
 * Claim one actual module and prepare the attempted edit without applying it.
 * @param server The isolated take server.
 * @param terminal The filmed command output.
 * @returns The exact attempted edit and original revision.
 */
async function claimCheckout(server: TakeServer, terminal: Terminal) {
	const model = await readModel(server);
	const subject = model.modules.find((module) => module.name === "Checkout API");
	if (subject === undefined) throw new Error("The example has no Checkout API module.");
	const target = { model: model.manifest.id, state: model.manifest.current?.id ?? null };
	const writer = "readme-agent";
	const claimFile = join(scratch("takes", "take-back"), "claim.json");
	writeFileSync(
		claimFile,
		JSON.stringify({ target, writer, reason: REASON, subjects: [subject.id] }),
	);
	await terminal.command(`archboard model claim --input '${claimFile}'`);
	const claimed = ArchitectureClaimResultSchema.parse(
		modelResult(await server.cli(["model", "claim", "--input", claimFile])),
	);
	if (!claimed.success) throw new Error(JSON.stringify(claimed));
	await terminal.done(`Claimed ${subject.name}`);
	const input = join(scratch("takes", "take-back"), "edit.json");
	writeFileSync(
		input,
		JSON.stringify({
			target,
			subject: subject.id,
			expectedRevision: model.revision,
			operationId: crypto.randomUUID(),
			writer,
			claim: claimed.claim.id,
			description: "Accept checkout requests and coordinate the order response.",
		}),
	);
	const release = join(scratch("takes", "take-back"), "release.json");
	writeFileSync(release, JSON.stringify({ claim: claimed.claim.id, writer }));
	return { input, release, revision: model.revision.digest };
}

/**
 * Run the former intent and require the actual revocation refusal.
 * @param server The isolated take server.
 * @param terminal The filmed command output.
 * @param input The authored edit input.
 * @param revision The architecture before the claim.
 */
async function refusedEdit(
	server: TakeServer,
	terminal: Terminal,
	input: string,
	revision: string,
) {
	await terminal.command(`archboard model edit --input '${input}' --doing '${REASON}'`);
	const refused = await server.attempt(["model", "edit", "--input", input, "--doing", REASON]);
	const result = ArchitectureModuleEditResultSchema.parse(modelResult(JSON.parse(refused.stdout)));
	if (refused.status !== 2 || result.success || result.code !== "CLAIM_REVOKED") {
		throw new Error(`The former intent did not refuse with CLAIM_REVOKED: ${refused.stdout}`);
	}
	if ((await readModel(server)).revision.digest !== revision) {
		throw new Error("The refused intent changed the authored architecture.");
	}
	await terminal.refused(result.code, ...result.diagnostics.map(({ message }) => message));
}

const takeBack: Producer = {
	kind: "clip",
	codex: false,
	files: [THUMBNAIL],
	attachments: [CLIP],
	needs: ["chromium", "ffmpeg"],
	plan: [
		"Open the copied canonical shop beside a terminal in an isolated browser.",
		"Claim Checkout API, press Take back control, then attempt the former edit through the CLI.",
		"Require CLAIM_REVOKED and the unchanged authored revision before encoding the clip and claim thumbnail.",
	],
	/**
	 * Film the take and encode it.
	 * @returns Once the files are written.
	 */
	make: async () =>
		withTake("take-back", "examples/web-shop", false, async (server, browser) => {
			const terminal = await Terminal.open(browser, "dark", PANE.height);
			const page = await browser.open({
				url: `${server.url}/?modelA=${MODEL}`,
				theme: "dark",
				cursor: true,
				...PANE,
			});
			await page.atRest();
			await present(page);
			await page.moveTo({ x: 1100, y: 700 }, 1);
			const take = await filmTogether("take-back", [terminal.page, page], async () => {
				await terminal.you("Explain the checkout responsibility in the architecture.");
				const intent = await claimCheckout(server, terminal);
				try {
					await page.waitFor(`!!document.querySelector("${BANNER} button")`, "the subject claim");
					await Bun.sleep(1600);
					const claimed = await moment(page, [BANNER], 960, { x: TERMINAL_WIDTH, y: 0 });
					await page.click(`${BANNER} [data-slot='model-take-back']`, 420);
					await page.waitFor(`!document.querySelector("${BANNER}")`, "the claim removed");
					await refusedEdit(server, terminal, intent.input, intent.revision);
					await terminal.say(
						"You took control back. The former edit was refused. The architecture is unchanged.",
					);
					await Bun.sleep(2600);
					return claimed;
				} finally {
					await server.cli(["model", "release", "--input", intent.release]);
				}
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

export { takeBack };
