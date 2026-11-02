// Putting the two halves of the listing together: the models the vault holds
// and the models the live panes hold. They are read separately so that one of
// them failing leaves the other on screen, and this is the only place they
// meet. Pure: no React, no fetching.

import { asksForDesignation } from "@archboard/model/legacy-board";
import { paneAddressOf, paneKeyFor, sameModelName } from "#ui/rules/canvas/reading/address.ts";
import type { DocumentEntry, RetainedListing } from "#ui/clients/canvas/reads/drawings.ts";
import type {
	LegacyListing,
	BrowserPaneListing,
	CatalogModel,
	ListedVariant,
} from "#ui/rules/pane-session/session-types.ts";

/** The listing before either half has been read. */
const EMPTY_LISTING: LegacyListing = Object.freeze({ models: [], levels: [], onScreen: [] });

/** The vault's half of the listing: its models as the shell lists them, and its levels. */
type VaultHalf = Omit<LegacyListing, "onScreen">;

/** The vault's half while it is unread. */
const NO_MODELS: VaultHalf = Object.freeze({ models: [], levels: [] });

/**
 * One legacy board as the shell lists it: every variant carries the key a pane opens
 * it by, bare for the variant the legacy board's name opens.
 * @param model The legacy board as the vault lists it.
 * @returns The listed legacy board.
 */
function catalogModel(model: DocumentEntry): CatalogModel {
	return {
		...model,
		variants: model.variants.map((variant): ListedVariant => ({
			...variant,
			key: paneKeyFor(model.key, variant.id === model.opens ? undefined : variant.id),
		})),
	};
}

/**
 * The listing the shell reads, from whichever halves have been read. An unread
 * vault is not an empty one, which is why the navigator asks the query whether
 * it is pending rather than reading anything into a vault with no models.
 *
 * The vault's half comes in already made, so a caller that keeps it while only
 * the panes move hands on the same models: every pane reads them, and new ones
 * would draw every pane again for a move in another pane.
 * @param vault The vault's half, or undefined while unread.
 * @param panes The live panes, or undefined while unread.
 * @returns The listing.
 */
function composeListing(
	vault: VaultHalf | undefined,
	panes: BrowserPaneListing | undefined,
): LegacyListing {
	if (vault === undefined && panes === undefined) {
		return EMPTY_LISTING;
	}
	return { ...(vault ?? NO_MODELS), onScreen: paneHalf(panes) };
}

/**
 * The vault's half: its models, each variant with the key a pane opens it by, and its levels.
 * @param vault The vault's listing.
 * @returns The models and levels.
 */
function vaultHalf(vault: RetainedListing): VaultHalf {
	return { models: vault.boards.map(catalogModel), levels: vault.levels };
}

/**
 * The pane half: what each live pane holds, empty while unread.
 * @param panes The live panes, or undefined while unread.
 * @returns The panes.
 */
function paneHalf(panes: BrowserPaneListing | undefined): LegacyListing["onScreen"] {
	return (panes?.panes ?? []).map(({ paneId, place, model }) => ({ paneId, place, model }));
}

/**
 * Plain words for a failed read.
 * @param failure What was thrown.
 * @returns The message.
 */
function failureMessage(failure: unknown): string {
	return failure instanceof Error ? failure.message : String(failure);
}

/**
 * Why the navigator cannot show what it should, or null when it can.
 *
 * The vault's failure is the one that matters and keeps its long-standing
 * words. A pane inventory that failed on its own is reported separately and
 * only while nothing of it is left to show: the vault's models are still
 * listed, and what is missing is which of them a pane has open.
 * @param vault What the vault read threw, or null.
 * @param panes What the pane read threw, or null.
 * @param panesRead Whether any pane inventory is still in hand.
 * @returns The message, or null.
 */
function listingError(vault: unknown, panes: unknown, panesRead: boolean): string | null {
	if (vault !== null && vault !== undefined) {
		return `The board listing could not be read: ${failureMessage(vault)}`;
	}
	if (panes !== null && panes !== undefined && !panesRead) {
		return `The open boards could not be read: ${failureMessage(panes)}`;
	}
	return null;
}

/**
 * The listed legacy board a name or key names.
 * @param listing The listing.
 * @param model The legacy board's name or key.
 * @returns The legacy board, or undefined when it is not listed.
 */
function listedLegacyBoard(listing: LegacyListing, model: string): CatalogModel | undefined {
	return listing.models.find((entry) => sameModelName(entry.name, model));
}

/**
 * The listed variant a pane address shows: the one the bare name opens, the
 * current one for `current`, or the one named by id or name.
 * @param model The listed legacy board.
 * @param wanted The variant the address asks for, or undefined for the bare name.
 * @returns The variant, or undefined when none matches.
 */
function listedVariant(model: CatalogModel, wanted: string | undefined): ListedVariant | undefined {
	const { variants } = model;
	if (wanted === undefined) {
		return variants.find((variant) => variant.id === model.opens);
	}
	if (asksForDesignation(wanted)) {
		return variants.find((variant) => variant.lifecycle === "current");
	}
	return (
		variants.find((variant) => variant.id === wanted) ??
		variants.find((variant) => variant.name === wanted)
	);
}

/**
 * The listed row for a pane address: the key of the variant it shows, so two
 * spellings of one reading are recognised as one.
 * @param listing The listing.
 * @param key The pane address.
 * @returns The variant's key, or the original address when it is not listed.
 */
function listedLegacyKey(listing: LegacyListing, key: string | null): string | null {
	const target = paneAddressOf(key);
	if (target === null) {
		return key;
	}
	const model = listedLegacyBoard(listing, target.model);
	const variant = model === undefined ? undefined : listedVariant(model, target.variant);
	return variant?.key ?? key;
}

/**
 * Whether a listed legacy board says nothing it describes is built: it lists variants and none of
 * them is current (ADR 0031). A legacy board that is not listed, or could not be read, says nothing.
 * @param listing The listing.
 * @param model The legacy board's name.
 * @returns True when the legacy board has variants and no current one.
 */
function nothingBuiltOn(listing: LegacyListing, model: string): boolean {
	const variants = listedLegacyBoard(listing, model)?.variants ?? [];
	return variants.length > 0 && variants.every((variant) => variant.lifecycle !== "current");
}

export {
	EMPTY_LISTING,
	composeListing,
	listedLegacyBoard,
	listingError,
	listedLegacyKey,
	nothingBuiltOn,
	vaultHalf,
	type VaultHalf,
};
