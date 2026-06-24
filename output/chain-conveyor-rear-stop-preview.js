import { Engine } from "@babylonjs/core/Engines/engine";
import { Scene } from "@babylonjs/core/scene";
import { ArcRotateCamera } from "@babylonjs/core/Cameras/arcRotateCamera";
import { HemisphericLight } from "@babylonjs/core/Lights/hemisphericLight";
import { DirectionalLight } from "@babylonjs/core/Lights/directionalLight";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";

const canvas = document.getElementById("renderCanvas");
const engine = new Engine(canvas, true, { preserveDrawingBuffer: true, stencil: true });
const scene = new Scene(engine);
scene.clearColor.set(0.06, 0.08, 0.09, 1);

const chainLength = 3.926;
const chainWidth = 1.171;
const cargoSize = 1;
const rearX = -chainLength / 2;
const frontX = chainLength / 2;
const cargoCenterX = rearX + cargoSize / 2;

const camera = new ArcRotateCamera("验证相机", -Math.PI * 0.72, Math.PI * 0.34, 6.2, new Vector3(0, 0.7, 0), scene);
camera.attachControl(canvas, true);
camera.wheelPrecision = 45;

const hemi = new HemisphericLight("环境光", new Vector3(0, 1, 0), scene);
hemi.intensity = 0.65;
const sun = new DirectionalLight("方向光", new Vector3(-0.45, -1, -0.25), scene);
sun.intensity = 1.55;

function createMaterial(name, diffuse, emissive = diffuse, alpha = 1) {
  const material = new StandardMaterial(name, scene);
  material.diffuseColor = Color3.FromHexString(diffuse);
  material.emissiveColor = Color3.FromHexString(emissive);
  material.alpha = alpha;
  material.disableLighting = false;
  return material;
}

const bodyMaterial = createMaterial("链条机主体材质", "#7f9699", "#182426");
const railMaterial = createMaterial("静态链条材质", "#0b1113", "#061112");
const cargoMaterial = createMaterial("运行态货箱材质", "#f2c94c", "#5b3b03");
const arrowMaterial = createMaterial("方向箭头材质", "#48f6ff", "#48f6ff", 0.9);
const haloMaterial = createMaterial("方向箭头光晕材质", "#48f6ff", "#48f6ff", 0.28);
const rearMaterial = createMaterial("后端标注材质", "#ff5f75", "#ff3f5f", 0.82);
const frontMaterial = createMaterial("前端标注材质", "#8ff56b", "#69dd4e", 0.8);

const deck = MeshBuilder.CreateBox("输送面", { width: chainLength, height: 0.12, depth: chainWidth }, scene);
deck.position.set(0, 0.42, 0);
deck.material = bodyMaterial;

[-chainWidth / 2 + 0.13, chainWidth / 2 - 0.13].forEach((z, index) => {
  const rail = MeshBuilder.CreateBox(`Rail_0${index + 1}_M001 静态`, { width: chainLength, height: 0.11, depth: 0.12 }, scene);
  rail.position.set(0, 0.58, z);
  rail.material = railMaterial;
});

const cargo = MeshBuilder.CreateBox("运行态货箱 Task202", { size: cargoSize }, scene);
cargo.position.set(cargoCenterX, 1.03, 0);
cargo.material = cargoMaterial;

const rearFrame = MeshBuilder.CreateBox("后端红框", { width: 0.06, height: 1.25, depth: chainWidth + 0.36 }, scene);
rearFrame.position.set(rearX, 0.92, 0);
rearFrame.material = rearMaterial;

const frontFrame = MeshBuilder.CreateBox("前端绿框", { width: 0.06, height: 0.85, depth: chainWidth + 0.18 }, scene);
frontFrame.position.set(frontX, 0.78, 0);
frontFrame.material = frontMaterial;

for (let index = 0; index < 4; index += 1) {
  const arrowRootX = frontX - 0.55 - index * 0.78;
  const halo = MeshBuilder.CreateBox(`光晕箭头 ${index + 1}`, { width: 0.48, height: 0.026, depth: 0.34 }, scene);
  halo.position.set(arrowRootX, 0.72, 0);
  halo.rotation.y = Math.PI / 2;
  halo.material = haloMaterial;

  const body = MeshBuilder.CreateBox(`实体箭头 ${index + 1}`, { width: 0.34, height: 0.034, depth: 0.18 }, scene);
  body.position.set(arrowRootX, 0.735, 0);
  body.rotation.y = Math.PI / 2;
  body.material = arrowMaterial;

  const headLeft = MeshBuilder.CreateBox(`箭头左翼 ${index + 1}`, { width: 0.18, height: 0.034, depth: 0.12 }, scene);
  headLeft.position.set(arrowRootX - 0.15, 0.74, -0.07);
  headLeft.rotation.y = Math.PI / 2 + Math.PI / 4;
  headLeft.material = arrowMaterial;

  const headRight = MeshBuilder.CreateBox(`箭头右翼 ${index + 1}`, { width: 0.18, height: 0.034, depth: 0.12 }, scene);
  headRight.position.set(arrowRootX - 0.15, 0.74, 0.07);
  headRight.rotation.y = Math.PI / 2 - Math.PI / 4;
  headRight.material = arrowMaterial;
}

engine.runRenderLoop(() => scene.render());
window.addEventListener("resize", () => engine.resize());
