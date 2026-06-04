# Babylon Unity-like 3D Editor

基于 Babylon.js 技术栈实现的桌面 3D 场景编辑器原型，目标是提供接近 Unity Scene View 的基础编辑体验：层级树、中央 3D 视口、属性面板、资产浏览器、拖拽创建、拖拽导入、Gizmo 变换和场景保存。当前工程已接入 Electron，可生成 Windows 安装程序。

## 技术栈

- Vite + React + TypeScript
- Electron + electron-builder
- Babylon.js 9
- Babylon.js Inspector
- Babylon.js Loaders
- lucide-react 图标

## 当前功能

- 四区编辑器布局：层级、视口、属性、资产浏览器
- Babylon.js Engine / Scene / ArcRotateCamera 渲染生命周期
- 默认场景：编辑网格、场景内 X/Y/Z 坐标轴、环境光、方向光、立方体、球体、地面；项目条和右侧场景属性可配置场景环境背景色，避免视口背景固定为全黑
- 米制单位：编辑器约定 `1 Babylon unit = 1 m`，默认对象、工作网格、属性面板位置和模型尺寸都按 `m` 展示；导入模型不会修改源文件，编辑器会在 Babylon/glTF 节点变换生效后按真实世界包围盒阈值启发式推断米、厘米或毫米来源，并把进入场景的模型实例归一到米，单位决策会写入模型和资产元数据；工作网格默认每小格为 `1 m`，会随相机位置和缩放动态覆盖视口，并通过全网格同相位闪烁帮助定位编辑平面
- 工具栏：选择、移动、旋转、缩放、创建基础对象、导入、导入 CAD 图纸、保存、整场景动画预览、Inspector、性能预览
- GizmoManager：选中对象后支持移动、旋转、缩放
- HighlightLayer：选中对象高亮
- 点击拾取：从视口或层级树选中对象，双击层级节点或视口模型可快速定位到对象
- 删除对象：选中基础对象或拖入模型后，可通过项目条按钮、Delete 或 Backspace 删除
- 复制粘贴：选中模型后可通过 `Ctrl+C` 复制，再用 `Ctrl+V` 粘贴为带水平偏移的独立副本；属性面板输入框等文本编辑区域仍保留系统复制粘贴行为，预览模式下不会复制或粘贴场景模型
- 属性编辑：右侧属性面板采用深色折叠分组样式，支持对象名称、显隐、位置、旋转、缩放、主体颜色、旧版 MeshVertexModifyComponent 参数、文件夹模型包解析出的动态参数和业务资产编号编辑；变换与颜色会实时驱动视口模型变化，组件参数、动态参数和资产编号会写入节点 metadata 并随场景保存恢复
- 资产导入：支持从工具栏和资产面板按钮导入 `.glb`、`.gltf`、`.babylon`、`.obj`、`.stl`、常见图片贴图，以及 `.gltf/.obj` 同批依赖的 `.bin/.mtl/贴图` 文件；桌面模式支持导入包含 `meta.json`/`meta.js`、单个 TypeScript 模型脚本和主 `.glb` 的文件夹模型包，导入后会复制到项目 `assets/source/`，属性栏会优先按 `meta.json` 的 `parameterScripts[].scriptFilename` 选择参数脚本，并静态解析 `visibleAsNumber` / `visibleAsString` / `visibleAsBoolean` / `visibleAsColor3` 装饰器生成动态参数；同一个 `.model.ts` 可以同时声明 `ParametricModelParamsComponent` 和 `ParametricModelRuntimeComponent`，`meta.json` 保留不同 `className` 供兼容运行环境识别；模型包实例化后会在 Electron renderer 中执行项目内已复制的本地运行脚本，属性栏参数会同步到 `metadata.scripts[].values` 并实时触发 `ParametricModelRuntimeComponent` 驱动几何、阵列和显隐变化，脚本异常会降级为属性栏告警且不阻断参数保存；项目模式下导入的源文件会复制到项目 `assets/source/`，模型和场景文件会先进入资产浏览器，不立即写入当前场景，重新打开项目后资产卡片会按需读取项目内源文件和同批依赖继续拖入使用；旧项目没有源文件副本时，会尝试从当前场景内同源模型克隆新实例，模型实例化到场景后，带子节点的模型在层级面板只展示主模型，保持列表简洁
- CAD 图纸导入：工具栏提供独立的“导入 CAD 图纸”按钮，当前支持 `.dxf` 文本图纸；LINE、LWPOLYLINE、POLYLINE、CIRCLE 和 ARC 会解析为 Babylon 矢量线并贴到 XZ 工作网格上，优先读取 DXF `$INSUNITS` 单位声明并换算到项目米制尺寸，未声明单位且原始尺寸明显过大时会推断为毫米，避免毫米图纸被当成米放大；DXF 文件大小不做导入限制，超大图纸仍保留线段数量保护并按 LineSystem 分块渲染，避免极端图纸造成内存或渲染压力；图纸按包围盒中心平移到世界原点方便立即查看，图层使用不同线色，导入结果作为可选中、可删除、可随场景保存恢复的 CAD 根节点。DWG 需先转换为 DXF 后导入。
- POI 库：底部资源区支持在“资产”和“POI”之间切换；POI 库内置标记点、信息点、告警点、摄像头、设备点和文本标签，拖入视口后会生成真实 Babylon 可编辑节点，支持选择、Gizmo 变换、属性面板编辑、层级展示和场景保存
- 拖拽操作：资产面板基础对象和导入模型都以统一资产卡片展示，拖到视口创建或实例化，同一模型资产可以像内置 Cube/Sphere 一样反复拖入生成多个实例；外部模型文件直接拖到视口仍按落点导入并同步登记为可复用资产，拖入后的模型保持选中但不自动改变当前相机视角，拖放落点通过透明地面和相机射线兜底计算，避免网格不可见时回退到原点
- 场景保存：导出 `.babylon` 文件，并附带编辑器资产元数据、场景环境背景色和 `metadata.editor.sceneDataDriven` 场景数据驱动配置；项目内重新打开场景时会注册 Babylon 序列化场景加载器，并清洗相机、选中高亮等编辑器运行时数据，避免保存后重新打开模型消失
- 性能预览：降低渲染分辨率并关闭指针移动拾取，便于大场景快速预览
- Electron 桌面壳：安全 preload、主窗口生命周期、开发/生产双入口、Windows NSIS 安装包
- 项目启动页：打开应用后展示最近项目，支持新建项目、打开项目和回到项目列表
- 项目制场景：项目内可创建多个场景，场景数据保存到项目目录下的 `scenes/`

