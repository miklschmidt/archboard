// What the person sees when the presented pane has lost its connection.

/** Inputs for the recovery message. */
interface RecoveryMessageProps {
	message: string;
}

/**
 * What the person sees when the presented pane has lost its connection.
 * @param props The plain message.
 * @returns The message, centred where the canvas was.
 */
function RecoveryMessage(props: RecoveryMessageProps): React.JSX.Element {
	return (
		<section
			aria-label="Presentation recovery"
			className="flex min-h-0 flex-1 flex-col items-center justify-center gap-2 p-8 text-center"
		>
			<p className="text-title">The presented pane is disconnected</p>
			<p className="text-muted-foreground text-body max-w-prose">{props.message}</p>
		</section>
	);
}

export { RecoveryMessage, type RecoveryMessageProps };
