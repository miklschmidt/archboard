import { useCallback, useContext, type JSX } from "react";
import { createPortal } from "react-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ArchitectureClaim, ArchitectureModelRead } from "@archboard/model/contract";
import { RiLockUnlockLine } from "@remixicon/react";
import { Button, cn } from "@archboard/ui-kit/components";
import { takeBackClaim } from "#ui/architecture-drawing/model-reader/access/clients/claims.ts";
import {
	architectureClaimsQuery,
	architectureModelKeys,
} from "#ui/architecture-drawing/model-reader/access/clients/queries.ts";
import {
	ModelPaneContext,
	type ClaimFrame,
	type ClaimFrames,
} from "#ui/architecture-drawing/model-reader/state/presentation.ts";
import { clockTime } from "#ui/shell/rules/time.ts";

interface ModelClaimsProps {
	vault: string;
	model: ArchitectureModelRead | undefined;
}

/** A place that lies over the top of its surface and lets the pointer through beside the claims. */
const CLAIMS_LAYER =
	"pointer-events-none absolute inset-x-0 top-0 z-20 flex flex-col *:pointer-events-auto";

/**
 * The one owner of the claims of a current reading. They stand over the surface of the pane that
 * is on screen: a walkthrough that plays, About, or the picture, and over the pane itself while no
 * surface is, as when the first read fails. So the claims and Take back control stay in reach in
 * every state of the pane, and nothing in the pane moves for them.
 * @param props The vault, its model for subject names, and whether the stream lost the server.
 * @param props.lost Whether the stream lost the server, which says nothing about ownership.
 * @returns The claims where they stand, or nothing until the pane holds a place for them.
 */
function ModelClaimsOver(props: ModelClaimsProps & { lost: boolean }): JSX.Element | null {
	const frames = useContext(ModelPaneContext)?.claimFrames;
	const frame = frames === undefined ? null : frameOnScreen(frames);
	if (frame === null) return null;
	return (
		<>
			{createPortal(
				<>
					{!props.lost && <ModelClaimsFailure vault={props.vault} />}
					<ModelClaims vault={props.vault} model={props.model} />
				</>,
				frame,
			)}
		</>
	);
}

/**
 * The surface on screen. A walkthrough hides the reading while it plays, and About covers the
 * picture. A hidden surface gives its place up, and the pane holds one under every surface.
 * @param frames The places that the surfaces of the pane hold.
 * @returns The place of the surface on top, or null while none holds one.
 */
function frameOnScreen(frames: ClaimFrames): HTMLElement | null {
	return frames.walkthrough ?? frames.about ?? frames.picture ?? frames.pane;
}

/**
 * The place that a surface holds for the claims while it is on screen. On the picture the claims
 * stand among its notices, which already lie over it. Elsewhere they lie over the top of the
 * surface, and `className` can lower them under what the top of the surface holds.
 * @param props The surface and where on it the claims stand.
 * @param props.frame The surface.
 * @param props.className Where the place lies on the surface.
 * @returns The place, or nothing outside a pane.
 */
function ModelClaimFrame(props: {
	readonly frame: ClaimFrame;
	readonly className?: string;
}): JSX.Element | null {
	const hold = useContext(ModelPaneContext)?.holdClaimFrame;
	const { frame } = props;
	const attach = useCallback(
		(element: HTMLElement | null) =>
			element === null || hold === undefined ? undefined : hold(frame, element),
		[hold, frame],
	);
	if (hold === undefined) return null;
	return (
		<div
			ref={attach}
			data-slot="model-claims-frame"
			data-frame={frame}
			className={cn(frame === "picture" ? "contents" : CLAIMS_LAYER, props.className)}
		/>
	);
}

/**
 * A current reading tells who holds its subjects and how to end that ownership. The claims stand
 * at the top centre of their surface, inside its frame, over it and never beside it, so a claim
 * that starts or ends moves nothing in the reading. Each pane shows the claims of the vault it
 * reads.
 * @param props The vault and its coherent model for subject names.
 * @returns Current claims, each with one explicit human action, or nothing.
 */
