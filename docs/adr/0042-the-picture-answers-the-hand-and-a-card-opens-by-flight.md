---
status: accepted
---

# The picture answers the hand, and a card opens by flight

A reader who does not know a system learns it by poking at its picture. A still
drawing leaves the work to the reader. They must find what a part is wired to,
follow a line with the eye, and find their place again when a board changes.
TASK-386 made the picture answer the reader's hand. It did this on 2026-10-03.

The browser still writes nothing. Every answer below is presentation state, in
the same class as the camera and the selection (ADR 0023). It is never sent to
the server and never part of an address.

## Decision

1. **A card opens its board by flight (the Dive).** The board's picture is put
   inside the card, in the picture's own units, as large as the card allows with
   its shape kept. The camera glides into the card (`dive`). The flight ends with
   the picture inside the card exactly where the board stands once it is opened
   and fitted. Then the pane does what it has always done to open the board, and
   the board's picture takes over from the one inside the card in the same
   commit, with no entrance.
2. **Anything that would make the flight worse is the plain way.** The plain way
   is the only way to open a board, and the flight ends in it. It is used when the
   reader asked for no motion, when a walkthrough is presented, when the card is
   not drawn, when the board's picture is not to hand within `divePrefetch`, and
   when the picture changes under the flight.
   ADR 0071 amends this: a move to a deeper module flies through the nearest drawn
   card that holds it, a move at the same depth never flies, and the plain way
   between two boards of the tree is a passage.

## How the picture is marked

The viewer marks the picture's own groups with classes (`is-lit`, `is-reach-2`
and so on). The surface carries the strength (`is-probing`, `is-far`). Rules in
`app.css` turn the marks into an opacity filter. The picture's own markup and
style sheet do not change, so an export is the same bytes as before. The
drawn-on lines are copies in a layer that the viewer adds and removes.

Where routes of one kind lie on one line, the renderer has one of them draw each
shared stretch and cuts it from the others with a mask, so a trunk reads as one
line. The light is by relationship, so a lit route would be lit only up to the
junction where it joins the trunk, and pale along it. The viewer points a lit
route at a copy of its mask without those cutouts (`lib/lit-ink.ts`, TASK-387).
The renderer's output does not change. It tells the two
kinds of cutout apart by their caps, butt for a trunk and round for a crossing,
and a test of the renderer holds it to that.

## Why

- **Presentation, so nothing is written.** All the answers are the reader's
  attention. An agent's board is unchanged by them. A viewer that wrote anything
  would break ADR 0023.
- **A filter, not a layer.** A recede painted as a layer over the picture would
  repaint the picture on every move, and the Still Shadow Rule in `DESIGN.md`
  forbids it. A filter on the groups multiplies with the opacity that the
  picture's own style sheet and a picture flight write.
- **One camera.** The board sits inside the card in the parent's units, so the one
  camera carries both pictures. Nothing has to be matched by eye. The flight ends
  where the board stands because the arithmetic puts it there, and the browser
  owner holds it to two pixels.
- **Every duration is in one file.** They live in `packages/timing/src/shared/constants/exploring.ts`
  with what each pulls against, and everything that moves runs on the frame clock
  (ADR 0041), so a recording renders it frame by frame.

## Considered and not chosen

- A dim layer, blur or halo over the picture for the light. It breaks the Still
  Shadow Rule and slows a drag.
- Hover and light rules in the picture's style sheet. It would change every
  export for a state that only the viewer has.
- A second layer, with its own camera, for the board in the card. It must be kept
  in step with the first, and the two can disagree by a pixel at the hand-over.
- A cross-fade between two whole pictures with no shared geometry. It hides the
  fact that the board in the card and the board that opens are the same board.
