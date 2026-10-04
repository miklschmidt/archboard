// What a README asset's producer is made from, in one import: the browser, the encoder, the
// filming steps, the producer contract, the take's server and the tools. Each producer imports this
// surface rather than every sibling it uses.

// oxlint-disable-next-line archboard/absolute-imports -- scripts/ has no alias root; @/ resolves only into src/
export { Browser, now, type Page } from "./browser.ts";
// oxlint-disable-next-line archboard/absolute-imports -- scripts/ has no alias root; @/ resolves only into src/
export { encodeExcerpt, encodeThumbnail, type Crop } from "./encode.ts";
export {
	Terminal,
	encodeTake,
	filmTogether,
	fit,
	foldSidebars,
	moment,
	present,
	stageUrl,
	withTake,
	type Moment,
	// oxlint-disable-next-line archboard/absolute-imports -- scripts/ has no alias root; @/ resolves only into src/
} from "./film.ts";
// oxlint-disable-next-line archboard/absolute-imports -- scripts/ has no alias root; @/ resolves only into src/
export { inRepository, readmeFile, type MakeContext, type Producer } from "./producer.ts";
// oxlint-disable-next-line archboard/absolute-imports -- scripts/ has no alias root; @/ resolves only into src/
export { readBoard, startServer, type TakeServer, type TrackedVault } from "./server.ts";
// oxlint-disable-next-line archboard/absolute-imports -- scripts/ has no alias root; @/ resolves only into src/
export { ffmpeg, inOrder, pyftsubsetCommand, run, scratch } from "./tools.ts";
