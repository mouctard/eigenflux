// Small, self-contained canvas 2D loop animations for story.html's scenes. Explicitly a
// schematic/toy-model illustration of the physics narrated alongside each one -- not a
// physically simulated N-body trajectory (no scattering, no field solve). Each function
// starts a requestAnimationFrame loop on the given canvas and returns a stop() callback.

function ctx2d(canvas) {
  const ctx = canvas.getContext("2d");
  const { width, height } = canvas;
  return { ctx, width, height };
}

function clear(ctx, width, height) {
  ctx.fillStyle = "#fafaf8";
  ctx.fillRect(0, 0, width, height);
}

function drawParticle(ctx, x, y, r, color, label) {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, 2 * Math.PI);
  ctx.fillStyle = color;
  ctx.fill();
  if (label) {
    ctx.fillStyle = "#1a1a1a";
    ctx.font = "12px -apple-system, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    ctx.fillText(label, x, y + r + 4);
  }
}

function loop(canvas, draw) {
  let raf = null;
  let running = true;
  const start = performance.now();
  function frame(now) {
    if (!running) return;
    draw((now - start) / 1000);
    raf = requestAnimationFrame(frame);
  }
  raf = requestAnimationFrame(frame);
  return () => {
    running = false;
    if (raf) cancelAnimationFrame(raf);
  };
}

// Scene 1: two reactants approach from either side, slowing and jittering near a Coulomb
// "barrier" hump at the center -- the classical energy never quite clears the hump, but the
// particles occasionally get through anyway (a visual stand-in for quantum tunneling).
export function sceneApproach(canvas, reactants) {
  const { ctx, width, height } = ctx2d(canvas);
  const midY = height / 2;
  return loop(canvas, (t) => {
    clear(ctx, width, height);

    // Barrier hump
    ctx.beginPath();
    ctx.moveTo(width * 0.35, midY + 30);
    ctx.quadraticCurveTo(width * 0.5, midY - 40, width * 0.65, midY + 30);
    ctx.strokeStyle = "#d8d8d3";
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.fillStyle = "#6a6a6a";
    ctx.font = "11px -apple-system, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("Coulomb barrier", width * 0.5, midY - 48);

    const cycle = t % 3;
    const tunnel = cycle > 2.4; // occasionally "gets through"
    const approach = Math.min(1, cycle / 2);
    const jitter = cycle > 1.8 && cycle < 2.4 ? Math.sin(cycle * 40) * 3 : 0;

    const x1 = width * 0.1 + approach * (width * (tunnel ? 0.42 : 0.34));
    const x2 = width * 0.9 - approach * (width * (tunnel ? 0.42 : 0.34));

    drawParticle(ctx, x1 + jitter, midY, 12, reactants[0].color, reactants[0].symbol);
    drawParticle(ctx, x2 - jitter, midY, 12, reactants[1].color, reactants[1].symbol);
  });
}

// Scene 2: the two reactants merge at center, flash, then the two products fly apart.
export function sceneCollision(canvas, reactants, products) {
  const { ctx, width, height } = ctx2d(canvas);
  const midX = width / 2,
    midY = height / 2;
  return loop(canvas, (t) => {
    clear(ctx, width, height);
    const cycle = t % 3;

    if (cycle < 1) {
      const p = cycle;
      const x1 = width * 0.15 + p * (midX - width * 0.15 - 14);
      const x2 = width * 0.85 - p * (width * 0.85 - midX - 14);
      drawParticle(ctx, x1, midY, 12, reactants[0].color, reactants[0].symbol);
      drawParticle(ctx, x2, midY, 12, reactants[1].color, reactants[1].symbol);
    } else if (cycle < 1.25) {
      const flash = 1 - (cycle - 1) / 0.25;
      ctx.beginPath();
      ctx.arc(midX, midY, 20 + (1 - flash) * 20, 0, 2 * Math.PI);
      ctx.fillStyle = `rgba(245, 158, 11, ${flash})`;
      ctx.fill();
    } else {
      const p = Math.min(1, (cycle - 1.25) / 1.5);
      const spread = p * (width * 0.38);
      drawParticle(ctx, midX - spread * 0.4, midY, 11, products[0].color, products[0].symbol);
      drawParticle(ctx, midX + spread, midY, 8, products[1].color, products[1].symbol);
    }
  });
}

// Scene 3: the two products fly apart at speeds set by their real kinetic energies (heavier
// product = slower, for the same momentum) -- v proportional to sqrt(KE/mass).
export function sceneKineticSplit(canvas, products) {
  const { ctx, width, height } = ctx2d(canvas);
  const midY = height / 2;
  const v0 = Math.sqrt(products[0].KE_MeV / products[0].massNumber);
  const v1 = Math.sqrt(products[1].KE_MeV / products[1].massNumber);
  const vMax = Math.max(v0, v1);
  return loop(canvas, (t) => {
    clear(ctx, width, height);
    const cycle = t % 2.5;
    const midX = width / 2;
    const p = cycle / 2.5;
    const reach = width * 0.42;
    const x0 = midX - p * reach * (v0 / vMax);
    const x1 = midX + p * reach * (v1 / vMax);
    drawParticle(ctx, x0, midY, 11, products[0].color, `${products[0].symbol} (${products[0].KE_MeV} MeV)`);
    drawParticle(ctx, x1, midY, 8, products[1].color, `${products[1].symbol} (${products[1].KE_MeV} MeV)`);
  });
}

