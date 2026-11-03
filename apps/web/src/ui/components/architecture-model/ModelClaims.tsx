import { useCallback, type JSX } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ArchitectureClaim, ArchitectureModelRead } from "@archboard/model/contract";
import { Button } from "@archboard/ui-kit/components";
import { takeBackClaim } from "#ui/clients/architecture-model/claims.ts";
import {
	architectureClaimsQuery,
	architectureModelKeys,
} from "#ui/clients/architecture-model/queries.ts";
import { clockTime } from "#ui/rules/shell/time.ts";

interface ModelClaimsProps {
	vault: string;
	model: ArchitectureModelRead | undefined;
}

/**
 * A current reading shows who holds its subjects and how to end that ownership.
 * @param props The vault and its coherent model for subject names.
 * @returns Current claims, with one explicit human action per claim.
 */
function ModelClaims(props: ModelClaimsProps): JSX.Element | null {
	const claims = useQuery(architectureClaimsQuery(props.vault));
	if (claims.data === undefined || !claims.data.success) return null;
	return (
		<>
			{claims.data.claims.map((claim) => (
				<ModelClaim key={claim.id} {...props} claim={claim} />
			))}
		</>
	);
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

interface ModelClaimProps extends ModelClaimsProps {
	claim: ArchitectureClaim;
}

/**
 * Taking back a claim changes runtime ownership, never authored architecture. The writer stays
 * out: it is an identity such as a thread's, which says nothing to a reader.
 * @param props The exact claim identity and its current subject names.
 * @returns The state, subjects, purpose, time, and take-back control.
 */
function ModelClaim(props: ModelClaimProps): JSX.Element {
	const { vault, claim, model } = props;
	const client = useQueryClient();
	const takeBack = useMutation({
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
	const { mutate } = takeBack;
	const release = useCallback((): void => mutate(), [mutate]);
	return (
		<div
			data-slot="model-claim"
			data-claim-id={claim.id}
			data-target-state={claim.target.state ?? ""}
			className="border-border bg-status-subtle text-status-foreground text-body flex shrink-0 items-center gap-3 border-b px-4 py-2"
		>
			<div className="min-w-0 flex-1">
				<p className="truncate">
					<span className="font-semibold">{claimedStateName(claim, model)}</span> ·{" "}
					{claimedSubjects(claim, model)}
				</p>
				<p className="truncate">{claim.reason}</p>
			</div>
			<time dateTime={claim.since} className="text-technical shrink-0">
				Since {clockTime(claim.since)}
			</time>
			{takeBack.isError && (
				<span role="alert" className="text-destructive text-body">
					{takeBack.error.message}
				</span>
			)}
			<Button
				variant="outline"
				size="sm"
				data-slot="model-take-back"
				onClick={release}
				disabled={takeBack.isPending}
				aria-busy={takeBack.isPending}
			>
				{takeBack.isPending ? "Taking back control…" : "Take back control"}
			</Button>
		</div>
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
