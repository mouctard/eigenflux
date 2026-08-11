// Three.js scene: nested translucent flux surfaces, orbit-controllable.
import * as THREE from "three";
import { OrbitControls } from "../../vendor/three/controls/OrbitControls.js";
import { colormapRGB } from "../app/colormap.js";

export function createViewer(container) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xfafaf8);

  const camera = new THREE.PerspectiveCamera(45, container.clientWidth / container.clientHeight, 0.01, 100);
  camera.position.set(3, 2, 3);

  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(container.clientWidth, container.clientHeight);
  container.appendChild(renderer.domElement);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;

  scene.add(new THREE.AmbientLight(0xffffff, 0.7));
  const dirLight = new THREE.DirectionalLight(0xffffff, 0.6);
  dirLight.position.set(3, 5, 2);
  scene.add(dirLight);

  let surfaceMeshes = [];

  function clearSurfaces() {
    for (const m of surfaceMeshes) {
      scene.remove(m);
      m.geometry.dispose();
      m.material.dispose();
    }
    surfaceMeshes = [];
  }

  // DESC's (X, Y, Z) has Z as the vertical axis; three.js convention is Y-up.
  function buildGeometry({ X, Y, Z }, nTheta, nZeta) {
    const positions = new Float32Array(nTheta * nZeta * 3);
    for (let k = 0; k < nTheta * nZeta; k++) {
      positions[k * 3 + 0] = X[k];
      positions[k * 3 + 1] = Z[k];
      positions[k * 3 + 2] = Y[k];
    }

    const indices = [];
    const idx = (i, j) => j * nTheta + i; // matches DESC LinearGrid node ordering
    for (let j = 0; j < nZeta; j++) {
      const j1 = (j + 1) % nZeta;
      for (let i = 0; i < nTheta; i++) {
        const i1 = (i + 1) % nTheta;
        const a = idx(i, j), b = idx(i1, j), c = idx(i1, j1), d = idx(i, j1);
        indices.push(a, b, c, a, c, d);
      }
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geo.setIndex(indices);
    geo.computeVertexNormals();
    return geo;
  }

  function setSurfaces(data) {
    clearSurfaces();
    const { nTheta, nZeta, surfaces } = data;

    surfaces.forEach((surface, i) => {
      const geo = buildGeometry(surface, nTheta, nZeta);
      const t = i / Math.max(1, surfaces.length - 1);
      const [r, g, b] = colormapRGB(t);
      const isOutermost = i === surfaces.length - 1;
      const material = new THREE.MeshStandardMaterial({
        color: new THREE.Color(r / 255, g / 255, b / 255),
        transparent: true,
        opacity: isOutermost ? 0.16 : 0.42,
        side: THREE.DoubleSide,
        depthWrite: false,
        roughness: 0.6,
        metalness: 0.05,
      });
      const mesh = new THREE.Mesh(geo, material);
      mesh.renderOrder = surfaces.length - i; // draw outer surfaces first (painter's algorithm)
      scene.add(mesh);
      surfaceMeshes.push(mesh);
    });

    const outer = surfaces[surfaces.length - 1];
    let maxR = 0;
    for (let k = 0; k < outer.X.length; k++) maxR = Math.max(maxR, Math.hypot(outer.X[k], outer.Y[k]));
    camera.position.set(maxR * 1.6, maxR * 1.1, maxR * 1.6);
    camera.near = maxR * 0.01;
    camera.far = maxR * 20;
    camera.updateProjectionMatrix();
    controls.target.set(0, 0, 0);
    controls.update();
  }

  function onResize() {
    const w = container.clientWidth, h = container.clientHeight;
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

  return { setSurfaces, onResize };
}
