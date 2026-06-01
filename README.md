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
- 默认场景：编辑网格、环境光、方向光、立方体、球体、地面
- 米制单位：编辑器约定 `1 Babylon unit = 1 m`，属性面板位置以 `m` 显示，工作网格默认每小格为 `1 m`，导入大模型后会自动扩展网格范围并使用更易读的步长
- 工具栏：选择、移动、旋转、缩放、创建基础对象、导入、保存、Inspector、性能预览
- GizmoManager：选中对象后支持移动、旋转、缩放
- HighlightLayer：选中对象高亮
- 点击拾取：从视口或层级树选中对象
- 删除对象：选中基础对象或拖入模型后，可通过项目条按钮、Delete 或 Backspace 删除
- 属性编辑：名称、位置、旋转、缩放、可见性、材质颜色；右侧属性面板输入会实时驱动视口模型变化，视口内通过 Gizmo 移动、旋转、缩放时右侧属性栏会实时同步
- 资产导入：支持从工具栏、视口拖拽或资产面板按钮导入 `.glb`、`.gltf`、`.babylon`、`.obj`、`.stl`、常见图片贴图；导入模型会按真实包围盒底部中心贴合落点，带子节点的模型在层级面板只展示主模型，保持列表简洁
- 拖拽操作：资产面板基础对象拖到视口创建，外部模型文件拖到视口导入；拖放落点通过透明地面和相机射线兜底计算，避免网格不可见时回退到原点
- 场景保存：导出 `.babylon` 文件，并附带编辑器资产元数据；项目内重新打开场景时会注册 Babylon 序列化场景加载器，并清洗相机、选中高亮等编辑器运行时数据，避免保存后重新打开模型消失
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
- 2026-06-01：统一编辑器米制单位约定，新增单位配置常量，默认几何体、灯光高度、工作网格和保存元数据均按 `1 Babylon unit = 1 m` 处理；属性面板显示 `m`、`deg`、`x` 单位；已执行 `npm run build`，构建通过。
- 2026-06-01：修复导入 GLB 后模型不可见的问题；导入改为使用 Babylon.js 9 的新式 `ImportMeshAsync(File, scene, { pluginExtension })`，并在导入后按真实包围盒居中到落点、自动调整相机看向模型；已执行 `npm run build`，并用 Khronos `Box.glb` 通过 Babylon `NullEngine` 完成导入冒烟验证。
- 2026-06-01：修复模型拖入场景后位置参考不清和网格不可见的问题；工作网格改为独立线段层加透明拖放平面，拖放落点增加相机射线兜底，导入模型改为底部中心贴合落点，并按模型范围自适应扩展网格；已通过 `node node_modules/typescript/bin/tsc -b`、`node node_modules/vite/bin/vite.js build`、`node node_modules/typescript/bin/tsc -p tsconfig.electron.json` 验证。
- 2026-06-01：修复重新打开项目后左侧层级有模型但视口只有网格的问题；根因是未注册 `.babylon` 序列化场景加载器，加载失败后又未及时刷新清空后的层级状态。现已注册 Babylon 文件加载器，保存/加载时剔除编辑器运行时高亮层和临时相机引用，清空场景后立即同步层级与统计，并在项目条展示加载错误；已通过 `node node_modules/typescript/bin/tsc -b`、`node node_modules/vite/bin/vite.js build`、`node node_modules/typescript/bin/tsc -p tsconfig.electron.json` 验证。
- 2026-06-01：修复每次打开项目后旧场景像是丢失的问题；项目打开逻辑不再把任何读取失败都当作新项目初始化，只在 `.babylon-editor/project.json` 明确不存在时创建项目，清单存在但损坏会直接报错保护旧文件；打开项目会扫描 `scenes/*.scene.json` 恢复清单遗漏的场景，保存前会把旧场景复制到 `scenes/.backups/`，并在场景读取失败或读取中时禁止保存，避免空场景覆盖磁盘文件；已通过 `node node_modules/typescript/bin/tsc -b`、`node node_modules/vite/bin/vite.js build`、`node node_modules/typescript/bin/tsc -p tsconfig.electron.json` 验证。
- 2026-06-01：修复项目每次打开都提示“加载场景失败”且内容被清空的问题；根因是 Babylon.js 9 按需导入后缺少 `LoadingScreen`、`ImageProcessingConfiguration`、`GroundMesh` 等反序列化副作用注册。场景加载改为先解析到 `AssetContainer`，成功后再替换视口内容，失败时保留现有场景；同时保留 Babylon 字符串异常原文，便于后续定位。已通过 Electron 渲染环境加载现有项目场景文件，并执行 `npm run build` 验证。

## 项目工作流

桌面应用启动后会先进入项目启动页，展示最近打开过的项目。用户可以直接打开最近项目，也可以选择已有目录作为项目，或者在指定父目录中新建一个项目。

项目创建时会自动生成默认场景。进入编辑器后，顶部项目条显示当前项目、项目路径和场景选择器；点击“新建场景”可以在同一项目内创建更多场景。保存按钮在项目模式下会把当前 Babylon 场景序列化写入当前场景文件；重新打开最近项目或切换场景时，会通过 Babylon.js 的场景加载能力恢复已保存的场景内容。若未处于项目模式，则继续使用原有的 `.babylon` 文件下载逻辑。

项目数据采用本地文件优先的格式，便于后续接入版本管理、资源管线和多人协作：

```text
ProjectName/
  .babylon-editor/
    project.json
  scenes/
    <scene-name>-<scene-id>.scene.json
    .backups/
      <scene-name>-<scene-id>-<timestamp>.scene.json
```

- `.babylon-editor/project.json` 保存项目名称、创建时间、更新时间、场景索引和当前激活场景。
- `scenes/*.scene.json` 保存单个场景的 Babylon 原生序列化数据以及编辑器元数据。
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

- `BabylonEditorEngine` 负责 Babylon.js 的渲染、场景、相机、Gizmo、拾取、高亮、导入和保存。
- React 组件只负责界面展示和命令转发，避免把 WebGL 生命周期散落在多个组件里。
- `ProjectLauncher` 负责桌面项目入口，包括最近项目、新建项目和打开项目。
- `types/editor.ts` 定义 React 与 Babylon 引擎之间传递的稳定数据结构。
- `editor/math.ts` 放置向量、角度和文件体积等通用转换逻辑。
- `electron/main.ts` 负责桌面窗口、开发/生产入口、外链拦截、单实例应用、项目文件读写和最近项目状态。
- `electron/preload.ts` 通过 `contextBridge` 暴露极小桌面端能力，渲染进程不直接启用 Node.js。
- `tsconfig.electron.json` 单独编译 Electron 主进程与 preload，避免污染 Vite 渲染端配置。
- `scripts/dev-electron.mjs` 串联 Vite 与 Electron 开发模式，避开 Windows `.cmd` shim 的 spawn 兼容问题，并负责退出时清理子进程。

## 后续演进

- 增加撤销/重做命令栈
- 增加多选、复制、删除、父子层级拖拽
- 增加 Prefab 与组件脚本系统
- 增加材质库、纹理槽、PBR 参数和 Node Material 入口
- 增加 LOD、薄实例、Octree、GPU Picking 等大场景优化
- 增加项目资源目录和资产引用重写，支持模型、贴图随项目迁移
- 增加正式应用图标、代码签名、自动更新和 asar 恢复策略
