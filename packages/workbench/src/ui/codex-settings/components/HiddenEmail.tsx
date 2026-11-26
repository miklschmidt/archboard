import { useCallback, useState, type JSX } from "react";
import { Tooltip, cn } from "@archboard/ui-kit/components";

/**
 * An email address blurred until it is clicked, so a shared screen does not show it. Clicking it
 * again blurs it again, and hovering it says which a click does.
 * @param props The address.
 * @param props.email The email address.
 * @returns The address as a toggle.
 */
function HiddenEmail(props: { readonly email: string }): JSX.Element {
	const [shown, setShown] = useState(false);
	const toggle = useCallback(() => {
		setShown((current) => !current);
	}, []);

	return (
		<Tooltip>
			<Tooltip.Trigger
				type="button"
				aria-label={shown ? `${props.email}, hide account email` : "Reveal account email"}
				onClick={toggle}
				data-slot="codex-account-email"
				className="focus-visible:ring-ring cursor-pointer rounded-sm outline-none focus-visible:ring-2"
			>
				<span
					aria-hidden="true"
					className={cn(
						"inline-block motion-safe:transition-[filter]",
						!shown && "blur-sm select-none",
					)}
				>
					{props.email}
				</span>
			</Tooltip.Trigger>
			<Tooltip.Content>{shown ? "Click to hide" : "Click to reveal"}</Tooltip.Content>
		</Tooltip>
	);
}

export { HiddenEmail };