## 官方资料依据

- Babylon.js 官方站点：https://www.babylonjs.com/
- Babylon.js 文档：https://doc.babylonjs.com/
- Babylon.js Editor 文档：https://editor.babylonjs.com/documentation
- Gizmo 文档：https://doc.babylonjs.com/features/featuresDeepDive/mesh/gizmo
- SceneLoader 文档：https://doc.babylonjs.com/features/featuresDeepDive/importers/loadingFileTypes
- 性能优化文档：https://doc.babylonjs.com/features/featuresDeepDive/scene/optimize_your_scene
- Electron 文档：https://www.electronjs.org/docs/latest/
- electron-builder 文档：https://www.electron.build/

## 运行方式

```bash
npm install
npm run dev
```

浏览器打开终端输出的本地地址，默认通常是：

```text
http://localhost:5173
```

桌面开发模式：

```bash
npm run electron:dev
```

该命令会先编译 Electron 主进程，再启动 Vite，最后打开 Electron 桌面窗口。

开发启动冒烟验证：

```bash
set ELECTRON_DEV_SMOKE_EXIT_MS=3000&& npm run electron:dev
```

该变量只用于自动化验证，会在 Electron 拉起后自动清理退出；正常开发不需要设置。

## 构建方式

```bash
npm run build
```

生成未安装版应用目录：

```bash
npm run pack
```

生成 Windows 安装程序：

