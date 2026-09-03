import { useId, type ReactNode } from "react";

import { cn } from "../../ui-classnames/index.js";
import type {
	WorkbenchCoordinatorDisclosureProps,
	WorkbenchCoordinatorField,
	WorkbenchCoordinatorSection,
	WorkbenchCoordinatorState,
} from "../contract.js";
import { projectWorkbenchCoordinator } from "./projection.js";

const STATUS_CLASSES = {
	loading: "border-border bg-surface-subtle text-muted-foreground",
	confirmed: "border-status bg-status-subtle text-status-foreground",
	stale: "border-warning bg-warning-subtle text-warning",
	unavailable: "border-destructive bg-destructive-subtle text-destructive",
	priority_fallback: "border-warning bg-warning-subtle text-warning",
} as const satisfies Record<WorkbenchCoordinatorState, string>;

const FIELD_CLASSES = {
	confirmed: "text-foreground",
	fallback: "text-warning",
	unavailable: "text-destructive",
} as const satisfies Record<WorkbenchCoordinatorField["state"], string>;

function DisclosureField({ item }: { readonly item: WorkbenchCoordinatorField }): ReactNode {
	return (
		<div className="min-w-0 grid grid-cols-[minmax(9rem,0.8fr)_minmax(0,1.2fr)] gap-control border-t border-border-subtle py-control first:border-t-0">
			<dt className="font-sans text-body font-medium text-muted-foreground">{item.label}</dt>
			<dd className={cn("m-0 min-w-0 font-sans text-body break-words", FIELD_CLASSES[item.state])}>
				<span>{item.value}</span>
				{item.recovery === null ? null : (
					<span className="mt-compact block text-muted-foreground">{item.recovery}</span>
				)}
			</dd>
		</div>
	);
}

function DisclosureSection({ value }: { readonly value: WorkbenchCoordinatorSection }): ReactNode {
	const headingId = useId();
	return (
		<section className="min-w-0" aria-labelledby={headingId}>
			<h3
				className="m-0 border-b border-border pb-control font-sans text-kicker font-semibold text-muted-foreground"
				id={headingId}
			>
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
	const headingId = useId();
	const descriptionId = useId();
	const projected = projectWorkbenchCoordinator(state);
	return (
		<section
			className={cn(
				"min-w-0 border-y border-border bg-surface px-region py-control font-sans text-foreground shadow-flat",
				className,
			)}
			aria-labelledby={headingId}
			aria-describedby={descriptionId}
			data-coordinator-disclosure="read-only"
			data-coordinator-state={projected.status.state}
		>
			<header className="flex min-h-touch-target items-center justify-between gap-control border-b border-border">
				<div className="min-w-0">
					<p className="m-0 text-kicker font-semibold text-muted-foreground">Voice coordinator</p>
					<h2 className="m-0 text-title font-semibold" id={headingId}>
						Coordinator identity and settings
					</h2>
				</div>
				<output
					className={cn(
						"shrink-0 rounded-control border px-control py-compact text-body font-medium",
						STATUS_CLASSES[projected.status.state],
					)}
					aria-live="polite"
					aria-atomic="true"
					aria-label={`Coordinator status: ${projected.status.label}`}
				>
					{projected.status.label}
				</output>
			</header>
			<p
				className="m-0 border-b border-border-subtle py-control text-body text-muted-foreground"
				id={descriptionId}
			>
				{projected.status.detail}
				{projected.status.recovery === null ? null : ` ${projected.status.recovery}`}
			</p>
			<div className="grid grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)] gap-panel py-panel">
				<DisclosureSection value={projected.coordinatorIdentity} />
				<DisclosureSection value={projected.coordinatorSettings} />
			</div>
			<aside className="border-t border-border pt-control" aria-label={projected.workhorse.label}>
				<div className="mb-control flex items-baseline justify-between gap-control">
					<h3 className="m-0 text-kicker font-semibold text-muted-foreground">Linked workhorse</h3>
					<span className="text-body text-muted-foreground">
						Separate task activity and settings
					</span>
				</div>
				<dl className="m-0 grid grid-cols-3 gap-region">
					{projected.workhorse.fields.map((item) => (
						<div className="min-w-0" key={item.label}>
							<dt className="font-sans text-kicker font-semibold text-muted-foreground">
								{item.label}
							</dt>
							<dd className={cn("m-0 font-sans text-body break-words", FIELD_CLASSES[item.state])}>
								{item.value}
								{item.recovery === null ? null : (
									<span className="mt-compact block text-muted-foreground">{item.recovery}</span>
								)}
							</dd>
						</div>
					))}
				</dl>
			</aside>
		</section>
	);
}
