// The snapshot's picture: its selected state, drawn in this page with the renderer core and the
// painter, against its comparison state when it has one. It reuses the reader's diagram, and keeps
// only what a read-only page needs around it: the scope a reader opens, and the selection.

import { useMemo, useState, type JSX } from "react";

import { projectModel } from "@archboard/model/content";
import { PaneVaultContext } from "#ui/architecture-drawing/canvas/pane-vault/state/pane-vault.ts";
import { usePictureCamera } from "#ui/architecture-drawing/canvas/picture/camera/hooks/use-picture-camera.ts";
import { useAcceptedScene } from "#ui/architecture-drawing/model-reader/hooks/use-accepted-scene.ts";
import { useModelSelection } from "#ui/architecture-drawing/model-reader/hooks/use-model-selection.ts";
import { ModelDiagram } from "#ui/architecture-drawing/model-reader/reading/components/ModelDiagram.tsx";
import { drawableGrammar } from "#ui/architecture-drawing/model-reader/rules/scene.ts";
import { prefersReducedMotion } from "#ui/snapshot-reader/clients/system-preferences.ts";
import { SnapshotHeading } from "#ui/snapshot-reader/components/SnapshotHeading.tsx";
import type { ModelSnapshot } from "#ui/snapshot-reader/rules/snapshot-file.ts";

/**
 * The vault that the picture's reads name. A snapshot answers every read (snapshot-reads), so this
 * only keeps the page's cached reads apart.
 */
const SNAPSHOT_VAULT = "model-snapshot";

/** A snapshot opens with nothing selected. */
const NO_SELECTION: readonly string[] = Object.freeze([]);

/**
 * The snapshot's heading and picture.
 * @param props The snapshot.
 * @param props.snapshot The opened snapshot.
 * @returns The canvas.
 */
function SnapshotCanvas(props: { readonly snapshot: ModelSnapshot }): JSX.Element {
	const { snapshot } = props;
	const [reducedMotion] = useState(prefersReducedMotion);
	const [scope, setScope] = useState<string | null>(null);
	const { accepted, selection } = useSnapshotScene(snapshot, scope);
	const camera = usePictureCamera(reducedMotion);
	return (
		<PaneVaultContext value={SNAPSHOT_VAULT}>
			<SnapshotHeading snapshot={snapshot} scope={scope} onScope={setScope} />
			<div className="relative flex min-h-0 flex-1 flex-col">
				{accepted.scene !== null && (
					<ModelDiagram
						scene={accepted.scene}
						camera={camera}
						pending={accepted.pending}
						leaving={accepted.leaving}
						selected={accepted.selected}
						onSelect={selection.select}
						onSelectMany={selection.selectMany}
						onOpen={setScope}
						reducedMotion={reducedMotion}
					/>
				)}
				{accepted.failure !== null && (
					<output role="alert" className="text-body absolute inset-x-0 top-0 z-10 p-8">
						{accepted.failure.message}
					</output>
				)}
			</div>
		</PaneVaultContext>
	);
}

/**
 * The scene of the open scope: the selected state, read against its comparison state.
 * @param snapshot The snapshot.
 * @param scope The open module, or null for the whole model.
 * @returns The accepted scene and the selection.
 */
function useSnapshotScene(snapshot: ModelSnapshot, scope: string | null) {
	const { reading: model, comparisonReading } = snapshot;
	const projection = useMemo(
		() => projectModel(model, scope, null, {}, comparisonReading ?? undefined),
		[model, scope, comparisonReading],
	);
	const selection = useModelSelection(projection, NO_SELECTION, scope ?? "");
	const request = useMemo(
		() => ({
			model,
			projection,
			reading: {
				scope,
				focus: null,
				expand: [],
				filters: { hideKinds: [] },
				grammar: "architecture",
				flow: null,
				subject: null,
				state: model.selectedState?.id ?? null,
				checkpoint: model.checkpoint?.id ?? null,
				against: null,
			},
			grammar: drawableGrammar("architecture", projection),
			settled: true,
		}),
		[model, projection, scope],
	);
	const accepted = useAcceptedScene(request, selection.ids);
	return { accepted, selection };
}

export { SnapshotCanvas };
