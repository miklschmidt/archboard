import { useMemo, type ComponentProps, type JSX, type ReactNode } from "react";
import {
	SemanticSidebar,
	SidebarPanel,
} from "#ui/components/semantic-board-canvas/SemanticSidebar.tsx";
import type { Sidebar } from "#ui/hooks/semantic-board-canvas/use-sidebar.ts";
import { ModelModuleList } from "#ui/components/architecture-model/ModelModuleList.tsx";
import {
	ModelSelectionDetails,
	ModelScopeDetails,
} from "#ui/components/architecture-model/ModelSelectionDetails.tsx";
import { ModelHiddenSelection } from "#ui/components/architecture-model/ModelHiddenSelection.tsx";
import { ModelCodeDetails } from "#ui/components/architecture-model/ModelCodeFindings.tsx";
import { ModelWalkthroughChoices } from "#ui/components/architecture-model/ModelWalkthroughChoices.tsx";
import type { useModelCodeFindings } from "#ui/hooks/architecture-model/use-model-code-findings.ts";

interface ReadingSidebarProps extends ComponentProps<typeof ModelSelectionDetails> {
	sidebar: Sidebar;
	controls: ReactNode;
	overview?: ReactNode;
	grammar: string;
	onReveal: () => void;
	code: ReturnType<typeof useModelCodeFindings>;
}

/**
 * Reading controls and selection share the existing single pane sidebar.
 * @param props The coherent reading, navigation actions, and shared sidebar state.
 * @returns The architecture and selection tabs at the shell's standard width.
 */
function ModelReadingSidebar(props: ReadingSidebarProps): JSX.Element {
	const available =
		props.grammar === "architecture" ? !props.projection.missing : props.projection.flow !== null;
	const evidence = useMemo(
		() => (
			<ModelCodeDetails
				reading={props.code.reading}
				selected={props.selection.ids}
				scope={props.scope}
			/>
		),
		[props.code.reading, props.selection.ids, props.scope],
	);
	return (
		<SemanticSidebar
			sidebar={props.sidebar}
			overviewLabel="Architecture"
			onClearSelection={props.selection.ids.size > 0 ? props.selection.clear : null}
			controls={props.controls}
		>
			<SidebarPanel tab="board">
				{props.overview}
				<ModelWalkthroughChoices walkthroughs={props.model.walkthroughs} />
				{available && (
					<>
						<div className="px-4 py-4">
							<ModelScopeDetails {...props} />
						</div>
						<ModelModuleList {...props} />
					</>
				)}
				<details className="text-body border-border border-t px-4 py-4">
					<summary>Model ownership</summary>
					<p data-slot="model-transfer-unavailable" className="text-muted-foreground mt-3">
						Moving architecture ownership to another repository is unavailable. Export a portable
						model to share an exact reading.
					</p>
				</details>
			</SidebarPanel>
			<SidebarPanel tab="selection">
				<div data-slot="model-inspector" className="space-y-6 px-4 py-4">
					<ModelHiddenSelection
						projection={props.projection}
						selected={props.selection.ids}
						onReveal={props.onReveal}
						onRevealFlow={props.onRevealFlow}
					/>
					<ModelSelectionDetails {...props} evidence={evidence} />
				</div>
			</SidebarPanel>
		</SemanticSidebar>
	);
}

export { ModelReadingSidebar };
