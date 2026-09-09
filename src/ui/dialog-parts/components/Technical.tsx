// An identifier, path, version or time set in the mono face.

/** Inputs for a technical value. */
interface TechnicalProps {
	children: React.ReactNode;
}

/**
 * An identifier, path, version or time in the mono face. A long value wraps
 * over three lines at most and carries its full text as a title.
 * @param props The value.
 * @returns The value as code.
 */
function Technical(props: TechnicalProps): React.JSX.Element {
	const { children } = props;
	return (
		<code
			title={typeof children === "string" ? children : undefined}
			className="text-technical line-clamp-3 font-mono break-all"
		>
			{children}
		</code>
	);
}

export { Technical, type TechnicalProps };
