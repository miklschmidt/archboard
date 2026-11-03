import { useMemo, type JSX } from "react";
import type { Model, VariantContent } from "@archboard/model/content";
import { ContainerInterface } from "#ui/components/canvas/ContainerInterface.tsx";
import type { ModuleInterface } from "#ui/rules/architecture-model/selected-subject.ts";
import { kindLookOf } from "#ui/rules/canvas/reading/kind-look.ts";

interface ModelInterfaceProps {
	model: Model;
	/** What the selected state says, whole. */
	complete: VariantContent;
	inspection: ModuleInterface | undefined;
	onSelect: (id: string) => void;
}

/**
 * The complete model defines interfaces before a reading narrows its content.
 * @param props The module and its complete interface facts.
 * @returns Entry points, hidden parts, callers, and explicit boundary connections.
 */
function ModelInterface(props: ModelInterfaceProps): JSX.Element | null {
	const { inspection, complete } = props;
	const look = useMemo(() => kindLookOf(props.model.policy, new Map()), [props.model.policy]);
	if (inspection === undefined || !inspection.holdsParts) return null;
	return (
		<section
			data-slot="model-interface"
			className="flex flex-col gap-6"
			aria-label="Module interface"
		>
			<div className="-mx-4 -my-4">
				<ContainerInterface
					content={complete}
					node={inspection.container}
					look={look}
					onPick={props.onSelect}
				/>
			</div>
			<section data-slot="model-whole-interface" className="text-body space-y-2">
				<h4 className="text-muted-foreground font-semibold">Whole-module callers</h4>
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
				<h4 className="text-muted-foreground font-semibold">Outgoing connections</h4>
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
