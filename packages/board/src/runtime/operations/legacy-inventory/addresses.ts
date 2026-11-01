import { addressedVariant, type SemanticBoard } from "#shared/schemas/board-document.ts";
import type { ArchitectureModel, ArchitectureModelRead } from "#shared/schemas/model.ts";
import type { LegacyInventory } from "#shared/schemas/migration.ts";
import { mappedIdentity } from "#shared/rules/legacy-inventory/plan.ts";
import { readingDiagnostics } from "#runtime/operations/read/reading-readiness.ts";
import { failure } from "#runtime/operations/read/model-read.ts";
import { paneBoardAddress, parseBoardKey, statedVariant } from "#runtime/store/address.ts";

type Address = NonNullable<NonNullable<ArchitectureModel["migrationPreview"]>["addresses"]>[number];
/**
 * Expand original names into explicit state addresses without name inference.
 * @param inventory The captured original identities and aliases.
 * @returns Exact addresses for the original current or sole planning-root selection.
 */
function legacyAddresses(inventory: LegacyInventory): Address[] {
	return inventory.aliases.flatMap((alias) => {
		const board = inventory.boards.find((entry) => entry.document?.id === alias.board)?.document;
		if (board === undefined) return [];
		const id = originalAliasState(board, alias.state);
		if (id === undefined) return [];
		const state = `${inventory.plan.origin}/${board.id}#${id}`;
		const addresses = new Set([
			alias.address,
			serializedAlias(board, alias.address, id) ?? alias.address,
		]);
		return [...addresses].map((address) => ({
			...alias,
			address,
			state,
			canonical: mappedIdentity(inventory.plan, state),
		}));
	});
}
/**
 * Capture the public pane key only when it opens the same original state.
 * @param board The captured original family.
 * @param address The captured authored address.
 * @param state The exact original state identity.
 * @returns Its serialized public alias, when the legacy interface accepts it.
 */
function serializedAlias(board: SemanticBoard, address: string, state: string): string | undefined {
	try {
		const identity = parseBoardKey(address);
		const opened = addressedVariant(board, statedVariant(identity));
		return opened.ok && opened.variant.id === state ? paneBoardAddress(identity) : undefined;
	} catch {
		return undefined;
	}
}
/**
 * Preserve the original current designation or one unambiguous planning root.
 * @param board The complete original family.
 * @param state Its explicit alias target, when present.
 * @returns The exact original state identity or an unavailable bare address.
 */
function originalAliasState(board: SemanticBoard, state?: string) {
	if (state !== undefined) return state;
	if (board.current !== undefined) return board.current;
	const roots = board.variants.filter(
		(entry) => entry.lifecycle === "draft" && entry.parent === undefined,
	);
	return roots.length === 1 ? roots[0]!.id : undefined;
}
/**
 * Resolve only an exact captured alias and refuse conflicting state selectors.
 * @param addresses The captured explicit alias catalogue.
 * @param selector The requested complete legacy address.
 * @param state The optional deliberate original state.
 * @returns One exact address or a structured refusal.
 */
function legacyAddressOf(addresses: Address[], selector: string, state?: string) {
	const matches = [
		...new Map(
			addresses.filter((entry) => entry.address === selector).map((entry) => [entry.state, entry]),
		).values(),
	];
	if (matches.length !== 1) {
		const code = matches.length === 0 ? "LEGACY_ADDRESS_NOT_FOUND" : "LEGACY_ADDRESS_AMBIGUOUS";
		return failure(code, [
			{
				code,
				file: ".archboard/migration-plan.json",
				subjects: matches.map((entry) => entry.state),
				message: "The exact original address does not identify one captured state.",
				recovery:
					"Select an explicit address from migrationPreview.addresses or use its qualified original state.",
			},
		]);
	}
	const address = matches[0]!;
	if (state !== undefined && state !== address.state)
		return failure("TARGET_CHANGED", [
			{
				code: "TARGET_CHANGED",
				file: ".archboard/migration-plan.json",
				subjects: [state, address.state],
				message: "The explicit state and original address select different coverage.",
				recovery: "Select the matching original state and address together.",
			},
		]);
	return address;
}
/**
 * Attach an optional identity-only bookmark without changing model content.
 * @param model The complete captured preview.
 * @param selector The requested bookmark identity or unique name.
 * @returns The same architecture with its chosen reading intent.
 */
function selectBookmark(model: ArchitectureModelRead, selector?: string): ArchitectureModelRead {
	if (!model.success || selector === undefined) return model;
	const bookmarks = importedBookmarks(model);
	const selected = bookmarkOf(bookmarks, selector);
	if ("success" in selected) return selected;
	const diagnostics = [
		...selected.diagnostics,
		...readingDiagnostics(model, selected.reading, selected.file, selected.id, "BOOKMARK").filter(
			(entry) => !selected.diagnostics.some((known) => known.code === entry.code),
		),
	];
	return withBookmark(model, { ...selected, diagnostics });
}
export { legacyAddresses, legacyAddressOf, selectBookmark };

/**
 * Resolve stable bookmark identities before exact unique names.
 * @param bookmarks The captured optional reading catalogue.
 * @param selector The deliberate bookmark selector.
 * @returns One content-free reading or explicit ambiguity.
 */
function bookmarkOf(
	bookmarks: NonNullable<NonNullable<ArchitectureModel["migrationPreview"]>["bookmarks"]>,
	selector: string,
) {
	const exact = bookmarks.filter((entry) => entry.id === selector);
	const matches = exact.length > 0 ? exact : bookmarks.filter((entry) => entry.name === selector);
	if (matches.length !== 1) {
		const code = matches.length === 0 ? "BOOKMARK_NOT_FOUND" : "BOOKMARK_AMBIGUOUS";
		return failure(code, [
			{
				code,
				file: ".archboard/migration-plan.json",
				subjects: matches.map((entry) => entry.id),
				message: "The bookmark selector does not identify one imported reading.",
				recovery: "Select one stable identity from migrationPreview.bookmarks.",
			},
		]);
	}
	return matches[0]!;
}

/**
 * Attach selected reading intent to its existing provenance owner.
 * @param model The coherent architecture.
 * @param selected The chosen content-free bookmark.
 * @returns Its reading with one explicit selection.
 */
function withBookmark(
	model: ArchitectureModel,
	selected: NonNullable<NonNullable<ArchitectureModel["migration"]>["bookmark"]>,
): ArchitectureModel {
	if (model.migrationPreview !== undefined)
		return { ...model, migrationPreview: { ...model.migrationPreview, bookmark: selected } };
	return { ...model, migration: { ...model.migration!, bookmark: selected } };
}

/**
 * Read optional bookmarks from the current reading authority.
 * @param model The coherent reading.
 * @returns Its content-free bookmark catalogue.
 */
function importedBookmarks(model: ArchitectureModel) {
	return model.migrationPreview?.bookmarks ?? model.migration?.bookmarks ?? [];
}
