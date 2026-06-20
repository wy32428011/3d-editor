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
- 编辑视口相机：编辑态和预览态的鼠标导航都对齐 [Unity Scene view navigation](https://docs.unity3d.com/6000.4/Documentation/Manual/SceneViewNavigation.html)；裸左键用于编辑态选择和 Gizmo，`Alt + 左键` 环绕当前 pivot，鼠标中键拖拽平移，`Alt + 右键` 拖拽缩放，右键拖拽观察视角，滚轮沿当前视线前进/后退并允许贴近、穿过模型内部；按住 `Shift` 会加快环绕、平移、缩放、滚轮和右键观察速度；右键单击命中可编辑对象时只在编辑态打开对象菜单，预览态不会弹出编辑菜单；工具栏可切换正顶俯瞰模式，开启时先切到近似垂直正顶视角，之后主动旋转只改变水平朝向且不会切换俯仰角，滚轮、中键平移、`Alt + 右键` 缩放和显式聚焦仍可使用，该模式下 Gizmo 拖拽和属性面板变换不会自动带动相机视角
- 默认场景：编辑网格、场景内 X/Y/Z 坐标轴、环境光、方向光、立方体、球体、地面；项目条和右侧场景属性可配置场景环境背景色，避免视口背景固定为全黑
- 米制单位：编辑器约定 `1 Babylon unit = 1 m`，默认对象、工作网格、属性面板位置和模型尺寸都按 `m` 展示；导入模型不会修改源文件，编辑器会在 Babylon/glTF 节点变换生效后按真实世界包围盒阈值启发式推断米、厘米或毫米来源，并把进入场景的模型实例归一到米，单位决策会写入模型和资产元数据；工作网格默认每小格为 `1 m`，会随相机位置和缩放动态覆盖视口，并通过全网格同相位呼吸闪烁和专用光晕层帮助定位编辑平面，光晕层只作用于编辑器网格 helper，不影响模型拾取、CAD、选中描边或场景保存
- 工具栏：选择、移动、旋转、缩放、创建基础对象、创建定位线框立方体、撤销场景布局、导入、导入 CAD 图纸、保存、发布、统一数据源配置、整场景动画预览、正顶俯瞰模式、Inspector、性能预览
- GizmoManager：选中可变换对象后会自动切换到移动工具并显示 X/Y/Z 方向轴，仍支持手动切换旋转和缩放；锁定对象和预览模式下不会显示移动轴
- OutlineRenderer：选中对象只显示外轮廓，不覆盖模型主体材质和贴图
- 点击拾取：从视口或层级树选中对象，普通单击只更新选区、Gizmo 和属性面板，不改变当前相机视角；双击层级节点或视口模型可快速定位到对象；左侧模型树支持 Windows 风格多选，普通点击替换选区，`Ctrl` 点击切换单项，`Shift` 按当前可见行做范围选择，选区会同步到树行高亮和视口轮廓高亮；左侧模型树支持新建逻辑 group、模型拖拽归组、group 展开折叠、显隐切换和锁定保护，选中 group 时会高亮其下所有普通 mesh 模型
- 右键与快捷键：模型树空白区域右键可新建文件夹、展开树和折叠树；文件夹、模型和 POI 右键可执行场景聚焦、库聚焦、显隐、复制、粘贴、锁定/解锁、重命名、删除、群组、解组、选择子级、反选、展开树和折叠树，文件夹不会显示可用的库聚焦。多选时删除、显示/隐藏、锁定/解锁和群组会作用于选区内可编辑的顶层对象，属性面板、Gizmo、复制、重命名、阵列、选择子级和库聚焦仍作用于主选中对象；在已选项上右键会保留多选集合并切换主对象。场景布局撤销支持工具栏按钮和 `Ctrl+Z`，会恢复最近一次创建、导入、删除、复制粘贴、阵列、分组、显隐、锁定、归组移动、属性编辑、Gizmo 变换、场景初始化或模型包刷新/替换；输入框和文本编辑区域保留系统键盘行为。其它快捷键支持 `F` 场景聚焦、`H` 显示/隐藏对象、`Ctrl+C` 复制、`Ctrl+V` 粘贴、`Ctrl+K` 锁定/解锁、`Delete`/`Backspace` 删除、`Ctrl+G` 群组对象、`Shift+G` 解组对象、`Ctrl+I` 反选对象、`P` 按当前树状态展开或折叠树。
- 删除对象：选中基础对象或拖入模型后，可通过项目条按钮、Delete 或 Backspace 删除；多选时会批量删除选区内未锁定的顶层模型或 group，若同时选中父 group 和子模型，只删除父 group 一次
- 复制粘贴：选中模型后可通过 `Ctrl+C` 复制，再用 `Ctrl+V` 粘贴为带水平偏移的独立副本；左侧模型树或视口中右击普通模型可打开“模型阵列”，按 `X/-X/Z/-Z` 地面轴向、克隆数量和模型间距批量生成真实可编辑副本，普通模型会按源模型当前世界 X/Z 外包络自动贴边排列，并在贴边基础上追加用户选择的米制间距；Shelf 货架沿 X/-X 阵列时会按左右支架中心距排列，默认 `0 m` 表示相邻货架中间立柱中心线重合，输入正数才在共享立柱语义外追加空隙，`X/Z` 表示世界坐标正向，`-X/-Z` 表示世界坐标负向，克隆数量表示新增副本数；副本资产编号按源编号追加递增数字，例如 `ABC` 会生成 `ABC-1`、`ABC-2`，并自动跳过同场景中已占用的编号；辊道机等模型包副本会先按源模型原始基线收敛子节点，再清除旧几何基线并重新生成独立运行态布局，避免从已参数化姿态二次取基线导致副本散架；属性面板输入框等文本编辑区域仍保留系统复制粘贴行为，预览模式下不会复制、粘贴或阵列场景模型
- 属性编辑：右侧属性面板采用深色折叠分组样式，支持对象名称、显隐、位置、旋转、缩放、主体颜色、旧版 MeshVertexModifyComponent 参数、文件夹模型包解析出的动态参数和业务资产编号编辑；变换与颜色会实时驱动视口模型变化，正顶俯瞰模式下模型仍会更新但相机不会跟随属性变更移动；组件参数、动态参数和资产编号会写入节点 metadata 并随场景保存恢复；普通 GLB 中带 `GT/roller/辊/滚` 命名的辊筒会按 MeshVertexModifyComponent 的“辊筒密度”显示最终数量，模型包辊道机则优先使用动态参数区的“辊筒数量”
- 资产导入：支持从工具栏和资产面板按钮导入 `.glb`、`.gltf`、`.babylon`、`.obj`、`.stl`、常见图片贴图，以及 `.gltf/.obj` 同批依赖的 `.bin/.mtl/贴图` 文件；桌面模式支持导入包含 `meta.json`/`meta.js`、单个 TypeScript 模型脚本和主 `.glb` 的文件夹模型包，导入后会复制到项目 `assets/source/`，属性栏会优先按 `meta.json` 的 `parameterScripts[].scriptFilename` 选择参数脚本，并静态解析 `visibleAsNumber` / `visibleAsString` / `visibleAsBoolean` / `visibleAsColor3` 装饰器生成动态参数；`meta.json.parameterScripts[].fields/defaultValue/values` 会作为模型自身给出的基础参数填入右侧属性面板，`values` 优先于字段默认值并同步到 `metadata.editor.modelPackageInstance.values` 与 `metadata.scripts[].values`，旧包装参数 `{ value }`、`{ currentValue }`、`{ defaultValue }`、字符串数字和字符串布尔值会在写回前自动归一化为裸值；长度、宽度、高度、深度、半径、间距和位置类数字参数会在右侧属性面板按 `m` 展示，并把 `unit: "m"` 同步到 `metadata.scripts[].fields` 供运行脚本按米制场景尺寸消费；同一个 `.model.ts` 可以同时声明 `ParametricModelParamsComponent` 和 `ParametricModelRuntimeComponent`，`meta.json` 保留不同 `className` 供兼容运行环境识别；模型包实例化后会在 Electron renderer 中执行项目内已复制的本地运行脚本，属性栏参数会同步到 `metadata.scripts[].values` 并实时触发 `ParametricModelRuntimeComponent` 驱动几何、阵列和显隐变化，脚本执行时会临时把模型根节点归一到局部基准坐标系，结束后恢复用户设置的位置和旋转，并把用户缩放与 `metadata.editor.modelPackageRuntime.parametricRootScaling` 中记录的参数化根缩放相乘，避免长度、宽度和高度等根节点参数化缩放被编辑器恢复逻辑抵消；脚本异常会降级为属性栏告警且不阻断参数保存；再次导入同源目录或资产库中唯一同名目录的模型包会复用原资产并完整替换项目内包文件，主进程会先复制到临时包目录，渲染端确认新 GLB、脚本和 meta 可加载后才切换正式目录，替换失败会回滚旧包；当前场景内同包实例会按新 GLB、脚本和 meta 重新加载，同时保留根节点位置、旋转、缩放、显隐、锁定、资产编号和已有动态参数，预览模式下会要求先退出预览再替换；项目模式下导入的源文件会复制到项目 `assets/source/`，模型和场景文件会先进入资产浏览器，不立即写入当前场景，重新打开项目后资产卡片会按需读取项目内源文件和同批依赖继续拖入使用；模型包从资产库拖入场景且源文件可用时会重新读取项目内 GLB 创建干净实例，只有旧项目缺少源文件副本时才从当前场景内同源模型克隆兜底；模型实例化到场景后，带子节点的模型在层级面板只展示主模型，保持列表简洁
- 模型包 runtime 保护：执行 `ParametricModelRuntimeComponent` 生命周期时，编辑器会临时标记 0 顶点 GLB 包装 mesh，让模型包脚本按既有 `generatedByParametricRuntime` 规则跳过这些不可渲染节点；执行结束后立即恢复原 metadata，避免辊道机这类原始坐标远离原点的 GLB 被脚本误算包围盒并缩放到不可见，同时不把临时标记写入场景文件。
- Shelf 参数形态：`F:\3d-models\models\Shelf\shelf.model.ts` 按 `Shelf.glb` 的真实节点结构做部件级参数化；层数沿 Y 方向复制横梁、深度梁、层板和斜撑，四根立柱连续拉高、底脚不按层复制；“货格宽度”以整体 X 向外包络为目标，只拉伸 `node1/node3/node25/node35` 对应的 `Box023/Box021/Box032/Box031` 横梁和层板，并按共同新端点保留各横梁原始端部搭接量，其它立柱、底脚和侧边件以这四个跨宽节点的原始左右端点为锚点，随新端点外移或内收而不放大截面；“货格深度”同样以这四个跨宽节点的原始前后端点为锚点，`Box001.4/Box002.5/Box003.6/Box004.3` 四根立柱和跨宽层梁随新前后边界整体移动，普通深度梁沿自身轴拉伸，`Box008.8/Box007.11` 侧面三角斜撑则同时按深度和层高重新贴合，避免多层或高度变化后侧面三角区域偏离立柱；运行时所有端点移动先按真实世界包围盒计算，再转换到父节点本地坐标写回，兼容 GLB `__root__` 坐标轴反向；“货格高度”调整层间 Y 距和立柱总高，列数和双深复制会继承当前模板节点变换。
- 辊道机参数形态：当前 opaque 命名的辊道机模型包不再把 `length/width/height` 作为根节点整体缩放保存；编辑器会在运行脚本前记录原始节点基线，参数变化时恢复基线后按部件级规则处理宽高、支架显隐和辊筒数量。基线只允许来自 GLB 原始节点，刷新参数化配置或替换模型包时不会继承旧 `opaqueRollerConveyorBaseline`，历史场景中混入的 `*_mesh_vertex_*`、`*_roller_*` 运行态辊筒克隆会被过滤并重新写回干净基线。`length` 按现场图片分成三段：左侧黄色固定区 `A16/A17/A7/A5/A3/A9/A13` 的右边界作为起点；红框内 `A10/A11` 两根长梁只在该起点右侧做顶点延伸或缩短，长梁节点自身不会再按延伸后的包围盒中心做 X 轴平移；右侧黄色尾端组件 `A18/A19/A4/A2/A6/A12/A14` 按 `lengthDelta` 跟随长梁尾端。电机、左端结构和 `GT` 辊筒数量/位置不因长度参数整体平移，`rollerDensity` 保持为独立辊筒数量参数。初始化未手动设置 `rollerDensity` 时只显示第一根辊筒，并把面板参数同步为 `1`；用户修改 `rollerDensity` 后，辊筒从 `A10/A11` 当前共同覆盖区中远离真实尾端的一侧开始，按原始 GT 中心距朝当前尾端方向追加，辊筒入口不再复用左侧固定区的 `length` 拉伸锚点，首根中心只在长梁入口内缩半个辊筒厚度，超过长梁安全范围的数量不会生成或显示。`width` 按整机目标外包络宽度处理，两侧零件贴齐新的外边界，横向贯穿件只在 Z 轴局部变宽；未手动修改 `rollerWidth` 时，辊筒宽度会改用 `A10/A11` 当前内侧间距自动计算，并放在两侧长梁内侧中线，避免整机变宽后辊筒端部和长梁之间出现缝隙；用户单独修改后则保持手动值。`height` 以底部脚杯为锚点，只让 `A4/A5/A6/A7` 四根角立柱承担高度增量，顶部框架、辊筒和驱动附件作为刚体上移；最终根节点只保留用户手动缩放，避免参数化后整机被拉伸变形。
- 链条机参数形态：`ChainConveyor01` / `chain-conveyor` 模型包不再用根节点 Z 向缩放表达 `chainLength`，也不再用根节点 X 向缩放表达 `chainWidth`；编辑器会记录 `Rail_01_M001`、`Rail_02_M001`、`ZJ`、`ZJ01`、`Box003`、`Box004` 和 `DJ` 的原始基线，长度变化时固定局部 `-Z` 起点，将两侧导轨和长梁类节点的 Z 向顶点延展到局部 `+Z` 方向，`Box004` 尾端附件跟随新尾端平移。`DJ` 电机保持图 1 的中间驱动位置，不参与缩放、不随长度尾端移动；`Box003` 会先把 GLB 因法线/材质拆出的同坐标顶点焊接成物理连通块，再以 `DJ` 的 X/Z 中心保护中间驱动段，长度增量只从驱动段尾侧之后作用到真正的长梁组件，横梁、脚板和支撑脚按组件保持原始三维形状，避免中间支撑板和电机座被拉长、拉斜或跑到端部。宽度变化时以局部 X 中心为锚点，`Box003` 会按物理连通块区分侧边窄块和内部跨宽块：两侧长梁/支撑小块保持原截面整体外移或内移，跨宽横梁、脚板、支撑脚等内部主体按左右顶点延展到新的宽度，只有 `DJ` 驱动区内的紧凑小件保持原始截面与位置；`Rail_01_M001`、`Rail_02_M001`、`ZJ`、`ZJ01` 和 `Box004` 作为刚体跟随两侧边界移动，导轨、支架、电机和侧边附件不会被横向压扁或放大截面，也不会和内部主体脱开架空。若 `Rail_01_M001` / `Rail_02_M001` 导出为空 `TransformNode` 包装，编辑器会记录并延展其真实子 Mesh 顶点；红框外主体会随 `chainLength` 真实变长，调小时也会从基线重新计算到不反转网格的安全长度，但仍不使用根节点整体缩放；保存重开、复制粘贴和阵列后都会按实例独立基线重新应用当前长度和宽度。链条机 fallback 识别以 `Box003`、`Rail_01_M001`、`Rail_02_M001` 和 `DJ` 为核心节点，`ZJ/ZJ01/Box004` 等附件缺失时不会导致长度和宽度参数完全失效。
- 辊道机辊筒定位：opaque 辊道机在首次导入、从资产库拖入、从场景模板克隆、复制、粘贴或阵列实例时都会执行同一套兜底布局；第一根辊筒中心取 `A10/A11` 当前共同覆盖区的红框入口并向内缩半个辊筒厚度，原始 GT 中心点只用于计算固定间距；设置数量后朝当前长梁尾端方向追加，超过长梁安全范围的辊筒不会生成或显示。
- 数据驱动：右侧场景属性和顶部工具栏“统一数据源配置”共用同一份 `SceneDataDrivenComponent`，支持配置 WebSocket 数据源，MQTT over WebSocket 模式只需填写 Broker IP/域名和 WebSocket 端口，系统会补齐默认 Topic、设备字段、匹配字段、payload 路径和插值时长；工具栏弹窗可直接点击“保存配置”把统一配置写入当前项目场景的 `metadata.editor.sceneDataDriven`，整场景保存时也会同步写入，重新打开同一项目场景后会自动恢复，不需要重复填写。开启预览后引擎会订阅数据并按设备号匹配场景模型，默认用对象“资产编号”匹配，也会兜底匹配模型包参数中的 `modelKey`、源文件名和节点名。模型包脚本可导出 `dataDriven` 声明设备类型、默认编号、payload 字段、运动轴向、参与节点、固定节点、本地模拟范围和货箱吸附语义，场景文件仍只保存连接配置。以 Stacker 模型包为例，上下轨道保持固定，整机生成/位姿走 `twinspawn`，内部动作走 `twindatadriven/joint` 的 `{e,p,v}` 点位格式；运行态会同时把 `movement_x` 行走和 `twinspawn` 平面位置夹紧到进入预览时的上下轨道范围，避免主体脱离轨道；新模型包默认使用 `movement_x/movement_y/front_movement_z/back_movement_z` 动作枚举持续驱动，`v=1` 正向、`v=2` 反向、`v=0` 停止保持当前位置，`cargo_action/cargo` 可在预览运行态把指定货箱临时吸附到货叉上，`drop` 携带 `target` 时可把货箱底面中心放入指定定位线框底面中心；退出预览会断开连接并恢复进入预览前的姿态，避免实时数据中间帧写入场景文件。
- 定位框动画连接：定位线框立方体可在右侧“资产信息”中填写资产编号，供 Stacker `drop target=定位框资产编号` 放货匹配；也可在“定位尺寸”中配置长、宽、高，尺寸保存到 `metadata.editor.locatorDimensions` 并实时改写场景内同一定位线框的 12 条边，长对应 X 轴、宽对应 Z 轴、高对应 Y 轴；还可在“动画连接”中启用数据驱动接收端，配置绑定设备、设备字段、匹配字段、X/Y/Z/朝向字段和插值时长。动画连接配置保存到 `metadata.editor.locatorAnimationConnection`，仍复用场景级 `SceneDataDrivenComponent` 连接。定位框只有显式启用且填写绑定设备后才会被预览数据驱动，默认按 `x/h/y/r` 映射到 Babylon 的 X/Y/Z/朝向；它仍是内置 primitive，不进入 `AssetRecord`、`assets/source` 或模型包链路，编辑态可手动摆放货物，预览态也可通过 Stacker `drop target=定位框资产编号` 把已吸附货物放入框内。
- CAD 图纸导入：工具栏提供独立的“导入 CAD 图纸”按钮，当前支持 `.dxf` 文本图纸；导入目标收敛为“所有可解析矢量线”，会把 LINE、LWPOLYLINE、POLYLINE/VERTEX、CIRCLE、ARC、ELLIPSE、SPLINE、SOLID/TRACE/3DFACE 外轮廓、LEADER/MLINE/MLEADER/MULTILEADER、RAY/XLINE 有限参考线、DIMENSION 块或 fallback 线以及 BLOCK/INSERT 嵌套内容解析为贴到 XZ 工作网格的米制线段；非线内容如文字、图片、填充面、遮罩和点不作为本次 CAD 导入目标，避免非线内容污染图纸 bounds 并产生放射状乱线。解析器优先导入模型空间线，模型空间没有可绘制线时才兜底导入布局/图纸空间并提示；若 DXF 的二维内容来自三维/剖面导出并落在 XZ 或 YZ 平面，导入器会读取实体 Z、高程和 OCS 挤出方向后自动选择面积最大的二维平面投影，避免只读 XY 导致所有线段压扁重叠；优先读取 DXF `$INSUNITS` 单位声明并换算到项目米制尺寸，未声明单位且原始尺寸明显过大时会推断为毫米；DXF 文件大小和线段数量不做截断，CAD 解析在 Worker 中输出二进制 typed-array chunk，Babylon 端直接用 `LinesMesh + VertexData` 分块渲染。项目模式会把多个线段 chunk 合并保存为约 16-24MB 的 `*.cadlines.pack.bin` 侧车包，场景 JSON 只保留 CAD 根节点 metadata、bounds、单位和 chunk manifest；旧项目中的单 chunk `*.cadlines.bin` 侧车仍可兼容恢复。图纸按包围盒中心平移到世界原点并在导入后自动取景，导入结果作为可选中、可删除、可随场景保存恢复的 CAD 根节点；选中 CAD 根节点后可在右侧“CAD 显示”中调整整张图纸透明度，不改变原始线色和几何数据。DWG 需先转换为 DXF 后导入。
- CAD 导入与恢复进度：导入 DXF 时项目条会显示专用进度条，按读取文件、测量图纸、输出线段、创建网格和保存侧车包等阶段更新；能拿到总量的阶段显示百分比，测量等未知总量阶段显示不确定进度。重新打开项目时普通场景会先完成加载并可操作，CAD 侧车线段在后台渐进恢复，顶部显示“CAD 恢复中”的 chunk/mesh 进度；恢复完成前会暂时禁用保存，避免把未恢复完整的 CAD 状态写回场景文件。导入中和恢复中的状态不会再占用错误提示。
- POI 库：底部资源区按“模型库、POI库、主题库、图表库、组合库、图片库、环境库”分组展示；本轮 POI库已补齐事件触发器、发送器、回收器、图表立标、图表面板、手动漫游、报警管理器、模型产生器、群组事件绑定、自动巡检和路径 11 类业务组件，支持按 POI 名称、描述和关键字搜索，拖入视口后会生成真实 Babylon 可编辑节点，支持选择、Gizmo 变换、层级展示、复制、删除、显隐、锁定和场景保存。旧版标记点、信息点、告警点、摄像头、设备点和文本标签会在加载时映射到最接近的新 POI 类型。
- 资源库高度：底部资源区上边缘支持鼠标拖拽调整高度，默认高度提升到可完整显示 POI 搜索栏和一排业务卡片；调整后的高度会保存到浏览器本地存储，下次打开编辑器继续使用，不写入项目或场景文件。
- POI 运行态：POI 作为内置轻量场景节点保存，不进入 `AssetRecord` 文件资产链路；可持久化配置写入 `metadata.editor.poiConfig`，顶层 `metadata.poi` 继续保留用于旧场景识别。编辑态和预览态都会启用 `SceneBusinessRuntime`，运行中间态、最新 payload、运行计数、临时图表面板、路径线、占位生成模型、WebSocket/MQTT 句柄都只放在内存或 `doNotSerialize` 临时节点上，保存、删除、清场、退出预览和 dispose 时统一清理，不写入 `.babylon` 文件。
- POI 数据源与发送器：POI 运行态复用场景级 `SceneDataDrivenComponent` 的 WebSocket/MQTT over WebSocket 数据源接收外部数据；发送器支持内部事件、WebSocket JSON 外发和 MQTT publish 三种输出，默认输出为内部事件。WebSocket/MQTT 外发需要在发送器配置中显式填写连接地址和 Topic，运行态继续保留消息大小、帧数、重连和 topic 保护。
- 拖拽操作：资产面板基础对象、定位线框立方体和导入模型都以统一资产卡片展示，拖到视口创建或实例化；定位线框立方体默认是 1.5m 线框参考对象，可在右侧属性面板实时调整长、宽、高，本身不会自动吸附、约束或归组货物；Stacker 的货箱取放吸附由预览态数据驱动独立处理，只按货箱资产编号临时跟随货叉，`drop target` 可把货物放到指定定位框底面中心；同一模型资产可以像内置 Cube/Sphere 一样反复拖入生成多个实例；外部模型文件直接拖到视口仍按落点导入并同步登记为可复用资产，拖入后的模型保持选中并自动显示移动轴但不自动改变当前相机视角，拖放落点通过透明地面和相机射线兜底计算，避免网格不可见时回退到原点
- 场景保存：非项目模式导出 `.babylon` 文件时保持自包含，并附带编辑器资产元数据、场景环境背景色和 `metadata.editor.sceneDataDriven` 场景数据驱动配置；项目模式保存会把运行时大贴图写入 `assets/source/editor-scene-textures-<sceneId>/` 侧车文件，场景 JSON 只保留 `metadata.editor.projectExternalTextures` 清单和 `file:<name>` 轻量引用，避免 GLB 内嵌贴图以大段 `base64String` 进入 `*.scene.json`；项目内重新打开场景时会注册 Babylon 序列化场景加载器，读回 CAD/贴图侧车文件，并清洗相机、选中高亮、数据连接和预览态等编辑器运行时数据，避免保存后重新打开模型消失或保留实时数据中间帧；点击保存后项目条会在磁盘写入完成后提示“保存完成”，保存失败只显示错误且不会回退触发普通 `.babylon` 导出
- 默认高清渲染：视口会按 3840x2160 目标像素量自动设置 Babylon 后备缓冲，低于 4K 的窗口自动超采样，避免高 DPI/大屏下画面发糊或出现马赛克；工具栏状态栏可悬停查看真实渲染分辨率、硬件缩放和 GPU renderer。
- 性能预览：仅在用户手动打开时降低渲染分辨率并关闭指针移动拾取，便于大场景快速预览；关闭后会自动恢复默认 4K 高清策略。
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

## 数据驱动协议

> 完整的 MQTT 接入操作文档（前置条件、配置步骤、全部设备 payload 速查、新模型接入和排错清单）见 [docs/mqtt-data-driven-guide.md](docs/mqtt-data-driven-guide.md)，可直接交付给数据服务方和现场实施人员。

顶部工具栏的“统一数据源配置”、场景属性面板的 `SceneDataDrivenComponent` 和对象属性面板的“数据驱动”分区复用同一份场景级非敏感连接配置，并保存到 `metadata.editor.sceneDataDriven`；项目场景保存成功后会随 `scenes/*.scene.json` 一起落盘，工具栏弹窗的“保存配置”会直接复用项目场景保存链路写盘，重新打开同一场景会从 metadata 读回。选中模型后的“绑定设备”仍写入对象资产编号。MQTT 需要 broker 开启 WebSocket 端口，界面只需要填写 Broker IP/域名和 WebSocket 端口，系统会自动生成 `ws://<IP>:<端口>/mqtt`，并补齐默认订阅 `dt/factory/logistics/+/+/twinspawn` 与 `dt/factory/logistics/+/+/twindatadriven/#`、设备字段 `e`、匹配字段 `assetCode` 和 200ms 插值；不要填写 `1883` 普通 TCP 端口。普通 WebSocket 会在连接成功后发送 `{"type":"subscribe","channel":"<通道>"}` 作为轻量订阅请求。预览运行态会显示连接中、已订阅、重连、最近消息时间和错误信息；真实连接超过 5 秒没有收到数据时会标记为离线但保持最后姿态，不把实时中间帧写入场景文件。

MQTT Topic 按 `dt/factory/logistics/{devType}/{deviceId}/{msgFlag}/{subRes}` 组织：整机生成/位姿使用 `twinspawn`，内部物理动作使用 `twindatadriven/joint`，负载、状态、告警分别使用 `twindatadriven/payload`、`twindatadriven/status`、`twindatadriven/alarm`。payload 建议携带设备字段（默认 `e`，也兼容 Excel 常用 `deviceCode`）；如果 MQTT topic 符合规范且 payload 缺少设备字段，运行时会用 topic 中的 `{deviceId}` 兜底匹配模型。动作 payload 应表达业务语义，例如 `movement_x`、`movement_y`、`front_movement_z`、`rotation`，不要直接发送 Babylon 节点路径或材质字段；具体映射由模型包 `dataDriven.motion` 决定。状态、告警和心跳类消息保留给 POI/业务层消费，不会被当作模型运动帧。

模型包脚本可以导出 `dataDriven` 对象，把运动语义放回模型资产自身。`motion.*.valueMode` 缺省为 `"target"` 以兼容旧场景，表示 payload 的 `v` 是相对进入预览基线姿态的目标值；新模型包使用 `valueMode:"action"`，表示 payload 的 `v` 是动作枚举，运行时按 `direction * speed * deltaSeconds` 持续积分。`translate` 的速度单位为 `m/s`，`rotate` 的速度单位为 `deg/s`；动作值为 `0` 时停止并保持当前位置，真实连接超过 5 秒无新消息时也会自动停住。`actionMap` 用来把协议枚举映射成方向：通用 `0=0, 1=+1, 2=-1`；货叉 `1/3=+1` 表示伸出，`2/4=-1` 表示缩回；输送线/辊筒 `1=+1, 2=-1` 表示正反转。`target:"root"` 可让 RGV/AGV/四向车这类整车按本地轴持续移动，缺省 `target:"nodes"` 驱动内部节点。`motion.*.limits` 仍可声明 `min/max` 或防撞物体推导边界，动作积分和旧 target 目标都会被截断在安全范围内；Stacker 若没有端部防撞节点，会使用上下轨道几何范围兜底生成行走边界。Stacker 的 `distancex` 使用 MQTT 毫米原值校准行走位置，不再做单位转换，轨道起点作为 0 点，并优先于同帧 `action` 积分；`front_distanceY/back_distanceY` 使用 PLC 毫米值校准载台和货叉垂直位置，运行时会换算成米并优先于同帧 `front_action/back_action` 升降积分；V5.2 标准 `front_forkLocation/back_forkLocation` 可作为货叉绝对伸缩位置校准，运行时额外兼容非标准连续距离字段 `front_forkDistance/back_forkDistance`；命中这些校准字段时优先于同帧 forkAction 积分；通用 `distance_x/distance_y/distance_z` 与 `rpm_*` 仍作为协议遥测字段保留，不直接换算位移或转速；整机绝对位姿仍使用 `twinspawn` 的 `x/y/h/r`。

Stacker 按 MQTT 文档中的数字孪生主题接入：整机生成/位姿使用 `dt/factory/logistics/stacker/DDJ2/twinspawn`，内部机构动作使用 `dt/factory/logistics/stacker/DDJ2/twindatadriven/joint`；旧 `Stacker01` 设备号仍可通过手动绑定或脚本环境变量继续使用。文档坐标中 `x/y/h/r` 分别表示 X 坐标、Y 坐标、Z 高度和旋转角度；运行时会映射到 Babylon 场景的 `x/z/y/rotationY`，也就是文档平面 Y 落到编辑器地面 Z 轴，文档高度 H 落到编辑器垂直 Y 轴。`twindatadriven/joint` 中的 `{e,p,v}` 会在运行时归一为 `{e,[p]:v}` 后再驱动模型内部运动。

推荐 Stacker 整机位姿帧：

```json
{"s":"spawn01","deviceCode":"Stacker01","x":12.5,"y":8.3,"h":0,"r":90,"ts":1746991234567}
```

推荐 Stacker 内部动作点位帧：

```json
[
  {"deviceCode":"Stacker01","p":"movement_x","v":1,"ts":1746991234567},
  {"deviceCode":"Stacker01","p":"movement_y","v":1,"ts":1746991234567},
  {"deviceCode":"Stacker01","p":"front_movement_z","v":1,"ts":1746991234567},
  {"deviceCode":"Stacker01","p":"back_movement_z","v":1,"ts":1746991234567},
  {"deviceCode":"Stacker01","p":"cargo_action","v":"pickup","ts":1746991234567},
  {"deviceCode":"Stacker01","p":"cargo","v":"Box01","ts":1746991234567}
]
```

动作枚举含义：`movement_x: 1` 前进、`2` 后退、`0` 静止；`movement_y: 1` 上升、`2` 下降；货叉 `front_movement_z/back_movement_z/forkState: 1/3` 伸出、`2/4` 缩回。`e` 和 `deviceCode` 都可匹配设备；规范 MQTT topic 也会提供 `{deviceId}` 兜底。`cargo_action=pickup/drop` 配合 `cargo=货箱资产编号` 使用，运行态会在货叉伸出量和距离满足保护阈值时把货箱临时吸附到货叉吸附点；`drop` 不带 `target` 时解除吸附并保持货箱当前位置，带 `target=定位框资产编号` 时会把已吸附货物底面中心放入对应定位线框底面中心，定位框只需在“资产信息”中填写资产编号，不必启用动画连接。规范 `twindatadriven/payload` 的 `{p:"payload",v:"Box01"}` 会归一为货箱字段，用于同步载体与负载关系：发给 Stacker 时同步货叉载荷，发给有运动语义的输送线时可绑定货箱到该输送线并由 `movement_x` 启停推进货箱；当前 opaque 辊道机 `RollerConveyor01` 支持 `payload` 绑定货箱，`movement_x/rotation` 会同时驱动原始 `GT` 辊筒和参数化生成的同源辊筒逐根自转，运行时会把自转 pivot 校正到每根辊筒自身几何中心，并推动货箱沿辊道有界移动，货箱整箱不会超出辊筒输送段，到末端后停住等待反向或重新绑定信号。若数据服务外层包了一层 `data` 或 `payload`，可以把“数据路径”设置为对应点路径；运行时也会递归归一化包装内的 `{e,p,v}` joint 数组，并会把外层 `target/dropTarget/locator` 放货目标透传到内层业务帧。数组 payload 会按设备合并处理但单条消息最多消费 200 帧，避免高频大包造成内存压力。

辊道机现场 PLC 点位按 `{data:[{e,p,v}],ts}` 合帧后直接消费：`move` 为光电信号 Byte，bit0 表示前端有货并在预览态生成临时 cube 货箱；`action` 为动作 Byte，bit0 正转映射 `movement_x=1`，bit1 反转映射 `movement_x=2`，冲突或全 0 停止。货箱编号优先取 `container_no`，缺失时用非 0 `task` 生成 `Task101` 这类稳定编号；临时 cube 不写入场景文件，停止预览时清理。

现场 DDJ2 Stacker PLC 报文可直接使用 V5.2 协议格式，`e` 作为模型匹配号，`deviceCode` 作为调度号保留，不覆盖 `e`；运行时仍兼容旧报文字段 `device_code`：

```json
{
  "data": [
    {"e":"DDJ2","p":"deviceCode","v":"1"},
    {"e":"DDJ2","p":"mode","v":"4"},
    {"e":"DDJ2","p":"move","v":"0"},
    {"e":"DDJ2","p":"action","v":"1"},
    {"e":"DDJ2","p":"distancex","v":"260928"},
    {"e":"DDJ2","p":"front_distanceY","v":"2366"},
    {"e":"DDJ2","p":"back_distanceY","v":"2366"},
    {"e":"DDJ2","p":"back_action","v":"4"},
    {"e":"DDJ2","p":"front_forkLocation","v":"1"},
    {"e":"DDJ2","p":"front_forkAction","v":"2"},
    {"e":"DDJ2","p":"back_forkAction","v":"2"}
  ],
  "ts": "2026-06-16T13:16:28.782+08:00"
}
```

DDJ2 PLC 点位映射按《双工堆垛机协议V5.2》处理：`action` bit0/bit1 转 `movement_x` 前进/后退；`distancex` 是 Stacker 行走绝对距离，单位毫米，运行时直接使用 MQTT 原值并以轨道起点为 0 点校准行走位置，同帧存在 `action` 时以 `distancex` 为准；`front_action/back_action` bit2/bit3 转 `movement_y` 上升/下降；`front_distanceY/back_distanceY` 是前后叉载台高度校准，单位毫米，运行时换算成米后优先于同帧升降动作，前叉值有效时优先使用前叉值；`front_forkAction/back_forkAction` 按 PLC 左右方向驱动货叉，bit1 向右伸叉、bit2 向左缩叉、bit3 向左伸叉、bit4 向右缩叉；`front_forkLocation/back_forkLocation` 可按原位、浅/深货位极限和换速位校准货叉伸缩位置。运行时同时兼容对象帧中的 `frontForkAction/backForkAction`、`frontForkLocation/backForkLocation`、`deviceCode/device_code`、`distanceX/distance_x`、`frontDistanceY/backDistanceY` 等写法；非 V5.2 标准的 `front_forkDistance/back_forkDistance` 等连续距离字段也可直接用米或毫米值校准伸缩量。`move`、`mode`、`front_command/back_command`、`front_task/back_task`、`front_x/front_y/front_z`、`back_x/back_y/back_z`、`*_rpm`、`*_electric Current`、`*_workingHours`、`*_runingTimes` 作为业务状态或遥测字段保留，默认不换算模型位移和速度。蓝色区域字段属于非程序逻辑信号，非必要时不参与模型驱动。

Stacker 放入指定定位线框的 joint payload 示例：

```json
[
  {"deviceCode":"Stacker01","p":"cargo_action","v":"drop","ts":1746991234567},
  {"deviceCode":"Stacker01","p":"cargo","v":"Box01","ts":1746991234567},
  {"deviceCode":"Stacker01","p":"target","v":"1-1-1","ts":1746991234567}
]
```

Stacker 的行走会在进入运动缓存前应用防越界限制。模型包显式声明 `motion.*.limits.min/max` 时按该数值截断；未声明数值但提供两端 `blockerNodes` 时，运行时会读取防撞物体几何包围盒的内侧面，保证行走机构整体不会越过两端防撞物体；如果模型只有上下轨道 `fixedNodes`，运行时会改用轨道整体几何范围兜底生成边界。`distancex`、`movement_x` 动作和 `twinspawn` 平面位置都会被夹紧在进入预览时的轨道范围内，高度 `h` 与朝向 `r` 保持原协议语义；`front_distanceY/back_distanceY` 会按 lift 限位截断；Stacker 货叉运行态支持左右双向伸缩，模型包旧的 `0..max` 货叉限位会扩展为 `-max..max`。超范围距离或动作只会在边界停住，不会报错或断开预览。Stacker 模型脚本已声明物理速度：`travel.speed=0.8m/s`、`lift.speed=0.3m/s`、`fork.speed=0.25m/s`。

除 Stacker 外，`E:\公司文件\数字孪生\模型文件\models` 下已补充以下物理动作语义：多穿小车 `Shuttle01` 使用 `front_movement_z/back_movement_z/forkState` 驱动货叉伸缩；RGV `RGV01` 使用 `movement_x/movement_y` 按根节点本地轴持续移动；`RollerConveyor01` 辊道机、有电机辊道 `MotorConveyor01` 和弯道输送机 `WLTS01` 使用 `movement_x` 或 `rotation` 驱动辊筒正反转；链条机 `ChainConveyor01` 使用 `movement_x` 驱动链条轨道正反向运动；一体式顶升移载 `YZJ01` 使用 `movement_y` 顶升、`movement_x/rotation` 驱动移载辊；换层提升机 `HCTS01` 使用 `movement_y` 驱动轿厢/平台升降。`RollerConveyor01` 还支持 `payload` 绑定货箱并做辊筒范围内的有界输送，现场 PLC `move` bit0 前端有货时会自动生成预览态临时 cube。Shelf 是静态货架，LED 属于状态灯颜色语义，本轮不加入物理动作。

推荐其它设备 payload 示例：

```json
{"s":"spawn-rgv","deviceCode":"RGV01","x":6.2,"y":1.4,"h":0,"r":0,"ts":1746991234567}
```

```json
[
  {"deviceCode":"RGV01","p":"movement_x","v":1,"ts":1746991234567},
  {"deviceCode":"RollerConveyor01","p":"movement_x","v":1,"ts":1746991234567},
  {"deviceCode":"MotorConveyor01","p":"movement_x","v":2,"ts":1746991234567},
  {"deviceCode":"WLTS01","p":"rotation","v":1,"ts":1746991234567},
  {"deviceCode":"ChainConveyor01","p":"movement_x","v":1,"ts":1746991234567},
  {"deviceCode":"YZJ01","p":"movement_y","v":1,"ts":1746991234567},
  {"deviceCode":"YZJ01","p":"movement_x","v":1,"ts":1746991234567},
  {"deviceCode":"HCTS01","p":"movement_y","v":1,"ts":1746991234567}
]
```

定位线框立方体启用“动画连接”后也消费同一份场景级数据源，默认字段映射为 `x/h/y/r`，示例：

```json
{"e":"BoxLocator01","x":2.4,"y":5.1,"h":0.8,"r":90,"ts":1746991234567}
```

### Stacker 本地模拟 Demo

拖入 `E:\公司文件\数字孪生\模型文件\models\Stacker` 后，再拖入或创建一个货箱模型，把货箱右侧属性里的“资产编号”填写为 `Box01`，并把货箱放在货叉吸附点约 `2.5m` 范围内。选中 Stacker，在右侧“数据驱动”中点击“启动 Stacker 模拟”；该按钮默认把绑定设备写为 `DDJ2`，已有 `Stacker01` 等旧绑定时会沿用当前资产编号，并自动进入预览模式。预览中编辑器会直接生成本地模拟数据，不需要启动 MQTT broker 或桥接脚本；当模拟数据发送 `cargo_action=pickup` 和 `cargo=Box01` 时，货箱会吸附到货叉上并跟随堆垛机运动，发送 `drop` 时解除吸附。停止预览后，模型会恢复进入预览前的姿态，避免模拟中间帧污染保存文件。

`填入 Stacker Demo` 只负责填写真实 WebSocket demo 配置，不会自己生成数据，也不会自动进入预览；它用于配合下面的 MQTT 桥接脚本验证真实数据链路。

### Stacker MQTT Demo

当前 `192.168.60.154:1883` 是普通 MQTT TCP 端口，编辑器属性面板运行在 Electron renderer 中，需要通过 WebSocket 数据源接入。可启动本地桥接脚本，把 demo 数据发布到真实 MQTT topic，同时转发到编辑器可订阅的本地 WebSocket：

```bash
node scripts/stacker-mqtt-demo-bridge.mjs
```

默认配置：

- MQTT broker：`192.168.60.154:1883`
- MQTT Topic：`dt/factory/logistics/stacker/DDJ2/twindatadriven/joint`
- 编辑器 WebSocket：`ws://127.0.0.1:18083/stacker`
- 设备编号：`DDJ2`
- 报文格式：默认 `STACKER_DEMO_PROTOCOL=plc`、`STACKER_DEMO_PAYLOAD_WRAP=data`，输出 `{data:[...],ts:"..."}`；旧标准点位可设置 `STACKER_DEMO_PROTOCOL=standard`、`STACKER_DEMO_PAYLOAD_WRAP=none`
- 演示货箱编号：`Box01`

如需换 broker、Topic、本地 WebSocket 端口、设备编号或演示货箱编号，可通过 `STACKER_DEMO_MQTT_HOST`、`STACKER_DEMO_MQTT_PORT`、`STACKER_DEMO_TOPIC`、`STACKER_DEMO_WS_PORT`、`STACKER_DEMO_DEVICE_ID`、`STACKER_DEMO_DEVICE_CODE`、`STACKER_DEMO_CARGO_ID` 等环境变量覆盖；换机器演示时，Stacker 模型路径也需要替换为本机实际模型包目录。

桥接演示步骤：先启动脚本，再拖入 `E:\公司文件\数字孪生\模型文件\models\Stacker` 和资产编号为 `Box01` 的货箱，选中 Stacker，在右侧“数据驱动”中点击“填入 Stacker Demo”，然后进入预览模式。按钮会把绑定设备写为 `DDJ2`，并把场景级数据源设置为本地 WebSocket demo；脚本默认持续发送 `action/front_action/back_action/front_forkAction/back_forkAction` 等 PLC 点位，运行时会映射到 Stacker 标准动作，便于确认上下轨道固定、行走机构沿轨道移动、载货台升降、货叉伸缩和货箱跟随。

### DDJ2 新现场报文 Demo

`scripts/stacker-ddj2-plc-message.mjs` 使用附件里的完整新报文字段集合，每帧都输出 `{data:[{e:"DDJ2",p:"...",v:"..."}],ts:"..."}`。脚本只覆盖少量动作点位形成演示动作，其他 `mode/move/command/task/error/rpm/current/workingHours/runingTimes/cache` 字段保持现场报文形态，用于 dry-run 和现场联调核对。

```bash
npm run demo:stacker-ddj2-plc
```

默认配置：

- MQTT broker：`192.168.60.154:1883`
- MQTT Topic：`dt/factory/logistics/stacker/DDJ2/twindatadriven/joint`
- 编辑器 WebSocket：`ws://127.0.0.1:18085/stacker-ddj2-plc`
- 设备编号：`DDJ2`

只核对报文内容时执行：

```bash
npm run demo:stacker-ddj2-plc:dry-run
```

编辑器联调时，把统一数据源配置为 WebSocket，连接地址填 `ws://127.0.0.1:18085/stacker-ddj2-plc`，Stacker 资产编号填 `DDJ2` 后进入预览。环境变量可覆盖 `STACKER_DDJ2_MQTT_HOST`、`STACKER_DDJ2_MQTT_PORT`、`STACKER_DDJ2_TOPIC`、`STACKER_DDJ2_WS_HOST`、`STACKER_DDJ2_WS_PORT`、`STACKER_DDJ2_WS_PATH`、`STACKER_DDJ2_DEVICE_ID`、`STACKER_DDJ2_DEVICE_CODE`、`STACKER_DDJ2_INTERVAL_MS`；只走本地 WebSocket 可加 `--no-mqtt`。

### Stacker 场景流程 MQTT 报文 Demo

`scripts/stacker-scene-mqtt-sequence.mjs` 会按固定流程发送完整动画报文：货箱 `Box01` 先用一次 `twinspawn` 放到辊道入口；`RollerConveyor01` 支持独立 `payload + movement_x` 有界输送，但该脚本仍主要演示 Stacker 取放流程；随后 Stacker 伸叉取货、缩回、移动载货台，最后通过 `cargo_action=drop`、`cargo=Box01`、`target=1-1-1` 放入定位线框。脚本默认保留旧标准点位；加 `--plc` 或设置 `STACKER_SCENE_PROTOCOL=plc` 时输出 DDJ2 PLC 点位和 `{data,ts}` 包装。本地 WebSocket 默认地址为 `ws://127.0.0.1:18084/stacker-scene`。

```bash
npm run demo:stacker-scene
```

推荐验证步骤：

1. 场景中准备 Stacker，PLC 模式绑定设备或资产编号为 `DDJ2`；旧标准模式可继续使用 `Stacker01`。
2. 创建/拖入一个 cube 作为货箱，资产编号填写 `Box01`。
3. 创建定位线框立方体，资产编号填写 `1-1-1`。
4. 启动脚本后，把统一数据源配置为 WebSocket，连接地址填 `ws://127.0.0.1:18084/stacker-scene`，进入预览；脚本会在首个 WebSocket 客户端连接后延迟 1.5 秒播放一次完整流程。
5. 如需只核对报文内容不连接 broker 或编辑器，可执行 `npm run demo:stacker-scene:dry-run`；核对 PLC 报文可执行 `npm run demo:stacker-scene:dry-run -- --plc`。

默认配置可通过环境变量覆盖：`STACKER_SCENE_MQTT_HOST`、`STACKER_SCENE_MQTT_PORT`、`STACKER_SCENE_WS_HOST`、`STACKER_SCENE_WS_PORT`、`STACKER_SCENE_WS_PATH`、`STACKER_SCENE_PROTOCOL`、`STACKER_SCENE_PAYLOAD_WRAP`、`STACKER_SCENE_STACKER_ID`、`STACKER_SCENE_DEVICE_CODE`、`STACKER_SCENE_BOX_ID`、`STACKER_SCENE_LOCATOR_ID`、`STACKER_SCENE_TIME_SCALE`。若只想向 MQTT broker 自动播放而不等待编辑器 WebSocket 连接，可执行 `npm run demo:stacker-scene -- --autostart`；若只走本地 WebSocket 可执行 `npm run demo:stacker-scene -- --no-mqtt`。

## 构建方式

```bash
npm run build
```

编辑器主界面工具栏提供“发布场景”按钮，桌面模式下会执行同一条 `npm run build`，构建成功后自动打开项目根目录的 `dist/` 文件夹。发布期间会禁用重复发布；预览播放、场景读取失败、CAD 导入或 CAD 恢复期间会阻止发布，避免生成半成品状态。

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
- 2026-06-08：移除 `package.json` 根级 `directories` 元数据，Electron 打包目录统一保留在 `build.directories.output/buildResources`，避免 electron-builder 26 把根级字段识别为废弃配置并中断打包。
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
- 2026-06-05：左侧模型树新增逻辑 group、锁定列和树内拖拽归组；group 使用 Babylon TransformNode 作为真实父级随场景保存恢复，锁定节点仍可在树中查看和解锁，但会阻止视口拾取、Gizmo、删除、属性编辑和再次归组。
- 2026-06-02：优化全屏编辑布局，左右侧栏改为有上限的紧凑宽度，底部资源区降低高度，把更多可视空间留给中间 Babylon 场景视口。
- 2026-06-02：右侧属性面板改为截图风格的深色折叠分组布局，新增 MeshVertexModifyComponent 参数和业务资产编号 metadata 落地；已执行 `npm run build`，构建通过。
- 2026-06-03：新增项目条场景环境背景色色块，默认环境色不再使用全黑；颜色会同步到 Babylon `clearColor`、派生环境基色和 `metadata.editor.sceneEnvironment.backgroundColor`，保存后可随项目场景恢复。已执行 `node node_modules\typescript\bin\tsc -b` 和 `node node_modules\vite\bin\vite.js build` 验证。
- 2026-06-03：工具栏新增“导入 CAD 图纸”按钮；DXF 文本图纸会按米制解析为贴地 CAD 根节点，并随场景保存恢复。后续已升级为按二维 primitive 导入，保留颜色、文字、填充和块展开内容，不再按旧线段上限截断。
- 2026-06-03：修复 DXF 导入后尺寸过大的问题；解析器会优先读取 `$INSUNITS`，将毫米、厘米、米、英制等 DXF 源单位统一换算为项目米制坐标，缺失单位且原始尺寸明显过大时按毫米推断，并在 CAD 根节点 metadata 记录源单位、换算比例、原始 bounds 和米制 bounds。
- 2026-06-03：整理 `E:\公司文件\数字孪生\模型文件\models` 下 11 个 GLB 为“一模型一目录”模型包，并将每个目录的 `*.params.ts` 参数脚本与 `*.parametric.ts` 运行脚本合并为单个 `*.model.ts`；`meta.json.parameterScripts[].scriptFilename` 和 `meta.json.animationScripts[].scriptFilename` 指向同一文件，分别通过 `ParametricModelParamsComponent` 与 `ParametricModelRuntimeComponent` 区分用途，避免编辑器显示多个 TS 后无法全部使用。
- 2026-06-04：模型包 manifest 新增运行脚本文件和运行类名；导入、资产拖入和项目重新打开后会按需加载项目内 `.model.ts`，同步 `metadata.scripts[].values` 并执行 `ParametricModelRuntimeComponent`，右侧属性栏修改参数后会实时驱动模型变化；保存场景前会临时停止运行脚本以清理生成节点和恢复基线，保存后再恢复视口效果，避免重新打开后重复克隆或二次变形。已执行 `npm run build`，构建通过。
- 2026-06-05：修复文件夹模型包点击保存后空间信息和动态参数被运行脚本生命周期还原的问题；模型包参数继续以 `metadata.editor.modelPackageInstance.values` 为权威源，保存前后会保护根节点名称、位置、旋转、缩放和参数，并让 `metadata.scripts[]` 的参数脚本与运行脚本记录携带同一份参数值。运行实例上的 `color3` 参数会恢复为 Babylon `Color3` 供脚本读取，runtime 生成节点清理时会同步释放不再使用的材质。保存语义仍是不持久化 runtime 生成节点，只保存基线模型和参数后重新生成视口效果。
- 2026-06-06：修复模型根节点在场景中旋转后参数化配置不生效的问题；模型包运行脚本生命周期执行前会临时归一模型根节点位置、旋转和缩放，让脚本按模型自身局部轴计算几何，执行后恢复用户根节点变换和权威参数 metadata。
- 2026-06-04：点击视口非模型区域或编辑器 helper 区域时，右侧属性面板会切换为场景属性；场景名、环境色、相机可视距离、编辑器设置和 `SceneDataDrivenComponent` 配置可编辑，其中数据驱动配置保存到 `metadata.editor.sceneDataDriven`，本次不启动真实数据驱动运行时。
- 2026-06-04：补齐真实数据驱动运行时；`SceneDataDrivenComponent` 可配置 WebSocket 或 MQTT over WebSocket 订阅，预览模式启动后按 `deviceId` 匹配模型并驱动 Stacker 的行走机构、载货台和货叉，停止预览会断开连接并恢复姿态，避免实时数据中间帧污染保存文件。已执行 `node node_modules\typescript\bin\tsc -b`、`node node_modules\vite\bin\vite.js build` 和 `git diff --check` 验证。
- 2026-06-05：补齐模型属性面板的“数据驱动”入口；选中 Stacker 等模型后可直接绑定设备编号并编辑同一份场景级 MQTT/WebSocket 数据源，Group 和 CAD 节点会提示选择模型实例，避免错误绑定非模型节点。
- 2026-06-05：新增 Stacker MQTT demo 桥接脚本；本地 `ws://127.0.0.1:18083/stacker` 会向编辑器转发动态 Stacker payload，同时向 `192.168.60.154:1883` 的 `dt/factory/logistics/stacker/Stacker01/twindatadriven/joint` 发布同一份数据，模型面板可一键填入 demo 配置。
- 2026-06-05：新增 Stacker 内置模拟预览；选中模型后点击“启动 Stacker 模拟”会绑定设备号、填入 demo 配置并进入预览，运行时直接生成 `travel_pos/lift_pos/fork_extend/fork_side` 往返数据验证模型运动，不依赖外部 MQTT 或 WebSocket 服务。
- 2026-06-05：修正 Stacker 数据驱动运动结构；上下轨道固定不动，`travel_pos` 只驱动堆垛机行走机构沿轨道移动，`lift_pos` 驱动载货台和货叉升降，`fork_extend/fork_side` 驱动货叉伸缩和微调。
- 2026-06-05：修复点击“启动 Stacker 模拟”后看似无反应的问题；数据驱动运行时现在同时识别 GLB 中的 Mesh 和 TransformNode 运动部件，并把 payload 的米制位移换算到模型内部局部坐标，兼容 Stacker 这类按毫米源单位导入并缩放到米制场景的模型。
- 2026-06-05：模型包 manifest 新增可选 `dataDriven` 运动语义；导入 Stacker 时会从 `stacker.model.ts` 静态解析设备默认绑定、运动组节点、轴向、固定轨道和本地模拟范围，运行时优先使用模型脚本定义，旧场景继续走内置 Stacker 兜底。
- 2026-06-06：修正 Stacker 根节点旋转后的数据驱动方向；模型脚本 `dataDriven.motion.*.axis` 现在按模型根节点局部轴解释，运行时会忽略根节点缩放只取方向，确保行走机构沿旋转后的轨道方向移动，payload 字段格式保持不变。
- 2026-06-06：按数字孪生 MQTT 文档重定义 Stacker 数据驱动；设备字段改为 `e`，默认设备号改为 `Stacker01`，整机 `twinspawn` 的文档坐标 `x/y/h` 映射为 Babylon `x/z/y`，内部机构动作使用 `twindatadriven/joint` 的 `{e,p,v,ts}` 数组并映射 `travel_pos/lift_pos/fork_extend/fork_side`。
- 2026-06-06：扩展模型包 MQTT 物理动作数据驱动；`dataDriven.motion.*.kind` 支持 `translate/rotate`，运行时可驱动任意模型内部运动组，并为多穿小车、RGV、辊道机、链条机、有电机辊道、WLTS、YZJ、HCTS 补充文档标准设备号和物理点位。
- 2026-06-06：修复 Shelf 模型包“货格宽度”参数调整无效；`shelf.model.ts` 不再通过模型根节点缩放表达货格尺寸，改为基于导入基线缩放模板内容节点并让复制出的层/列货格继承当前模板变换，避免被编辑器根节点变换保护逻辑还原。
- 2026-06-06：补全 POI库 11 类业务组件、搜索卡片、POI 专属 Inspector 和编辑态 `SceneBusinessRuntime`；POI 配置保存到 `metadata.editor.poiConfig`，运行态临时对象和连接句柄不保存。已执行 `node node_modules\typescript\bin\tsc -b` 和 `node node_modules\vite\bin\vite.js build` 验证通过。
- 2026-06-06：底部资源库新增上边缘拖拽调高能力，默认高度提升到 190px，并把用户调整后的高度保存到 `localStorage`，方便 POI 库展示更多组件信息。
- 2026-06-07：内置“定位线框立方体”基础对象；工具栏可直接创建，资产面板可拖入视口落点生成 1.5m 的 12 边线框，作为可保存、可选中、可移动/旋转/缩放的视觉定位框，便于把货物手动摆放到框内，不会自动吸附、约束或归组货物。
- 2026-06-07：定位线框立方体新增专属“动画连接”属性；启用并填写绑定设备后可作为 `SceneDataDrivenRuntime` 数据驱动接收端，按配置字段驱动整体位置和朝向，未启用或未绑定时不会被无设备号数据帧兜底命中。
- 2026-06-08：按右键功能清单补齐模型树和对象右键菜单，并接入 `F/H/Ctrl+K/Ctrl+G/Shift+G/Ctrl+I/P` 等快捷键；对象命令统一复用 Babylon 引擎能力，库聚焦会把模型包、导入模型、基础对象或 POI 反向定位到底部资源库卡片。
- 2026-06-08：模型包导入会解析 `meta.json.parameterScripts[].fields` 和 `values`，用模型给出的基础参数初始化右侧属性面板；首次导入、资产区再次拖入和运行脚本读取都以合并后的 `metadata.editor.modelPackageInstance.values` 为准。
- 2026-06-08：模型包动态数字参数新增单位语义推断，长度类字段在右侧属性面板显示 `m` 并同步到脚本 metadata；`E:\公司文件\数字孪生\模型文件\models` 下 11 个模型包的 `meta.json` 和 `.model.ts` 默认长度值已按导入后米制基线回填，脚本会把长度参数换算为目标场景尺寸，避免继续把长度输入当比例倍率。
- 2026-06-09：兼容旧版文件夹模型包的参数接入；当 `meta.json` 没有声明 `parameterScripts` 或目录内存在辅助 TS 时，导入流程会自动选择包含 `@visibleAsNumber/String/Boolean/Color3` 的根脚本生成右侧参数面板，并从默认导出的旧脚本类名推断运行类，避免同目录其他模型参数无法附加到属性面板。
- 2026-06-09：项目模式保存新增场景贴图侧车文件；保存前会临时关闭 Babylon 贴图 buffer 序列化，把可还原的大贴图写入 `assets/source/editor-scene-textures-<sceneId>/`，`*.scene.json` 只保存 `file:<name>` 引用和 `metadata.editor.projectExternalTextures` 清单，降低 JSON/IPC/内存峰值，避免点击保存后界面黑屏。非项目 `.babylon` 下载仍走自包含导出语义。
- 2026-06-09：顶部工具栏新增“统一数据源配置”按钮，可一次配置 MQTT/WebSocket 地址、Topic、设备字段和插值等场景级连接参数；入口与右侧场景属性、模型数据驱动分区共用 `metadata.editor.sceneDataDriven`，预览中修改仍会走现有运行时重启链路。
- 2026-06-04：CAD/DXF 导入从单一折线升级为完整二维 primitive 导入，支持原 CAD 颜色、文字、HATCH/SOLID 填充、POINT、LEADER、DIMENSION 块和嵌套 INSERT；移除 180000 线段截断，导入后按 CAD bounds 自动取景，选中 CAD 时不再用高亮层覆盖原图配色。
- 2026-06-04：修复包含 `IMAGE/IMAGEDEF` 外部栅格参照的 DXF 只显示少量残留线条的问题；CAD 导入现在支持同批选择或拖拽 DXF 与图片文件，Electron 桌面端会尝试从 DXF 同目录读取外部图片，并按 IMAGE 四角贴到 XZ 网格。
- 2026-06-04：补齐 CAD 保存恢复后的媒体重建；文字会根据 `cadText` metadata 重新绘制 DynamicTexture，Electron 环境会根据保存的原始 DXF 路径从同目录恢复 IMAGE 图片贴图。
- 2026-06-04：补齐 DXF `WIPEOUT` 遮罩导入，按裁剪边界生成贴地遮罩面，不再把 WIPEOUT 当作未支持可见实体跳过；顶部 CAD 导入提示支持点击展开完整内容。
- 2026-06-04：CAD 导入忽略 DXF `IMAGE/IMAGEDEF` 中的 `.bmp` 外部栅格参照，不再因缺失 BMP 底图反复弹出图片读取提示，也不让 BMP 占位范围影响图纸取景。
- 2026-06-04：修复部分 DXF 转换器把主体图元写在 `*Model_Space/$MODEL_SPACE` 块中导致导入后只剩少量 `ENTITIES` 残留线的问题；解析器会补读模型空间块并按图元指纹去重，WIPEOUT 遮罩也调整为不覆盖主体矢量线。
- 2026-06-04：修复三维/剖面导出的 DXF 使用 XZ/YZ 平面坐标时，导入器只读取 XY 导致所有线段重叠的问题；核心实体会保留 Z 坐标并自动投影到面积最大的二维平面后再按米制贴到网格。
- 2026-06-04：补齐 DXF OCS/挤出方向坐标转换；LWPOLYLINE、POLYLINE、CIRCLE/ARC、TEXT/MTEXT、HATCH、SOLID/TRACE 等实体会先按 `38/210/220/230` 转为世界坐标，再自动投影到工作网格，修复剖面图只在局部 XY 中有坐标导致导入后线条重叠的问题。
- 2026-06-04：CAD/DXF 导入目标调整为线-only；解析器只输出可渲染 `polyline`，补齐 HATCH pattern line、DIMENSION 无块 fallback、MLEADER/MULTILEADER 引线和模型空间优先/图纸空间兜底策略，文字、图片、填充、遮罩不再作为新导入内容创建。
- 2026-06-04：修复超密 HATCH pattern 导入时 `result.push(...大量线段)` 触发 `Maximum call stack size exceeded` 的问题；图案线改为流式写入，渲染端也会把单条超长 polyline 拆成多个连续 LineSystem 块。
- 2026-06-04：修复大型 `BLOCK/INSERT` 阵列或嵌套块展开时为每个块实例复制一个 primitive，最终触发 V8 `JavaScript heap out of memory` 的问题；INSERT 展开现在按样式合并为分批离散 polyline，大型 BLOCK 展开结果不再长期缓存且有全局缓存预算，极深 BLOCK 嵌套会受控告警，模型空间 fallback 去重改为轻量 hash，渲染端也改为流式转换超长 polyline，保留全部可计算线段但显著降低对象数量和内存峰值。
- 2026-06-04：修复 CAD 线段已解析成功但 Babylon `CreateLineSystemVertexData` 在渲染阶段再次触发 renderer OOM 的问题；CAD 线渲染不再调用 `MeshBuilder.CreateLineSystem(lines, colors)`，改为直接创建 `LinesMesh + VertexData` 的 typed array 线段缓冲，并按 mesh 使用统一颜色，避免 Vector3/Color4 对象数组和 Babylon 内部二次展开。
- 2026-06-04：进一步降低超大 DXF 导入峰值内存；CAD 渲染不再先把所有 polyline 按样式复制成分组数组，而是按 primitive 流式写入各样式 typed-array 分块，导入完成后返回 UI 前会释放解析阶段的几何数组，仅保留 bounds、counts 和 warnings 摘要。
- 2026-06-04：CAD/DXF 导入改为 Worker 后台解析和二进制线段 chunk 协议；主线程边接收 transferable `ArrayBuffer` 边创建 `LinesMesh + VertexData`，项目模式把 `.cadlines.bin` 侧车文件写入 `assets/source/<cad-id>/`，场景 JSON 只保存 CAD 根节点 metadata、bounds、单位、样式表和 chunk manifest，重新打开项目时按 manifest 读取侧车文件重建图纸；大型 BLOCK 缓存预算属于内部性能策略，不再作为用户 warning 展示。
- 2026-06-04：CAD/DXF 导入新增专用进度条；读取、测量、线段输出、网格创建和侧车分块保存都会上报阶段状态，已知总量阶段显示百分比，导入中不再复用红色错误提示。
- 2026-06-05：优化 CAD 项目重开性能；项目场景先加载完成并可操作，CAD 线段侧车改为后台渐进恢复并显示“CAD 恢复中”进度。新导入 CAD 会把多个 chunk 合并写入 `*.cadlines.pack.bin`，重开时通过批量 IPC 读取并按样式合并成更少的 `LinesMesh`；旧 `.cadlines.bin` 侧车继续兼容，恢复完成前会禁止保存以避免写入半恢复状态。
- 2026-06-05：CAD 根节点属性面板新增“CAD 显示”分区，可用透明度滑块统一调淡整张 CAD 图纸；透明度作为根节点 metadata 保存，重开项目和后台侧车恢复后会继续按该倍率显示。
- 2026-06-04：修复 `【ZDRD98-智能仓储】设备接入图纸.dxf` 导入后出现放射状乱线的问题；根因是 HATCH 填充/剖面图案被派生为上千万条边界/图案线并污染 bounds。线-only 导入现在跳过 HATCH 派生线，只保留真实线、曲线和块展开线，实测该图纸 bounds 回到约 186.29m × 133.71m 并可按中心贴到 XZ 网格。

## 项目工作流

桌面应用启动后会先进入项目启动页，展示最近打开过的项目。用户可以直接打开最近项目，也可以选择已有目录作为项目，或者在指定父目录中新建一个项目。

项目创建时会自动生成默认场景。进入编辑器后，顶部项目条显示当前项目、项目路径和场景选择器；点击“新建场景”可以在同一项目内创建更多场景。保存按钮在项目模式下会把当前 Babylon 场景序列化写入当前场景文件；发布按钮会通过 Electron 主进程执行固定的 `npm run build` 并在成功后打开 `dist/` 文件夹。重新打开最近项目或切换场景时，会通过 Babylon.js 的场景加载能力恢复已保存的场景内容。若未处于项目模式，则继续使用原有的 `.babylon` 文件下载逻辑。

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
- `assets/source/` 保存导入资产的源文件副本；多文件模型会把同批选择的依赖文件一起记录到场景元数据，文件夹模型包会保留 `meta.json`/`meta.js`、参数脚本和主 `.glb`，重新打开项目后拖入资产时再按需读取；项目场景保存生成的 `editor-scene-textures-<sceneId>/` 目录保存从 GLB 内嵌贴图拆出的 PNG/JPEG/WebP 侧车文件。
- `scenes/*.scene.json` 保存单个场景的 Babylon 原生序列化数据以及编辑器元数据，包含场景环境背景色、非敏感数据连接配置、SceneDataDrivenComponent 设置和项目贴图侧车清单；项目模式下大贴图只保存 `file:<name>` 引用，不再把完整 `base64String` 写入场景 JSON。
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
    sceneDataDrivenRuntime.ts
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

- `BabylonEditorEngine` 负责 Babylon.js 的渲染、场景、相机、Gizmo、拾取、高亮、导入和保存，并区分“资产登记”和“场景实例化”两条链路，避免选择模型文件时直接污染当前场景。选择状态由引擎统一持有，模型树只提交点击意图和可见行顺序，属性面板与 Gizmo 使用主选中对象，多选集合用于树行和视口轮廓高亮。
- React 组件只负责界面展示和命令转发，避免把 WebGL 生命周期散落在多个组件里。
- `ProjectLauncher` 负责桌面项目入口，包括最近项目、新建项目和打开项目。
- `types/editor.ts` 定义 React 与 Babylon 引擎之间传递的稳定数据结构。
- `editor/dynamicParameterUnits.ts` 负责模型包动态参数的单位和物理语义推断，长度类字段会按 `m` 写入 Inspector 和脚本 metadata。
- `editor/modelPackageDataDriven.ts` 静态解析模型包脚本导出的 `dataDriven` 普通对象字面量，只允许字符串、数字、布尔、数组和对象，避免为读取运动语义执行模型脚本。
- `editor/sceneDataDrivenRuntime.ts` 负责预览模式下的 WebSocket/MQTT over WebSocket 订阅、payload 解析、设备匹配、模型脚本数据驱动运动映射、Stacker 货箱运行态吸附和退出预览后的姿态恢复；模型包脚本只声明运动语义，不直接持有网络连接。内部机构动作支持通用 `translate/rotate` 运动组，旧 Stacker 无脚本场景继续走内置兜底。
- `editor/cadDxf.ts` 负责 DXF 文本解析和单位归一化，把 CAD 中可解析的线实体、曲线采样线和块展开线按 `$INSUNITS` 或明显毫米级尺寸推断换算成项目米制线段；HATCH 填充/剖面图案属于非线内容，默认跳过以避免派生线污染 bounds；`editor/cadDxf.worker.ts` 在后台把线段输出为 transferable typed-array chunk；Babylon 引擎负责把 chunk 映射到 XZ 网格并按图层/颜色/透明度生成分块 `LinesMesh`。项目模式下新导入会把多个 chunk 合并为 `*.cadlines.pack.bin` 侧车包，重开项目时普通场景先可操作，CAD 再通过批量读取和 mesh 合并后台渐进恢复；旧 `.cadlines.bin` 侧车文件仍兼容。
- `editor/math.ts` 放置向量、角度和文件体积等通用转换逻辑。
- `electron/main.ts` 负责桌面窗口、开发/生产入口、外链拦截、单实例应用、项目文件读写和最近项目状态。
- `electron/preload.ts` 通过 `contextBridge` 暴露极小桌面端能力，渲染进程不直接启用 Node.js。
- `tsconfig.electron.json` 单独编译 Electron 主进程与 preload，避免污染 Vite 渲染端配置。
- `scripts/dev-electron.mjs` 串联 Vite 与 Electron 开发模式，避开 Windows `.cmd` shim 的 spawn 兼容问题，并负责退出时清理子进程。

## 任务记录

- 2026-06-20：修复 Shelf 侧面三角区域错位；`Box008.8/Box007.11` 不再仅作为普通深度梁处理，而是归入侧面三角斜撑分类，深度变化时仍沿前后端点适配，层高变化时会按原始 Y 端点同步缩放和居中，确保多层复制后的侧面三角斜撑保持在对应层内并贴合立柱。
- 2026-06-20：定位线框立方体新增可配置长、宽、高；右侧属性面板“定位尺寸”会把尺寸写入 `metadata.editor.locatorDimensions`，并通过 Babylon line-system instance 实时更新场景内对应线框的 12 条边，保持节点 ID、资产编号、选中态和动画连接配置不变；旧场景缺少尺寸 metadata 时按默认 1.5m 线框恢复。
- 2026-06-19：修复链条机调整 `chainWidth` 后内部主体没有一起变宽导致架空的问题；`Box003` 宽度规则现在先按焊接后的物理连通块判断，侧边窄块继续刚体跟随边界，内部跨宽横梁、脚板和支撑脚改为按左右顶点随宽度延展，`DJ` 驱动区内紧凑小件仍保持原始位置和截面，避免电机附近小件被拉坏。
- 2026-06-19：继续修复场景内复制出的链条机副本修改参数后视口不实时变化的问题；链条机剪贴板模板不再从 helper 网格捕获空基线，而是保留源实例的干净 `opaqueChainConveyorBaseline`，真实粘贴副本和阵列副本会先把 `Box003`、`Rail_01_M001`、`Rail_02_M001`、`ZJ`、`ZJ01` 等可变形网格拆成独立 Geometry，参数重算入口也会对已有共享几何实例做同样隔离，再按源基线恢复并重新捕获自己的基线，避免 Babylon 克隆共享几何导致 `chainLength` / `chainWidth` 修改被源模型或剪贴板模板状态抵消。
- 2026-06-19：修复场景内复制出的链条机修改动态参数不生效的问题；复制模板、粘贴副本和阵列副本在清理旧 `opaqueChainConveyorBaseline` 后会立即从当前干净几何重新写入自己的链条机基线，后续修改 `chainLength` / `chainWidth` 时不再依赖源实例或剪贴板模板的旧运行态 metadata，副本可按自身基线重新恢复并应用参数化。
- 2026-06-19：补强链条机复制体实时参数化；Babylon 克隆子节点时会生成 `副本根名.Box003`、`副本根名.Rail_01_M001` 一类前缀名，编辑器现在会在复制、粘贴和阵列准备阶段恢复非根子节点的源模型物理名称，同时链条机兜底索引会把旧场景里已经存在的前缀节点规范化回 `Box003`、`Rail_01_M001`、`Rail_02_M001`、`DJ` 等原名，确保复制体修改 `chainLength` / `chainWidth` 时能实时命中当前实例的基线和真实 Mesh。
- 2026-06-19：二次修复链条机红框横梁、脚板和支撑脚在调整 `chainLength` / `chainWidth` 后变形的问题；`Box003` 真实 GLB 是包含长梁、横梁、脚板、支撑脚的混合 Mesh，编辑器现在会先按同坐标顶点焊接成物理连通块，再执行长度/宽度规则：真正的长梁沿 Z 延展，尾侧刚性附件跟随长度，横梁、脚板、支撑脚和 `DJ` 驱动区保持原始三维形状，不再按面片或单顶点拆开拉伸。
- 2026-06-19：根据现场截图修正链条机长度表现；`Box003` 红框主体不再走程序化补板，而是与 `Rail_01_M001`、`Rail_02_M001`、`ZJ`、`ZJ01` 一起按原始基线做顶点级 Z 向延展；若两根 Rail 是空 `TransformNode` 包装，则改为捕获并延展其真实子 Mesh 顶点；运行模型包脚本前会先捕获链条机干净基线，且 `F:\3d-models\models\链条机\chain-conveyor.model.ts` 不再把 `chainLength` 用作根节点 Z 缩放，确保修改 `chainLength` 时红框内长条部件真实伸长，并支持在网格不反向的安全范围内从基线缩短。
- 2026-06-19：修复链条机红框伸长后模型被压成侧面薄片的问题；`Rail_01_M001`、`Rail_02_M001`、`Box003`、`ZJ`、`ZJ01` 的顶点基线保持 GLB 原始局部单位，不再归一化成米制根节点长度，`chainLength` 增量只转换为伸长比例后作用到局部 Z 顶点，保留导轨、横梁、支架和电机的三维厚度。
- 2026-06-19：补齐链条机 `chainWidth` 非变形参数化；`F:\3d-models\models\链条机\chain-conveyor.model.ts` 不再把 `chainWidth` 纳入根节点 X 缩放，编辑器兜底会清理旧脚本留下的 X/Z 参数化根缩放，然后按局部 X 中心拉长 `Box003` 横向跨梁，并让 `Rail_01_M001`、`Rail_02_M001`、`ZJ`、`ZJ01` 和 `Box004` 两侧附件刚体跟随，避免改宽时整机被横向压扁或截面变粗。
- 2026-06-19：按最新图 1/图 2 反馈修正链条机 `DJ` 和中间驱动区语义；撤销电机按尾端移动的规则，`DJ` 始终从原始基线恢复并保持中间驱动位置，`Box003` 按 `DJ` 的 X/Z 二维驱动区保护中间段，长度增量从驱动段尾侧之后开始作用到长框架，避免调整长度后电机跑到端部、红框中间支撑区域被拉长或拉斜；链条机识别也改为核心节点齐全即可执行兜底，附件缺失时不会让 `chainLength` / `chainWidth` 完全无反应。
- 2026-06-18：新增链条机 `chainLength` 非变形参数化兜底；`ChainConveyor01` 固定局部 `-Z` 端作为红框起点，`Rail_01_M001`、`Rail_02_M001`、`ZJ`、`ZJ01` 按顶点级规则向 `+Z` 延伸，`Box004` 尾端附件随长度尾端平移，起始端保持基线位置。后续已在 2026-06-19 按现场截图把 `Box003` 红框外主体纳入同一套顶点级延展规则，并保护 `DJ` 周围中间驱动区。
- 2026-06-18：新增场景布局撤销功能；Babylon 引擎在创建、导入、删除、复制粘贴、阵列、分组、显隐、锁定、归组移动、属性面板编辑、Gizmo 拖拽、场景初始化以及会重跑当前实例的模型包刷新/替换前记录轻量序列化快照，工具栏撤销按钮和 `Ctrl+Z` 会恢复上一份布局并保留当前编辑相机视角。撤销恢复时只按仍存在的资产 ID 恢复当前会话的源文件和依赖文件缓存，避免重载快照后资产库卡片丢失可继续拖入的源文件；加载新项目场景仍会清空旧缓存，防止跨项目残留。
- 2026-06-18：新增正顶俯瞰模式；工具栏俯瞰按钮会把编辑相机切到近似垂直正顶视角，`Alt + 左键` 和右键拖拽只改变水平朝向，滚轮、中键平移、`Alt + 右键` 缩放和显式聚焦仍可使用，该模式下对象拖拽和属性编辑不会自动带动相机视角。
- 2026-06-18：收紧 Unity 鼠标导航边界；滚轮缩放同样支持 `Shift` 加速，`Alt + 右键` 即使没有明显拖拽也会被识别为相机导航并稳定抑制对象右键菜单，避免松开 Alt 后系统补发 contextmenu。
- 2026-06-18：修复编辑场景鼠标单击选中模型会改变视角的问题；普通点击和层级树选中现在只刷新选区、Gizmo、属性面板和轮廓高亮，不再同步 `ArcRotateCamera.target`，视角变化只保留给双击模型、双击层级节点、`F` 快捷键和右键菜单“场景聚焦”等显式聚焦操作。
- 2026-06-18：补齐辊道机现场 PLC 来货语义；`move` bit0 作为前端有货信号，会在预览态用 `container_no` 或非 0 `task` 生成临时 cube 货箱，`action` bit0/bit1 继续映射正反转并复用现有辊道有界输送，退出预览后临时货箱统一清理且不写入场景文件。
- 2026-06-17：统一数据源配置弹窗新增“保存配置”按钮；点击后会先同步最新 `SceneDataDrivenComponent` 快照到 Babylon 场景 metadata，再复用项目场景保存链路写入 `scenes/*.scene.json`，保存期间会阻止整场景保存和数据源保存并发执行；项目场景打开时会显式从序列化 JSON 恢复场景级 `metadata.editor`，避免 `LoadAssetContainerAsync` 容器加载路径丢失 `sceneDataDriven` 导致 MQTT/WebSocket 配置重开后回到默认值。
- 2026-06-17：修复辊道机在场景内复制粘贴后副本部件散开的问题；复制命令现在会把模型包内部子节点统一收敛到模型包根节点再克隆，克隆实例会清除源实例的 `opaqueRollerConveyorBaseline` 并在自身 A/GT 节点上重新捕获基线，同时在克隆异常时用 `finally` 恢复源模型包 runtime，确保 `RollerConveyor01` 的动态参数按整机进入剪贴板但几何基线不跨实例复用。
- 2026-06-17：编辑视口鼠标操作改为 Unity Scene View 风格；移除 Babylon 默认左键旋转，裸左键只负责选择和 Gizmo，新增 `Alt + 左键` 环绕、中键平移、`Alt + 右键` 缩放、右键拖拽观察，同时保留滚轮沿视线穿模移动和右键单击对象菜单。已执行 `npm run build`，并用 Playwright 验证 Alt+左键、中键、Alt+右键、滚轮、右键菜单和 Alt+右键菜单抑制。
- 2026-06-17：补齐 Unity Scene View 鼠标导航的 `Shift` 加速；按住 `Shift` 时，`Alt + 左键` 环绕、中键平移、`Alt + 右键` 缩放和右键拖拽观察会统一提高速度，仍不影响裸左键选择、Gizmo 拖拽和普通右键对象菜单。
- 2026-06-17：编辑相机显式移除 Babylon 默认键盘输入并清空 Babylon 9 `ArcRotateCameraMovement.inputMap`，避免左键旋转、右键平移、滚轮缩放、方向键或加减键绕过 Unity 风格鼠标导航产生隐藏相机行为；当前场景导航入口以鼠标手势和已有 `F` 聚焦快捷键为准。
- 2026-06-20：重写外部 Shelf 模型包 `F:\3d-models\models\Shelf\shelf.model.ts` 的运行时参数化规则，并同步 `meta.json` 参数说明；`layerCount` 现在沿 Y 复制一层层 Shelf 结构，`cellWidth` 只拉伸 `node1/node3/node25/node35` 对应的横向横梁和层板，且按共同新端点保留 `Box023/Box021/Box032/Box031` 各自原始端部搭接量，避免较短的上层横梁随统一比例缩放后离开立柱；立柱、底脚和侧边件按四个跨宽节点的新左右端点平移保持截面不变，确保 `Box032.13/Box031.18/Box023.1/Box021.2` 数值增加时连接处同步跟随；`cellDepth` 改为同样基于跨宽节点前后端点重排，`Box001.4/Box002.5/Box003.6/Box004.3` 四根立柱随新深度边界移动且不缩放截面，深度梁/侧撑继续沿自身轴拉伸；所有世界轴位移和层/列/双深复制偏移都会先转换为父节点本地向量，避免 GLB `__root__` 轴向反转导致模型散架；`cellHeight/columnCount/doubleDeepEnabled` 分别按高度、多列和双深语义生成对应尺寸。已执行 `npm run build` 验证仓库构建通过。
- 2026-06-17：补齐 Unity 鼠标导航边界行为；`Alt + 左键` 环绕会在捕获阶段优先拦截，避免命中 Gizmo 时误触发对象变换；右键观察和右键菜单共用 6px 拖拽阈值，普通右键轻微抖动仍会打开对象菜单，超过阈值才关闭菜单并进入视角观察。已用 Playwright 读取 Babylon 相机状态验证 `Alt + 左键`、中键、`Alt + 右键`、右键拖拽和滚轮均改变相机，滚轮事件会被阻止默认行为，普通右键、3px 抖动右键和右键拖拽菜单抑制均符合预期。
- 2026-06-17：视口中键平移、`Alt + 左键` 环绕和 `Alt + 右键` 缩放会在导航开始时主动屏蔽浏览器默认滚动或菜单行为，滚轮被相机消费后也会阻止页面滚动和宿主缩放；普通右键单击仍保留给对象上下文菜单，右键拖拽会立即关闭旧菜单并只负责观察视角。
- 2026-06-17：预览模式复用 Unity Scene View 鼠标导航，预览运行中 `Alt + 左键`、中键、`Alt + 右键`、右键拖拽和滚轮继续控制相机，同时禁止右键单击弹出编辑对象菜单，避免预览观察被编辑态菜单打断。
- 2026-06-17：补齐 Stacker 现场 PLC 货叉运动；运行时会在模型包缺少货叉 action 组时用 `huocha.9/huocha2.10` 兜底驱动 `front_movement_z/back_movement_z/forkState`，并将 `front_distanceY/back_distanceY` 按毫米值换算为米后校准载台和货叉升降位置。
- 2026-06-18：修复 MQTT 货叉距离或位置变化时 Stacker 预览场景货叉不伸缩的问题；运行时新增 `front_forkLocation/back_forkLocation`、`front_forkDistance/back_forkDistance` 等绝对位置校准，并把 Stacker 货叉限位扩展为左负右正的双向伸缩。
- 2026-06-18：按《双工堆垛机协议V5.2》校准 DDJ2 Stacker PLC 点位说明和 demo 报文；正式调度点位改用 `deviceCode`，`front_forkAction/back_forkAction` 按 bit1 右伸、bit2 左缩、bit3 左伸、bit4 右缩生成与解析，旧 `device_code` 仍兼容。
- 2026-06-17：修复 `RollerConveyor01` 辊道机参数化新增辊筒不参与数据驱动自转、且原始 `GT` 网格因 pivot 在模型原点导致旋转方式不正确的问题；`movement_x/rotation` 现在会把原始 `GT1..GT10` 和 `generatedByParametricRuntime` 生成的同源辊筒克隆一并纳入 `motion.roller`，并在预览态把自转 pivot 临时校正到每根辊筒自身几何中心，确保辊道内每根辊筒各自绕自身轴旋转。
- 2026-06-17：新增 Stacker `distancex` 行走距离校验；现场毫米值直接作为 travel 目标值并以轨道起点为 0 点校准位置，同帧存在 `action` 时优先使用 `distancex`，最终仍受上下轨道行程限制保护。
- 2026-06-17：修复 Stacker 运行态主体可能脱离上下轨道的问题；`movement_x` 行走限位在端部挡块推导失败时会使用上下轨道 `fixedNodes` 的整体几何范围兜底，`twinspawn` 整机平面位置也会夹紧到进入预览时的轨道线内，高度和朝向保持原协议语义。
- 2026-06-16：修复 Shelf 多列货架中间支架和蓝色侧架重复显示的问题；`shelf.model.ts` 的列复制改为按左右支架中心距计算列距，新增列跳过起始侧窄边界构件，只保留远端支架/侧架和跨宽层梁，让相邻列共用一根边界支架且不留间距。
- 2026-06-16：新增 `scripts/stacker-ddj2-plc-message.mjs`，按现场新 DDJ2 堆垛机完整 PLC 报文字段集合输出 `{data:[{e,p,v}],ts}`；运行时 Stacker 点位别名识别改为更宽容，支持对象帧中的 `frontForkAction/backForkAction`、`deviceCode/device_code` 等写法，`move/mode/command/task` 等状态字段只保留不驱动模型。
- 2026-06-16：修复选中模型后拖拽 Gizmo 的 X/Y/Z 轴会同时拖动镜头的问题；Gizmo 拖拽期间会暂停编辑相机输入并清理惯性，释放后恢复左键旋转、右键平移和滚轮视线移动。
- 2026-06-16：按现场 DDJ2 堆垛机 PLC MQTT 报文调整数据驱动适配；运行时支持 `{data:[{e,p,v}],ts}` 包装，`action/front_action/back_action/front_forkAction/back_forkAction` 会转换为 Stacker 标准动作，`device_code` 保留为调度号不覆盖 `e`，demo 脚本默认输出 DDJ2 PLC 点位并保留旧标准点位开关。
- 2026-06-16：修复点击保存时全局 MQTT / 统一数据源配置未稳定写入场景的问题；保存前会把工具栏配置弹窗里的最新 `sceneDataDriven` 快照同步回 Babylon 场景 metadata，再进入项目场景或 `.babylon` 序列化。
- 2026-06-16：点击保存后项目条新增“保存中/保存完成”状态，项目场景只有在 IPC 写入和最近项目刷新完成后才提示成功；保存失败不会再回退触发普通 `.babylon` 导出，MQTT Broker 与端口随场景保存并在重新打开项目场景时恢复。
- 2026-06-16：编辑视口左键轨道旋转改为围绕当前选中物体的世界包围盒中心；点击模型准备旋转时会先同步相机 `target`，对象移动后也会刷新旋转中心，避免继续围绕世界原点或旧中心旋转。
- 2026-06-16：新增 `scripts/stacker-scene-mqtt-sequence.mjs`，按固定 MQTT/WebSocket 报文流程演示货箱放在辊道入口、Stacker 伸叉取货、载货台移动并放入定位线框 `1-1-1`；补充 `npm run demo:stacker-scene` 与 dry-run 文档。
- 2026-06-16：修复 Stacker 吸附后货箱不跟随货叉缩回载货台的问题；货箱被 `pickup` 吸附期间会暂停自身 `twinspawn` 位姿帧，并把运行态姿态缓存同步到货叉锚点，避免被吸附前旧目标位置拉回辊道。
- 2026-06-16：恢复 `RollerConveyor01` 货箱语义化载荷绑定；`payload + movement_x/rotation` 会同时驱动辊筒自转和货箱有界输送，货箱整箱被夹在当前辊筒输送段内，运动到末尾后保持绑定并等待反向或重新绑定信号。
- 2026-06-16：按现场要求调整 `RollerConveyor01` 辊道机动画效果；编辑器读取该 opaque 辊道机模型包的数据驱动语义时保留 `motion.roller`，`movement_x/rotation` 驱动 `GT` 辊筒自转，绑定货箱时同步推动货箱沿辊道移动。
- 2026-06-16：编辑视口滚轮改为沿当前相机视线方向前进/后退，不再依赖 `ArcRotateCamera` 默认半径缩放；相机可直接进入并穿过模型内部，同时保留原有轨道旋转、右键平移和聚焦取景逻辑。
- 2026-06-16：修复 Shelf 输入列数后列与列之间出现间隙的问题；`shelf.model.ts` 的列复制偏移不再额外叠加 `postWidth`，改为按当前单列实际 X 向外包络宽度贴边排列多列货架。
- 2026-06-15：按目标图重做 Shelf 层/列参数布局；`shelf.model.ts` 不再用 `layerCount` 复制整套模板，改为连续拉高四根立柱、按层复制横梁/深度梁/侧撑，再按 `columnCount` 复制完整单列结构，避免每层重复脚杯和立柱导致货架不像整体框架。
- 2026-06-20：修正 Shelf 货架在通用“模型阵列”中的 0 间距语义；普通模型继续按外包络贴边，Shelf 沿 X/-X 阵列时改用左右支架中心距作为基础步长，让中间立柱中心线重合，用户输入的模型间距只作为额外空隙追加。
- 2026-06-20：模型阵列弹窗新增“模型间距（m）”输入；创建阵列时仍先按源模型当前世界 X/Z 外包络自动贴边，再追加用户选择的非负米制间距，默认 `0 m` 保持旧的无间隙排列。
- 2026-06-15：模型阵列改为自动贴边排列；弹窗移除“间距 m”输入，创建时按源模型当前世界 X/Z 外包络计算步长，默认相邻无间隙，目标无可渲染包围盒或轴向尺寸过小时会提示失败而不是生成重叠副本。
- 2026-06-15：修复右键菜单中“模型阵列”不易发现的问题；阵列入口从菜单底部移到“复制/粘贴”旁，并复用 Babylon 引擎的可阵列目标判断，避免 UI 判断和实际创建规则不一致导致普通模型右键看不到入口。
- 2026-06-15：修复 Shelf 模型包“货格宽度”只让红框横梁变宽的问题；`shelf.model.ts` 不再把编辑器临时标记的原始 GLB 包装层误排除为运行态克隆，并改为按原始 X 向包围盒中心整体重排模板节点，立柱和侧向部件随宽度外移，横向跨宽横梁才按 X 轴拉伸。
- 2026-06-15：修复辊道机变宽后辊筒端部与长梁之间出现缝隙的问题；自动 `rollerWidth` 不再按整机外宽比例放大，而是按 `A10/A11` 当前内侧间距计算，并把辊筒 Z 中心对齐到两侧长梁内侧中线。
- 2026-06-15：修复模型包辊道机从资产库拖入场景后部件散开的问题；模型包资产在源文件可用时不再优先克隆场景模板，而是从项目内 GLB 重新实例化并运行参数化兜底，缺源文件的模板兜底路径也改为先按停止态模板准备克隆元数据，再恢复源模板运行态。
- 2026-06-15：修复辊筒入口误用 `length` 固定区右边界的问题；`rollerDensity` 现在以 `A10/A11` 当前共同覆盖区的红框入口作为轨道起点，第一根中心仅内缩半个辊筒厚度，后续辊筒按原始间距朝当前尾端追加。
- 2026-06-15：修复辊筒数量调整后整组仍落在红框左侧外部的问题；辊筒轨道现在优先使用 `A10/A11` 拉伸后的真实包围盒，并从红框入口到当前尾端的有效段排布，第一根辊筒会落在红框对应位置后再朝尾端方向追加。
- 2026-06-15：修复修改辊筒数量后新增辊筒向左侧生成的问题；`rollerDensity` 的中心点生成现在复用长梁真实尾端参考点，从远离尾端的一侧向当前长梁尾端逐个追加，不再固定按根节点 X 递增方向排布。
- 2026-06-15：修复辊道机右侧尾端支腿在修改 `length` 后跟随方向反的问题；编辑器现在会先应用 `A10/A11` 长梁顶点拉伸，再读取长梁当前真实尾端 X 坐标，右侧尾端组件按其相对长梁尾端的原始偏移重新定位，不再单纯使用 `center + lengthDelta`，避免场景轴向或模型包装层导致支腿向左偏移。
- 2026-06-15：按现场标注图明确辊道机 `length` 三段式规则；左侧黄色固定区 `A16/A17/A7/A5/A3/A9/A13` 作为起点不动，红框 `A10/A11` 长梁向右延伸，右侧黄色尾端组件 `A18/A19/A4/A2/A6/A12/A14` 随 `lengthDelta` 向右跟随。
- 2026-06-15：修正辊道机长度拉伸后电机/传动组件被误带到尾端导致模型移位的问题；`A8/A15/A20/A21/A22/A1` 保持左端固定区基线 X 位置，不再随 `lengthDelta` 平移，避免改变长梁长度后电机组与机架分离。
- 2026-06-15：修复辊道机长度拉伸后右端短横件仍停留在旧位置的问题；`A12/A14` 现在作为长度尾端跟随节点随 `lengthDelta` 平移到长梁新尾端，避免右端细件留在红框旧端点，且不改变 `showRearSupport` 仅控制后支架节点 `A18/A19/A4/A2/A6` 的显隐语义。
- 2026-06-15：修复辊道机辊筒被移动到机架外侧的问题；`moveNodeCenterOnRootAxis` 现在会先把编辑根节点本地轴向位移转换为世界位移，再转换到节点父级局部坐标后写入 `position`，避免外层编辑根、单位归一化根或 GLB 包装层导致 GT 辊筒落到绿色框外部；完整 `A* + GT*` opaque 节点集合会直接走辊道机专用兜底，不再因资产文本匹配失败退回普通辊筒布局。
- 2026-06-15：修正辊道机 `length` 行为为“红框长梁延伸，尾部支撑脚跟随尾端”；`A10/A11` 长梁仍只从左端蓝框锚点向右做顶点延伸并跳过 X 轴包围盒中心重对齐，尾部支撑脚组 `A18/A19/A4/A2/A6` 按 `lengthDelta` 平移，`GT` 辊筒数量和位置继续不随长度自动变化。
- 2026-06-15：修正辊道机 `rollerDensity` 数量重排边界；opaque 辊道机现在以 `A10/A11` 两根长梁共同覆盖且位于左端固定锚点之后的 X 区间作为辊筒轨道，设置辊筒数量时按当前 `length` 计算长梁尾端并扣除半个辊筒长度，所有目标中心都会被夹在安全区间内，避免新增或重排辊筒出现在长梁外面。
- 2026-06-15：继续收紧辊筒安全区间；`A10/A11` 共同覆盖区间无效时不再回退到两根长梁并集，避免把辊筒排到只有单侧长梁覆盖的区域。
- 2026-06-15：修复设置辊筒数量时整组辊筒跑到模型外的问题；数量重排改为使用 `lengthAnchorX` 到 `baseline.minimum.x + targetLength` 的整机当前目标尾端作为可见输送段，再扣除半个辊筒长度后等距分布，彻底移除原始 GT 区间和 A10/A11 历史包围盒尾端回退。
- 2026-06-15：调整 opaque 辊道机初始化和数量递增语义；未手动设置 `rollerDensity` 时默认只显示左侧第一根辊筒，用户设置数量后从第一根中心按原始 GT 中心距向右追加，超过长梁安全范围的目标数量会被裁剪隐藏。
- 2026-06-15：补齐辊筒数量初始化同步；未手动接管时会把 `rollerDensity` 参数值写回为 `1`，并在数量递增轨道上叠加 `A10/A11` 当前长梁共同覆盖范围，防止面板数值和视图不一致或辊筒超过长梁。
- 2026-06-14：按现场红框和蓝框要求收敛辊道机 `length` 行为；长度变化以左端蓝框支架右边界为起点拉伸 `A10/A11` 两根长梁，并保留尾部支撑脚组随长梁末端移动；不会按长度自动改 `rollerDensity` 或重排 `GT` 辊筒，辊筒数量仍由 `rollerDensity` 独立控制。
- 2026-06-14：修复辊道机模型包拖入场景后不可见和参数变化无效的问题；根因是外部 runtime 将 GLB 的 0 顶点 `__root__` 包装 mesh 纳入包围盒计算，误把模型基线尺寸算成几千米级并生成极小根缩放。编辑器现在只在模型包生命周期调用期间临时标记这类不可渲染包装节点，让脚本按已有 `generatedByParametricRuntime` 规则跳过，调用结束立即恢复 metadata；同时保留用户缩放与 `parametricRootScaling` 分离保存、辊筒数量和 opaque 支架显隐兜底。
- 2026-06-14：继续收敛辊道机机械外观规则；`length` 改为以模型左端固定，`A10/A11` 长梁按左端顶点锚定延展，尾部支撑脚组随长梁末端平移，辊筒联动保持取消；`height` 改为底部脚杯固定，仅四根角立柱按底端锚定加长，顶部框架、辊筒和驱动附件作为刚体上移，避免电机、辊筒和支架被比例拉伸后破坏正常外观。
- 2026-06-14：调整辊道机参数化形态应用方式；`length/width/height/rollerWidth/rollerDensity/showFrontSupport/showRearSupport` 写入 metadata 后仍实时刷新，但 opaque 辊道机不再保留 runtime 根节点整体缩放，改为恢复原始节点基线后按部件级规则处理长梁、宽高、支架显隐和辊筒数量，避免整机随参数被整体拉伸变形。
- 2026-06-14：修正辊道机 `width` 参数的机械外观；宽度现在以整机外包络为目标，两侧结构贴齐目标边界，横向贯穿件局部变宽，默认辊筒宽度随整机宽度自动变化，单独修改 `rollerWidth` 后不再被宽度输入覆盖。
- 2026-06-14：细化辊道机 `length` 的固定起点；长度现在以左端支架组右边界为伸长起点，蓝框固定区、电机、左端附件和右端端架保持原位，只延展 `A10/A11` 长梁右侧顶点，辊筒不再随长度自动补齐。
- 2026-06-14：修复刷新或修改辊道机参数化配置后运行态辊筒克隆混入原始基线的问题；编辑器在捕获 opaque 辊道机基线前会先清理 runtime 克隆，捕获和读取时排除 `generatedByParametricRuntime`、`generatedByMeshVertexModifyRuntime` 与历史克隆名，模型包替换也不再继承旧 opaque 基线，避免机架和辊筒分离。
- 2026-06-13：工作网格升级为同步呼吸闪烁和专用 GlowLayer 光晕；光晕只 include 网格闪光主线、坐标轴和定位线，仍保持 helper 不参与拾取、层级树和场景序列化，性能预览模式会关闭光晕后处理并保留基础线段呼吸。
- 2026-06-13：放开编辑视口 `ArcRotateCamera` 的最近半径限制；鼠标滚轮可继续贴近并穿过模型目标点，便于检查模型内部结构，预览相机快照继续按原逻辑保存和恢复该状态。
- 2026-06-13：Stacker 货箱放货新增 `target` 定位框目标；`cargo_action=drop` 携带 `target/dropTarget/locator` 等字段时，会把已吸附货物底面中心对齐到指定定位线框底面中心，定位框只需在“资产信息”中填写资产编号，不要求启用动画连接。
- 2026-06-13：定位线框立方体属性面板新增独立“资产信息/资产编号”，Stacker `drop target` 优先匹配该编号；旧场景若只在“动画连接/绑定设备”填写过编号，运行时仍兜底兼容。
- 2026-06-13：修复中文或特殊字符模型包文件夹导入失败的问题；主进程生成 `packageId` 时会把目录名收敛为安全 ASCII 片段，继续保留 `assets/source/<packageId>` 的目录穿越防护。
- 2026-06-13：修复辊道机放入场景后的移动轴体验和辊筒数量参数；导入时会为几何原点明显偏离模型的资源创建外层编辑根节点，让移动轴出现在模型底面中心。`E:\公司文件\数字孪生\模型文件\models\辊道机` 中 `rollerDensity` 仍作为参数键保存，但界面语义改为最终辊筒数量；编辑器在导入、刷新、打开场景和属性面板实时修改 `rollerDensity` 时都会执行引擎层兜底重排，避免旧模型包脚本或旧运行状态导致辊筒不显示，当前规则会从左侧第一根向右追加并裁剪超出长梁安全范围的数量，长度变化不再触发辊筒重排；当前辊道机 GLB 的支架节点只有 `A*` 不透明命名，编辑器在识别到完整 `GT1..GT10` 与已验证支架节点组时，会用 `showFrontSupport/showRearSupport` 切换 `A16/A7/A3/A5/A17` 和 `A18/A19/A4/A2/A6`；普通 GLB 旧面板的“辊筒密度”也会驱动 `GT/roller/辊/滚` 辊筒数量。
- 2026-06-12：修复 Windows/Node 22 环境点击发布时报 `spawn EINVAL` 的问题；发布构建在 Windows 下改为固定通过 `cmd.exe /d /s /c npm.cmd run build` 启动，仍由主进程控制命令、参数和工作目录。
- 2026-06-12：工具栏新增发布按钮；桌面模式下通过受控 Electron IPC 执行固定 `npm run build`，成功后打开根目录 `dist/`，并通过发布中单飞锁、构建失败日志尾部和产物目录校验避免重复发布或误打开旧产物。
- 2026-06-08：针对大模型场景黑屏和 GPU 占用偏低问题，Electron 启动阶段会向 Chromium 请求高性能 GPU、启用 GPU rasterization 并忽略 GPU blocklist；Babylon WebGL 引擎请求 `high-performance`，常态关闭 `preserveDrawingBuffer` 和 `stencil`，减少后备缓冲显存压力。
- 2026-06-08：视口状态栏增加 DrawCall、硬件缩放、WebGL renderer/vendor 和上下文状态提示；如果 WebGL context lost，会直接显示“WebGL 丢失”，便于区分 GPU 上下文丢失和普通场景不可见。
- 2026-06-08：资产区重复拖入同一模型时，优先复用场景中已有同源模板克隆新实例，避免每次重新 `ImportMeshAsync` 解码并上传同一份几何、材质和贴图；克隆实例仍走编辑器复制准备流程，保留独立材质，避免属性面板改色串到其它实例。
- 2026-06-08：修复场景默认画质被 `performanceMode=false` 覆盖成低 DPI 的问题；现在默认按 4K 目标像素量计算 `hardwareScalingLevel`，窗口尺寸变化或 WebGL 上下文恢复后都会重新应用高清策略，只有手动开启“性能预览”才会降采样。
- 2026-06-09：选中态移除 `HighlightLayer` 发光层，改用 Babylon `SelectionOutlineLayer` 把同一模型的子网格作为一个整体描边，避免复杂模型主体被整片染色或内部零件边界密集发亮。
- 2026-06-10：Stacker 数据驱动新增运行态货箱吸附；`cargo_action=pickup/drop` 与 `cargo=货箱资产编号` 可把货箱临时吸附到货叉并跟随运动，内置模拟和 MQTT demo 桥接脚本默认演示 `Box01`，停止预览后恢复进入预览前姿态。已执行 `node node_modules\typescript\bin\tsc -b`、`node node_modules\vite\bin\vite.js build` 和 `git diff --check` 验证。
- 2026-06-10：Stacker 数据驱动行走新增防越界限制；`motion.travel.limits` 支持显式 `min/max` 或按两端防撞物体包围盒自动推导，`travel_pos` 超出范围时会在进入运动缓存前截断，避免堆垛机行走机构穿过轨道两端防撞物体。
- 2026-06-11：统一数据源新增运行态连接状态显示，WebSocket/MQTT over WebSocket 会上报连接中、已订阅、重连、最近消息时间和错误信息；真实数据超过 5 秒未到达时标记离线并保持最后姿态。数据驱动协议补齐 MQTT WebSocket 地址要求、通配 Topic、Stacker/RGV/输送线/提升机/定位框示例 payload。
- 2026-06-11：整理 MQTT 数据驱动完整接入操作文档 `docs/mqtt-data-driven-guide.md`，覆盖前置条件、编辑器配置步骤、主题与 payload 协议、全部 9 个设备模型的点位速查表、行程限制与货箱吸附、新模型 `dataDriven` 接入指引和 20 条排错清单；README“数据驱动协议”章节增加文档导引。
- 2026-06-11：简化 MQTT 数据源配置；MQTT 模式下属性面板和统一数据源弹窗只填写 Broker IP/域名与 WebSocket 端口，系统继续写回完整 `dataEndpoint` 和默认 `dataChannel`，并保留旧场景自定义 WebSocket path 与 Topic。
- 2026-06-11：按中鼎 MQTT 规范补齐默认订阅与解析；MQTT 默认订阅 `twinspawn` 和 `twindatadriven/#`，PUBLISH topic 会透传到运行时，payload 缺少 `e` 时用规范 topic 的 `{devId}` 兜底，订阅请求改为 QoS1，状态/告警/负载帧进入 POI/业务语义而不误驱动模型。
- 2026-06-11：模型脚本 `dataDriven.motion.*.speed` 支持按物理速度计算数据驱动插值时长；`translate` 使用 `m/s`，`rotate` 使用 `deg/s`，同一帧多个运动组取最长时长同步到达，未配置速度的模型继续使用原插值配置。Stacker 脚本已补 `travel/lift/fork/forkSide` 速度。
- 2026-06-11：按接口定义 V4.6 调整 MQTT 数据驱动动作语义；新模型包默认使用 `movement_x/movement_y/front_movement_z/back_movement_z` 等动作枚举持续驱动，旧 `target` 数值目标模式保留兼容，`deviceCode` 纳入设备匹配兜底，Stacker demo 和外部模型包脚本同步切换到动作模式。
- 2026-06-13：修复 Stacker 主体高度与顶部长轨联动；`bodyHeight` 只拉伸立柱，顶部上轨、顶部滑轨和横杆按世界坐标整体随立柱上移，兼容 GLB `__root__` 的缩放和翻转，底部行走轨保持基准不动。属性面板模型包参数区新增“刷新模型包”，旧实例可从源模型包目录刷新 `.ts` 和 `meta` 文本并立即重跑脚本，不替换已导入 GLB 几何。
- 2026-06-13：模型包导入新增同包替换语义；重复导入同源目录会优先按 `sourceRoot` 命中原资产，目录移动时仅在资产库存在唯一同名模型包目录时兜底，主进程会先复制到 staging 目录，渲染端读取 staging 文件完成 manifest 和 GLB 替换验证后再激活正式目录，失败时通过 pending token 回滚旧包，预览模式下禁止导入或替换。替换成功后资产库不新增重复卡片，当前场景内同包实例会用新 GLB 模板重建，并保留根节点编辑状态、业务资产编号和兼容动态参数。

## 后续演进

- 增加重做命令栈
- 增加批量复制/删除、批量属性编辑、父子层级拖拽
- 增加 Prefab 与组件脚本系统
- 增加材质库、纹理槽、PBR 参数和 Node Material 入口
- 增加 LOD、薄实例、Octree、GPU Picking 等大场景优化
- 增加未引用资产清理和资产重命名工具
- 增加正式应用图标、代码签名、自动更新和 asar 恢复策略
