// A timer started at evaluation time is started again on every reload, and
// nothing stops the one before it. After ten reloads the canvas is doing this
// ten times a tick.

const tick = () => {
  // whatever the timer does
};

setInterval(tick, 1000);
