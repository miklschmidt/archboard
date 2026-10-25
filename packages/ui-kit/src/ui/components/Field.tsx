// A form field with its parts on it: `Field.Label`, `Field.Description`, `Field.Content` and
// `Field.Issues`, its validation messages, and `Field.Set` with `Field.Legend` for a group of
// fields. The layout parts are the official shadcn ones, so the markup stays the registry's.

import { FieldIssues } from "#ui/components/dialog-parts/FieldIssues.tsx";
import {
	FieldContent,
	FieldDescription,
	FieldLabel,
	FieldLegend,
	Field as FieldRoot,
	FieldSet,
} from "#ui/components/shadcn/field.tsx";

/** A form field, with its label, description, content and messages, and the set that groups fields. */
const Field = Object.assign(FieldRoot, {
	Content: FieldContent,
	Description: FieldDescription,
	Issues: FieldIssues,
	Label: FieldLabel,
	Legend: FieldLegend,
	Set: FieldSet,
});

export { Field };