```bash
npm run dist:win
```

当前安装包输出位置：

```text
release/Babylon 3D Editor-0.1.0-Setup.exe
```

## 构建验证记录

- 2026-05-31：已执行 `npm install`，生成 `node_modules` 与 `package-lock.json`，依赖审计结果为 0 个漏洞。
- 2026-05-31：已执行 `npx tsc -b`，TypeScript 类型检查通过。
- 2026-05-31：已执行 `npm run build`，Vite 生产构建通过并生成 `dist/`。
- 2026-05-31：已执行 `npm run electron:build`，Electron 主进程和 preload 编译通过并生成 `dist-electron/`。
- 2026-05-31：已执行 `npx electron-builder --win nsis`，Windows NSIS 安装包生成成功：`release/Babylon 3D Editor-0.1.0-Setup.exe`。
- 2026-05-31：已执行 `npm audit --json`，依赖审计结果为 0 个漏洞；Electron 已升级到 `^42.3.0`。
- 构建优化：Babylon.js 改为子路径按需导入，避免 `@babylonjs/core` 桶导入导致 Vite transform 阶段过慢；Inspector 改为运行时通过 Babylon DebugLayer 的 CDN 配置加载，不进入生产构建依赖图。
- 配置修复：`tsconfig.json` 不再引用 `tsconfig.node.json`，避免 `tsc -b` 生成 `vite.config.js` 副产物导致 Vite 读取过期配置。
- Electron 打包说明：当前 Windows 环境不能创建 `winCodeSign` 包中的符号链接，且 `asar` 完整性写回 exe 时会被系统锁占用；因此安装包配置暂时关闭 `asar` 和 `signAndEditExecutable`，优先保证普通权限下可生成未签名安装程序。后续接入正式代码签名证书和具备符号链接权限的构建机后，可恢复 `asar` 与 exe 资源编辑。
- 2026-06-01：已执行 `npm run build`，项目启动页、最近项目、新建项目和新建场景相关改动通过 Vite 与 Electron TypeScript 构建。
- 2026-06-01：已执行 `npm audit --json`，依赖审计结果为 0 个漏洞。
- 2026-06-01：修复 Windows + Node 22 下 `npm run electron:dev` 因 `.cmd` shim 配合 `shell: false` 触发 `spawn EINVAL` 的问题；开发脚本改为直接通过当前 Node 启动 TypeScript、Vite 和 Electron CLI，并已用 `ELECTRON_DEV_SMOKE_EXIT_MS=3000` 完成冒烟验证。
- 2026-06-01：修复视口 Gizmo 拖拽时右侧属性栏不实时刷新的问题；已执行 `npm run build`，构建通过。
- 2026-06-01：按编辑器简洁层级要求，导入带子节点模型时左侧层级只显示主模型；已执行 `npm run build`，构建通过。
- 2026-06-01：资产面板新增“导入模型”按钮，可直接从资产区导入外部可用模型；已执行 `npm run build`，构建通过。
- 2026-06-01：修复保存后重新打开项目场景模型消失的问题；根因是未编码 `data:` 场景字符串遇到 `#image0` 等片段会被 URL 截断，现改为 Blob URL 交给 Babylon.js 加载，并已执行 `npm run build` 验证。
- 2026-06-01：修复右侧属性面板修改后视口模型不实时变化的问题；属性输入改为实时提交，引擎侧会刷新节点和子网格世界矩阵，并将导入模型根节点的显隐、材质修改同步到所有子网格；已执行 `npm run build`，构建通过。
- 本次修复：右侧属性面板改为按当前选中快照 ID 定向更新 Babylon 节点，避免场景切换、引擎重建或选中状态短暂失配时参数提交被丢弃或写入错误对象；引擎销毁时会清空旧属性、层级、资产和统计快照；已执行 `npm run build`，构建通过。
- 2026-06-01：统一编辑器米制单位约定，新增单位配置常量，默认几何体、灯光高度、工作网格和保存元数据均按 `1 Babylon unit = 1 m` 处理；属性面板显示 `m`、`deg`、`x` 单位；已执行 `npm run build`，构建通过。
- 2026-06-01：修复导入 GLB 后模型不可见的问题；导入改为使用 Babylon.js 9 的新式 `ImportMeshAsync(File, scene, { pluginExtension })`，并在导入后按真实包围盒居中到落点；当时的自动取景行为已在后续调整为仅显式定位时触发。已执行 `npm run build`，并用 Khronos `Box.glb` 通过 Babylon `NullEngine` 完成导入冒烟验证。
- 2026-06-01：修复模型拖入场景后位置参考不清和网格不可见的问题；工作网格改为独立线段层加透明拖放平面，拖放落点增加相机射线兜底，导入模型改为底部中心贴合落点，并按模型范围自适应扩展网格；已通过 `node node_modules/typescript/bin/tsc -b`、`node node_modules/vite/bin/vite.js build`、`node node_modules/typescript/bin/tsc -p tsconfig.electron.json` 验证。
- 2026-06-01：修复重新打开项目后左侧层级有模型但视口只有网格的问题；根因是未注册 `.babylon` 序列化场景加载器，加载失败后又未及时刷新清空后的层级状态。现已注册 Babylon 文件加载器，保存/加载时剔除编辑器运行时高亮层和临时相机引用，清空场景后立即同步层级与统计，并在项目条展示加载错误；已通过 `node node_modules/typescript/bin/tsc -b`、`node node_modules/vite/bin/vite.js build`、`node node_modules/typescript/bin/tsc -p tsconfig.electron.json` 验证。
- 2026-06-01：修复每次打开项目后旧场景像是丢失的问题；项目打开逻辑不再把任何读取失败都当作新项目初始化，只在 `.babylon-editor/project.json` 明确不存在时创建项目，清单存在但损坏会直接报错保护旧文件；打开项目会扫描 `scenes/*.scene.json` 恢复清单遗漏的场景，保存前会把旧场景复制到 `scenes/.backups/`，并在场景读取失败或读取中时禁止保存，避免空场景覆盖磁盘文件；已通过 `node node_modules/typescript/bin/tsc -b`、`node node_modules/vite/bin/vite.js build`、`node node_modules/typescript/bin/tsc -p tsconfig.electron.json` 验证。
- 2026-06-01：修复项目每次打开都提示“加载场景失败”且内容被清空的问题；根因是 Babylon.js 9 按需导入后缺少 `LoadingScreen`、`ImageProcessingConfiguration`、`GroundMesh` 等反序列化副作用注册。场景加载改为先解析到 `AssetContainer`，成功后再替换视口内容，失败时保留现有场景；同时保留 Babylon 字符串异常原文，便于后续定位。已通过 Electron 渲染环境加载现有项目场景文件，并执行 `npm run build` 验证。
- 2026-06-01：调整模型导入语义，工具栏和资产面板选择模型文件时只登记到资产浏览器，不再自动添加到当前场景；用户需要把资产列表中的模型拖入视口后才会实例化。
- 2026-06-01：精简资产面板，移除右侧重复的内置 Cube/Sphere/Ground 资产列表；底部资产区默认只保留左侧基础对象拖拽入口，导入外部资源后才显示资源列表。
- 2026-06-01：场景工作网格改为动态无边界效果；网格 helper 会按相机视口投影到地面的可见范围重建，并隐藏最外圈线段，同时继续限制线段数量，避免视口只显示固定网格块。
- 2026-06-01：新增快速定位交互；双击层级节点或视口中的模型会选中对象并把相机快速聚焦到其包围盒范围。
- 2026-06-01：补齐全项目米制契约；场景保存元数据、加载后场景元数据和导入模型节点元数据都会声明 `meter`，属性面板新增只读“尺寸 m”，模型包围盒按米展示。
- 2026-06-01：修复 `Stacker.glb` 导入后巨大到看不到全貌的问题；根因是模型源坐标为毫米量级，编辑器此前直接按米解释。现在导入 `.glb/.gltf/.obj/.stl` 时会根据包围盒识别明显毫米级模型，把内部模型根按 `0.001` 缩放到米，并在节点元数据记录 `sourceUnit` 与 `unitScaleToMeters`。
- 2026-06-02：修复同一批 GLB 模型导入后尺寸标准不一致的问题；导入时不修改源模型文件，而是在 Babylon/glTF 节点变换应用后基于真实世界包围盒阈值启发式推断米、厘米或毫米来源，把场景实例统一归一到米，并把 `sourceUnit`、`unitScaleToMeters`、推断来源和置信度写入资产与节点元数据，避免同一资产后续拖入时重新猜单位。
- 2026-06-01：扩大编辑器场景可见视野并降低黑屏风险；编辑器相机默认半径、远裁剪面和取景余量增大，打开项目后会按完整可编辑场景包围盒重新取景，视口容器尺寸变化会通过 `ResizeObserver` 同步到 Babylon 引擎，避免布局变化后画布后备缓冲未刷新导致视口发黑。
- 2026-06-01：修复导入模型与内置模型拖入体验不一致的问题；导入模型现在和 Cube/Sphere 等基础对象一起显示为资产卡片，拖入视口时通过资产编号实例化，原始文件缓存不会被消费，因此同一个模型可以反复拖入生成多个场景实例。
- 2026-06-01：调整模型拖入后的视角行为；模型从资产面板或外部文件拖入视口后仍会自动选中并刷新网格覆盖范围，但不再把相机目标和半径切换到当前拖入模型，视角跟随只保留给双击模型或层级节点的显式快速定位。
- 2026-06-01：强化动态工作网格闪光定位效果；基础网格线改为更亮的呼吸闪光，主线和坐标轴增加高对比脉冲覆盖层，并保留移动高亮定位线，所有闪光对象仍只作为编辑器 helper 存在，不影响透明拖放平面、场景序列化和模型拾取。
- 2026-06-02：调整工作网格闪光方式；基础网格、主线、坐标轴和定位线统一使用同一个闪烁相位，不再局部扫动，形成整张网格同时一闪一闪的定位效果。
- 2026-06-01：修复大模型场景中鼠标右键移动几乎失效的问题；编辑器相机会按当前观察半径动态提升平移速度，小场景保持原手感，大模型取景后右键拖拽会按场景尺度移动。
- 2026-06-01：移除视口右上角 DOM 形式的 `X/Y/Z` 方块，改为 Babylon 场景原点内的三轴坐标系 helper；坐标轴和标签均不参与模型拾取、层级展示和场景序列化。
- 2026-06-01：工具栏新增“预览”按钮；进入预览时会自动取景完整可编辑场景并循环播放场景动画，停止后恢复编辑相机、选中高亮和 Gizmo 状态，预览中禁止保存以避免写入动画中间帧。
- 2026-06-01：底部资源区新增 POI 库，内置 6 类基础 POI 组件；POI 拖入视口后以非 helper 的可编辑 Babylon 根节点创建，已通过 `node node_modules\typescript\bin\tsc -b` 和 `node node_modules\vite\bin\vite.js build` 验证。
- 2026-06-02：修复重新打开项目后已导入模型资产无法继续使用的问题；项目模式导入资产时会把源文件写入 `assets/source/`，场景元数据记录项目相对路径，资产拖入时再按需读取源文件，避免打开项目时一次性加载大模型；`.gltf/.obj` 可同批选择 `.bin/.mtl/贴图` 依赖并随资产记录恢复；资产选择入口会先快照 `FileList`，避免清空 input 后登记为空；任一文件写入失败时仍会先把模型登记为当前会话资产并提示重新打开项目前需要重新导入失败文件；旧项目没有项目内源文件时，会尝试复用当前场景中的同源模型作为模板克隆新实例，仅当场景内仍存在同源模型实例时生效。已通过 `node node_modules\typescript\bin\tsc -b`、`node node_modules\typescript\bin\tsc -p tsconfig.electron.json`、`node node_modules\vite\bin\vite.js build` 和 `git diff --check` 验证。
- 2026-06-02：修复右侧属性面板三轴数值布局；位置、尺寸、旋转和缩放会按面板宽度自动换行，尺寸只读值最多显示 3 位小数并保留完整值悬停提示，避免数值框显示省略号。
- 2026-06-02：调整左侧层级面板为深色表格样式，新增关键词搜索和“新建”入口；每行眼睛按钮可直接切换对应模型在场景中的隐藏和显示，导入模型根节点会同步刷新真实子网格显隐状态。
- 2026-06-02：优化全屏编辑布局，左右侧栏改为有上限的紧凑宽度，底部资源区降低高度，把更多可视空间留给中间 Babylon 场景视口。
- 2026-06-02：右侧属性面板改为截图风格的深色折叠分组布局，新增 MeshVertexModifyComponent 参数和业务资产编号 metadata 落地；已执行 `npm run build`，构建通过。
- 2026-06-03：新增项目条场景环境背景色色块，默认环境色不再使用全黑；颜色会同步到 Babylon `clearColor`、派生环境基色和 `metadata.editor.sceneEnvironment.backgroundColor`，保存后可随项目场景恢复。已执行 `node node_modules\typescript\bin\tsc -b` 和 `node node_modules\vite\bin\vite.js build` 验证。
- 2026-06-03：工具栏新增“导入 CAD 图纸”按钮；DXF 文本图纸会按米制解析为贴地矢量线，支持 LINE、LWPOLYLINE、POLYLINE、CIRCLE 和 ARC，并按图层分色生成可保存的 CAD 根节点。DXF 文件大小不做导入限制，仍保留线段数量保护和 LineSystem 分块渲染。已执行 `node node_modules\typescript\bin\tsc -b` 验证。
- 2026-06-03：修复 DXF 导入后尺寸过大的问题；解析器会优先读取 `$INSUNITS`，将毫米、厘米、米、英制等 DXF 源单位统一换算为项目米制坐标，缺失单位且原始尺寸明显过大时按毫米推断，并在 CAD 根节点 metadata 记录源单位、换算比例、原始 bounds 和米制 bounds。
- 2026-06-03：整理 `E:\公司文件\数字孪生\模型文件\models` 下 11 个 GLB 为“一模型一目录”模型包，并将每个目录的 `*.params.ts` 参数脚本与 `*.parametric.ts` 运行脚本合并为单个 `*.model.ts`；`meta.json.parameterScripts[].scriptFilename` 和 `meta.json.animationScripts[].scriptFilename` 指向同一文件，分别通过 `ParametricModelParamsComponent` 与 `ParametricModelRuntimeComponent` 区分用途，避免编辑器显示多个 TS 后无法全部使用。
- 2026-06-04：模型包 manifest 新增运行脚本文件和运行类名；导入、资产拖入和项目重新打开后会按需加载项目内 `.model.ts`，同步 `metadata.scripts[].values` 并执行 `ParametricModelRuntimeComponent`，右侧属性栏修改参数后会实时驱动模型变化；保存场景前会临时停止运行脚本以清理生成节点和恢复基线，保存后再恢复视口效果，避免重新打开后重复克隆或二次变形。已执行 `npm run build`，构建通过。
- 2026-06-04：点击视口非模型区域或编辑器 helper 区域时，右侧属性面板会切换为场景属性；场景名、环境色、相机可视距离、编辑器设置和 `SceneDataDrivenComponent` 配置可编辑，其中数据驱动配置保存到 `metadata.editor.sceneDataDriven`，本次不启动真实数据驱动运行时。

