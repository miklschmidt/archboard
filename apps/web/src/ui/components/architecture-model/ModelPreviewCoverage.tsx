import type { JSX } from "react";
import type { Model } from "@archboard/board/content";

/**
 * Keep a selected original distinct from a complete historical repository.
 * @param props The exact preview receipt.
 * @param props.model The model and its original coverage.
 * @returns The original scope, or absence for composed current.
 */
function ModelPreviewCoverage({ model }: { model: Model }): JSX.Element | null {
	const preview = model.migrationPreview;
	const selected = preview?.selected;
	if (selected === undefined) return null;
	const board = preview?.coverage.find((entry) => entry.board === selected.board);
	return (
		<p
			data-preview-coverage={selected.legacy}
			className="text-body border-border shrink-0 border-b px-4 py-3"
		>
			This original state covers {board?.name ?? selected.board} only. It does not reconstruct the
			repository.
		</p>
	);
}

export { ModelPreviewCoverage };
