// The registered checkout an opener test opens.

import { useCallback, useId } from "react";

import type { OpenerSettingsReply } from "@/shared/code-target";
import { Badge } from "@/ui/components/badge";
import { Field, FieldDescription, FieldLabel } from "@/ui/components/field";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/ui/components/select";
import { Technical } from "@/ui/dialog-parts";

type CheckoutChoice = OpenerSettingsReply["repositories"][number];

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
function RepositoryField(props: RepositoryFieldProps): React.JSX.Element {
	const id = useId();
	const { onChange } = props;
	const handleChange = useCallback((value: string | null) => onChange(value), [onChange]);
	const chosen = props.repositories.find((checkout) => checkout.repository === props.value);
	return (
		<Field>
			<FieldLabel htmlFor={id}>Test with repository</FieldLabel>
			<Select value={props.value} onValueChange={handleChange} disabled={props.disabled}>
				<SelectTrigger id={id} className="w-full">
					<SelectValue placeholder="No registered checkout" />
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

/** Inputs for one repository entry. */
interface RepositoryItemProps {
	checkout: CheckoutChoice;
}

/**
 * One checkout, with a warning badge when it cannot be opened as registered.
 * @param props The checkout.
 * @returns A select item.
 */
function RepositoryItem(props: RepositoryItemProps): React.JSX.Element {
	const { checkout } = props;
	return (
		<SelectItem value={checkout.repository}>
			<span className="font-mono">{checkout.repository}</span>
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
