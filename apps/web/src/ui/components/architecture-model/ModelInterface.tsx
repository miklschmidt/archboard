import { useMemo, type JSX } from "react";
import type { Model, projectModel } from "@archboard/board/content";
import { ContainerInterface } from "#ui/components/semantic-board-canvas/ContainerInterface.tsx";
import { kindLookOf } from "#ui/rules/semantic-board-canvas/board/kind-look.ts";

interface ModelInterfaceProps {
	model: Model;
	projection: ReturnType<typeof projectModel>;
	onSelect: (id: string) => void;
}

/**
 * The complete model defines interfaces before a reading narrows its content.
 * @param props The scoped module and its complete interface facts.
 * @returns Entry points, hidden parts, callers, and explicit boundary connections.
 */
function ModelInterface(props: ModelInterfaceProps): JSX.Element | null {
	const { inspection, complete } = props.projection;
	const look = useMemo(() => kindLookOf(props.model.policy, new Map()), [props.model.policy]);
	if (inspection === undefined || !inspection.holdsParts) return null;
	return (
		<section data-slot="model-interface" className="mt-8 space-y-6" aria-label="Module interface">
			<ContainerInterface
				content={complete}
				node={inspection.container}
				look={look}
				onPick={props.onSelect}
			/>
			<section data-slot="model-whole-interface" className="text-body space-y-2">
				<h3 className="text-title font-semibold">Whole-module callers</h3>
				{inspection.onContainer.length === 0 && (
					<p className="text-muted-foreground">No connection names this module as a whole.</p>
				)}
				{inspection.onContainer.map((edge) => (
					<p key={edge.id} data-relationship-id={edge.id}>
						{props.model.modules.find((module) => module.id === edge.from)?.name ?? edge.from} →{" "}
						{inspection.container.name}
					</p>
				))}
			</section>
			<section data-slot="model-interface-outgoing" className="text-body space-y-2">
				<h3 className="text-title font-semibold">Outgoing connections</h3>
				{inspection.outgoing.length === 0 && (
					<p className="text-muted-foreground">No connection leaves this module.</p>
				)}
				{inspection.outgoing.map((edge) => (
					<p key={edge.id} data-relationship-id={edge.id}>
						{props.model.modules.find((module) => module.id === edge.from)?.name ?? edge.from} →{" "}
						{props.model.modules.find((module) => module.id === edge.to)?.name ?? edge.to}
					</p>
				))}
			</section>
		</section>
	);
}

export { ModelInterface };
