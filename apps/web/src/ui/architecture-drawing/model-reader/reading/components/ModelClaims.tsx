import { useCallback, useEffect, type JSX } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import type { ArchitectureClaim, ArchitectureModelRead } from "@archboard/model/contract";
import { RiLockUnlockLine } from "@remixicon/react";
import { Button } from "@archboard/ui-kit/components";
import { takeBackClaim } from "#ui/architecture-drawing/model-reader/access/clients/claims.ts";
import {
	architectureClaimsQuery,
	architectureModelKeys,
} from "#ui/architecture-drawing/model-reader/access/clients/queries.ts";
import { clockTime } from "#ui/shell/rules/time.ts";

interface ModelClaimsProps {
	vault: string;
	model: ArchitectureModelRead | undefined;
}

/**
 * A current reading tells who holds its subjects and how to end that ownership. Each claim floats
 * as a persistent toast in the shell's notice corner, so a claim that starts or ends moves
 * nothing in the reading. This draws no layout of its own.
 * @param props The vault and its coherent model for subject names.
 * @returns Current claims, each with one explicit human action, as toasts.
 */
function ModelClaims(props: ModelClaimsProps): JSX.Element | null {
	const claims = useQuery(architectureClaimsQuery(props.vault));
	if (claims.data === undefined || !claims.data.success) return null;
	return (
		<>
			{claims.data.claims.map((claim) => (
				<ModelClaimToast key={claim.id} {...props} claim={claim} />
			))}
		</>
	);
}

/** How many mounted readings show each claim, by its toast. Two panes can read one vault. */
const readings = new Map<string, number>();

interface ModelClaimProps extends ModelClaimsProps {
	claim: ArchitectureClaim;
}

/**
 * Hold one toast for a claim while a reading shows it. It has no timer and no dismiss: only the
 * end of the claim or the take-back ends it. Two panes on one vault share the toast, which stays
 * until the last of them stops showing the claim. Taking back a claim changes runtime ownership,
 * never authored architecture. Every change of the card goes through the stack, which measures
 * the toast again.
 * @param props The exact claim identity and its current subject names.
 * @returns Nothing: the toast lies in the shell's notice stack.
 */
function ModelClaimToast(props: ModelClaimProps): null {
	const { vault, claim, model } = props;
	const id = `claim:${claim.id}`;
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
	useEffect(() => {
		readings.set(id, (readings.get(id) ?? 0) + 1);
		return () => {
			const left = (readings.get(id) ?? 1) - 1;
			if (left > 0) {
				readings.set(id, left);
				return;
			}
			readings.delete(id);
			toast.dismiss(id);
		};
	}, [id]);
	useEffect(() => {
		toast.custom(
			() => (
				<ModelClaim
					claim={claim}
					model={model}
					pending={isPending}
					error={error?.message ?? null}
					onTakeBack={release}
				/>
			),
			{ id, duration: Infinity, dismissible: false },
		);
	}, [id, claim, model, isPending, error, release]);
	return null;
}

/**
 * Say that ownership cannot be read. It lies over the picture with the other notices, which a
 * line in the header above the picture would move.
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

/** The card's claim and subject names, with how its take-back stands. */
interface ModelClaimCardProps extends Pick<ModelClaimProps, "claim" | "model"> {
	pending: boolean;
	error: string | null;
	onTakeBack: () => void;
}

/**
 * The writer stays out: it is an identity such as a thread's, which says nothing to a reader. The
 * claim is the site's claim card: a live ring round it, the facts as terms, and Take back control
 * as its one primary action. It floats as a notice, so its head and key share the first line and
 * the facts stand under them.
 * @param props The claim, its subject names and how its take-back stands.
 * @returns The state, subjects, purpose, time, and take-back control.
 */
function ModelClaim(props: ModelClaimCardProps): JSX.Element {
	const { claim, model, pending, error } = props;
	return (
		<div
			data-slot="model-claim"
			data-claim-id={claim.id}
			data-target-state={claim.target.state ?? ""}
			className="bg-sidebar rounded-table text-body shadow-float inset-ring-status/40 flex w-(--width) flex-col gap-2.5 p-4 inset-ring"
		>
			<div className="flex items-center justify-between gap-3">
				<ClaimHead since={claim.since} />
				<Button
					size="sm"
					data-slot="model-take-back"
					onClick={props.onTakeBack}
					disabled={pending}
					aria-busy={pending}
				>
					<RiLockUnlockLine aria-hidden="true" />
					{pending ? "Taking back control…" : "Take back control"}
				</Button>
			</div>
			<dl className="grid min-w-0 grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-0.5">
				<ClaimFact label="State">{claimedStateName(claim, model)}</ClaimFact>
				<ClaimFact label="Doing">{claim.reason}</ClaimFact>
				<ClaimFact label="Subjects">{claimedSubjects(claim, model)}</ClaimFact>
			</dl>
			{error !== null && (
				<span role="alert" className="text-destructive text-body">
					{error}
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
 * One fact of a claim, as a term and its words.
 * @param props The term and its words.
 * @param props.label The term.
 * @param props.children The words.
 * @returns The fact.
 */
function ClaimFact(props: { readonly label: string; readonly children: string }): JSX.Element {
	return (
		<>
			<dt className="text-muted-foreground">{props.label}</dt>
			<dd className="text-foreground truncate" title={props.children}>
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
 * Name what a claim holds. A subject that this reading lacks, such as a module new in a draft, is
 * counted: an identity says nothing to a reader.
 * @param claim The claim.
 * @param model The reading, for its names.
 * @returns The names.
 */
function claimedSubjects(claim: ArchitectureClaim, model: ModelClaimsProps["model"]): string {
	const reading = model?.success ? model : undefined;
	const names = claim.subjects.flatMap(
		(id) => reading?.modules.find((one) => one.id === id)?.name ?? [],
	);
	const others = claim.subjects.length - names.length;
	if (others === 0) return names.join(", ");
	const more = `${others} ${others === 1 ? "subject" : "subjects"}`;
	return names.length === 0 ? more : `${names.join(", ")} and ${more}`;
}

export { ModelClaims, ModelClaimsFailure };
