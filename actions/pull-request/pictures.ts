// The pictures of a pull request: draw the architecture at the base and at the head with
// `model render`, put the files on the assets branch, and give the comment their addresses.

/* oxlint-disable archboard/absolute-imports -- actions/ has no # imports; sibling imports stay relative */
import { mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { pushAssets } from "./assets.ts";
import type { PictureLinks, PictureSameness } from "./comment.ts";
import { archboard } from "./context.ts";
import type { Context } from "./context.ts";
import { publicationProblem } from "./github.ts";
import { rawUrl } from "./links.ts";
import type { ModelState } from "./plan.ts";

const SIDES = ["before", "after"] as const;
const THEMES = ["light", "dark"] as const;

/**
 * Draw one picture.
 * @param context The run.
 * @param directory The vault to draw.
 * @param request The state to draw, the theme and the file.
 * @param request.state The proposal, or undefined for the current architecture.
 * @param request.theme The theme.
 * @param request.out The SVG file to write.
 * @param request.focus The modules to draw close up, by stable identity.
 * @returns Whether the picture was drawn.
 */
function renderPicture(
	context: Context,
	directory: string,
	request: {
		state: ModelState | undefined;
		theme: string;
		out: string;
		focus?: readonly string[];
	},
): boolean {
	const state = request.state === undefined ? [] : ["--state", request.state.id];
	const focus = (request.focus ?? []).flatMap((id) => ["--focus", id]);
	const args = [
		"model",
		"render",
		...state,
		...focus,
		"--theme",
		request.theme,
		"--out",
		request.out,
	];
	return archboard(context, directory, args).exitCode === 0;
}

/**
 * Draw the before and after pictures in both themes.
 * @param context The run.
 * @param drawings Where to draw from.
 * @param drawings.baseDir The vault at the base.
 * @param drawings.headDir The vault at the head.
 * @param drawings.state The proposal for the after picture.
 * @returns The files that were drawn, by name such as `after-light.svg`.
 */
function drawPictures(
	context: Context,
	drawings: Trees & { state: ModelState | undefined },
): Record<string, string> {
	const folder = join(context.scratch, "pictures");
	mkdirSync(folder, { recursive: true });
	const drawn: Record<string, string> = {};
	for (const side of SIDES) {
		for (const theme of THEMES) {
			const name = `${side}-${theme}.svg`;
			const [directory, state] =
				side === "before" ? [drawings.baseDir, undefined] : [drawings.headDir, drawings.state];
			if (renderPicture(context, directory, { state, theme, out: join(folder, name) })) {
				drawn[name] = join(folder, name);
			}
		}
	}
	return drawn;
}

/**
 * Whether the base and the head draw the same picture in every theme.
 * @param drawn The files that were drawn.
 * @returns True when each theme has both pictures and they are equal.
 */
function sameDrawings(drawn: Readonly<Record<string, string>>): boolean {
	return THEMES.every((theme) => {
		const before = drawn[`before-${theme}.svg`];
		const after = drawn[`after-${theme}.svg`];
		return (
			before !== undefined &&
			after !== undefined &&
			readFileSync(before).equals(readFileSync(after))
		);
	});
}

/**
 * Replace two equal pictures with one, because two equal pictures say nothing. The one picture
 * draws the head close up on the modules whose code changed, and the whole head stays the map.
 * @param context The run.
 * @param drawings Where to draw from.
 * @param drawings.headDir The vault at the head.
 * @param drawings.state The proposal for the picture.
 * @param drawings.focus The modules whose code changed, by stable identity.
 * @param drawn The files that were drawn. Equal before pictures leave it.
 * @returns How the one picture is drawn, or undefined when the pictures differ.
 */
function onePicture(
	context: Context,
	drawings: { headDir: string; state: ModelState | undefined; focus: readonly string[] },
	drawn: Record<string, string>,
): PictureSameness | undefined {
	if (!sameDrawings(drawn)) return undefined;
	for (const theme of THEMES) {
		delete drawn[`before-${theme}.svg`];
		if (drawings.focus.length === 0) continue;
		const out = join(context.scratch, "pictures", `focus-${theme}.svg`);
		if (renderPicture(context, drawings.headDir, { ...drawings, theme, out })) {
			drawn[`focus-${theme}.svg`] = out;
		}
	}
	// The comment needs a light picture for its <img>, even when a dark source exists.
	return drawn["focus-light.svg"] === undefined ? "whole" : "close-up";
}

/**
 * The address of one picture on the assets branch.
 * @param context The run.
 * @param name The picture's file name, such as `after-dark.svg`.
 * @returns The address.
 */
function pictureUrl(context: Context, name: string): string {
	return rawUrl(context.hosting, context.branch, `${assetFolder(context)}/${name}`);
}

/**
 * Where this head's pictures are on the assets branch.
 * @param context The run.
 * @returns The folder, such as `pr-12/3f9a…`.
 */
function assetFolder(context: Context): string {
	return `pr-${String(context.number)}/${context.headSha}`;
}

/**
 * The addresses of one side's pictures.
 * @param context The run.
 * @param side `before`, `after` or `focus`.
 * @param drawn The files that were drawn.
 * @returns The links, or undefined when the side has no light picture.
 */
function linksOf(
	context: Context,
	side: (typeof SIDES)[number] | "focus",
	drawn: Readonly<Record<string, string>>,
): PictureLinks | undefined {
	const light = `${side}-light.svg`;
	const dark = `${side}-dark.svg`;
	if (!(light in drawn)) return undefined;
	return {
		light: pictureUrl(context, light),
		dark: dark in drawn ? pictureUrl(context, dark) : undefined,
	};
}

/** The pictures of a pull request, as the comment embeds them. */
interface Pictures {
	readonly before?: PictureLinks | undefined;
	readonly after?: PictureLinks | undefined;
	/** The whole architecture after the change, full size. */
	readonly map?: string | undefined;
	/** The base and the head draw the same picture, so only the after picture is shown. */
	readonly same?: PictureSameness | undefined;
	readonly note?: string | undefined;
}

/** Where the pictures are drawn from. */
interface Trees {
	/** The vault at the base commit. */
	readonly baseDir: string;
	/** The vault at the head commit. */
	readonly headDir: string;
	/** The root of the checkout of the head commit. */
	readonly headRoot: string;
}

/**
 * Why the pictures could not be put on the assets branch.
 * @param context The run.
 * @param failure What git said.
 * @returns A sentence.
 */
function notPushed(context: Context, failure: string): string {
	const why = context.fromFork
		? `this pull request comes from a fork, so its token cannot push to ${context.branch}`
		: `the token could not push to ${context.branch}: ${failure}`;
	return `The pictures are not shown: ${why}.`;
}

/**
 * Draw the pictures and put them where the comment can embed them.
 * @param context The run.
 * @param trees Where to draw from.
 * @param state The proposal for the after picture.
 * @param focus The modules whose code changed, by stable identity.
 * @returns The links, or why there are none.
 */
async function makePictures(
	context: Context,
	trees: Trees,
	state: ModelState | undefined,
	focus: readonly string[] = [],
): Promise<Pictures> {
	const drawn = drawPictures(context, { ...trees, state });
	if (Object.keys(drawn).length === 0) return { note: "No picture could be drawn." };
	const same = onePicture(context, { headDir: trees.headDir, state, focus }, drawn);
	// A run that must not publish says why in its own words, not as a refused push.
	let stopped: string | undefined;
	const failure = await pushAssets(
		{
			server: context.hosting.server,
			repository: context.hosting.repository,
			token: context.access.token,
			branch: context.branch,
			folder: assetFolder(context),
			pullRequestFolder: `pr-${String(context.number)}`,
			files: drawn,
		},
		async () => {
			stopped = await publicationProblem(context.access, context.number, context.headSha);
			return stopped;
		},
	);
	if (stopped !== undefined) return { note: stopped };
	if (failure !== undefined) return { note: notPushed(context, failure) };
	return linkPictures(context, drawn, same);
}

/**
 * The addresses of the pictures that were published.
 * @param context The run.
 * @param drawn The files that were drawn.
 * @param same How the one picture of an unchanged architecture is drawn, if it is.
 * @returns The links.
 */
function linkPictures(
	context: Context,
	drawn: Readonly<Record<string, string>>,
	same: PictureSameness | undefined,
): Pictures {
	const before = linksOf(context, "before", drawn);
	const after = linksOf(context, "after", drawn);
	return {
		before,
		after: same === "close-up" ? linksOf(context, "focus", drawn) : after,
		map: after?.light,
		same,
		note:
			before === undefined && same === undefined
				? "The base commit has no architecture to draw, so there is no before picture."
				: undefined,
	};
}

export { makePictures, type Pictures, type Trees };
