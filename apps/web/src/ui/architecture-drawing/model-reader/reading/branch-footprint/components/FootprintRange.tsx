import { useCallback, useMemo, type JSX } from "react";
import { Button } from "@archboard/ui-kit/components";
import type { SourceRefsAnswer } from "#ui/architecture-drawing/model-reader/access/clients/branch-footprint.ts";
import {
	RefPicker,
	type RefChoice,
} from "#ui/architecture-drawing/model-reader/reading/branch-footprint/components/RefPicker.tsx";
import type { FootprintChoice } from "#ui/architecture-drawing/model-reader/reading/branch-footprint/hooks/use-branch-footprint.ts";
import {
	againstChoices,
	type VaultStates,
} from "#ui/architecture-drawing/model-reader/reading/branch-footprint/rules/against.ts";

/** The value of the head list's first entry: the head of each checkout, which sends no head. */
const CHECKOUT = "";

/** Inputs for the range. */
interface FootprintRangeProps {
	readonly refs: SourceRefsAnswer | undefined;
	/** The states of the vault that the footprint reads, once read. */
	readonly states: VaultStates | undefined;
	readonly base: string | null;
	readonly head: string | null;
	readonly against: string | null;
	readonly choice: FootprintChoice;
	readonly onChoice: (choice: FootprintChoice) => void;
	readonly busy: boolean;
	readonly onRefresh: () => void;
}

/**
 * What a footprint reads, on one row: the base, the head, the state it is set against, and
 * Refresh at the end. A new head clears the chosen state, because another vault can be read.
 * @param props The range, its choices and what a choice does.
 * @returns The row.
 */
function FootprintRange(props: FootprintRangeProps): JSX.Element {
	const { refs, states, base, head, against, choice, onChoice } = props;
	const branches = useMemo(() => refChoices(refs), [refs]);
	const heads = useMemo(
		() => [{ value: CHECKOUT, label: checkedOut(refs), detail: "The checkout" }, ...branches],
		[refs, branches],
	);
	const stateChoices = useMemo(() => againstChoices(states), [states]);
	const chooseBase = useCallback(
		(next: string): void => onChoice({ ...choice, base: next }),
		[choice, onChoice],
	);
	const chooseHead = useCallback(
		(next: string): void =>
			onChoice({ ...choice, head: next === CHECKOUT ? null : next, against: undefined }),
		[choice, onChoice],
	);
	const chooseAgainst = useCallback(
		(next: string): void => onChoice({ ...choice, against: next }),
		[choice, onChoice],
	);
	return (
		<div data-slot="footprint-range" className="flex flex-wrap items-end gap-4">
			<RefPicker
				name="base"
				label="Base"
				value={base ?? ""}
				shown={base ?? "Choose a base"}
				choices={branches}
				free
				find="Find a branch, or type a ref"
				onChoose={chooseBase}
			/>
			<RefPicker
				name="head"
				label="Head"
				value={head ?? CHECKOUT}
				shown={head ?? checkedOut(refs)}
				choices={heads}
				free
				find="Find a branch, or type a ref"
				onChoose={chooseHead}
			/>
			<RefPicker
				name="against"
				label="Against"
				value={against ?? ""}
				shown={labelOf(stateChoices, against)}
				choices={stateChoices}
				free={false}
				find="Find a state"
				mono={false}
				disabled={stateChoices.length === 0}
				onChoose={chooseAgainst}
			/>
			<Button
				variant="outline"
				size="xs"
				data-slot="footprint-refresh"
				disabled={props.busy}
				onClick={props.onRefresh}
				className="ml-auto"
			>
				Refresh
			</Button>
		</div>
	);
}

/**
 * The branches a base or a head can be, local first, each naming the repositories that hold it.
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
 * What the head of each checkout is: the branch of the vault's checkout, or its commit when
 * detached.
 * @param answer The source refs, when read.
 * @returns The words.
 */
function checkedOut(answer: SourceRefsAnswer | undefined): string {
	const vault = answer?.vault;
	if (vault?.branch != null) return `${vault.branch} (checked out)`;
	if (vault?.commit != null) return `HEAD at ${vault.commit.slice(0, 7)} (checked out)`;
	return "HEAD of each checkout";
}

/**
 * What the state list's trigger shows.
 * @param choices The states.
 * @param value The chosen state.
 * @returns Its name, or what stands in its place.
 */
function labelOf(choices: readonly RefChoice[], value: string | null): string {
	if (value === null) return "Reading the states…";
	return choices.find((one) => one.value === value)?.label ?? value;
}

export { FootprintRange };
