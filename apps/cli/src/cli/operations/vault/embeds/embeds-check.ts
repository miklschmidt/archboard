import { captureArchitecture } from "#cli/operations/model/rasterize.ts";
import { embedStanding, fixLine } from "#cli/rules/check/embed-state.ts";
import { writeFileAtomic } from "@archboard/workspace/atomic-write";
import { repoRootOf } from "@archboard/workspace/checkouts";
import { checkoutsReadFrom } from "@archboard/code-binding/resolution";
import { checkoutOfVault } from "@archboard/workspace/vault";
import { readRenderRecipe, replaceRenderRecipe } from "@archboard/renderer/recipe";
import { isRecord, stringAt } from "@archboard/diagnostics/unknown-record";
import { errorMessage } from "@archboard/diagnostics/thrown-error";
import { renderArchitectureFlowOnServer } from "#cli/clients/server/architecture-model.ts";
import {
	checkoutEmbeds,
	type CheckoutEmbed,
} from "#cli/operations/vault/embeds/checkout-embeds.ts";
import { vaultReader } from "#cli/operations/vault/embeds/embed-vaults.ts";
import type { CommandContext } from "#cli/protocol/contract/contract.ts";
import type { EmbedFinding, EmbedFix, EmbedsPart } from "#cli/protocol/check/embeds-answer.ts";
type Recipe = Extract<
	Extract<ReturnType<typeof readRenderRecipe>, { kind: "recipe" }>["recipe"],
	{ model: unknown }
>;
type Picture = Extract<
	Awaited<ReturnType<typeof renderArchitectureFlowOnServer>>,
	{ success: true }
>;
type Checked = { findings: EmbedFinding[]; fixed: EmbedFix[] };
type Options = { fix: boolean; signal: AbortSignal };
/**
 * Require a canonical recipe from the existing renderer metadata owner.
 * @param svg The complete canonical SVG.
 * @returns Its reproducible recipe.
 */
function canonicalRecipe(svg: string): Recipe {
	const read = readRenderRecipe(Buffer.from(svg));
	if (read.kind !== "recipe" || !("model" in read.recipe))
		throw new Error("The canonical renderer returned no canonical recipe.");
	return read.recipe;
}
/**
 * Record an unavailable canonical source without choosing a replacement by name.
 * @param embed The artifact.
 * @param recipe Its declared identity.
 * @param message Why its source is unavailable.
 * @returns The source finding.
 */
function unavailable(embed: CheckoutEmbed, recipe: Recipe, message: string): Checked {
	return {
		findings: [
			{
				severity: "warning",
				code: "EMBED_SOURCE_MISSING",
				file: embed.file,
				model: recipe.model,
				missing: "picture",
				message,
			},
		],
		fixed: [],
	};
}
/**
 * Preserve the original bitmap scale and region during repair.
 * @param recipe The exact original recipe.
 * @returns Its raster selectors or native full-page defaults.
 */
function rasterSettings(recipe: Recipe) {
	return { scale: recipe.raster?.scale ?? 1, region: recipe.raster?.region ?? undefined };
}
/**
 * Repair one local artifact after its complete canonical rendering succeeds.
 * @param embed The artifact.
 * @param recipe Its previous recipe and raster selectors.
 * @param fresh The coherent new picture.
 * @param changed Whether the picture differs.
 * @param code The observed source or renderer change.
 * @param signal The invocation cancellation signal.
 * @returns The completed repair receipt.
 */
async function repair(
	embed: CheckoutEmbed,
	recipe: Recipe,
	fresh: Picture,
	changed: boolean,
	code: "EMBED_OUTDATED" | "EMBED_RENDERER_CHANGED",
	signal: AbortSignal,
): Promise<Checked> {
	if (embed.kind === "png") {
		const raster = rasterSettings(recipe);
		const { png } = await captureArchitecture(fresh, raster.scale, raster.region, signal);
		writeFileAtomic(embed.path, Buffer.from(png));
	} else
		writeFileAtomic(
			embed.path,
			changed
				? fresh.svg
				: Buffer.from(replaceRenderRecipe(embed.bytes, canonicalRecipe(fresh.svg))),
		);
	return {
		findings: [],
		fixed: [
			changed
				? { action: "drawn", file: embed.file, code }
				: { action: "recipe", file: embed.file },
		],
	};
}
/**
 * Explain a different picture that the current invocation cannot replace.
 * @param embed The artifact.
 * @param recipe Its declared model.
 * @param code The observed change.
 * @param cached Whether the source comes only from a stale cache.
 * @returns The existing diagnostic shape.
 */
