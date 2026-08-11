// Three.js scene: the live-solved 2D (R,Z) equilibrium revolved into a 3D torus, with
// schematic magnet coils and control cabinets around it. Closely mirrors
// src/stellarator/viewer.js's nested-translucent-flux-surface technique and materials, for
// visual consistency between the two pages -- except here the surfaces come from this page's
// own live Grad-Shafranov solve instead of precomputed DESC data, so they're built by
// revolving the O-grid mesh's own rho-rings around the toroidal (Z) axis instead of reading
// a precomputed (X, Y, Z) grid.
//
// The magnet/cabinet geometry is explicitly schematic -- sized from the plasma's own bounding
// box, not any real reactor's engineering design. Said so in index.html's caption too.
import * as THREE from "three";
import { OrbitControls } from "../../vendor/three/controls/OrbitControls.js";
import { colormapRGB } from "./colormap.js";
import { getCanvasPalette, onThemeChange } from "./theme.js";

const N_ZETA = 48; // toroidal (long-way-round) segments for the revolved surfaces
const SURFACE_FRACS = [0.15, 0.4, 0.7, 1.0]; // innermost -> outermost, as fractions of nRho
const N_TF_COILS = 16;
const N_CABINETS = 6;

export function createTokamakViewer(container) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(getCanvasPalette().sceneBg);
  onThemeChange(() => {
    scene.background = new THREE.Color(getCanvasPalette().sceneBg);
  });

  const camera = new THREE.PerspectiveCamera(45, container.clientWidth / container.clientHeight, 0.01, 100);
  camera.position.set(6, 4, 6);

  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(container.clientWidth, container.clientHeight);
  container.appendChild(renderer.domElement);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;

  scene.add(new THREE.AmbientLight(0xffffff, 0.65));
  const dirLight = new THREE.DirectionalLight(0xffffff, 0.55);
  dirLight.position.set(3, 5, 2);
  scene.add(dirLight);

  const coreLight = new THREE.PointLight(0xfbbf24, 0, 10);
  scene.add(coreLight);

  let surfaceMeshes = [];
  let surfaceBaseOpacity = [];
  let coilGroup = null;
  let cabinetLights = [];
  let magnetMaterials = []; // coils + solenoid + PF rings, toggled by setMagnetActive

  function clearGroup(objs) {
    for (const m of objs) {
      scene.remove(m);
      m.geometry?.dispose?.();
      m.material?.dispose?.();
    }
  }

  // The coil/cabinet group's children mostly share geometry/material instances (all 16 TF
  // coils reuse one tube geometry, for instance), so dispose each unique one exactly once
  // rather than per-mesh -- avoids double-disposing a shared resource.
  function disposeStructure(group) {
    if (!group) return;
    scene.remove(group);
    const seenGeo = new Set(),
      seenMat = new Set();
    group.traverse((obj) => {
      if (obj.geometry && !seenGeo.has(obj.geometry)) {
        seenGeo.add(obj.geometry);
        obj.geometry.dispose();
      }
      if (obj.material && !seenMat.has(obj.material)) {
        seenMat.add(obj.material);
        obj.material.dispose();
      }
    });
  }

  // Revolves an ordered ring of (R, Z) poloidal points around the Z (three.js Y) axis --
  // the same axisymmetric "surface of revolution" construction as
  // src/stellarator/viewer.js's buildGeometry, just computing (X, Y, Z) from a 2D (R, Z)
  // profile here instead of receiving them precomputed.
  function buildRevolvedGeometry(ringPoints) {
    const nTheta = ringPoints.length;
    const positions = new Float32Array(nTheta * N_ZETA * 3);
    for (let j = 0; j < N_ZETA; j++) {
      const zeta = (2 * Math.PI * j) / N_ZETA;
      const cz = Math.cos(zeta),
        sz = Math.sin(zeta);
      for (let i = 0; i < nTheta; i++) {
        const [R, Z] = ringPoints[i];
        const k = j * nTheta + i;
        positions[k * 3 + 0] = R * cz;
        positions[k * 3 + 1] = Z;
        positions[k * 3 + 2] = R * sz;
      }
    }
    const indices = [];
    const idx = (i, j) => j * nTheta + i;
    for (let j = 0; j < N_ZETA; j++) {
      const j1 = (j + 1) % N_ZETA;
      for (let i = 0; i < nTheta; i++) {
        const i1 = (i + 1) % nTheta;
        const a = idx(i, j),
          b = idx(i1, j),
          c = idx(i1, j1),
          d = idx(i, j1);
        indices.push(a, b, c, a, c, d);
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geo.setIndex(indices);
    geo.computeVertexNormals();
    return geo;
  }

  // Ring k (k=1..nRho) of the O-grid mesh spans node indices [1+(k-1)*nTheta, ...+nTheta-1]
  // in theta order -- see the node-numbering comment in src/geom/mesh.js's
  // buildRingConnectivity. Ring nRho is exactly mesh.boundaryNodes.
  function extractRing(mesh, nTheta, k) {
    const start = 1 + (k - 1) * nTheta;
    const pts = [];
    for (let i = 0; i < nTheta; i++) pts.push(mesh.nodes[start + i]);
    return pts;
  }

  // Schematic toroidal-field coils (vertical loops encircling the plasma poloidally, spaced
  // around the torus) + a slender central-solenoid stack + a couple of flat poloidal-field
  // rings + a few control-cabinet boxes with a status light each. All sized from the
  // plasma's own (R, Z) bounding box plus a fixed margin -- not a specific device's design.
  function buildStructure(bounds) {
    const group = new THREE.Group();
    const { minR, maxR, minZ, maxZ } = bounds;
    const margin = (maxR - minR) * 0.25;
    const coilR0 = minR - margin,
      coilR1 = maxR + margin;
    const coilZ0 = minZ - margin,
      coilZ1 = maxZ + margin;
    const coilMidR = (coilR0 + coilR1) / 2;

    magnetMaterials = [];
    const coilMaterial = new THREE.MeshStandardMaterial({
      color: 0x8a8f98,
      emissive: 0x3b82f6,
      emissiveIntensity: 0,
      metalness: 0.6,
      roughness: 0.4,
    });
    magnetMaterials.push(coilMaterial);

    // TF coils: a D-ish outline in the (R,Z) plane, tube-extruded, repeated around zeta.
    const outline = [
      new THREE.Vector3(coilR0, 0, 0),
      new THREE.Vector3(coilR0, coilZ1 * 0.6, 0),
      new THREE.Vector3(coilMidR, coilZ1, 0),
      new THREE.Vector3(coilR1, coilZ1 * 0.6, 0),
      new THREE.Vector3(coilR1, coilZ0 * 0.6, 0),
      new THREE.Vector3(coilMidR, coilZ0, 0),
      new THREE.Vector3(coilR0, coilZ0 * 0.6, 0),
    ];
    const coilCurve = new THREE.CatmullRomCurve3(outline, true);
    const coilTube = new THREE.TubeGeometry(coilCurve, 64, (maxR - minR) * 0.02, 8, true);
    for (let c = 0; c < N_TF_COILS; c++) {
      const mesh = new THREE.Mesh(coilTube, coilMaterial);
      mesh.rotation.y = (2 * Math.PI * c) / N_TF_COILS;
      group.add(mesh);
    }

    // Central solenoid: a slim vertical cylinder near the torus axis.
    const solenoidR = Math.max(0.05, minR - margin * 1.6);
    const solenoidMaterial = new THREE.MeshStandardMaterial({
      color: 0x556072,
      emissive: 0x3b82f6,
      emissiveIntensity: 0,
      metalness: 0.5,
      roughness: 0.5,
      side: THREE.DoubleSide,
    });
    magnetMaterials.push(solenoidMaterial);
    const solenoid = new THREE.Mesh(
      new THREE.CylinderGeometry(solenoidR * 0.25, solenoidR * 0.25, (coilZ1 - coilZ0) * 1.1, 24, 1, true),
      solenoidMaterial
    );
    group.add(solenoid);

    // Poloidal-field rings, flattened tori above and below the plasma.
    const pfMaterial = new THREE.MeshStandardMaterial({
      color: 0x6b7280,
      emissive: 0x3b82f6,
      emissiveIntensity: 0,
      metalness: 0.55,
      roughness: 0.45,
    });
    magnetMaterials.push(pfMaterial);
    for (const zFrac of [0.85, -0.85]) {
      const ring = new THREE.Mesh(
        new THREE.TorusGeometry(coilMidR, (maxR - minR) * 0.03, 12, 48),
        pfMaterial
      );
      ring.rotation.x = Math.PI / 2;
      ring.position.y = coilZ1 * zFrac;
      group.add(ring);
    }

    // Control cabinets, outside the coil envelope, each with a small status light.
    const cabinetMat = new THREE.MeshStandardMaterial({ color: 0xe5e1d3, metalness: 0.1, roughness: 0.8 });
    const lightGeo = new THREE.SphereGeometry((maxR - minR) * 0.025, 8, 8);
    cabinetLights = [];
    for (let c = 0; c < N_CABINETS; c++) {
      const angle = (2 * Math.PI * c) / N_CABINETS + Math.PI / N_CABINETS;
      const r = coilR1 + margin * 1.3;
      const box = new THREE.Mesh(new THREE.BoxGeometry(margin * 0.5, margin * 0.7, margin * 0.4), cabinetMat);
      box.position.set(r * Math.cos(angle), coilZ0 * 0.3, r * Math.sin(angle));
      group.add(box);

      const lightMat = new THREE.MeshStandardMaterial({ color: 0x22c55e, emissive: 0x22c55e, emissiveIntensity: 0.3 });
      const light = new THREE.Mesh(lightGeo, lightMat);
      light.position.set(r * Math.cos(angle), coilZ0 * 0.3 + margin * 0.4, r * Math.sin(angle));
      group.add(light);
      cabinetLights.push(light);
    }

    return group;
  }

  function setEquilibrium(mesh, nRho, nTheta) {
    clearGroup(surfaceMeshes);
    surfaceMeshes = [];
    surfaceBaseOpacity = [];
    disposeStructure(coilGroup);
    coilGroup = null;

    let minR = Infinity,
      maxR = -Infinity,
      minZ = Infinity,
      maxZ = -Infinity;
    for (const [R, Z] of mesh.nodes) {
      if (R < minR) minR = R;
      if (R > maxR) maxR = R;
      if (Z < minZ) minZ = Z;
      if (Z > maxZ) maxZ = Z;
    }

    SURFACE_FRACS.forEach((frac, i) => {
      const k = Math.max(1, Math.min(nRho, Math.round(frac * nRho)));
      const ring = extractRing(mesh, nTheta, k);
      const geo = buildRevolvedGeometry(ring);
      const t = 1 - i / (SURFACE_FRACS.length - 1); // i=0 (innermost) -> hot, i=last (edge) -> cool
      const [r, g, b] = colormapRGB(t);
      const isOutermost = i === SURFACE_FRACS.length - 1;
      const material = new THREE.MeshStandardMaterial({
        color: new THREE.Color(r / 255, g / 255, b / 255),
        emissive: new THREE.Color(r / 255, g / 255, b / 255),
        emissiveIntensity: 0.12,
        transparent: true,
        opacity: isOutermost ? 0.18 : 0.42,
        side: THREE.DoubleSide,
        depthWrite: false,
        roughness: 0.6,
        metalness: 0.05,
      });
      const surfaceMesh = new THREE.Mesh(geo, material);
      surfaceMesh.renderOrder = SURFACE_FRACS.length - i;
      scene.add(surfaceMesh);
      surfaceMeshes.push(surfaceMesh);
      surfaceBaseOpacity.push(isOutermost ? 0.18 : 0.42);
    });

    coilGroup = buildStructure({ minR, maxR, minZ, maxZ });
    scene.add(coilGroup);

    const maxExtent = Math.max(maxR, maxZ - minZ);
    camera.position.set(maxExtent * 1.5, maxExtent * 1.1, maxExtent * 1.5);
    camera.near = maxExtent * 0.02;
    camera.far = maxExtent * 30;
    camera.updateProjectionMatrix();
    controls.target.set(0, (minZ + maxZ) / 2, 0);
    controls.update();

    coreLight.position.set(0, (minZ + maxZ) / 2, 0);
  }

  // Called every burn-simulation frame (renderBurnState) while playing, with the same
  // powerLevel/pulsePhase already driving the 2D core glow (src/app/render.js) -- so the 3D
  // view pulses in lockstep with the 2D one, both tied to the same validated P(t)/P0.
  function setGlow(glow) {
    const level = glow ? Math.max(0, Math.min(1, glow.powerLevel)) : 0;
    const pulse = glow ? 0.7 + 0.3 * Math.sin(glow.pulsePhase) : 0;
    coreLight.intensity = level * pulse * 3;
    if (surfaceMeshes[0]) surfaceMeshes[0].material.emissiveIntensity = 0.12 + level * pulse * 0.8;
    for (const light of cabinetLights) {
      light.material.emissiveIntensity = 0.3 + level * pulse * 1.2;
    }
  }

  // Fades the flux surfaces toward the background as fuel depletes (frac = n(t)/n0), floored
  // so the shape stays visible rather than vanishing outright -- a presentation cue for the
  // burn model's fuel state, see the matching comment in src/app/render.js.
  function setFuelFraction(frac) {
    const f = Math.max(0, Math.min(1, frac));
    surfaceMeshes.forEach((mesh, i) => {
      mesh.material.opacity = surfaceBaseOpacity[i] * (0.12 + 0.88 * f);
    });
  }

  // The coils' emissive tint follows the magnet ramp fraction (0..1) driven by main.js's
  // magnetRamp state machine -- continuous, not a snap, so the coils visibly energize/
  // de-energize over the ramp-up/ramp-down of a shot rather than switching instantly. Accepts
  // a plain boolean too (treated as 0 or 1) for callers that don't track a ramp fraction.
  function setMagnetActive(activeOrFrac) {
    const frac = typeof activeOrFrac === "number" ? Math.max(0, Math.min(1, activeOrFrac)) : activeOrFrac ? 1 : 0;
    for (const mat of magnetMaterials) {
      mat.emissiveIntensity = 0.55 * frac;
    }
  }

  function onResize() {
    const w = container.clientWidth,
      h = container.clientHeight;
    if (w === 0 || h === 0) return;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
  }
  window.addEventListener("resize", onResize);

  function animate() {
    requestAnimationFrame(animate);
    controls.update();
    renderer.render(scene, camera);
  }
  animate();

  return { setEquilibrium, setGlow, setFuelFraction, setMagnetActive, onResize };
}
