import type { JSX } from "react";
import { Button } from "@archboard/ui-kit/components";
import type { projectModel } from "#ui/rules/architecture-model/projection.ts";

/**
 * A hidden selection remains inspectable and can form a visible focused reading.
 * @param props The visible projection and stable selected identities.
 * @param props.projection The drawn reading.
 * @param props.selected Canonical selected identities.
 * @param props.onReveal Reveals the selection without changing architecture.
 * @returns The hidden count and an explicit reveal action.
 */
function ModelHiddenSelection(props: {
	projection: ReturnType<typeof projectModel>;
	selected: ReadonlySet<string>;
	onReveal: () => void;
}): JSX.Element | null {
	const { projection, selected } = props;
	const known = [...projection.complete.nodes, ...projection.complete.edges];
	const visible = new Set([
		...projection.content.nodes.map((node) => node.id),
		...projection.connections.flatMap(({ joins }) => joins.map((edge) => edge.id)),
	]);
	const hidden = known.filter((subject) => selected.has(subject.id) && !visible.has(subject.id));
	if (hidden.length === 0) return null;
	return (
		<section className="border-border mb-6 space-y-3 border-b pb-4">
			<output
				data-slot="model-hidden-selection"
				data-count={hidden.length}
				className="text-body block"
			>
				{hidden.length} selected subjects are hidden in this reading.
			</output>
			<Button
				data-slot="model-reveal-selection"
				variant="outline"
				size="sm"
				onClick={props.onReveal}
			>
				Reveal selection
			</Button>
		</section>
	);
}

export { ModelHiddenSelection };