function differentPicture(
	embed: CheckoutEmbed,
	recipe: Recipe,
	code: "EMBED_OUTDATED" | "EMBED_RENDERER_CHANGED",
	cached: boolean,
): Checked {
	return {
		findings: [
			{
				severity: cached || code === "EMBED_RENDERER_CHANGED" ? "information" : "warning",
				code,
				file: embed.file,
				model: recipe.model,
				message: "The canonical reading draws a different picture.",
				...(cached ? { notFixed: "A cached source cannot replace this artifact." } : {}),
			},
		],
		fixed: [],
	};
}
/**
 * Compare one coherent picture with an artifact and apply explicit local repair.
 * @param embed The artifact.
 * @param recipe Its original recipe.
 * @param fresh The coherent new picture.
 * @param options The repair intent and cancellation signal.
 * @param cached Whether the source is a stale cached reading.
 * @returns Findings and completed repairs.
 */
async function inspectPicture(
	embed: CheckoutEmbed,
	recipe: Recipe,
	fresh: Picture,
	options: Options,
	cached: boolean,
): Promise<Checked> {
	const next = canonicalRecipe(fresh.svg);
	if (embedStanding(recipe, next) === "current") return { findings: [], fixed: [] };
	const changed = next.picture !== recipe.picture;
	const code =
		recipe.fingerprint === next.fingerprint ? "EMBED_RENDERER_CHANGED" : "EMBED_OUTDATED";
	if (options.fix && !cached) return repair(embed, recipe, fresh, changed, code, options.signal);
	if (!changed) return { findings: [], fixed: [] };
	return differentPicture(embed, recipe, code, cached);
}
/**
 * Redraw one canonical embed through the existing renderer adapter.
 * @param embed The artifact.
 * @param recipe Its declared reading.
 * @param vault The resolved vault.
 * @param options The repair intent and cancellation signal.
 * @param cached Whether the source is a cached remote reading.
 * @returns Its findings and completed repairs.
 */
async function inspect(
	embed: CheckoutEmbed,
	recipe: Recipe,
	vault: string,
	options: Options,
	cached: boolean,
): Promise<Checked> {
	const fresh = await renderArchitectureFlowOnServer(recipe.reading, vault);
	if (!fresh.success)
		return unavailable(
			embed,
			recipe,
			fresh.diagnostics.map((item) => `${item.message} ${item.recovery}`).join(" "),
		);
	if (fresh.model !== recipe.model.id)
		return unavailable(embed, recipe, "The vault contains another model.");
	return inspectPicture(embed, recipe, fresh, options, cached);
}
/**
 * Resolve and inspect one artifact without a live board lookup or tracking list.
 * @param embed The artifact found through Git.
 * @param reader The existing checkout and fetched-vault resolver.
 * @param options The repair intent and cancellation signal.
 * @returns Its findings and completed repairs.
 */
