import type { JSX } from "react";
import type { BranchFootprintAnswer } from "#ui/architecture-drawing/model-reader/access/clients/branch-footprint.ts";

/**
 * The changed files that no module binds, which no row shows, folded under one line under the
 * cards. A review acts on them, so they stay in view when the other facts do not.
 * @param props The files.
 * @param props.files The files of the answer.
 * @returns The list, or nothing when every changed file is bound.
 */
function UnboundFiles(props: {
	readonly files: BranchFootprintAnswer["unboundFiles"];
}): JSX.Element | null {
	const { files } = props;
	if (files.length === 0) return null;
	// Two repositories can change the same path, so a list of several names each file's.
	const several = new Set(files.map((file) => file.repo)).size > 1;
	return (
		<details data-slot="footprint-unbound" className="text-body text-muted-foreground shrink-0">
			<summary className="cursor-default">
				{files.length} changed {files.length === 1 ? "file has" : "files have"} no module bound to{" "}
				{files.length === 1 ? "it" : "them"}.
			</summary>
			{/* A branch can leave hundreds of files unbound, so they scroll and the cards keep their room. */}
			<ul className="bg-tray-sink shadow-well rounded-panel mt-1.5 flex max-h-[min(12rem,25vh)] flex-col gap-0.5 overflow-y-auto p-2.5 font-mono">
				{files.map((file) => (
					<li key={`${file.repo}:${file.path}`} className="text-technical [overflow-wrap:anywhere]">
						{several ? `${file.repo}: ${file.path}` : file.path}
					</li>
				))}
			</ul>
		</details>
	);
}

export { UnboundFiles };
