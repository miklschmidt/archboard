import type { JSX } from "react";
import type { Model } from "#ui/rules/architecture-model/projection.ts";

/**
 * Keep legacy authority and exact input evidence visible beside the candidate.
 * @param props The coherent preview reading.
 * @param props.model The public reader result.
 * @returns A bounded disclosure of source coverage and planned architecture.
 */
function ModelPreviewDetails({ model }: { model: Model }): JSX.Element | null {
	const preview = model.migrationPreview;
	if (preview === undefined) return null;
	return (
		<>
			<details
				data-slot="model-migration-preview"
				className="border-border text-body shrink-0 border-b"
			>
				<summary className="hover:bg-muted cursor-pointer px-4 py-2">
					Legacy files remain authoritative · {preview.coverage.length} source{" "}
					{preview.coverage.length === 1 ? "board" : "boards"}
				</summary>
				<div className="max-h-48 space-y-4 overflow-auto px-4 pb-4">
					<p>
						This preview writes no architecture files. Planned-only boards stay outside the current
						model.
					</p>

					<dl className="space-y-2">
						<div>
							<dt className="font-semibold">Source fingerprint</dt>
							<dd>
								<code data-slot="preview-source" className="break-all">
									{preview.source.digest}
								</code>
							</dd>
						</div>
						<div>
							<dt className="font-semibold">Mapping fingerprint</dt>
							<dd>
								<code data-slot="preview-plan" className="break-all">
									{preview.planRevision}
								</code>
							</dd>
						</div>
					</dl>
					<ul className="space-y-2">
						{preview.coverage.map((board) => (
							<li key={board.board} data-preview-board={board.board}>
								<span className="font-semibold">{board.name}</span> · {board.file}
								{board.formerNames?.length ? (
									<p>Former names: {board.formerNames.join(", ")}</p>
								) : null}
								<p>
									{board.current === undefined
										? "Planned only"
										: `${board.current.name} · ${board.current.legacy}`}
								</p>
							</li>
						))}
					</ul>
					{preview.plannedBoards.length > 0 && (
						<section aria-label="Proposed state mappings" className="space-y-2">
							<h3 className="font-semibold">Proposed state mappings</h3>
							<ul className="space-y-2">
								{preview.plannedBoards.flatMap((board) =>
									board.states.map((state) => (
										<li key={state.legacy} data-preview-planned={state.canonical}>
											{state.name} · {state.lifecycle}
											<br />
											<code className="break-all">
												{state.legacy} → {state.canonical}
											</code>
										</li>
									)),
								)}
							</ul>
						</section>
					)}
				</div>
			</details>
			{model.manifest.current === null && (
				<p
					data-slot="preview-empty"
					className="text-body border-border shrink-0 border-b px-4 py-3"
				>
					No implemented architecture exists in these sources. Open the source details to inspect
					proposed state mappings.
				</p>
			)}
		</>
	);
}

export { ModelPreviewDetails };
