// Film one complete canonical proposal through the public CLI, with no model call.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ArchitectureModuleEditSchema, ArchitectureModelReadSchema } from "@archboard/board/model";

import { messagesOf } from "@archboard/board/flow";
import { modelContent, type Model } from "@archboard/board/content";

import {
	Terminal,
	encodeTake,
	filmTogether,
	present,
	attachmentFile,
	withTake,
	type Producer,
	type TakeServer,
	// oxlint-disable-next-line archboard/absolute-imports -- scripts/ has no # imports; sibling imports stay relative
} from "./kit.ts";

// oxlint-disable-next-line archboard/absolute-imports -- scripts/ has no # imports; sibling imports stay relative
import { readModel, editModel, modelResult } from "./model-authoring.ts";

const MODEL = "Shop";
const PROPOSAL = "Off the request path";
const REQUEST =
	"Checkout waits on stock, the card and the receipt email. Propose taking fulfilment off the request path, and show me.";
const CLIP = attachmentFile("hero.webp");
const PANE = { width: 1320, height: 1080 } as const;
const PLACEHOLDER = /^@[NEFSW]:/;

/**
 * The subjects of a variant a placeholder can name, by kind: a list of name and id pairs.
 * @param model The canonical model.
 * @param kind The placeholder's kind.
 * @param key What it names.
 * @returns The subjects it matches.
 */
function matches(model: Model, kind: string, key: string): readonly { id: string }[] {
	const content = modelContent(model);
	if (kind === "N") return content.nodes.filter((node) => node.name === key);
	if (kind === "E") return ownedRelationships(model, key);
	if (kind === "F") return content.flows.filter((flow) => flow.name === key);
	const split = key.indexOf(":");
	const flow = content.flows.find((one) => one.name === key.slice(0, split));
	return messagesOf(flow?.steps ?? []).filter((step) => step.label === key.slice(split + 1));
}

/**
 * A relationship label belongs to its explicit source module.
 * @param model The current canonical reading.
 * @param key The source module name followed by its relationship label.
 * @returns Matching source-owned relationships; ambiguity remains an explicit refusal.
 */
function ownedRelationships(model: Model, key: string) {
	const split = key.indexOf(":");
	const sources = new Set(
		model.modules.filter((module) => module.name === key.slice(0, split)).map(({ id }) => id),
	);
	return model.relationships.filter(
		(relationship) => sources.has(relationship.from) && relationship.label === key.slice(split + 1),
	);
}

/**
 * The id one placeholder names in the model.
 * @param placeholder The placeholder, such as `@N:Place order`.
 * @param model The canonical reading that the change affects.
 * @returns The id.
 * @throws {Error} When it names no subject, or more than one.
 */
function idOf(placeholder: string, model: Model): string {
	const key = placeholder.slice(3);
	const found =
		placeholder.charAt(1) === "W"
			? model.walkthroughs.filter((walkthrough) => walkthrough.name === key)
			: matches(model, placeholder.charAt(1), key);
	const [only, ...more] = found;
	if (only === undefined || more.length > 0) {
		throw new Error(`${placeholder} names ${found.length} subjects of the proposal, not one.`);
	}
	return only.id;
}

/**
 * Fill each id placeholder of a change with its canonical identity.
 * @param value The change, or a part of it.
 * @param model The canonical reading that the change affects.
 * @returns The change with ids.
 */
function filled(value: unknown, model: Model): unknown {
	if (Array.isArray(value)) return value.map((item: unknown) => filled(item, model));
	if (typeof value === "object" && value !== null) {
		return Object.fromEntries(
			Object.entries(value).map(([key, item]) => [key, filled(item, model)]),
		);
	}
	return typeof value === "string" && PLACEHOLDER.test(value) ? idOf(value, model) : value;
}

/**
 * Show the exact arguments that the take executes through its CLI.
 * @param server The isolated source and transport.
 * @param terminal The filmed terminal.
 * @returns The same server with visible command progress.
 */
function filmedCommands(server: TakeServer, terminal: Terminal): TakeServer {
	return {
		...server,
		/**
		 * Show and run one actual command.
		 * @param args The CLI arguments.
		 * @returns Its successful JSON result.
		 */
		cli: async (args) => {
			await terminal.command(["archboard", ...args.map(shellWord)].join(" "));
			const answer = await server.cli(args);
			await terminal.done("Completed");
			await Bun.sleep(700);
			return answer;
		},
	};
}

/**
 * Quote a displayed command argument without changing its shell value.
 * @param value The argument passed to the CLI.
 * @returns Copyable shell syntax.
 */
function shellWord(value: string): string {
	return /^[\w./:@-]+$/u.test(value) ? value : "'" + value.replaceAll("'", "'\\''") + "'";
}

/**
 * Read the authored operation batch and resolve only continuing identities.
 * @param model The current canonical reading.
 * @returns The public operation shapes for one complete proposal.
 */
function proposalChanges(model: Model) {
	const template: unknown = JSON.parse(
		readFileSync(join(import.meta.dir, "hero-change.json"), "utf8"),
	);
	return ArchitectureModuleEditSchema.options[1].shape.changes.parse(filled(template, model));
}

const hero: Producer = {
	kind: "clip",
	codex: false,
	files: [],
	attachments: [CLIP],
	needs: ["chromium", "ffmpeg"],
	plan: [
		"Open the canonical shop model beside a terminal in an isolated take.",
		"Film the actual read, claim, complete proposal edit, release, comparison, and pane commands.",
		"Create the proposal through hero-change.json with continuing IDs from the current public reading.",
		"Encode the two windows as a 1280 px WebP in scratch storage for attachment.",
	],
	/**
	 * Film the public authoring workflow and its resulting proposal.
	 * @returns After the clip is encoded.
	 */
	make: async () =>
		withTake("hero", "examples/web-shop", false, async (server, browser) => {
			const terminal = await Terminal.open(browser, "dark", PANE.height);
			const page = await browser.open({
				url: `${server.url}/?modelA=${MODEL}`,
				theme: "dark",
				...PANE,
			});
			await page.atRest();
			await present(page);
			const commands = filmedCommands(server, terminal);
			const take = await filmTogether("hero", [terminal.page, page], async () => {
				await terminal.you(REQUEST);
				const current = await readModel(commands);
				const result = await editModel(commands, "hero", null, proposalChanges(current), {
					type: "create",
					name: PROPOSAL,
					summary: "Move stock reservations and receipt delivery to a worker.",
				});
				const state = result.target.state!;
				const compared = ArchitectureModelReadSchema.parse(
					modelResult(await commands.cli(["model", "compare", "--state", state])),
				);
				if (!compared.success) throw new Error(JSON.stringify(compared));
				const changed =
					compared.comparison?.subjects.filter((subject) => subject.kind !== "unchanged").length ??
					0;
				await terminal.say(`${changed} subjects differ from current architecture.`);
				await commands.cli(["browser", "show", MODEL, "--state", state, "--pane", "A"]);
				await page.atRest();
				await terminal.say(
					"The proposal is saved and shown against current architecture. Current architecture remains unchanged.",
				);
				await Bun.sleep(2600);
				return null;
			});
			await encodeTake(take, { clip: CLIP, width: 1280, leadWithEnd: 2.2, hold: 1.2 });
		}),
};

export { hero };
