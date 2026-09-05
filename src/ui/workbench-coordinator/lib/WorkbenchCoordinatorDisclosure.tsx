import { useId, type ReactNode } from "react";

import { cn } from "../../ui-classnames/index.js";
import type {
	WorkbenchCoordinatorDisclosureProps,
	WorkbenchCoordinatorField,
	WorkbenchCoordinatorSection,
} from "../contract.js";
import { projectWorkbenchCoordinator } from "./projection.js";

function DisclosureField({ item }: { readonly item: WorkbenchCoordinatorField }): ReactNode {
	return (
		<div className="grid min-w-0 grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)] gap-control py-control">
			<dt className="font-sans text-body text-muted-foreground">{item.label}</dt>
			<dd
				className={cn(
					"m-0 min-w-0 font-sans text-body break-words",
					item.state === "fallback" ? "text-warning" : "text-foreground",
				)}
			>
				{item.value}
			</dd>
		</div>
	);
}

function DisclosureSection({ value }: { readonly value: WorkbenchCoordinatorSection }): ReactNode {
	const headingId = useId();
	if (value.fields.length === 0) return null;
	return (
		<section
			className="min-w-0 border-t border-border-subtle pt-control"
			aria-labelledby={headingId}
		>
			<h3 className="m-0 font-sans text-body font-semibold" id={headingId}>
				{value.label}
			</h3>
			<dl className="m-0">
				{value.fields.map((item) => (
					<DisclosureField item={item} key={item.label} />
				))}
			</dl>
		</section>
	);
}

export function WorkbenchCoordinatorDisclosure({
	state,
	className,
}: WorkbenchCoordinatorDisclosureProps): ReactNode {
	const projected = projectWorkbenchCoordinator(state);
	return (
		<section
			className={cn("min-w-0 font-sans text-foreground", className)}
			aria-label="Voice coordinator details"
			data-coordinator-disclosure="read-only"
			data-coordinator-state={projected.status.state}
		>
			<output
				className="m-0 block pb-region text-body text-muted-foreground"
				aria-live="polite"
				aria-atomic="true"
				aria-label={`Coordinator status: ${projected.status.label}`}
			>
				{projected.status.detail}
				{projected.status.recovery === null ? null : ` ${projected.status.recovery}`}
			</output>
			<DisclosureSection value={projected.coordinatorIdentity} />
			<DisclosureSection value={projected.coordinatorSettings} />
			<DisclosureSection value={projected.workhorse} />
		</section>
	);
}
