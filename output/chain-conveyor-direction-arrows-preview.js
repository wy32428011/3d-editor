import { Engine } from "@babylonjs/core/Engines/engine";
import { Scene } from "@babylonjs/core/scene";
import { ArcRotateCamera } from "@babylonjs/core/Cameras/arcRotateCamera";
import { HemisphericLight } from "@babylonjs/core/Lights/hemisphericLight";
import { DirectionalLight } from "@babylonjs/core/Lights/directionalLight";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { SceneDataDrivenRuntime } from "../src/editor/sceneDataDrivenRuntime";

const canvas = document.getElementById("renderCanvas");
const engine = new Engine(canvas, true, { preserveDrawingBuffer: true, stencil: true });
const scene = new Scene(engine);
scene.clearColor.set(0.06, 0.08, 0.09, 1);

const camera = new ArcRotateCamera("预览相机", Math.PI * 0.22, Math.PI * 0.32, 6.2, new Vector3(0.4, 0.5, 1.0), scene);
camera.attachControl(canvas, true);
camera.wheelPrecision = 45;

const hemi = new HemisphericLight("环境光", new Vector3(0, 1, 0), scene);
hemi.intensity = 0.62;
const sun = new DirectionalLight("方向光", new Vector3(-0.4, -1, -0.35), scene);
sun.intensity = 1.5;

const baseline = {
  minimum: { x: -0.636, y: 0, z: -0.913 },
  maximum: { x: 0.636, y: 0.83, z: 0.913 },
  size: { x: 1.271, y: 0.83, z: 1.826 }
};
const chainLength = 3.926;
const frontZ = baseline.minimum.z + chainLength;
const rearZ = baseline.minimum.z;
const centerZ = (frontZ + rearZ) / 2;

const root = new TransformNode("1004 链条机视觉验证", scene);
root.metadata = {
  editor: {
    modelPackageInstance: {
      values: {
        modelKey: "chain-conveyor",
        chainLength,
        chainFrontEndpointRatio: 1,
        chainRearEndpointRatio: 0
      }
    },
    modelPackageRuntime: {
      opaqueChainConveyorBaseline: baseline
    }
  }
};

const bodyMaterial = new StandardMaterial("链条机主体材质", scene);
bodyMaterial.diffuseColor = new Color3(0.25, 0.29, 0.3);
bodyMaterial.emissiveColor = new Color3(0.02, 0.025, 0.025);

const railMaterial = new StandardMaterial("静态链条材质", scene);
railMaterial.diffuseColor = new Color3(0.03, 0.035, 0.04);
railMaterial.emissiveColor = new Color3(0.015, 0.02, 0.022);

const body = MeshBuilder.CreateBox("链条机主体", { width: 1.24, height: 0.16, depth: chainLength }, scene);
body.parent = root;
body.position.set(0, 0.52, centerZ);
body.material = bodyMaterial;

[-0.48, 0.48].forEach((x, index) => {
  const rail = MeshBuilder.CreateBox(`Rail_0${index + 1}_M001`, { width: 0.16, height: 0.1, depth: chainLength }, scene);
  rail.parent = root;
  rail.position.set(x, 0.83, centerZ);
  rail.material = railMaterial;
});

const endpointMaterial = new StandardMaterial("端点材质", scene);
endpointMaterial.diffuseColor = new Color3(0.9, 0.72, 0.2);
endpointMaterial.emissiveColor = new Color3(0.55, 0.34, 0.04);
for (const [name, z] of [["前端", frontZ], ["后端", rearZ]]) {
  const marker = MeshBuilder.CreateSphere(name, { diameter: 0.12, segments: 16 }, scene);
  marker.parent = root;
  marker.position.set(0, 1.02, z);
  marker.material = endpointMaterial;
}

const target = {
  root,
  matchFields: {
    assetCode: "1004",
    modelKey: "chain-conveyor",
    name: "链条机",
    sourceFile: "链条机.glb",
    sourceFileStem: "链条机"
  },
  dataDriven: {
    device: {
      devType: "conveyor",
      defaultAssetCode: "ChainConveyor01",
      deviceIdField: "e",
      assetCodeField: "assetCode",
      interpolationMs: 200
    }
  }
};

const runtime = new SceneDataDrivenRuntime({
  scene,
  getConfig: () => ({ enabled: false }),
  getTargets: () => [target],
  getDropTargets: () => [],
  onTargetsChanged: () => undefined
});
const state = runtime.ensureTargetState(target, performance.now());
state.motionActionDirections.set("chainConveyor", 1);

engine.runRenderLoop(() => {
  runtime.updateChainConveyorDirectionArrowsForState(state, performance.now(), false);
  scene.render();
});
window.addEventListener("resize", () => engine.resize());