async function inspectEmbed(
	embed: CheckoutEmbed,
	reader: ReturnType<typeof vaultReader>,
	options: Options,
): Promise<Checked> {
	options.signal.throwIfAborted();
	if (!embed.recipe.ok)
		return {
			findings: [
				{
					severity: "warning",
					code: "EMBED_RECIPE_UNREADABLE",
					file: embed.file,
					message: embed.recipe.problem,
				},
			],
			fixed: [],
		};
	const recipe = embed.recipe.recipe;
	if (!("model" in recipe))
		return {
			findings: [
				{
					severity: "warning",
					code: "EMBED_SOURCE_MISSING",
					file: embed.file,
					message:
						"This legacy recipe requires explicit migration and a canonical render. Its original bytes remain unchanged.",
				},
			],
			fixed: [],
		};
	const source = await reader.read(recipe.vault.repo);
	if (!source.ok)
		return {
			findings: [
				{
					severity: source.code === "EMBED_VAULT_FETCH_FAILED" ? "warning" : "information",
					code: source.code,
					file: embed.file,
					model: recipe.model,
					message: source.reason,
				},
			],
			fixed: [],
		};
	return inspect(embed, recipe, source.vault, options, source.read.source === "cache");
}
/**
 * Preserve every completed repair in an interrupted invocation's diagnostic.
 * @param error The failure or cancellation.
 * @param fixed The durable repairs already completed.
 * @returns The original failure or its complete repair evidence.
 */
function stoppedAfter(error: unknown, fixed: readonly EmbedFix[]): unknown {
	if (fixed.length === 0) return error;
	const code = isRecord(error) ? stringAt(error, "code") : undefined;
	const message = [errorMessage(error), "Before it stopped:", ...fixed.map(fixLine)].join("\n");
	return Object.assign(new Error(message, { cause: error }), code === undefined ? {} : { code });
}
/**
 * Inspect artifacts in Git order and retain completed repairs on interruption.
 * @param embeds The Git-tracked artifacts.
 * @param reader The existing vault resolver.
 * @param options The repair intent and cancellation signal.
 * @returns Findings and completed repairs.
 */
async function inspectInOrder(
	embeds: readonly CheckoutEmbed[],
	reader: ReturnType<typeof vaultReader>,
	options: Options,
): Promise<Checked> {
	const findings: EmbedFinding[] = [],
		fixed: EmbedFix[] = [];
	try {
		for (const embed of embeds) {
			// oxlint-disable-next-line no-await-in-loop -- each durable artifact repair completes before the next starts
			const result = await inspectEmbed(embed, reader, options);
			findings.push(...result.findings);
			fixed.push(...result.fixed);
		}
	} catch (error) {
		throw stoppedAfter(error, fixed);
	}
	return { findings, fixed };
}
/**
 * Inspect canonical recipes in the addressed checkout without board-owned tracking.
 * @param at The explicit vault or checkout.
 * @param options The repair intent and cancellation signal.
 * @param options.fix Whether to replace changed local artifacts.
 * @param options.signal The invocation cancellation signal.
 * @returns The existing embed-check receipt.
 */
async function checkEmbedsAt(
	at: { vault: string } | { checkout: string },
	options: Options,
): Promise<EmbedsPart> {
	const vault = "vault" in at ? at.vault : null;
	const root =
		"checkout" in at
			? at.checkout
			: await repoRootOf(checkoutOfVault(at.vault), { signal: options.signal });
	if (root === undefined)
		return { checkout: null, embeds: [], tracked: [], vaults: [], findings: [], fixed: [] };
	const embeds = await checkoutEmbeds(root, options.signal);
	const reader = vaultReader(checkoutsReadFrom(vault), options.signal);
	const checked = await inspectInOrder(embeds, reader, options);
	return {
		checkout: root,
		embeds: embeds.map((embed) => embed.file),
		tracked: [],
		vaults: await reader.vaults(),
		...checked,
	};
}
/**
 * Inspect the checkout that the command explicitly addressed.
 * @param context The invocation's vault and checkout.
 * @param fix Whether to repair changed artifacts.
 * @returns The embed receipt.
 */
function checkEmbeds(context: Pick<CommandContext, "vault" | "checkout" | "signal">, fix: boolean) {
	const options = { fix, signal: context.signal };
	if (context.vault !== null) return checkEmbedsAt({ vault: context.vault.path }, options);
	if (context.checkout !== null) return checkEmbedsAt({ checkout: context.checkout }, options);
	throw new Error("The embeds check requires an addressed vault or checkout.");
}
export { checkEmbeds, checkEmbedsAt };
