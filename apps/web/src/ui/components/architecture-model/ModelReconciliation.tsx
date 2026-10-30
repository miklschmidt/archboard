import { useCallback, type JSX } from "react";
import { Button } from "@archboard/ui-kit/components";
import type { Model } from "@archboard/board/content";
import { modelSubjects, subjectName } from "#ui/rules/architecture-model/flow-reading.ts";
import { useModelLocation } from "#ui/hooks/architecture-model/use-model-location.ts";
import { ReconciliationIssues } from "#ui/components/semantic-board-canvas/SemanticInspectorStanding.tsx";

interface ModelReconciliationProps {
	model: Model;
	paneId: string;
}

/**
 * Unresolved proposals keep their coherent content and expose the decisions that still block them.
 * @param props The exact selected reading and its pane.
 * @returns An issue disclosure or an explicit blocked-ancestor action.
 */
function ModelReconciliation(props: ModelReconciliationProps): JSX.Element | null {
	const standing = props.model.selectedState?.standing;
	if (standing === undefined) return null;
	if (standing.blockedBy !== undefined)
		return <BlockedProposal {...props} ancestor={standing.blockedBy} />;
	const names = new Map(
		modelSubjects(props.model).map((subject) => [subject.id, subjectName(subject)]),
	);
	names.set(props.model.manifest.id, props.model.manifest.name);
	return (
		<details
			data-slot="model-reconciliation"
			className="text-body bg-status-subtle rounded-md px-3 py-2"
		>
			<summary className="text-status-foreground cursor-pointer font-medium">
				{standing.issues.length} unresolved{" "}
				{standing.issues.length === 1 ? "decision" : "decisions"}
			</summary>
			<section aria-label="Unresolved decisions" className="mt-3 max-h-64 overflow-y-auto">
				<ReconciliationIssues open={standing.issues} names={names} />
			</section>
		</details>
	);
}

/**
 * A blocked descendant names the ancestor whose decision it awaits.
 * @param props The coherent reading and exact blocking identity.
 * @returns A deliberate state navigation that leaves the blocked reading intact until activated.
 */
function BlockedProposal(props: ModelReconciliationProps & { ancestor: string }): JSX.Element {
	const { selectState } = useModelLocation(props.paneId);
	const { ancestor } = props;
	const open = useCallback((): void => selectState(ancestor), [ancestor, selectState]);
	const name = props.model.proposals.find((proposal) => proposal.id === ancestor)?.name ?? ancestor;
	return (
		<div
			data-slot="model-reconciliation"
			className="text-body bg-status-subtle flex items-center justify-between gap-4 rounded-md px-3 py-2"
		>
			<p>
				This proposal waits for unresolved decisions in {name}. Its last coherent content remains
				visible.
			</p>
			<Button
				variant="outline"
				size="sm"
				data-slot="model-blocked-ancestor"
				data-state-id={ancestor}
				onClick={open}
			>
				{props.model.checkpoint === undefined ? "Open ancestor" : "Open live ancestor"}
			</Button>
		</div>
	);
}

export { ModelReconciliation };