function ModelClaims(props: ModelClaimsProps): JSX.Element | null {
	const claims = useQuery(architectureClaimsQuery(props.vault));
	if (claims.data === undefined || !claims.data.success) return null;
	if (claims.data.claims.length === 0) return null;
	return (
		<div
			data-slot="model-claims"
			className="mt-3 flex max-w-[calc(100%-1.5rem)] flex-col gap-2 self-center"
		>
			{claims.data.claims.map((claim) => (
				<ModelClaim key={claim.id} {...props} claim={claim} />
			))}
		</div>
	);
}

interface ModelClaimProps extends ModelClaimsProps {
	claim: ArchitectureClaim;
}

/**
 * Say that ownership cannot be read. It lies over the surface with the claims, where a line in
 * the header above it would move it.
 * @param props The vault.
 * @param props.vault The addressed vault.
 * @returns The refusal, or nothing.
 */
function ModelClaimsFailure(props: { vault: string }): JSX.Element | null {
	const claims = useQuery(architectureClaimsQuery(props.vault));
	const message =
		claims.error?.message ?? (claims.data?.success === false ? claims.data.error : null);
	if (message === null) return null;
	return (
		<output data-slot="model-claims-failure" className="text-body bg-background px-4 py-2">
			{message}
		</output>
	);
}

/**
 * Taking back a claim changes runtime ownership, never authored architecture. The writer stays
 * out: it is an identity such as a thread's, which says nothing to a reader. The claim is the
 * site's claim card: a live ring round it, the facts as terms, and Take back control as its one
 * primary action. It has no timer and no key to dismiss it: only the end of the claim or the
 * take-back ends it.
 * @param props The exact claim identity and its current subject names.
 * @returns The state, subjects, purpose, time, and take-back control.
 */
function ModelClaim(props: ModelClaimProps): JSX.Element {
	const { vault, claim, model } = props;
	const client = useQueryClient();
	const { mutate, isPending, error } = useMutation({
		/**
		 * End the displayed claim as an explicit human action.
		 * @returns The remaining claims.
		 */
		mutationFn: () => takeBackClaim(vault, claim.id),
		/**
		 * Read ownership again after the mutation settles.
		 * @returns The fresh claim read.
		 */
		onSuccess: () => client.invalidateQueries({ queryKey: architectureModelKeys.claims(vault) }),
	});
	const release = useCallback((): void => mutate(), [mutate]);
	return (
		<div
			data-slot="model-claim"
			data-claim-id={claim.id}
			data-target-state={claim.target.state ?? ""}
			className="bg-sidebar rounded-table text-body shadow-float inset-ring-status/40 flex w-[420px] max-w-full flex-col gap-2.5 p-4 inset-ring"
		>
			<div className="flex items-center justify-between gap-3">
				<ClaimHead since={claim.since} />
				<Button
					size="sm"
					data-slot="model-take-back"
					onClick={release}
					disabled={isPending}
					aria-busy={isPending}
				>
					<RiLockUnlockLine aria-hidden="true" />
					{isPending ? "Taking back control…" : "Take back control"}
				</Button>
			</div>
			<dl className="grid min-w-0 grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-0.5">
				<ClaimFact label="State">{claimedStateName(claim, model)}</ClaimFact>
				<ClaimFact label="Doing">{claim.reason}</ClaimFact>
				<ClaimFact label="Subjects" whole>
					{claimedSubjects(claim, model)}
				</ClaimFact>
			</dl>
			{error !== null && (
				<span role="alert" className="text-destructive text-body">
					{error.message}
				</span>
			)}
		</div>
	);
}

/**
 * That an agent holds the subjects, with the live dot, and since when.
 * @param props When the claim began.
 * @param props.since The ISO time the claim began.
 * @returns The head.
 */
