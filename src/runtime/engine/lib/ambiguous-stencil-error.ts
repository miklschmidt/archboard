import type { CatalogueEntry } from "@/runtime/engine/library-catalogue";

/** A name that more than one library uses. */
class AmbiguousStencilError extends Error {
	public readonly wanted: string;
	public readonly candidates: CatalogueEntry[];

	/**
	 * Refuse a name several libraries answer to, naming every one of them so
	 * the caller can say which it meant.
	 * @param wanted The name that was asked for.
	 * @param candidates The stencils that answer to it.
	 */
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