## 项目工作流

桌面应用启动后会先进入项目启动页，展示最近打开过的项目。用户可以直接打开最近项目，也可以选择已有目录作为项目，或者在指定父目录中新建一个项目。

项目创建时会自动生成默认场景。进入编辑器后，顶部项目条显示当前项目、项目路径和场景选择器；点击“新建场景”可以在同一项目内创建更多场景。保存按钮在项目模式下会把当前 Babylon 场景序列化写入当前场景文件；重新打开最近项目或切换场景时，会通过 Babylon.js 的场景加载能力恢复已保存的场景内容。若未处于项目模式，则继续使用原有的 `.babylon` 文件下载逻辑。

项目数据采用本地文件优先的格式，便于后续接入版本管理、资源管线和多人协作：

```text
ProjectName/
  .babylon-editor/
    project.json
  assets/
    source/
      <asset-id>/
        <source-file>
      <model-package-id>/
        meta.json
        <model-script>.model.ts
        <model>.glb
  scenes/
    <scene-name>-<scene-id>.scene.json
    .backups/
      <scene-name>-<scene-id>-<timestamp>.scene.json
```

- `.babylon-editor/project.json` 保存项目名称、创建时间、更新时间、场景索引和当前激活场景。
- `assets/source/` 保存导入资产的源文件副本；多文件模型会把同批选择的依赖文件一起记录到场景元数据，文件夹模型包会保留 `meta.json`/`meta.js`、参数脚本和主 `.glb`，重新打开项目后拖入资产时再按需读取。
- `scenes/*.scene.json` 保存单个场景的 Babylon 原生序列化数据以及编辑器元数据，包含场景环境背景色等场景级设置。
- `scenes/.backups/*.scene.json` 保存场景覆盖前的自动备份，每个场景默认保留最近 10 份，便于误保存后手动恢复。
- Electron 的 `userData/app-state.json` 保存最近项目列表，仅用于启动页快速访问，不参与项目内容版本管理。

