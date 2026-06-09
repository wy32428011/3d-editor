import {
  ArchiveRestore,
  BarChart3,
  Box,
  Circle,
  Cuboid,
  Cylinder,
  FileArchive,
  GitBranch,
  Grid3X3,
  Image,
  Lightbulb,
  LineChart,
  Navigation,
  Package,
  PackagePlus,
  Route,
  Search,
  Send,
  TriangleAlert,
  Upload,
  Waypoints,
  Zap,
  type LucideIcon
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type MouseEvent as ReactMouseEvent } from "react";
import { POI_CATALOG_ITEMS } from "../editor/poiCatalog";
import type { AssetLibraryFocusTarget, AssetRecord, PrimitiveKind } from "../types/editor";

interface AssetBrowserProps {
  assets: AssetRecord[];
  focusCommand?: (AssetLibraryFocusTarget & { token: number }) | null;
  height: number;
  minHeight: number;
  maxHeight: number;
  onHeightChange: (height: number) => void;
  onImportFiles: (files: FileList) => void | Promise<void>;
  onImportModelPackage: () => void | Promise<void>;
}

const primitives: Array<{ kind: PrimitiveKind; label: string; icon: LucideIcon }> = [
  { kind: "cube", label: "Cube", icon: Box },
  { kind: "locatorWireCube", label: "Locator Box", icon: Cuboid },
  { kind: "sphere", label: "Sphere", icon: Circle },
  { kind: "cylinder", label: "Cylinder", icon: Cylinder },
  { kind: "ground", label: "Ground", icon: Grid3X3 },
  { kind: "light", label: "Light", icon: Lightbulb }
];

type AssetLibraryKey = "model" | "poi" | "theme" | "chart" | "group" | "image" | "environment";

const libraryTabs: Array<{ key: AssetLibraryKey; label: string }> = [
  { key: "model", label: "模型库" },
  { key: "poi", label: "POI库" },
  { key: "theme", label: "主题库" },
  { key: "chart", label: "图表库" },
  { key: "group", label: "组合库" },
  { key: "image", label: "图片库" },
  { key: "environment", label: "环境库" }
];

const poiIconMap: Record<string, LucideIcon> = {
  zap: Zap,
  send: Send,
  "archive-restore": ArchiveRestore,
  "bar-chart-3": BarChart3,
  "line-chart": LineChart,
  navigation: Navigation,
  "triangle-alert": TriangleAlert,
  "package-plus": PackagePlus,
  "git-branch": GitBranch,
  route: Route,
  waypoints: Waypoints
};

