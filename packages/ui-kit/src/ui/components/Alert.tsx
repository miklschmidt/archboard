// A callout that shows a state, with its parts on it: `Alert.Title`, `Alert.Description` and
// `Alert.Action`. The parts are the official shadcn ones, so the markup stays the registry's.

import {
	AlertAction,
	AlertDescription,
	AlertTitle,
	Alert as AlertRoot,
} from "#ui/components/shadcn/alert.tsx";

/** A callout that shows a state, with its title, description and action as its parts. */
const Alert = Object.assign(AlertRoot, {
	Action: AlertAction,
	Description: AlertDescription,
	Title: AlertTitle,
});

export { Alert };
