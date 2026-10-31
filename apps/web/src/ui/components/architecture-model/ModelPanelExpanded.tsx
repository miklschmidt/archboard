import { RiSubtractLine } from "@remixicon/react";
import { useCallback, useMemo, type JSX } from "react";
import type { Model } from "@archboard/board/content";
import { IconButton } from "@archboard/ui-kit/components";
import { moduleName } from "#ui/components/architecture-model/ModelConnections.tsx";
import { ModelPanel } from "#ui/components/architecture-model/ModelPanel.tsx";
import { useModelPick } from "#ui/hooks/architecture-model/use-model-pick.ts";
import type { ModelSelection } from "#ui/hooks/architecture-model/use-model-selection.ts";
import { usePeekRow } from "#ui/hooks/architecture-model/use-peek-row.ts";
import { framesOf } from "#ui/rules/architecture-model/expansion.ts";
import type { Projection } from "#ui/rules/architecture-model/scene.ts";

/** What the panel says of the modules opened beside the open one. */
interface ModelPanelExpandedProps {
	readonly model: Model;
	readonly projection: Projection;
	readonly selection: Pick<ModelSelection, "select">;
	/** Collapse a frame. */
	readonly onToggle: (id: string) => boolean;
}

/**
 * The modules that the reading opens beside the open one, each of which selects its frame and
 * holds its collapse. An address can name a module that does not open here, and the list says so.
 * @param props The reading.
 * @returns The list, or nothing for a reading of one module.
 */
function ModelPanelExpanded(props: ModelPanelExpandedProps): JSX.Element | null {
	const { projection } = props;
	const { unopened } = projection;
	const frames = framesOf(projection);
	if (frames.length === 0 && unopened === 0) return null;
	return (
		<ModelPanel.Section title="Expanded" count={frames.length} slot="model-panel-expanded">
			<ModelPanel.Rows items={frames}>
				{(frame) => <ExpandedRow key={frame} {...props} frame={frame} />}
			</ModelPanel.Rows>
			{unopened > 0 && (
				<li data-slot="model-panel-unopened" className="text-body text-muted-foreground px-2 py-1">
					{unopened} more in the address cannot open here
				</li>
			)}
		</ModelPanel.Section>
	);
}

/**
 * One expanded module.
 * @param props The reading and the frame.
 * @returns A row of the panel.
 */
function ExpandedRow(props: ModelPanelExpandedProps & { readonly frame: string }): JSX.Element {
	const { frame, model, projection, selection, onToggle } = props;
	const pick = useModelPick(frame, selection.select);
	const peek = usePeekRow(frame);
	const name = moduleName(model, frame, projection.reference);
	const collapse = useCallback((): void => {
		onToggle(frame);
	}, [frame, onToggle]);
	const action = useMemo(
		() => (
			<IconButton label={`Collapse ${name}`} slot="model-panel-collapse" onClick={collapse}>
				<RiSubtractLine />
			</IconButton>
		),
		[name, collapse],
	);
	return <ModelPanel.Row data-frame={frame} {...pick} {...peek} name={name} action={action} />;
}

export { ModelPanelExpanded };