function ClaimHead(props: { readonly since: string }): JSX.Element {
	return (
		<div className="flex shrink-0 flex-col gap-0.5">
			<span className="text-control text-foreground flex items-center gap-2 font-semibold">
				<span
					aria-hidden="true"
					className="bg-status size-1.5 rounded-full shadow-[0_0_0_3px_color-mix(in_oklch,var(--status)_25%,transparent)]"
				/>
				Claimed
			</span>
			<time dateTime={props.since} className="text-technical text-muted-foreground font-mono">
				since {clockTime(props.since)}
			</time>
		</div>
	);
}

/**
 * One fact of a claim, as a term and its words. A fact keeps one line unless it is whole.
 * @param props The term and its words.
 * @param props.label The term.
 * @param props.children The words.
 * @param props.whole Whether the words wrap, so every one of them shows.
 * @returns The fact.
 */
function ClaimFact(props: {
	readonly label: string;
	readonly children: string;
	readonly whole?: boolean;
}): JSX.Element {
	return (
		<>
			<dt className="text-muted-foreground">{props.label}</dt>
			<dd
				className={
					props.whole === true ? "text-foreground break-words" : "text-foreground truncate"
				}
				title={props.children}
			>
				{props.children}
			</dd>
		</>
	);
}

/**
 * Claims identify the state they affect, independently of the pane's selected state.
 * @param claim The exact runtime claim.
 * @param model The coherent catalogue available to this reader.
 * @returns Its authored state name, or words for a state this reading does not hold.
 */
function claimedStateName(claim: ArchitectureClaim, model: ModelClaimsProps["model"]): string {
	if (!model?.success) return "Planning model";
	const states = [model.selectedState, model.manifest.current, ...model.proposals];
	return states.find((state) => state?.id === claim.target.state)?.name ?? "A state of this model";
}

/**
 * Name what a claim holds, every subject by its name: the whole model, a module, a relationship
 * by its ends, a flow or a walkthrough. A subject that this reading lacks, such as a module new in
 * a draft, is named as new in the claimed state.
 * @param claim The claim.
 * @param model The reading, for its names.
 * @returns The names, in the claim's order.
 */
function claimedSubjects(claim: ArchitectureClaim, model: ModelClaimsProps["model"]): string {
	const names = model?.success ? subjectNames(model) : new Map<string, string>();
	const known = claim.subjects.flatMap((id) => names.get(id) ?? []);
	if (known.length === claim.subjects.length) return known.join(", ");
	const state = claimedStateName(claim, model);
	return known.length === 0
		? `Parts new in ${state}`
		: `${known.join(", ")}, and parts new in ${state}`;
}

/** A reading that answered. */
type Reading = Extract<ArchitectureModelRead, { success: true }>;

/**
 * The name of everything a claim can hold in a reading, by its identity.
 * @param reading The reading.
 * @returns The names.
 */
function subjectNames(reading: Reading): ReadonlyMap<string, string> {
	const modules = new Map(reading.modules.map((one) => [one.id, one.name]));
	const names = new Map(modules);
	names.set(reading.manifest.id, `${reading.manifest.name} (the whole model)`);
	for (const one of reading.relationships) names.set(one.id, relationshipName(one, modules));
	for (const one of reading.collections.flatMap((collection) => collection.flows)) {
		names.set(one.id, one.name);
	}
	for (const one of reading.walkthroughs) names.set(one.id, one.name);
	return names;
}

/**
 * A relationship by its ends, and its label when it has one.
 * @param relationship The relationship.
 * @param modules The modules' names.
 * @returns The name.
 */
function relationshipName(
	relationship: Reading["relationships"][number],
	modules: ReadonlyMap<string, string>,
): string {
	const ends = `${modules.get(relationship.from) ?? "?"} → ${modules.get(relationship.to) ?? "?"}`;
	return relationship.label === undefined ? ends : `${ends} (${relationship.label})`;
}

export { ModelClaimFrame, ModelClaimsOver };
