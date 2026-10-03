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

The picture gives five answers. Each has one owner in `src/ui/semantic-board-canvas`.

1. **The camera moves under a hand.** A turn of the wheel or a pinch zooms by an
   amount in proportion to the turn. The camera eases toward where the hand sent
   it (`EXPLORING_MS.cameraEase`), so a hard flick adds up and eases once. The arrow
   keys ease in the same way. A released drag carries on at its release speed and
   slows to rest (`cameraFling`). The `0` key glides to the whole board. A press
   stops all of it where it is drawn. The frame loop runs only while something
   moves.
2. **The picture answers a poke.** The part that is picked out, or that the
   pointer rests on, lights what it is wired to (the Light in `CONTEXT.md`). The
   rest recedes. The relationships that light are drawn on once, from source to
   target. Seen from far, relationship labels go, because the cards already draw
   their names alone. A lit or picked label stays.
3. **The list and the picture answer each other.** A row of the relationship list
   lights its relationship while the pointer or the focus is on the row. A pick
   that somebody other than the reader made, from the list or by a command,
   brings the part into view once (`reveal`). A trace (`CONTEXT.md`) lights what
   a part reaches onward or back, each hop more faintly and one hop after
   another (`reachHop`).
4. **A card opens its board by flight (the Dive).** The board's picture is put
   inside the card, in the picture's own units, as large as the card allows with
   its shape kept. The camera glides into the card (`dive`). The flight ends with
   the picture inside the card exactly where the board stands once it is opened
   and fitted. Then the pane does what it has always done to open the board, and
   the board's picture takes over from the one inside the card in the same
   commit, with no entrance. Going back runs the flight the other way, from the
   card that opened the board.
5. **Anything that would make the flight worse is the plain way.** The plain way
   is the only way to open a board, and the flight ends in it. It is used when the
   reader asked for no motion, when a walkthrough is presented, when the card is
   not drawn, when the board's picture is not to hand within `divePrefetch`, and
   when the picture changes under the flight. A second request ends the first at
   once and is made the plain way. A press, a turn of the wheel or a key (Tab and
   the modifier keys excepted) ends a flight at its end and goes no further.

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
The gaps under a line that crosses over stay, and so does the picture's own rule
for a picked route. The renderer's output does not change. It tells the two
kinds of cutout apart by their caps, butt for a trunk and round for a crossing,
and a test of the renderer holds it to that.

The surface's classes reach every descendant, so they would reach the board
inside a card too. One rule in `app.css` gives that board no filter. The board
inside a card also carries `is-far` when it will be seen from far where the
flight meets it, so it draws the same cards as the board that opens.

## Why

- **Presentation, so nothing is written.** All five answers are the reader's
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
- **Every duration is in one file.** They live in `src/shared/timing/lib/exploring.ts`
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

## Consequences

- A card with a drill-down opens its board about 0.7 s after the reader asks, when
  the board's picture is to hand. Pictures are drawn ahead, so this is the normal
  case. Otherwise the board opens at once, as before.
- `useAutoFit` takes the camera from its caller and fits it to a picture that a
  flight arrived at without gliding.
- Three owners hold the answers. Module tests hold the arithmetic and the order
  of events. The browser owner `semantic-board-exploring` holds what only a real
  page can show: the recede, the labels of the far view, and the flight landing
  where it says.
