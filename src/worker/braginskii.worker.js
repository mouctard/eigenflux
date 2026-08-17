// Off-main-thread mesh build + implicit Braginskii time-stepping loop, mirroring
// solver.worker.js's role for the tokamak page.
import { buildOGridMeshFromBoundary } from "../geom/mesh.js";
import { buildIterWallBoundary } from "../braginskii/wallGeometry.js";
import { BackgroundField } from "../braginskii/background.js";
import { buildBraginskiiDofMap, precomputeMeshGeometry } from "../braginskii/equations.js";
import { computeWallSegments } from "../braginskii/wallSegments.js";
import { stepBraginskii } from "../braginskii/timestep.js";

let ctx = null;
let state = null;
let running = false;
let stepsPerPost = 4;

async function init({ nRho, nTheta, params }) {
  // Worker module URLs resolve relative to the worker script; data/ lives at the repo
  // root, two levels up from src/worker/.
  const data = await (await fetch(new URL("../../data/iter_equilibrium.json", import.meta.url))).json();

  const background = new BackgroundField(
    data.backgroundGrid.r_m, data.backgroundGrid.z_m, data.backgroundGrid.psi,
    data.btf_T, data.rtf_m, data,
  );
  const { centerR, boundaryAt } = buildIterWallBoundary(data);
  const mesh = buildOGridMeshFromBoundary(centerR, boundaryAt, { nRho, nTheta });
  const dofMap = buildBraginskiiDofMap(mesh, params.coreRingFrac ?? 0.15);
  const triGeom = precomputeMeshGeometry(mesh, background);
  const wallSegments = computeWallSegments(mesh, centerR);

  const wallField = new Map();
  for (const g of mesh.boundaryNodes) {
    const t = triGeom.find((tg) => tg.tri.includes(g));
    wallField.set(g, t ? t.field.bHatPol : [1, 0]);
  }

  const n = mesh.nodes.length;
  const fixed = {
    n: new Float64Array(n).fill(params.coreN),
    Ti: new Float64Array(n).fill(params.coreT),
    Te: new Float64Array(n).fill(params.coreT),
  };
  state = {
    n: new Float64Array(n).fill(params.coreN),
    Ti: new Float64Array(n).fill(params.coreT),
    Te: new Float64Array(n).fill(params.coreT),
  };

  ctx = { mesh, dofMap, triGeom, wallSegments, wallField, params, fixed };

  self.postMessage({
    type: "mesh",
    nodes: mesh.nodes,
    triangles: mesh.triangles,
    boundaryNodes: mesh.boundaryNodes,
    isFixed: Array.from(dofMap.isFixed),
    realWallPointCount: data.wallArc.points_m.length,
  });
  postState();
}

function postState() {
  self.postMessage({
    type: "state",
    n: Array.from(state.n),
    Ti: Array.from(state.Ti),
    Te: Array.from(state.Te),
  });
}

function loop() {
  if (!running || !ctx) return;
  try {
    for (let i = 0; i < stepsPerPost; i++) {
      state = stepBraginskii(state, ctx, ctx.params.dt);
    }
    postState();
  } catch (err) {
    self.postMessage({ type: "error", message: err.message });
    running = false;
    return;
  }
  setTimeout(loop, 0);
}

self.onmessage = async (e) => {
  const msg = e.data;
  if (msg.type === "init") {
    running = false;
    await init(msg);
  } else if (msg.type === "play") {
    running = true;
    loop();
  } else if (msg.type === "pause") {
    running = false;
  } else if (msg.type === "step") {
    if (ctx) {
      for (let i = 0; i < (msg.n || 1); i++) state = stepBraginskii(state, ctx, ctx.params.dt);
      postState();
    }
  } else if (msg.type === "setParams") {
    if (ctx) Object.assign(ctx.params, msg.params);
  }
};