/** 底部资源浏览器展示模型库和 POI 库，所有可用卡片都通过拖拽进入视口。 */
export function AssetBrowser({
  assets,
  focusCommand,
  height,
  minHeight,
  maxHeight,
  onHeightChange,
  onImportFiles,
  onImportModelPackage
}: AssetBrowserProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const resizeCleanupRef = useRef<(() => void) | null>(null);
  const tileRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const [activeLibrary, setActiveLibrary] = useState<AssetLibraryKey>("model");
  const [poiKeyword, setPoiKeyword] = useState("");
  const [focusedTile, setFocusedTile] = useState<{ key: string; token: number } | null>(null);
  const importedAssets = assets.filter((asset) => asset.type !== "primitive");
  const filteredPoiItems = useMemo(() => {
    const keyword = poiKeyword.trim().toLowerCase();
    if (!keyword) {
      return POI_CATALOG_ITEMS;
    }

    return POI_CATALOG_ITEMS.filter((item) =>
      [item.title, item.description, item.kind, ...item.keywords].some((value) => value.toLowerCase().includes(keyword))
    );
  }, [poiKeyword]);

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

  useEffect(() => {
    return () => resizeCleanupRef.current?.();
  }, []);

  useEffect(() => {
    if (!focusCommand) {
      return;
    }

    setActiveLibrary(focusCommand.type === "poi" ? "poi" : "model");
    if (focusCommand.type === "poi") {
      setPoiKeyword("");
    }
    setFocusedTile({ key: getAssetFocusTileKey(focusCommand), token: focusCommand.token });
  }, [focusCommand]);

  useEffect(() => {
    if (!focusedTile) {
      return;
    }

    const frame = window.requestAnimationFrame(() => {
      const element = tileRefs.current.get(focusedTile.key);
      element?.scrollIntoView({ block: "nearest", inline: "center" });
      element?.focus({ preventScroll: true });
    });
    const timer = window.setTimeout(() => {
      setFocusedTile((current) => (current?.token === focusedTile.token ? null : current));
    }, 1400);

    return () => {
      window.cancelAnimationFrame(frame);
      window.clearTimeout(timer);
    };
  }, [activeLibrary, focusedTile, filteredPoiItems.length, importedAssets.length]);

  /** 登记资源卡片 DOM，资源库聚焦命令需要直接滚动到目标卡片。 */
  const registerTileRef = useCallback((key: string) => {
    return (element: HTMLDivElement | null) => {
      if (element) {
        tileRefs.current.set(key, element);
        return;
      }

      tileRefs.current.delete(key);
    };
  }, []);

  /** 拖动资源库上边缘，按鼠标纵向位移调整底部区域高度。 */
  const handleResizeMouseDown = useCallback(
    (event: ReactMouseEvent<HTMLButtonElement>) => {
      if (event.button !== 0) {
        return;
      }

      event.preventDefault();
      resizeCleanupRef.current?.();
      const startY = event.clientY;
      const startHeight = height;
      const previousUserSelect = document.body.style.userSelect;
      const previousCursor = document.body.style.cursor;
      let resizeActive = true;
      document.body.style.userSelect = "none";
      document.body.style.cursor = "row-resize";

      const handleMouseMove = (moveEvent: MouseEvent) => {
        onHeightChange(startHeight + startY - moveEvent.clientY);
      };
      const handleMouseUp = () => {
        if (!resizeActive) {
          return;
        }

        resizeActive = false;
        window.removeEventListener("mousemove", handleMouseMove);
        window.removeEventListener("mouseup", handleMouseUp);
        window.removeEventListener("blur", handleMouseUp);
        document.body.style.userSelect = previousUserSelect;
        document.body.style.cursor = previousCursor;
        resizeCleanupRef.current = null;
      };

      window.addEventListener("mousemove", handleMouseMove);
      window.addEventListener("mouseup", handleMouseUp);
      window.addEventListener("blur", handleMouseUp);
      resizeCleanupRef.current = handleMouseUp;
    },
    [height, onHeightChange]
  );

  /** 支持键盘按 8px 或 32px 步进调整资源库高度，补齐拖拽条的可访问操作。 */
  const handleResizeKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLButtonElement>) => {
      const step = event.shiftKey ? 32 : 8;
      if (event.key === "ArrowUp") {
        event.preventDefault();
        onHeightChange(height + step);
        return;
      }
      if (event.key === "ArrowDown") {
        event.preventDefault();
        onHeightChange(height - step);
        return;
      }
      if (event.key === "Home") {
        event.preventDefault();
        onHeightChange(minHeight);
        return;
      }
      if (event.key === "End") {
        event.preventDefault();
        onHeightChange(maxHeight);
      }
    },
    [height, maxHeight, minHeight, onHeightChange]
  );

  return (
    <section className="panel asset-browser">
      <button
        aria-label="拖拽调整资源库高度"
        aria-orientation="horizontal"
        aria-valuemax={maxHeight}
        aria-valuemin={minHeight}
        aria-valuenow={height}
        className="asset-browser-resize-handle"
        role="separator"
        title="拖拽调整资源库高度"
        type="button"
        onKeyDown={handleResizeKeyDown}
        onMouseDown={handleResizeMouseDown}
      />
      <div className="panel-title asset-panel-title">
        <div className="asset-library-tabs" role="tablist" aria-label="资源库切换">
          {libraryTabs.map((tab) => (
            <button
              className={`asset-library-tab ${activeLibrary === tab.key ? "is-active" : ""}`}
              key={tab.key}
              type="button"
              role="tab"
              aria-selected={activeLibrary === tab.key}
              onClick={() => setActiveLibrary(tab.key)}
            >
              {tab.label}
            </button>
          ))}
        </div>
        {activeLibrary === "model" && (
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
        {activeLibrary === "poi" && (
          <div className="poi-library-toolbar">
            <Search size={14} />
            <input
              aria-label="POI名称"
              className="poi-search-input"
              placeholder="POI名称"
              value={poiKeyword}
              onChange={(event) => setPoiKeyword(event.currentTarget.value)}
            />
          </div>
        )}
        <div className={`asset-shelf ${activeLibrary === "poi" ? "poi-shelf" : ""}`}>
          {activeLibrary === "model" && (
            <>
              {primitives.map((item) => {
                const Icon = item.icon;
                return (
                  <div
                    key={item.kind}
                    ref={registerTileRef(`primitive:${item.kind}`)}
                    className={`asset-tile ${focusedTile?.key === `primitive:${item.kind}` ? "is-focused" : ""}`}
                    draggable
                    tabIndex={-1}
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
                    ref={registerTileRef(`asset:${asset.id}`)}
                    className={`asset-tile imported-asset-tile ${placeable ? "" : "is-unavailable"} ${
                      focusedTile?.key === `asset:${asset.id}` ? "is-focused" : ""
                    }`}
                    draggable={placeable}
                    tabIndex={-1}
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
            filteredPoiItems.map((item) => {
              const Icon = poiIconMap[item.iconKey] ?? Box;
              return (
                <div
                  key={item.kind}
                  ref={registerTileRef(`poi:${item.kind}`)}
                  className={`asset-tile poi-asset-tile ${focusedTile?.key === `poi:${item.kind}` ? "is-focused" : ""}`}
                  draggable
                  tabIndex={-1}
                  title={`${item.title}，${item.description}`}
                  onDragStart={(event) => {
                    event.dataTransfer.effectAllowed = "copy";
                    event.dataTransfer.setData("application/x-editor-poi", item.kind);
                  }}
                >
                  <div className="poi-tile-preview">
                    <Icon size={24} />
                    <span className="poi-tile-node" />
                  </div>
                  <span>{item.title}</span>
                  <small>{item.description}</small>
                </div>
              );
            })}
          {activeLibrary === "poi" && filteredPoiItems.length === 0 && <div className="empty-state">没有匹配的 POI 组件</div>}
          {activeLibrary !== "model" && activeLibrary !== "poi" && (
            <div className="asset-library-empty">
              <span>{libraryTabs.find((tab) => tab.key === activeLibrary)?.label}</span>
              <small>该资源库入口已预留，当前版本暂未接入资源内容。</small>
            </div>
          )}
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

/** 把 App 下发的资源库目标转成具体卡片 key。 */
function getAssetFocusTileKey(command: AssetLibraryFocusTarget): string {
  if (command.type === "asset") {
    return `asset:${command.assetId}`;
  }

  if (command.type === "poi") {
    return `poi:${command.poiKind}`;
  }

  return `primitive:${command.primitiveKind}`;
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
