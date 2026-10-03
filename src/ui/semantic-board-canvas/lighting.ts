// What the picture lights when a part is poked, as an entrypoint of the module.
// The stage lights it itself and needs none of this by name; it is here so that
// what a poke lights can be held to from outside the module's private folders.

export { litBy } from "@/ui/semantic-board-canvas/lib/connections";
