// Film exact canonical readings before and after a recorded adoption.

import {
	ArchitectureCheckpointRetainSchema,
	type ArchitectureCheckpointRetain,
} from "@archboard/board/model";

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
import { editModel, modelResult, readModel, showModel } from "./model-authoring.ts";

const MODEL = "Shop";
type Checkpoint = Extract<ArchitectureCheckpointRetain, { success: true }>["checkpoint"];
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
	readonly checkpoint: string;
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
 * Preserve the example before its proposal is adopted.
 * @param server The copied example and restored archive.
 * @returns Its immutable current reading.
 */
async function retainCurrent(server: TakeServer): Promise<Checkpoint> {
	const model = await readModel(server);
	const retained = ArchitectureCheckpointRetainSchema.parse(
		modelResult(
			await server.cli([
				"model",
				"retain",
				"--operation-id",
				crypto.randomUUID(),
				"--writer",
				"readme",
				"--expect-revision",
				model.revision.digest,
				"--doing",
				"Retain the example before adding delivery tracking",
			]),
		),
	);
	if (!retained.success) throw new Error(JSON.stringify(retained));
	return retained.checkpoint;
}

/**
 * Describe one exact checkpoint from the accepted operation metadata.
 * @param checkpoint The retained reading.
 * @returns Its timeline entry and recorded decision.
 */
function stopOf(checkpoint: Checkpoint): Stop {
	const decision = checkpoint.lifecycle;
	const recorded =
		decision === undefined
			? { lifecycle: "historical", label: "Retained before adoption", why: "" }
			: {
					lifecycle: "current",
					label: `Adopted ${decision.at.slice(0, 10)}`,
					why: quoted(decision.reason),
				};
	return {
		id: checkpoint.id,
		checkpoint: checkpoint.id,
		name: checkpoint.state?.name ?? "Initial architecture",
		...recorded,
	};
}

/**
 * Record a real adoption in the disposable example before filming history.
 * @param server The copied example and its restored archive.
 * @returns The before and after readings in decision order.
 */
async function historyStops(server: TakeServer): Promise<readonly Stop[]> {
	const before = await retainCurrent(server);
	const draft = await editModel(
		server,
		"history",
		null,
		[
			{
				type: "add-module",
				module: {
					name: "Delivery tracking",
					kind: "datastore",
					order: 12000,
					responsibility: "Records delivery requests for fulfilment workers",
				},
			},
			{
				type: "add-relationship",
				source: "Checkout API",
				relationship: {
					to: "Delivery tracking",
					kind: "call",
					emphasis: "normal",
					label: "records delivery",
					order: 12000,
				},
			},
		],
		{
			type: "create",
			name: "Delivery tracking",
			summary: "Keep a durable delivery request outside checkout processing.",
		},
	);
	if (draft.target.state === null) throw new Error("The history example created no proposal.");
	const adopted = await editModel(server, "history", draft.target.state, [], {
		type: "adopt",
		reason: "Record delivery requests separately so checkout can respond promptly.",
	});
	if (adopted.checkpoint.lifecycle?.type !== "adopt")
		throw new Error("The history example did not record its adoption.");
	return [stopOf(before), stopOf(adopted.checkpoint)];
}

const history: Producer = {
	kind: "clip",
	codex: false,
	files: [THUMBNAIL],
	attachments: [CLIP],
	needs: ["chromium", "ffmpeg"],
	plan: [
		"Copy the canonical Shop example, retain current architecture, and create and adopt a delivery-tracking proposal through the public CLI. Keep both exact checkpoints and the recorded decision.",
		`Open the first checkpoint in a private headless Chromium at ${PANE.width}x${PANE.height}, dark, and present the pane; open the timeline strip beside it at ${STRIP.width}x${STRIP.height}.`,
		"Film archboard browser show moving the pane to each later state while the strip lights it.",
		`Encode the pane above the strip as a ${CLIP_WIDTH} px lossless WebP at 30 frames a second, in the scratch directory to attach by hand, and cut ${THUMBNAIL} from the second state.`,
	],
	/**
	 * Film the take and encode it.
	 * @returns Once the files are written.
	 */
	make: async () =>
		withTake("history", "examples/web-shop", false, async (server, browser) => {
			const stops = await historyStops(server);
			const [first, next] = stops;
			if (first === undefined || next === undefined) {
				throw new Error("The example has fewer than two retained readings.");
			}
			const strip = await browser.open({
				url: stageUrl("timeline.html", { theme: "dark" }),
				theme: "dark",
				...STRIP,
			});
			await strip.waitFor("window.ready === true", "the timeline page");
			await strip.evaluate(`window.timeline.set(${JSON.stringify(stops)}); window.timeline.go(0)`);
			const query = new URLSearchParams({
				modelA: MODEL,
				checkpointA: first.checkpoint,
				againstA: first.checkpoint,
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
					await showModel(server, "history", "A", {
						model: MODEL,
						checkpoint: stop.checkpoint,
						against: stop.checkpoint,
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
