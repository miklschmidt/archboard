import { useCallback, type JSX } from "react";
import { Button } from "@archboard/ui-kit/components";
import type { Model } from "#ui/rules/architecture-model/projection.ts";
import type { useModelNavigation } from "#ui/hooks/architecture-model/use-model-navigation.ts";
import { useReferenceNavigation } from "#ui/hooks/architecture-model/use-reference-navigation.ts";

type Resolution = NonNullable<Model["resolvedReferences"]>[number];
interface ModuleReferencesProps {
	paneId: string;
	references: NonNullable<Model["modules"][number]["references"]>;
	navigation: ReturnType<typeof useModelNavigation>;
}

/**
 * Authored references remain visible when their target architecture is unavailable.
 * @param props The selected module's references and coherent availability.
 * @returns Explicit destinations with one deliberate navigation action each.
 */
function ModuleReferences(props: ModuleReferencesProps): JSX.Element {
	const action = useReferenceNavigation(props.paneId, props.navigation);
	return (
		<section className="space-y-3">
			<h4 className="text-title font-semibold">References</h4>
			{action.error !== null && (
				<p role="alert" data-slot="module-reference-error" className="text-body">
					{action.error}
				</p>
			)}
			<ul className="space-y-4">
				{[...referenceChoices(props.references)].map(([key, { reference, index }]) => (
					<ReferenceRow
						key={key}
						reference={reference}
						index={index}
						resolved={props.navigation.references.find((entry) => entry.index === index)}
						navigation={props.navigation}
						action={action}
					/>
				))}
			</ul>
		</section>
	);
}

/**
 * Identical authored references offer one action while retaining its original request index.
 * @param references The module's authored reference list.
 * @returns Stable distinct choices in authored order.
 */
function referenceChoices(references: ModuleReferencesProps["references"]) {
	const choices = new Map<
		string,
		{ reference: ModuleReferencesProps["references"][number]; index: number }
	>();
	for (const [index, reference] of references.entries()) {
		const key = JSON.stringify(reference);
		if (!choices.has(key)) choices.set(key, { reference, index });
	}
	return choices;
}

interface ReferenceRowProps {
	reference: ModuleReferencesProps["references"][number];
	index: number;
	resolved: Resolution | undefined;
	navigation: ModuleReferencesProps["navigation"];
	action: ReturnType<typeof useReferenceNavigation>;
}

/**
 * A disabled link explains which authored destination could not be resolved.
 * @param props The exact authored reference and optional resolved address.
 * @returns Its stable identity, availability, and opening control.
 */
function ReferenceRow(props: ReferenceRowProps): JSX.Element {
	const { resolved, action } = props;
	const { follow: activate } = action;
	const follow = useCallback((): void => {
		if (resolved !== undefined) void activate(resolved);
	}, [resolved, activate]);
	return (
		<li
			data-slot="module-reference"
			data-index={props.index}
			data-status={referenceStatus(props)}
			className="text-body space-y-2"
		>
			<p>
				{props.reference.model} · {props.reference.subject}
			</p>
			<p className="text-muted-foreground break-all">
				{props.reference.repo} · {props.reference.state}
			</p>
			<Button
				variant="outline"
				size="sm"
				data-slot="module-follow-reference"
				disabled={resolved?.status !== "available" || action.pending !== null}
				onClick={follow}
			>
				{action.pending === props.index ? "Opening…" : "Open architecture"}
			</Button>
			<ReferenceAvailability {...props} />
		</li>
	);
}

/**
 * A still-pending reference differs from a refused or changed source reading.
 * @param props The current query and resolved reference.
 * @returns The visible availability state.
 */
function referenceStatus(props: ReferenceRowProps): string {
	if (props.resolved !== undefined) return props.resolved.status;
	return props.navigation.query.isFetching ? "loading" : "unavailable";
}

/**
 * Share the runtime's recovery instructions without guessing another target.
 * @param props The addressed reference and shared read.
 * @returns Its pending or unavailable explanation.
 */
function ReferenceAvailability(props: ReferenceRowProps): JSX.Element | null {
	const { resolved } = props;
	if (resolved?.status === "available") return null;
	if (referenceStatus(props) === "loading")
		return <output className="text-muted-foreground block">Locating architecture…</output>;
	if (resolved === undefined)
		return (
			<p className="text-muted-foreground">Refresh the architecture to locate this reference.</p>
		);
	return (
		<div className="text-muted-foreground space-y-2">
			{resolved.diagnostics.map((diagnostic) => (
				<p key={JSON.stringify(diagnostic)}>
					{diagnostic.message} {diagnostic.recovery}
				</p>
			))}
		</div>
	);
}

export { ModuleReferences };
