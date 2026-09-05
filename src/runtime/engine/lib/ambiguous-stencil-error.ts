import type { CatalogueEntry } from "../library-catalogue.js";

/** A name that more than one library uses. */
class AmbiguousStencilError extends Error {
	public readonly wanted: string;
	public readonly candidates: CatalogueEntry[];

	public constructor(wanted: string, candidates: CatalogueEntry[]) {
		super(
			`"${wanted}" is a name ${candidates.length} libraries use: ${candidates
				.map(
					(candidate) =>
						`${candidate.name} [${candidate.source ?? "installed"}] id=${candidate.id}`,
				)
				.join("; ")}.`,
		);
		this.name = "AmbiguousStencilError";
		this.wanted = wanted;
		this.candidates = candidates;
	}
}

export { AmbiguousStencilError };
