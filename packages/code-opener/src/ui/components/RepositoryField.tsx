// The registered checkout an opener test opens, named as the navigator names
// its repository (TASK-477).

import { useCallback, useId, type JSX, type ReactNode } from "react";

import type { OpenerSettingsReply } from "#shared/schemas/opener-settings.ts";
import { Badge } from "@archboard/ui-kit/display";
import {
	Field,
	FieldDescription,
	FieldLabel,
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@archboard/ui-kit/controls";
import { Technical } from "@archboard/ui-kit/dialog-parts";
import { RepositoryName } from "@archboard/ui-kit/repository-name";

type CheckoutChoice = OpenerSettingsReply["repositories"][number];

/** What the closed field says while no checkout is chosen. */
const NO_CHOICE = "No registered checkout";

/** Inputs for the repository field. */
interface RepositoryFieldProps {
	repositories: readonly CheckoutChoice[];
	value: string | null;
	disabled: boolean;
	onChange: (repository: string | null) => void;
}

/**
 * The registered checkout a test opens.
 * @param props The checkouts, the chosen one and the change handler.
 * @returns The field.
 */
function RepositoryField(props: RepositoryFieldProps): JSX.Element {
	const id = useId();
	const { onChange } = props;
	const handleChange = useCallback((value: string | null) => onChange(value), [onChange]);
	const chosen = props.repositories.find((checkout) => checkout.repository === props.value);
	return (
		<Field>
			<FieldLabel htmlFor={id}>Test with repository</FieldLabel>
			<Select value={props.value} onValueChange={handleChange} disabled={props.disabled}>
				<SelectTrigger id={id} className="w-full">
					<SelectValue>{chosenName}</SelectValue>
				</SelectTrigger>
				<SelectContent>
					{props.repositories.map((checkout) => (
						<RepositoryItem key={checkout.repository} checkout={checkout} />
					))}
				</SelectContent>
			</Select>
			<FieldDescription>
				{chosen ? (
					<Technical>{chosen.root}</Technical>
				) : (
					"A test opens a checkout's root with the chosen opener."
				)}
			</FieldDescription>
		</Field>
	);
}

/**
 * The chosen checkout in the closed field, named as its entry in the list names it.
 * @param value The repository, or null while none is chosen.
 * @returns The name, or the words for no choice.
 */
function chosenName(value: string | null): ReactNode {
	return value === null ? NO_CHOICE : <RepositoryName identity={value} className="font-mono" />;
}

/** Inputs for one repository entry. */
interface RepositoryItemProps {
	checkout: CheckoutChoice;
}

/**
 * One checkout, with a warning badge when it cannot be opened as registered.
 * @param props The checkout.
 * @returns A select item.
 */
function RepositoryItem(props: RepositoryItemProps): JSX.Element {
	const { checkout } = props;
	return (
		<SelectItem value={checkout.repository}>
			<RepositoryName identity={checkout.repository} className="font-mono" />
			{!checkout.exists && (
				<Badge variant="outline" className="border-warning/60 text-warning-foreground">
					missing
				</Badge>
			)}
			{checkout.exists && !checkout.identityMatches && (
				<Badge variant="outline" className="border-warning/60 text-warning-foreground">
					identity changed
				</Badge>
			)}
		</SelectItem>
	);
}

export { RepositoryField, type RepositoryFieldProps };
