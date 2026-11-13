import { useCallback, useMemo, type JSX, type ReactNode } from "react";
import type { Model } from "@archboard/model/content";
import { Button } from "@archboard/ui-kit/components";
import type { SourceRefsAnswer } from "#ui/architecture-drawing/model-reader/access/clients/branch-footprint.ts";
import { FootprintFacts } from "#ui/architecture-drawing/model-reader/reading/branch-footprint/components/FootprintFacts.tsx";
import { FootprintLists } from "#ui/architecture-drawing/model-reader/reading/branch-footprint/components/FootprintLists.tsx";
import {
	RefPicker,
	type RefChoice,
} from "#ui/architecture-drawing/model-reader/reading/branch-footprint/components/RefPicker.tsx";
import {
	useBranchFootprint,
	type FootprintChoice,
} from "#ui/architecture-drawing/model-reader/reading/branch-footprint/hooks/use-branch-footprint.ts";

/** Inputs for the view. */
interface BranchFootprintProps {
	readonly vault: string;
	/** The reading on screen. */
	readonly model: Model;
	/** What the reader chose for the range, kept while the dialog is away. */
	readonly choice: FootprintChoice;
	readonly onChoice: (choice: FootprintChoice) => void;
	/** The module selected on the picture, or null. */
	readonly selected: string | null;
	/** Select a module on its picture, here or in the other pane. */
	readonly onChoose: (id: string, beside: boolean) => void;
}

/**
 * What this branch changed: the branch footprint of the reading on screen, from a base to a head
 * (ADR 0045). A checkpoint is not live, so it has none.
 * @param props The reading, the range and what a row does.
 * @returns The view.
 */
function BranchFootprint(props: BranchFootprintProps): JSX.Element {
	if (props.model.checkpoint !== undefined)
		return (
			<p
				data-slot="branch-footprint-empty"
				className="text-body text-muted-foreground bg-tray-sink shadow-well rounded-panel flex-1 p-4"
			>
				A checkpoint is not live, so it has no branch footprint. Open Current or a proposal.
			</p>
		);
	return <LiveFootprint {...props} />;
}

/**
 * The view of a live reading: the range, the lists and what they cover.
 * @param props The reading, the range and what a row does.
 * @returns The view.
 */
function LiveFootprint(props: BranchFootprintProps): JSX.Element {
	const { vault, model, choice, onChoice } = props;
	const { refs, footprint, base, head, refresh } = useBranchFootprint(vault, model, choice);
	const choices = useMemo(() => refChoices(refs.data), [refs.data]);
	const chooseBase = useCallback(
		(next: string): void => onChoice({ ...choice, base: next }),
		[choice, onChoice],
	);
	const busy = refs.isFetching || footprint.isFetching;
	return (
		<div
			data-slot="branch-footprint"
			data-footprint-state={footprint.status}
			className="flex min-h-0 flex-1 flex-col gap-3"
		>
			<div className="flex flex-wrap items-end gap-4">
				<RefPicker
					label="Base"
					value={base ?? ""}
					shown={base ?? "Choose a base"}
					choices={choices}
					free
					onChoose={chooseBase}
				/>
				<div className="flex flex-col gap-1">
					<span className="text-body text-muted-foreground">Head</span>
					<span data-slot="footprint-head" className="text-control flex h-8 items-center font-mono">
						{head ?? checkedOut(refs.data)}
					</span>
				</div>
				<Button
					variant="outline"
					size="xs"
					data-slot="footprint-refresh"
					disabled={busy}
					onClick={refresh}
					className="ml-auto"
				>
					Refresh
				</Button>
			</div>
			<FootprintBody
				{...props}
				base={base}
				refsFailure={refs.error?.message}
				footprint={footprint}
			/>
		</div>
	);
}

/**
 * The lists and what they cover, or what stands in their place.
 * @param props The reads and what a row does.
 * @returns The body.
 */
function FootprintBody(
	props: BranchFootprintProps & {
		readonly base: string | null;
		readonly refsFailure: string | undefined;
		readonly footprint: ReturnType<typeof useBranchFootprint>["footprint"];
	},
): JSX.Element {
	const { base, refsFailure, footprint } = props;
	if (refsFailure !== undefined)
		return <Status alert>The branches could not be read. {refsFailure}</Status>;
	if (base === null) return <Status>Choose the base that this branch started from.</Status>;
	if (footprint.status === "error")
		return <Status alert>The footprint could not be read. {footprint.error.message}</Status>;
	if (footprint.data === undefined) return <Status>Reading the commits…</Status>;
	return (
		<>
			<FootprintLists answer={footprint.data} selected={props.selected} onChoose={props.onChoose} />
			<FootprintFacts answer={footprint.data} />
		</>
	);
}

/**
 * One line that stands in place of the lists.
 * @param props What it says, and whether it reports a failure.
 * @param props.alert Whether it reports a failure.
 * @param props.children What it says.
 * @returns The line.
 */
function Status(props: { readonly alert?: boolean; readonly children: ReactNode }): JSX.Element {
	return (
		<p
			data-slot="branch-footprint-status"
			role={props.alert === true ? "alert" : undefined}
			className="text-body text-muted-foreground bg-tray-sink shadow-well rounded-panel flex-1 p-4 [overflow-wrap:anywhere]"
		>
			{props.children}
		</p>
	);
}

/**
 * The branches a base can be, local first, each naming the repositories that hold it.
 * @param answer The source refs, when read.
 * @returns The choices.
 */
function refChoices(answer: SourceRefsAnswer | undefined): readonly RefChoice[] {
	return (answer?.refs ?? []).map((ref) => ({
		value: ref.name,
		label: ref.name,
		detail: ref.repos.join(", "),
	}));
}

/**
 * What the default head reads: the branch of the vault's checkout, or its commit when detached.
 * @param answer The source refs, when read.
 * @returns The words.
 */
function checkedOut(answer: SourceRefsAnswer | undefined): string {
	const vault = answer?.vault;
	if (vault?.branch != null) return `${vault.branch} (checked out)`;
	if (vault?.commit != null) return `HEAD at ${vault.commit.slice(0, 7)}`;
	return "HEAD of each checkout";
}

export { BranchFootprint };