// Scene 4: every charged product gyrates in place (trapped by the confining field); if a
// neutral product exists, it ignores the field entirely and exits in a straight line.
// chargedProducts is an array (1 for D-T/D-D, 2 for the aneutronic D-3He channel).
export function sceneFates(canvas, chargedProducts, neutralProduct) {
  const { ctx, width, height } = ctx2d(canvas);
  const midY = height / 2;
  return loop(canvas, (t) => {
    clear(ctx, width, height);

    // Field lines (schematic)
    ctx.strokeStyle = "#eceae4";
    ctx.lineWidth = 1;
    for (let i = 0; i < 6; i++) {
      const y = 20 + i * ((height - 40) / 5);
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
    }

    // Each charged product: small circular gyration around its own guiding center
    chargedProducts.forEach((product, i) => {
      const cx = width * (chargedProducts.length > 1 ? 0.28 + i * 0.16 : 0.32);
      const cy = midY;
      const gr = 16;
      const phase = i * Math.PI; // offset so two gyrating particles aren't overlapping
      const gx = cx + gr * Math.cos(t * 4 + phase);
      const gy = cy + gr * Math.sin(t * 4 + phase);
      drawParticle(ctx, gx, gy, 9, product.color, product.symbol + " — trapped, heats plasma");
    });

    if (neutralProduct) {
      const cycle = t % 2;
      const nx = width * 0.32 + cycle * (width * 0.62);
      drawParticle(ctx, Math.min(nx, width - 10), midY, 7, neutralProduct.color, neutralProduct.symbol + " — no charge, ignores field");
    }
  });
}

// Scene 5: a neutron enters a blanket block and is absorbed, with a small energy-release
// burst (schematic for the blanket multiplier + tritium breeding reaction).
export function sceneBlanket(canvas) {
  const { ctx, width, height } = ctx2d(canvas);
  const midY = height / 2;
  const blanketX = width * 0.72;
  return loop(canvas, (t) => {
    clear(ctx, width, height);

    ctx.fillStyle = "#e9e4d8";
    ctx.fillRect(blanketX, 20, width - blanketX - 20, height - 40);
    ctx.strokeStyle = "#c9c2ae";
    ctx.strokeRect(blanketX, 20, width - blanketX - 20, height - 40);
    ctx.fillStyle = "#6a6a6a";
    ctx.font = "11px -apple-system, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("Li/Be blanket", blanketX + (width - blanketX - 20) / 2, 34);

    const cycle = t % 2.2;
    if (cycle < 1.4) {
      const p = cycle / 1.4;
      const x = width * 0.08 + p * (blanketX - width * 0.08);
      drawParticle(ctx, x, midY, 7, "#64748b", "n");
    } else {
      const flash = 1 - (cycle - 1.4) / 0.8;
      ctx.beginPath();
      ctx.arc(blanketX + 30, midY, 10 + (1 - flash) * 26, 0, 2 * Math.PI);
      ctx.fillStyle = `rgba(245, 158, 11, ${Math.max(0, flash * 0.8)})`;
      ctx.fill();
    }
  });
}

// Scene 6: heat flows in from the left, spins a turbine, lights a bulb.
export function sceneTurbine(canvas) {
  const { ctx, width, height } = ctx2d(canvas);
  const cx = width * 0.42,
    cy = height / 2;
  const bulbX = width * 0.82;
  return loop(canvas, (t) => {
    clear(ctx, width, height);

    // Heat arrows flowing in
    ctx.strokeStyle = "#f59e0b";
    ctx.lineWidth = 2;
    for (let i = 0; i < 3; i++) {
      const phase = (t * 0.6 + i / 3) % 1;
      const x = 20 + phase * (cx - 60);
      ctx.beginPath();
      ctx.moveTo(x, cy - 20 + i * 20);
      ctx.lineTo(x + 14, cy - 20 + i * 20);
      ctx.stroke();
    }

    // Turbine
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(t * 3);
    ctx.strokeStyle = "#1a1a1a";
    ctx.lineWidth = 3;
    for (let i = 0; i < 4; i++) {
      ctx.save();
      ctx.rotate((i * Math.PI) / 2);
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(0, -28);
      ctx.stroke();
      ctx.restore();
    }
    ctx.restore();
    ctx.beginPath();
    ctx.arc(cx, cy, 6, 0, 2 * Math.PI);
    ctx.fillStyle = "#1a1a1a";
    ctx.fill();

    // Bulb
    const glow = 0.5 + 0.5 * Math.sin(t * 3);
    ctx.beginPath();
    ctx.arc(bulbX, cy, 14, 0, 2 * Math.PI);
    ctx.fillStyle = `rgba(245, 158, 11, ${0.4 + 0.5 * glow})`;
    ctx.fill();
    ctx.strokeStyle = "#1a1a1a";
    ctx.lineWidth = 1.5;
    ctx.stroke();
  });
}
