// Structured O-grid triangular mesh in (rho, theta) coordinates.
//
// Eigendrum meshes arbitrary user-drawn shapes with a Cartesian lattice that gets clipped
// and projected onto the boundary, plus degenerate-element repair. That approach earns its
// keep there because the domain is arbitrary. Here the domain is star-shaped around
// (R0, 0) and given by a closed formula, so radially interpolating from the center to a
// boundary curve produces a valid, exactly boundary-fitted mesh directly -- no
// point-in-polygon testing or repair needed. Ring nRho *is* the domain boundary, which
// makes imposing psi=0 there exact rather than approximate.
//
// Ring 0 is a single center node (the coordinate singularity of any polar-style mesh),
// fanned out to ring 1. Rings 1..nRho each have nTheta nodes, connected to their neighbor
// ring by a strip of quads split into two triangles.

function buildRingConnectivity(positionAt, { nRho = 26, nTheta = 48 } = {}) {
  const nodes = [positionAt(0, 0)];
  const nodeRho = [0];
  const ringStart = [1];

  for (let k = 1; k <= nRho; k++) {
    const rho = k / nRho;
    ringStart.push(nodes.length);
    for (let j = 0; j < nTheta; j++) {
      const theta = (2 * Math.PI * j) / nTheta;
      nodes.push(positionAt(rho, theta));
      nodeRho.push(rho);
    }
  }

  const triangles = [];

  const ring1Start = ringStart[1];
  for (let j = 0; j < nTheta; j++) {
    const j1 = (j + 1) % nTheta;
    triangles.push([0, ring1Start + j, ring1Start + j1]);
  }

  for (let k = 1; k < nRho; k++) {
    const kStart = ringStart[k];
    const k1Start = ringStart[k + 1];
    for (let j = 0; j < nTheta; j++) {
      const j1 = (j + 1) % nTheta;
      const a0 = kStart + j, a1 = kStart + j1;
      const b0 = k1Start + j, b1 = k1Start + j1;
      triangles.push([a0, b0, b1]);
      triangles.push([a0, b1, a1]);
    }
  }

  const boundaryStart = ringStart[nRho];
  const boundaryNodes = [];
  for (let j = 0; j < nTheta; j++) boundaryNodes.push(boundaryStart + j);

  return {
    nodes,          // [ [R, Z], ... ]
    triangles,      // [ [i, j, k], ... ] node index triples (orientation not assumed)
    boundaryNodes,  // node indices lying exactly on the domain boundary (rho = 1)
    nodeRho,        // rho value per node, in [0, 1]
    nRho,
    nTheta,
  };
}

// Miller/Turnbull boundary, radially scaled from the center by rho.
export function buildOGridMesh(shape, opts = {}) {
  const { R0, a, kappa, delta } = shape;
  return buildRingConnectivity((rho, theta) => {
    const R = R0 + a * rho * Math.cos(theta + delta * rho * Math.sin(theta));
    const Z = kappa * a * rho * Math.sin(theta);
    return [R, Z];
  }, opts);
}

// Generic version: boundaryAt(theta) -> [R, Z] on rho=1, linearly interpolated from the
// center (R0, 0). Used when the boundary isn't the analytic Miller formula -- e.g.
// validating against a numerically-traced closed-form solution's own zero-contour, which
// is only approximately (not exactly) the Miller ellipse.
export function buildOGridMeshFromBoundary(R0, boundaryAt, opts = {}) {
  return buildRingConnectivity((rho, theta) => {
    if (rho === 0) return [R0, 0];
    const [Rb, Zb] = boundaryAt(theta);
    return [R0 + rho * (Rb - R0), rho * Zb];
  }, opts);
}
