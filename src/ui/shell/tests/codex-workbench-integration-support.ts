export function installFullscreen(): () => void {
	let fullscreenElement: Element | null = null;
	const documentDescriptor = Object.getOwnPropertyDescriptor(document, "fullscreenElement");
	const requestDescriptor = Object.getOwnPropertyDescriptor(Element.prototype, "requestFullscreen");
	const exitDescriptor = Object.getOwnPropertyDescriptor(document, "exitFullscreen");
	Object.defineProperty(document, "fullscreenElement", {
		configurable: true,
		get: () => fullscreenElement,
	});
	Object.defineProperty(Element.prototype, "requestFullscreen", {
		configurable: true,
		value() {
			fullscreenElement = document.querySelector(".shell");
			document.dispatchEvent(new Event("fullscreenchange"));
			return Promise.resolve();
		},
	});
	Object.defineProperty(document, "exitFullscreen", {
		configurable: true,
		value() {
			fullscreenElement = null;
			document.dispatchEvent(new Event("fullscreenchange"));
			return Promise.resolve();
		},
	});
	return () => {
		if (documentDescriptor)
			Object.defineProperty(document, "fullscreenElement", documentDescriptor);
		else Reflect.deleteProperty(document, "fullscreenElement");
		if (requestDescriptor)
			Object.defineProperty(Element.prototype, "requestFullscreen", requestDescriptor);
		else Reflect.deleteProperty(Element.prototype, "requestFullscreen");
		if (exitDescriptor) Object.defineProperty(document, "exitFullscreen", exitDescriptor);
		else Reflect.deleteProperty(document, "exitFullscreen");
	};
}
