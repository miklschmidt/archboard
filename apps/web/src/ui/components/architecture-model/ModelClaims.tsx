import { useCallback, type JSX } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ArchitectureClaim, ArchitectureModelRead } from "@archboard/board/model";
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
	if (claims.isError)
		return <output className="text-body px-4 py-2">{claims.error.message}</output>;
	if (claims.data === undefined) return null;
	if (!claims.data.success)
		return <output className="text-body px-4 py-2">{claims.data.error}</output>;
	return (
		<>
			{claims.data.claims.map((claim) => (
				<ModelClaim key={claim.id} {...props} claim={claim} />
			))}
		</>
	);
}

interface ModelClaimProps extends ModelClaimsProps {
	claim: ArchitectureClaim;
}

/**
 * Taking back a claim changes runtime ownership, never authored architecture.
 * @param props The exact claim identity and its current subject names.
 * @returns The writer, purpose, subjects, time, and take-back control.
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
	const names = claim.subjects.map((id) =>
		model?.success ? (model.modules.find((module) => module.id === id)?.name ?? id) : id,
	);
	return (
		<div
			data-slot="model-claim"
			data-claim-id={claim.id}
			className="border-border bg-status-subtle text-status-foreground text-body flex shrink-0 items-center gap-3 border-b px-4 py-2"
		>
			<div className="min-w-0 flex-1">
				<p className="truncate">
					<span className="font-semibold">{claim.writer}</span> · {names.join(", ")}
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

export { ModelClaims };