## 目录结构

```text
electron/
  main.ts
  preload.ts
scripts/
  dev-electron.mjs
src/
  components/
    AssetBrowser.tsx
    HierarchyPanel.tsx
    InspectorPanel.tsx
    ProjectLauncher.tsx
    Toolbar.tsx
    ViewportCanvas.tsx
  editor/
    cadDxf.ts
    math.ts
  engine/
    BabylonEditorEngine.ts
  styles/
    editor.css
  types/
    electron-app.d.ts
    editor.ts
  App.tsx
  main.tsx
tsconfig.electron.json
```

## 架构说明

- `BabylonEditorEngine` 负责 Babylon.js 的渲染、场景、相机、Gizmo、拾取、高亮、导入和保存，并区分“资产登记”和“场景实例化”两条链路，避免选择模型文件时直接污染当前场景。
- React 组件只负责界面展示和命令转发，避免把 WebGL 生命周期散落在多个组件里。
- `ProjectLauncher` 负责桌面项目入口，包括最近项目、新建项目和打开项目。
- `types/editor.ts` 定义 React 与 Babylon 引擎之间传递的稳定数据结构。
- `editor/cadDxf.ts` 负责 DXF 文本解析和单位归一化，把 CAD 实体按 `$INSUNITS` 或明显毫米级尺寸推断换算成项目米制二维矢量折线；Babylon 引擎只负责把米制折线映射到 XZ 网格并生成 LineSystem。
- `editor/math.ts` 放置向量、角度和文件体积等通用转换逻辑。
- `electron/main.ts` 负责桌面窗口、开发/生产入口、外链拦截、单实例应用、项目文件读写和最近项目状态。
- `electron/preload.ts` 通过 `contextBridge` 暴露极小桌面端能力，渲染进程不直接启用 Node.js。
- `tsconfig.electron.json` 单独编译 Electron 主进程与 preload，避免污染 Vite 渲染端配置。
- `scripts/dev-electron.mjs` 串联 Vite 与 Electron 开发模式，避开 Windows `.cmd` shim 的 spawn 兼容问题，并负责退出时清理子进程。

## 后续演进

- 增加撤销/重做命令栈
- 增加多选、批量复制/删除、父子层级拖拽
- 增加 Prefab 与组件脚本系统
- 增加材质库、纹理槽、PBR 参数和 Node Material 入口
- 增加 LOD、薄实例、Octree、GPU Picking 等大场景优化
- 增加未引用资产清理和资产重命名工具
- 增加正式应用图标、代码签名、自动更新和 asar 恢复策略
