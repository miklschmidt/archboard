// What the snapshot page says above its picture: the model and the open scope, which a reader
// steps back out of, the state the picture draws, the state it is compared with, and the version
// of Archboard that wrote the snapshot.

import { Fragment, useCallback, useMemo, type JSX } from "react";

import type { Model } from "@archboard/model/content";
import { Button } from "@archboard/ui-kit/components";
import type { ModelSnapshot } from "#ui/snapshot-reader/rules/snapshot-file.ts";

/** Inputs for the heading. */
interface SnapshotHeadingProps {
	readonly snapshot: ModelSnapshot;
	/** The open module, or null for the whole model. */
	readonly scope: string | null;
	/** Open a module, or the whole model for null. */
	readonly onScope: (scope: string | null) => void;
}

/**
 * The heading of the snapshot.
 * @param props The snapshot, its open scope and the way back out of it.
 * @returns The heading.
 */
function SnapshotHeading(props: SnapshotHeadingProps): JSX.Element {
	const { reading, comparisonReading, cliVersion } = props.snapshot;
	const { modules } = reading;
	const path = useMemo(() => scopePath(modules, props.scope), [modules, props.scope]);
	const base = comparisonLabel(reading, comparisonReading);
	return (
		<header
			data-slot="snapshot-heading"
			className="border-border flex min-h-12 shrink-0 flex-wrap items-center gap-x-4 gap-y-1 border-b px-4 py-2"
		>
			<nav aria-label="Scope" className="flex min-w-0 items-center gap-1">
				<h1 className="text-title font-semibold">
					<Crumb
						id={null}
						name={reading.manifest.name}
						open={path.length > 0}
						onScope={props.onScope}
					/>
				</h1>
				{path.map((module, index) => (
					<Fragment key={module.id}>
						<span aria-hidden className="text-muted-foreground">
							/
						</span>
						<Crumb
							id={module.id}
							name={module.name}
							open={index < path.length - 1}
							onScope={props.onScope}
						/>
					</Fragment>
				))}
			</nav>
			<p data-slot="snapshot-state" className="text-body text-muted-foreground">
				{stateLabel(reading)}
				{base !== null && (
					<span data-slot="snapshot-comparison">
						{" · Compared with "}
						<span className="text-foreground">{base}</span>
					</span>
				)}
			</p>
			<p className="text-technical text-muted-foreground ml-auto font-mono">
				Snapshot · archboard {cliVersion}
			</p>
		</header>
	);
}

/**
 * One step of the scope: a key back to it, or the open scope itself.
 * @param props The step.
 * @param props.id The module, or null for the whole model.
 * @param props.name Its name.
 * @param props.open Whether a reader can step back to it, because a scope inside it is open.
 * @param props.onScope Open a scope.
 * @returns The step.
 */
function Crumb(props: {
	readonly id: string | null;
	readonly name: string;
	readonly open: boolean;
	readonly onScope: (scope: string | null) => void;
}): JSX.Element {
	const { id, onScope } = props;
	const back = useCallback((): void => onScope(id), [id, onScope]);
	if (!props.open) {
		return (
			<span aria-current="location" className="truncate px-2">
				{props.name}
			</span>
		);
	}
	return (
		<Button variant="ghost" size="xs" onClick={back} className="text-title">
			{props.name}
		</Button>
	);
}

/**
 * The modules from the outermost down to the open scope.
 * @param modules The modules of the model.
 * @param scope The open module, or null for the whole model.
 * @returns The path, empty for the whole model.
 */
function scopePath(modules: Model["modules"], scope: string | null): Model["modules"] {
	const byId = new Map(modules.map((module) => [module.id, module]));
	const path: Model["modules"][number][] = [];
	for (let id = scope; id !== null;) {
		const module = byId.get(id);
		if (module === undefined || path.includes(module)) break;
		path.unshift(module);
		id = module.parent ?? null;
	}
	return path;
}

/**
 * What a reading draws, in words: its state and where that state stands.
 * @param reading The reading.
 * @returns The label.
 */
function stateLabel(reading: Model): string {
	const state = reading.selectedState;
	if (state === null) {
		return reading.checkpoint === undefined ? "Planning" : "Saved reading";
	}
	const word = `${state.lifecycle.charAt(0).toUpperCase()}${state.lifecycle.slice(1)}`;
	return word === state.name ? word : `${word} · ${state.name}`;
}

/**
 * The state a reading is compared with, in words.
 * @param reading The selected reading.
 * @param comparison The comparison reading, or null when the snapshot holds none.
 * @returns The label, or null when the reading compares nothing.
 */
function comparisonLabel(reading: Model, comparison: Model | null): string | null {
	if (comparison !== null) return stateLabel(comparison);
	const against = reading.comparison?.against;
	return against === null || against === undefined ? null : against.name;
}

export { SnapshotHeading };
