import { useMemo, type JSX, type ReactNode } from "react";
import type { Model } from "@archboard/model/content";
import type { KindLook } from "#ui/architecture-drawing/canvas/picture/rules/kind-look.ts";
import type { BranchFootprintAnswer } from "#ui/architecture-drawing/model-reader/access/clients/branch-footprint.ts";
import type { VaultStates } from "#ui/architecture-drawing/model-reader/reading/branch-footprint/rules/against.ts";
import { FootprintFacts } from "#ui/architecture-drawing/model-reader/reading/branch-footprint/components/FootprintFacts.tsx";
import { FootprintLists } from "#ui/architecture-drawing/model-reader/reading/branch-footprint/components/FootprintLists.tsx";
import type { FootprintShow } from "#ui/architecture-drawing/model-reader/reading/branch-footprint/rules/show-on-picture.ts";
import { FootprintRange } from "#ui/architecture-drawing/model-reader/reading/branch-footprint/components/FootprintRange.tsx";
import { UnboundFiles } from "#ui/architecture-drawing/model-reader/reading/branch-footprint/components/UnboundFiles.tsx";
import {
	useBranchFootprint,
	type FootprintChoice,
} from "#ui/architecture-drawing/model-reader/reading/branch-footprint/hooks/use-branch-footprint.ts";

/** Inputs for the view. */
interface BranchFootprintProps {
	readonly vault: string;
	/** The reading on screen. */
	readonly model: Model;
	/** How kinds look, for each module's chip. */
	readonly look: KindLook;
	/** What the reader chose for the range, kept while the dialog is away. */
	readonly choice: FootprintChoice;
	readonly onChoice: (choice: FootprintChoice) => void;
	/** The module selected on the picture, or null. */
	readonly selected: string | null;
	/** Select a module on its picture, here or in the other pane. */
	readonly onChoose: (id: string, beside: boolean) => void;
	/** Show a list on its picture. */
	readonly onShow: (target: FootprintShow) => void;
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
	const { refs, footprint, base, head, read, against, refresh } = useBranchFootprint(
		vault,
		model,
		choice,
	);
	return (
		<div
			data-slot="branch-footprint"
			data-footprint-state={footprint.status}
			className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto"
		>
			<FootprintRange
				refs={refs.data}
				states={read.states}
				base={base}
				head={head}
				against={against}
				choice={choice}
				onChoice={onChoice}
				adopted={adoptedHere(footprint.data, read.states)}
				busy={refs.isFetching || read.isFetching || footprint.isFetching}
				onRefresh={refresh}
			>
				<FootprintFacts answer={footprint.data} />
			</FootprintRange>
			<FootprintBody
				{...props}
				base={base}
				refsFailure={refs.error?.message}
				vaultFailure={read.error?.message}
				footprint={footprint}
				read={read.states}
			/>
		</div>
	);
}

/**
 * Whether the branch adopted the current state that the footprint is set against: the server then
 * sets it against the merge base's current state, as a proposal, and names that state `against`.
 * @param answer The footprint, once read.
 * @param states The states of the vault that the footprint reads, once read.
 * @returns Whether it did.
 */
function adoptedHere(
	answer: BranchFootprintAnswer | undefined,
	states: VaultStates | undefined,
): boolean {
	const current = states?.manifest.current?.id;
	return current !== undefined && answer?.proposal?.id === current;
}

/**
 * The lists and the files that no module binds, or what stands in their place.
 * @param props The reads and what a row does.
 * @returns The body.
 */
function FootprintBody(
	props: BranchFootprintProps & {
		readonly base: string | null;
		readonly refsFailure: string | undefined;
		readonly vaultFailure: string | undefined;
		readonly footprint: ReturnType<typeof useBranchFootprint>["footprint"];
		/** The model that the footprint reads, once read. */
		readonly read: Pick<Model, "modules"> | undefined;
	},
): JSX.Element {
	const { model, base, refsFailure, vaultFailure, footprint, read } = props;
	const kinds = useKinds(model, read);
	if (refsFailure !== undefined)
		return <Status alert>The branches could not be read. {refsFailure}</Status>;
	if (vaultFailure !== undefined)
		return <Status alert>The model for this head could not be read. {vaultFailure}</Status>;
	if (base === null) return <Status>Choose the base that this branch started from.</Status>;
	if (footprint.status === "error")
		return <Status alert>The footprint could not be read. {footprint.error.message}</Status>;
	if (footprint.data === undefined) return <Status>Reading the commits…</Status>;
	return (
		<>
			<FootprintLists
				answer={footprint.data}
				look={props.look}
				kinds={kinds}
				selected={props.selected}
				onChoose={props.onChoose}
				onShow={props.onShow}
			/>
			<UnboundFiles files={footprint.data.unboundFiles} />
		</>
	);
}

/**
 * The kind of each module: in the model that the footprint reads, which holds the branch's modules
 * that the reading on screen can lack, else in the reading on screen.
 * @param model The reading on screen.
 * @param read The model that the footprint reads, once read.
 * @returns The kinds by module.
 */
function useKinds(
	model: Pick<Model, "modules">,
	read: Pick<Model, "modules"> | undefined,
): ReadonlyMap<string, string> {
	const branch = read?.modules;
	return useMemo(
		() => new Map([...model.modules, ...(branch ?? [])].map((module) => [module.id, module.kind])),
		[model.modules, branch],
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

export { BranchFootprint };
