import {
  Box,
  Camera,
  Circle,
  Cpu,
  Cylinder,
  FileArchive,
  Grid3X3,
  Image,
  Info,
  Lightbulb,
  MapPin,
  Package,
  Tag,
  TriangleAlert,
  Upload
} from "lucide-react";
import { useRef, useState } from "react";
import type { AssetRecord, PoiKind, PrimitiveKind } from "../types/editor";

interface AssetBrowserProps {
  assets: AssetRecord[];
  onImportFiles: (files: FileList) => void | Promise<void>;
  onImportModelPackage: () => void | Promise<void>;
}

const primitives: Array<{ kind: PrimitiveKind; label: string; icon: typeof Box }> = [
  { kind: "cube", label: "Cube", icon: Box },
  { kind: "sphere", label: "Sphere", icon: Circle },
  { kind: "cylinder", label: "Cylinder", icon: Cylinder },
  { kind: "ground", label: "Ground", icon: Grid3X3 },
  { kind: "light", label: "Light", icon: Lightbulb }
];

const poiComponents: Array<{ kind: PoiKind; label: string; description: string; icon: typeof Box }> = [
  { kind: "marker", label: "标记点", description: "定位", icon: MapPin },
  { kind: "info", label: "信息点", description: "说明", icon: Info },
  { kind: "warning", label: "告警点", description: "告警", icon: TriangleAlert },
  { kind: "camera", label: "摄像头", description: "监控", icon: Camera },
  { kind: "device", label: "设备点", description: "设备", icon: Cpu },
  { kind: "label", label: "文本标签", description: "标签", icon: Tag }
];

/** 底部资源浏览器展示资产库和 POI 库，所有卡片都通过拖拽进入视口。 */
export function AssetBrowser({ assets, onImportFiles, onImportModelPackage }: AssetBrowserProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [activeLibrary, setActiveLibrary] = useState<"asset" | "poi">("asset");
  const importedAssets = assets.filter((asset) => asset.type !== "primitive");

  /** 打开资产面板内的模型选择器，方便从资产区直接导入外部模型。 */
  const openFilePicker = () => {
    inputRef.current?.click();
  };

  /** 处理模型文件选择，并清空 input 以便连续导入同名模型。 */
  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.files?.length) {
      onImportFiles(event.target.files);
      event.target.value = "";
    }
  };

  return (
    <section className="panel asset-browser">
      <div className="panel-title asset-panel-title">
        <div className="asset-library-tabs" role="tablist" aria-label="资源库切换">
          <button
            className={`asset-library-tab ${activeLibrary === "asset" ? "is-active" : ""}`}
            type="button"
            role="tab"
            aria-selected={activeLibrary === "asset"}
            onClick={() => setActiveLibrary("asset")}
          >
            资产
          </button>
          <button
            className={`asset-library-tab ${activeLibrary === "poi" ? "is-active" : ""}`}
            type="button"
            role="tab"
            aria-selected={activeLibrary === "poi"}
            onClick={() => setActiveLibrary("poi")}
          >
            POI
          </button>
        </div>
        {activeLibrary === "asset" && (
          <div className="asset-import-actions">
            <button className="asset-import-button" type="button" title="导入外部模型" onClick={openFilePicker}>
              <Upload size={14} />
              <span>导入模型</span>
            </button>
            <button className="asset-import-button" type="button" title="导入模型包文件夹" onClick={() => void onImportModelPackage()}>
              <Package size={14} />
              <span>导入模型包</span>
            </button>
          </div>
        )}
      </div>
      <div className="asset-content">
        <div className="asset-shelf">
          {activeLibrary === "asset" && (
            <>
              {primitives.map((item) => {
                const Icon = item.icon;
                return (
                  <div
                    key={item.kind}
                    className="asset-tile"
                    draggable
                    title={item.label}
                    onDragStart={(event) => event.dataTransfer.setData("application/x-editor-primitive", item.kind)}
                  >
                    <Icon size={22} />
                    <span>{item.label}</span>
                  </div>
                );
              })}

              {importedAssets.map((asset) => {
                const Icon = getAssetIcon(asset.type);
                const placeable = isPlaceableAsset(asset);
                return (
                  <div
                    key={asset.id}
                    className={`asset-tile imported-asset-tile ${placeable ? "" : "is-unavailable"}`}
                    draggable={placeable}
                    title={placeable ? `${asset.name}，拖入视口添加到场景` : `${asset.name}，当前类型不可拖入场景`}
                    onDragStart={(event) => {
                      if (!placeable) {
                        event.preventDefault();
                        return;
                      }

                      event.dataTransfer.effectAllowed = "copy";
                      event.dataTransfer.setData("application/x-editor-asset", asset.id);
                    }}
                  >
                    <Icon size={22} />
                    <span>{asset.name}</span>
                    <small>{formatAssetDetails(asset)}</small>
                    {asset.modelPackage && (
                      <div className="asset-package-meta">
                        <span>模型包</span>
                        <span>{asset.modelPackage.dynamicFields.length} 参数</span>
                      </div>
                    )}
                  </div>
                );
              })}
            </>
          )}

          {activeLibrary === "poi" &&
            poiComponents.map((item) => {
              const Icon = item.icon;
              return (
                <div
                  key={item.kind}
                  className="asset-tile poi-asset-tile"
                  draggable
                  title={`${item.label}，拖入视口添加到场景`}
                  onDragStart={(event) => {
                    event.dataTransfer.effectAllowed = "copy";
                    event.dataTransfer.setData("application/x-editor-poi", item.kind);
                  }}
                >
                  <Icon size={22} />
                  <span>{item.label}</span>
                  <small>{item.description}</small>
                </div>
              );
            })}
        </div>
      </div>
      <input
        ref={inputRef}
        className="hidden-input"
        type="file"
        multiple
        accept=".glb,.gltf,.babylon,.obj,.stl,.bin,.mtl,.png,.jpg,.jpeg,.webp,.ktx,.ktx2"
        onChange={handleFileChange}
      />
    </section>
  );
}

/** 只有模型和 Babylon 场景资产可以从资产区拖入视口实例化。 */
function isPlaceableAsset(asset: AssetRecord): boolean {
  return asset.type === "model" || asset.type === "scene";
}

/** 组合资产大小和单位归一化提示，帮助用户确认模型会按米进入场景。 */
function formatAssetDetails(asset: AssetRecord): string {
  const unitLabel = getAssetUnitLabel(asset);
  return unitLabel ? `${asset.sizeLabel} · ${unitLabel}` : asset.sizeLabel;
}

/** 根据资产单位 metadata 生成简短展示文案。 */
function getAssetUnitLabel(asset: AssetRecord): string | null {
  if (asset.type !== "model" && asset.type !== "scene") {
    return null;
  }

  const confidenceSuffix = asset.unitInferenceConfidence === "low" ? " 自动" : "";
  if (asset.sourceUnit === "centimeter") {
    return `cm → m${confidenceSuffix}`;
  }

  if (asset.sourceUnit === "millimeter") {
    return `mm → m${confidenceSuffix}`;
  }

  if (asset.sourceUnit === "meter") {
    return `m${confidenceSuffix}`;
  }

  return asset.unitScaleToMeters ? `×${asset.unitScaleToMeters} → m${confidenceSuffix}` : null;
}

/** 根据资产类型选择列表图标。 */
function getAssetIcon(type: AssetRecord["type"]) {
  if (type === "texture") {
    return Image;
  }

  if (type === "scene") {
    return FileArchive;
  }

  if (type === "model") {
    return Package;
  }

  return Box;
}
