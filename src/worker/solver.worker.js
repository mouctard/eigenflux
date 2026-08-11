// Off-main-thread mesh + assemble + Picard solve, so the UI stays responsive while a
// preset change triggers a fresh equilibrium solve.
import { solveEquilibrium } from "../fem/equilibrium.js";
import { SHAPE_PRESETS, CUSTOM_R0, customBoundaryPoint, validateCustomBoundary } from "../geom/boundary.js";
import { PROFILE_PRESETS, buildProfile } from "../profiles/presets.js";
import { compileExpr } from "../math/exprParser.js";

self.onmessage = (e) => {
  const { shapeKey, profileKey, nRho, nTheta, customExpr } = e.data;
  const profile = buildProfile(PROFILE_PRESETS[profileKey]);

  let boundarySource;
  if (shapeKey === "custom") {
    let rFn;
    try {
      rFn = compileExpr(customExpr);
    } catch (err) {
      self.postMessage({ shapeKey, profileKey, error: err.message });
      return;
    }
    const check = validateCustomBoundary(rFn);
    if (!check.ok) {
      self.postMessage({ shapeKey, profileKey, error: check.reason });
      return;
    }
    boundarySource = { R0: CUSTOM_R0, boundaryAt: (theta) => customBoundaryPoint(CUSTOM_R0, rFn, theta) };
  } else {
    boundarySource = SHAPE_PRESETS[shapeKey];
  }

  const result = solveEquilibrium(boundarySource, profile, { nRho, nTheta }, { tol: 1e-6, maxIter: 60 });

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
