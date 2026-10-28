// Film exact original readings through canonical aliases and their retained decision metadata.

import { ArchitectureModelReadSchema, type ArchitectureModelRead } from "@archboard/board/model";

import {
	encodeTake,
	filmTogether,
	inOrder,
	now,
	present,
	attachmentFile,
	readmeFile,
	stageUrl,
	withTake,
	type Moment,
	type Producer,
	type TakeServer,
	// oxlint-disable-next-line archboard/absolute-imports -- scripts/ has no # imports; sibling imports stay relative
} from "./kit.ts";
// oxlint-disable-next-line archboard/absolute-imports -- scripts/ has no # imports; sibling imports stay relative
import { modelResult, showModel } from "./model-authoring.ts";

const ORIGINAL = "Renderer layout";
type Model = Extract<ArchitectureModelRead, { success: true }>;
const CLIP = attachmentFile("history.webp");
const THUMBNAIL = readmeFile("idx-history.webp");
const CLIP_WIDTH = 960;
const PANE = { width: 1440, height: 900 } as const;
const STRIP = { width: 1440, height: 180 } as const;

/** The thumbnail: the lower 16:9 part of the pane above the strip, which holds the strip. */
const LOWER_PART = { x: 0, y: PANE.height + STRIP.height - 810, width: 1440, height: 810 };

/** The longest reason the strip quotes whole. */
const LONGEST_QUOTE = 100;

/** One state of the board on the timeline. */
interface Stop {
	readonly id: string;
	readonly name: string;
	readonly lifecycle: string;
	readonly label: string;
	readonly why: string;
}

/**
 * A reason as the strip quotes it: whole, or cut at a word with an ellipsis.
 * @param reason The reason the board file records.
 * @returns The quotation.
 */
function quoted(reason: string): string {
	if (reason.length <= LONGEST_QUOTE) return `“${reason}”`;
	const cut = reason.slice(0, reason.lastIndexOf(" ", LONGEST_QUOTE));
	return `“${cut} …”`;
}

/**
 * Read an exact original address through the installed migration catalogue.
 * @param server The copied model and its restored archive.
 * @param address The captured original address.
 * @returns The complete original coverage and its history.
 */
async function readOriginal(server: TakeServer, address: string): Promise<Model> {
	const model = ArchitectureModelReadSchema.parse(
		modelResult(await server.cli(["model", "read", "--legacy-address", address])),
	);
	if (!model.success) throw new Error(JSON.stringify(model));
	if (model.migrationPreview?.selected === undefined)
		throw new Error("The alias did not resolve original coverage.");
	return model;
}

/**
 * Keep each original state and its decision separate from repository-wide history.
 * @param model The original reading and its captured history catalogue.
 * @returns Original current and historical states in their authored order.
 */
function stopsOf(model: Model): readonly Stop[] {
	const source = model.migrationPreview!;
	return (source.history ?? [])
		.filter((entry) => entry.board === source.selected!.board)
		.filter(({ state }) => state.lifecycle === "historical" || state.lifecycle === "current")
		.map(({ state, adoptions }) => {
			const adoption = adoptions?.[0];
			const reason = adoption?.reason;
			const day = adoption?.at.slice(0, 10);
			return {
				id: state.id,
				name: state.name,
				lifecycle: state.lifecycle,
				label:
					day === undefined
						? `${state.lifecycle} · first retained state`
						: `${state.lifecycle} · adopted ${day}`,
				why: reason === undefined ? "" : quoted(reason),
			};
		});
}

const history: Producer = {
	kind: "clip",
	codex: false,
	files: [THUMBNAIL],
	attachments: [CLIP],
	needs: ["chromium", "ffmpeg"],
	plan: [
		`Start an Archboard server over a copy of .archboard/vault, and read the states of "${ORIGINAL}", their adoption dates and reasons through model read and its retained catalogue.`,
		`Open the shell on the first state in a private headless Chromium at ${PANE.width}x${PANE.height}, dark, show only its original subjects and present the pane; open the timeline strip beside it at ${STRIP.width}x${STRIP.height}.`,
		"Film archboard browser show moving the pane to each later state while the strip lights it.",
		`Encode the pane above the strip as a ${CLIP_WIDTH} px lossless WebP at 30 frames a second, in the scratch directory to attach by hand, and cut ${THUMBNAIL} from the second state.`,
	],
	/**
	 * Film the take and encode it.
	 * @returns Once the files are written.
	 */
	make: async () =>
		withTake("history", ".archboard/vault", false, async (server, browser) => {
			const original = await readOriginal(server, ORIGINAL);
			const stops = stopsOf(original);
			const [first, next] = stops;
			if (first === undefined || next === undefined) {
				throw new Error(`${ORIGINAL} has fewer than two states, so it has no history to show.`);
			}
			const strip = await browser.open({
				url: stageUrl("timeline.html", { theme: "dark" }),
				theme: "dark",
				...STRIP,
			});
			await strip.waitFor("window.ready === true", "the timeline page");
			await strip.evaluate(`window.timeline.set(${JSON.stringify(stops)}); window.timeline.go(0)`);
			const initial = await readOriginal(server, `${ORIGINAL}@${first.id}`);
			const query = new URLSearchParams({
				modelA: initial.manifest.id,
				legacyAddressA: `${ORIGINAL}@${first.id}`,
				focusA: initial.modules.map(({ id }) => id).join(","),
			});
			const page = await browser.open({
				url: `${server.url}/?${query}`,
				theme: "dark",
				...PANE,
			});
			await page.atRest();
			await present(page);
			await page.atRest();
			await Bun.sleep(1500);
			const take = await filmTogether("history", [page, strip], async () => {
				await Bun.sleep(2600);
				// The later states are shown one after another, the strip moving with the pane, and
				// each holds long enough to read. The thumbnail is the first of them.
				const shown = await inOrder(stops.slice(1), async (stop, index): Promise<Moment> => {
					const address = `${ORIGINAL}@${stop.id}`;
					const model = await readOriginal(server, address);
					await showModel(server, "history", "A", {
						model: model.manifest.id,
						legacyAddress: address,
						focus: model.modules.map(({ id }) => id),
					});
					await page.atRest();
					await strip.evaluate(`window.timeline.go(${index + 1})`);
					await Bun.sleep(3800);
					return { at: now(), crop: LOWER_PART };
				});
				await Bun.sleep(600);
				return shown[0] ?? null;
			});
			await encodeTake(take, {
				clip: CLIP,
				width: CLIP_WIDTH,
				stack: "above",
				thumbnail: THUMBNAIL,
			});
		}),
};

export { history };
