// What the picture lights when a part is poked, and how, as an entrypoint of the
// module. The stage lights it itself and needs none of this by name; it is here
// so that what a poke lights can be held to from outside the module's private
// folders.

export { litBy } from "@/ui/semantic-board-canvas/lib/connections";
export { lightInk } from "@/ui/semantic-board-canvas/lib/lit-ink";
export { reachOf, type Reach, type Way } from "@/ui/semantic-board-canvas/lib/reach";
