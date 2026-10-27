import type { ArchitectureModel, ArchitectureModelRead } from "#shared/schemas/model.ts";
import type { LegacyInventory } from "#shared/schemas/migration.ts";
import { mappedIdentity } from "#shared/rules/legacy-inventory/plan.ts";
import { failure } from "#runtime/operations/read/model-read.ts";

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
		const roots = board.variants.filter(
			(state) => state.lifecycle === "draft" && state.parent === undefined,
		);
		const id = alias.state ?? board.current ?? (roots.length === 1 ? roots[0]!.id : undefined);
		if (id === undefined) return [];
		const state = `${inventory.plan.origin}/${board.id}#${id}`;
		return [{ ...alias, state, canonical: mappedIdentity(inventory.plan, state) }];
	});
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
	const bookmarks = model.migrationPreview?.bookmarks ?? [];
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
	return { ...model, migrationPreview: { ...model.migrationPreview!, bookmark: matches[0]! } };
}
export { legacyAddresses, legacyAddressOf, selectBookmark };
