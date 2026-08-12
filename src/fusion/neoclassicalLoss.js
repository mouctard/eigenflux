// Neoclassical ripple transport: in a stellarator's non-axisymmetric field, particles
// trapped in local ripples of |B| follow radial drift orbits that -- unlike a tokamak's
// axisymmetric banana orbits -- don't automatically close on themselves. Coulomb collisions
// randomly kick a particle's pitch angle; in the "1/nu" long-mean-free-path regime relevant
// at reactor temperatures (collision frequency nu is low when plasma is hot), that random
// kick can be enough to put a particle onto a loss orbit that carries it to the wall before
// it thermalizes. This is a genuinely stochastic process -- real random collisional
// scattering, not a periodic one -- exactly the transport channel quasi-symmetric designs
// (all three configurations on this page: W7-X's quasi-isodynamic optimization, HSX's
// quasi-helical symmetry, NCSX's quasi-axisymmetry) exist specifically to suppress.
//
// The literature is clear this channel is real and can be severe (transport scaling
// unfavorably as collisionality drops is exactly the wrong direction for a hot reactor
// plasma), but doesn't give one trustworthy per-device number to calibrate against -- the
// same illustrative range is used for all three configurations here rather than fabricated
// per-device precision. See stellarator.html's "How this works" for the full writeup.
//
// Modeled as a Poisson process: loss "events" (a burst of particles crossing the last closed
// flux surface) arrive at random real-time intervals with mean rate EVENT_RATE_HZ -- the
// standard way to model a memoryless random-arrival process, via inverse-CDF sampling of the
// exponential inter-arrival distribution (Math.random(), not a periodic function, since
// pitch-angle-scattering events genuinely don't have a preferred phase). Each event derates
// confined power/energy by a random fraction, recovering via real exponential relaxation as
// the loss subsides and confinement re-establishes.
const EVENT_RATE_HZ = 0.6; // mean event arrival rate
const MIN_LOSS_FRAC = 0.03; // illustrative range: instantaneous derating at the moment of an event
const MAX_LOSS_FRAC = 0.12;
const RECOVERY_S = 0.8; // real-time exponential recovery after each event

function drawInterarrivalTime() {
  // Exponential distribution via inverse-CDF sampling: for a Poisson process with rate r,
  // inter-arrival times are exponentially distributed with mean 1/r.
  return -Math.log(1 - Math.random()) / EVENT_RATE_HZ;
}

// Independent per shot (each Play gets its own random event sequence) -- create one, then
// call reset() on every fresh shot (main.js's resetShot).
export function createLossProcess() {
  let nextEventAt = drawInterarrivalTime();
  let lastEventAt = -Infinity;
  let lastEventMag = 0;

  // Advances the process to real time t (seconds since this shot's ignition) and returns the
  // current derating factor in (1 - MAX_LOSS_FRAC, 1]. t must be non-decreasing across calls.
  function factorAt(t) {
    while (t >= nextEventAt) {
      lastEventAt = nextEventAt;
      lastEventMag = MIN_LOSS_FRAC + Math.random() * (MAX_LOSS_FRAC - MIN_LOSS_FRAC);
      nextEventAt = nextEventAt + drawInterarrivalTime();
    }
    const sinceEvent = t - lastEventAt;
    const recovery = sinceEvent >= 0 ? Math.exp(-sinceEvent / RECOVERY_S) : 0;
    return 1 - lastEventMag * recovery;
  }

  function reset() {
    nextEventAt = drawInterarrivalTime();
    lastEventAt = -Infinity;
    lastEventMag = 0;
  }

  return { factorAt, reset };
}
