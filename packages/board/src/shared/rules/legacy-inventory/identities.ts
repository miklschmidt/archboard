import type { LegacyInventory } from "#shared/schemas/migration.ts";
import { subjectsOf } from "#shared/schemas/content.ts";
import type { SemanticBoard, SemanticVariant } from "#shared/schemas/board-document.ts";

/**
 * Preserve every subject identity, including subjects retained only in a reconciliation base.
 * @param document The original family.
 * @returns Its original local identities and kinds.
 */
function familySubjects(document: SemanticBoard) {
	return [
		...document.views.map((view) => ({ id: view.id, kind: "view" as const })),
		...document.variants.flatMap((state) => [
			{ id: state.id, kind: "state" as const },
			...subjectsOf(state.content),
			...(state.reconciliation === undefined ? [] : subjectsOf(state.reconciliation.base)),
		]),
	];
}

/**
 * Preserve named state selectors without replacing the current designation with an identity.
 * @param document The original family.
 * @param state The original state.
 * @returns Every original state selector.
 */
function stateNames(document: SemanticBoard, state: SemanticVariant): string[] {
	return [
		state.name,
		...(state.formerNames ?? []),
		state.id,
		...(document.current === state.id ? ["current"] : []),
	];
}

/**
 * Preserve every board and state address under the original family identity.
 * @param document The original family.
 * @param file The original source location.
 * @returns Its retained addresses.
 */
function familyAliases(document: SemanticBoard, file: string): LegacyInventory["aliases"] {
	const names = [
		...new Set([
			document.name,
			...(document.formerNames ?? []),
			file.slice(0, -".semantic.json".length),
		]),
	];
	return names.flatMap((name) => [
		{ address: name, board: document.id },
		...document.variants.flatMap((state) =>
			stateNames(document, state).map((selector) => ({
				address: `${name}@${selector}`,
				board: document.id,
				state: state.id,
			})),
		),
	]);
}

/**
 * Build provenance without minting or combining any original identity.
 * @param boards The complete original documents.
 * @param origin The owner's stable import namespace.
 * @param diagnostics Duplicate family identities that block safe mapping.
 * @returns Original subject identities and addresses.
 */
function legacyIdentities(
	boards: LegacyInventory["boards"],
	origin: string,
	diagnostics: LegacyInventory["diagnostics"],
): Pick<LegacyInventory, "identities" | "aliases"> {
	const identities = new Map<string, LegacyInventory["identities"][number]>();
	const aliases: LegacyInventory["aliases"] = [];
	const families = new Map<string, string>();
	for (const { document, file } of boards) {
		if (document === undefined) continue;
		const prior = families.get(document.id);
		if (prior !== undefined)
			diagnostics.push({
				code: "DUPLICATE_NAMESPACE",
				file,
				subjects: [`${origin}/${document.id}`],
				message: `This board family identity also appears in ${prior}.`,
				recovery:
					"Resolve the duplicate original family explicitly before recording mappings. Inventory never invents a replacement id.",
			});
		families.set(document.id, file);
		aliases.push(...familyAliases(document, file));
		for (const entry of familySubjects(document)) {
			const id = `${origin}/${document.id}#${entry.id}`;
			identities.set(`${entry.kind}:${id}`, {
				id,
				board: document.id,
				localId: entry.id,
				kind: entry.kind,
			});
		}
	}
	return { identities: [...identities.values()], aliases };
}
export { legacyIdentities };
