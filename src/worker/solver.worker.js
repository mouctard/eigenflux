// Off-main-thread mesh + assemble + Picard solve, so the UI stays responsive while a
// preset change triggers a fresh equilibrium solve.
import { solveEquilibrium } from "../fem/equilibrium.js";
import { SHAPE_PRESETS } from "../geom/boundary.js";
import { PROFILE_PRESETS, buildProfile } from "../profiles/presets.js";

self.onmessage = (e) => {
  const { shapeKey, profileKey, nRho, nTheta } = e.data;
  const shape = SHAPE_PRESETS[shapeKey];
  const profile = buildProfile(PROFILE_PRESETS[profileKey]);

  const result = solveEquilibrium(shape, profile, { nRho, nTheta }, { tol: 1e-6, maxIter: 60 });

  self.postMessage({
    shapeKey,
    profileKey,
    nodes: result.mesh.nodes,
    triangles: result.mesh.triangles,
    boundaryNodes: result.mesh.boundaryNodes,
    psi: Array.from(result.psi),
    psiAxis: result.psiAxis,
    iterations: result.iterations,
    residual: result.residual,
  });
};
