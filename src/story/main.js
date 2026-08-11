// Wires src/story/reactionStory.js's per-fuel data and src/story/animations.js's canvas
// scenes into story.html's narrative, using the same convertToElectric (src/fusion/capture.js)
// the main page uses -- applied to one reaction's Q instead of a running power, since the
// conversion fraction is the same either way (it's a linear scaling).
import { STORY_DATA, parseStoryHash } from "./reactionStory.js";
import { CAPTURE_PRESETS, convertToElectric } from "../fusion/capture.js";
import { sceneApproach, sceneCollision, sceneKineticSplit, sceneFates, sceneBlanket, sceneTurbine } from "./animations.js";

const { fuelKey, captureKey } = parseStoryHash();
const fuel = STORY_DATA[fuelKey];
const capture = CAPTURE_PRESETS[captureKey];
const neutralProduct = fuel.hasNeutron ? fuel.products.find((p) => p.neutral) : null;
const chargedProducts = fuel.products.filter((p) => !p.neutral);

document.getElementById("story-fuel-label").textContent = fuel.label;
document.getElementById("story-equation").textContent = fuel.equation;
document.getElementById("story-q").textContent = `Q = ${fuel.Q_MeV} MeV`;

const [p0, p1] = fuel.products;
const ratioToy = (p1.massNumber / p0.massNumber).toFixed(2);
const ratioActual = (p0.KE_MeV / p1.KE_MeV).toFixed(2);
document.getElementById("story-split-eq").textContent =
  `KE(${p0.symbol}) / KE(${p1.symbol})  ≈  mass(${p1.symbol}) / mass(${p0.symbol})  =  ${p1.massNumber}/${p0.massNumber} = ${ratioToy}` +
  `\n(actual measured ratio: ${p0.KE_MeV}/${p1.KE_MeV} = ${ratioActual})`;
document.getElementById("story-split-numbers").textContent = `${p0.KE_MeV} MeV vs. ${p1.KE_MeV} MeV`;

if (fuel.branchNote) {
  const note = document.createElement("p");
  note.className = "story-branch-note";
  note.textContent = fuel.branchNote;
  document.getElementById("scene-collision").appendChild(note);
}

// Scene 4: two fates
const fatesText = document.getElementById("story-fates-text");
if (fuel.hasNeutron) {
  const chargedProduct = chargedProducts[0];
  fatesText.textContent =
    `The charged ${chargedProduct.label} has a +${chargedProduct.charge} charge, so the magnetic ` +
    `field grips it -- it gyrates around a field line and stays inside the plasma, ` +
    `depositing its ${chargedProduct.KE_MeV} MeV as heat right where it was born (this is called ` +
    `"alpha heating" in a real D-T plasma, and it's a big part of why a reactor can eventually ` +
    `sustain itself). The neutron has no charge at all, so the magnetic field can't touch it -- ` +
    `it just flies in a straight line until it physically hits something.`;
} else {
  fatesText.textContent =
    `Both products here are charged (${chargedProducts.map((p) => p.label).join(" and ")}), so the ` +
    `magnetic field grips both of them -- neither one just escapes in a straight line the way a ` +
    `neutron would. That's the whole appeal of an aneutronic reaction like this one: every ` +
    `reaction product is, in principle, available for direct capture rather than needing a ` +
    `neutron-absorbing blanket at all.`;
}

// Scene 5: blanket (only meaningful with a neutron)
const blanketScene = document.getElementById("scene-blanket");
if (!fuel.hasNeutron) {
  blanketScene.querySelector("h2").textContent = "5. No neutron here";
  blanketScene.querySelector("canvas").remove();
  blanketScene.querySelector("p").textContent =
    `This channel doesn't produce a neutron, so there's no blanket step to walk through -- ` +
    `both products from step 4 stay charged and confined. (Real D-³He plasmas still have some ` +
    `D-D side reactions with their own neutrons, not shown here -- see the note in step 2.)`;
} else {
  document.getElementById("story-blanket-mult").textContent = `×${CAPTURE_PRESETS.blanketSteam.blanketMultiplier}`;
}

// Scene 6: turbine, phrased for whichever capture method was selected on the main page
const turbineText = document.getElementById("story-turbine-text");
if (captureKey === "directConversion") {
  turbineText.textContent =
    `You had "Direct conversion" selected on the main page: this reaction's charged-particle ` +
    `energy is decelerated electrostatically straight into electrical current, at roughly ` +
    `${Math.round(capture.thermalEfficiency * 100)}% efficiency -- no turbine at all, and (as ` +
    `real designs note) still experimental, never deployed at reactor scale. ` +
    (fuel.hasNeutron ? `Critically, this pathway captures none of the neutron's energy above.` : ``);
} else {
  turbineText.textContent =
    `You had "Blanket + steam turbine" selected on the main page: the heat from both the ` +
    `confined charged particle and the neutron's blanket absorption ends up in the same coolant ` +
    `loop, boiling water into steam that spins a turbine and a generator -- a Rankine cycle, ` +
    `the same basic idea a coal or nuclear fission plant uses, at roughly ` +
    `${Math.round(capture.thermalEfficiency * 100)}% thermal-to-electric efficiency.`;
}

// Summary table -- reuses the exact conversion function the main page runs continuously.
const neutronFrac = fuel.hasNeutron ? neutralProduct.KE_MeV / fuel.Q_MeV : 0;
const chargedFrac = 1 - neutronFrac;
const { E_electric } = convertToElectric(fuel.Q_MeV, fuel.Q_MeV, { neutronFrac, chargedFrac }, capture);
document.getElementById("story-summary-table").textContent = [
  `reaction              ${fuel.equation}`,
  `Q (total released)    ${fuel.Q_MeV} MeV`,
  `  neutron share        ${(neutronFrac * 100).toFixed(1)}%`,
  `  charged-particle share  ${(chargedFrac * 100).toFixed(1)}%`,
  `capture method         ${capture.label}`,
  `electric-equivalent    ${E_electric.toFixed(2)} MeV  (${((E_electric / fuel.Q_MeV) * 100).toFixed(1)}% of Q)`,
].join("\n");

// Animations
sceneApproach(document.getElementById("canvas-approach"), fuel.reactants);
sceneCollision(document.getElementById("canvas-collision"), fuel.reactants, fuel.products);
sceneKineticSplit(document.getElementById("canvas-split"), fuel.products);
sceneFates(document.getElementById("canvas-fates"), chargedProducts, neutralProduct);
if (fuel.hasNeutron) sceneBlanket(document.getElementById("canvas-blanket"));
sceneTurbine(document.getElementById("canvas-turbine"));
