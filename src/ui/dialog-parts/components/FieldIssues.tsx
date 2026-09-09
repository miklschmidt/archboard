// The validation messages under one dialog field.

import { useMemo, type JSX } from "react";

import { FieldError } from "@/ui/components/field";

/** Inputs for a field's validation messages. */
interface FieldIssuesProps {
	messages: readonly string[];
}

/**
 * The validation messages under one field, through the official error slot.
 * @param props The messages.
 * @returns The field error, which renders nothing when there is none.
 */
function FieldIssues(props: FieldIssuesProps): JSX.Element {
	const { messages } = props;
	const errors = useMemo(() => messages.map((message) => ({ message })), [messages]);
	return <FieldError errors={errors} />;
}

export { FieldIssues, type FieldIssuesProps };
