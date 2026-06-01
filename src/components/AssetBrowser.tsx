import { Box, Circle, Cylinder, FileArchive, Grid3X3, Image, Lightbulb, Package, Upload } from "lucide-react";
import { useRef } from "react";
import type { AssetRecord, PrimitiveKind } from "../types/editor";

interface AssetBrowserProps {
  assets: AssetRecord[];
  onImportFiles: (files: FileList) => void;
}

const primitives: Array<{ kind: PrimitiveKind; label: string; icon: typeof Box }> = [
  { kind: "cube", label: "Cube", icon: Box },
  { kind: "sphere", label: "Sphere", icon: Circle },
  { kind: "cylinder", label: "Cylinder", icon: Cylinder },
  { kind: "ground", label: "Ground", icon: Grid3X3 },
  { kind: "light", label: "Light", icon: Lightbulb }
];

/** 底部资产浏览器展示内置对象和导入资源，内置对象可拖入视口创建。 */
export function AssetBrowser({ assets, onImportFiles }: AssetBrowserProps) {
  const inputRef = useRef<HTMLInputElement>(null);

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
        <span>资产</span>
        <button className="asset-import-button" type="button" title="导入外部模型" onClick={openFilePicker}>
          <Upload size={14} />
          <span>导入模型</span>
        </button>
      </div>
      <div className="asset-content">
        <div className="asset-shelf">
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
        </div>

        <div className="asset-list">
          {assets.map((asset) => {
            const Icon = getAssetIcon(asset.type);
            return (
              <div key={asset.id} className="asset-row">
                <Icon size={16} />
                <span className="asset-name">{asset.name}</span>
                <span className="asset-size">{asset.sizeLabel}</span>
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
        accept=".glb,.gltf,.babylon,.obj,.stl"
        onChange={handleFileChange}
      />
    </section>
  );
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
