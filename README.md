# ORBITAL | Infinite Li

**[立即探索宇宙 · Explore the universe →](https://infinite-li.cn/)**

正式网站 / Official website：[https://infinite-li.cn](https://infinite-li.cn/)

[中文介绍](#中文介绍) · [English introduction](#english-introduction) · [本地运行 / Run locally](#启动) · [技术实现 / Implementation](#实现)

## 中文介绍

ORBITAL 有两个空间。航行层参考 Active Theory 的连续空间叙事与克制字幕，行星、星环与深空背景由本地 WebGL 实时生成。阅读层收录个人日志、造物与联系方式，也可以从天体标点的考察记录进入相关文章。

ORBITAL / Infinite Li 将一次宇宙探索展开为八幕电影式旅程：从远眺气态巨行星出发，穿行粒子星环，掠过发光的大气层，见证日食，再通过超光速跃迁抵达黑洞与炽热吸积盘。滚动直接驱动三维摄像机，极简界面为宇宙景观留出充分空间。

项目基于 Vite、Three.js、GSAP 和 Lenis，结合程序化 GLSL 材质、后期泛光与深空粒子。支持自由环绕、三个空间探索锚点，以及由 Web Audio API 实时合成、默认静音的氛围音效；同时为桌面和移动端提供适配构图、触屏操作与减少动态效果支持。

## English introduction

ORBITAL combines a fullscreen WebGL journey with a personal journal. The flight draws its planets, rings and star fields procedurally, with continuous camera movement and restrained typography inspired by Active Theory. A separate reading panel holds Markdown articles, projects and contact links. Field notes on the planet and its rings open the corresponding articles.

ORBITAL / Infinite Li unfolds across eight cinematic chapters: approach a gas giant, fly through its particle rings, skim a glowing atmosphere, witness an eclipse, and make a faster-than-light jump to a black hole and its blazing accretion disk. Scrolling drives the camera through a three-dimensional universe, while a minimal interface leaves room for the scenery.

Built with Vite, Three.js, GSAP, and Lenis, the project combines procedural GLSL materials, bloom post-processing, and deep-space particles. Explore with free orbit controls and three spatial hotspots, or enable ambient sound synthesized in real time with the Web Audio API; audio is muted by default. Desktop and mobile layouts include tailored camera framing, touch controls, and support for reduced motion preferences.

## 启动

已安装 Node.js 后，在此目录运行：

```powershell
npm ci
npm run dev
```

访问 **http://127.0.0.1:5173/**。使用鼠标滚轮、触屏滑动、Page Down 或顶部八个航行节点探索。右上角 FREE ORBIT 进入自由漫游，SOUND 开启或关闭声音，最后一章可重新启航。请通过开发服务器访问，不使用 `file://`。

## 实现

### 日志、造物与关于

顶部的 JOURNAL 打开日志目录。可以按分类筛选，或从风暴巨眼、卡西尼环缝、极光电离层的考察记录直接读文章。PROJECTS 和 ABOUT 共用这个阅读面板。Esc 或右上角的关闭按钮返回进入前的机位。

在 `src/posts/` 新建 UTF-8 编码的 `.md` 文件即可进入目录，文件名也是可分享地址的一部分，例如 `/#journal/weather-in-two-clocks`。开发模式下 Vite 自动发现新文件。公网发布时重新运行 `npm run build`，部署新的 `dist/`。

```markdown
---
title: 给星环留一道空隙
date: 2026-11-15
category: 构造实验
summary: 让模型中的一道环缝，成为镜头可以穿过的一段路。
anchor: division
---

## 观测

在这里写正文。
```

头部支持平面文本字段、引号、注释，以及用 `>` 或 `|` 缩进书写的多行摘要。日期使用 `YYYY-MM-DD`。普通文章可省略 `anchor`。精选文章使用 `storm`、`division`、`ionosphere`，同一标点展示日期最新的一篇。目录按日期倒序排列，分类从文章自动生成。正文使用 Marked 和 DOMPurify，在浏览器内完成渲染。

`src/content/` 负责文章解析，`src/ui/reader.js` 和 `reader.css` 负责阅读面板。个人项目及公开联系方式可在 `index.html` 的 `projects-view` 和 `about-view` 模板中编辑。

### 三维航行

点击 **PILOT SHIP** 从当前章节进入驾驶舱。W 推进，S 制动，A / D 偏航，Q / E 或上下方向键控制俯仰，按住 Shift + W 超频。雷达以机头为上方。按 R 或点击雷达旁的目标名，可以切换空间站与文章信标，查看距离和方位。触屏使用左侧摇杆和右侧推进键。

飞入青色对接圈后，按 F 或点按对接提示进入造物展厅。靠近八面体信标时按 F 扫描并阅读对应日志。关闭抽屉会继续驾驶，从空间站离港时机头会对准第一篇日志。EXIT PILOT 或 Esc 返回出发时的章节。驾驶音效跟随 SOUND 开关。

### 接入驾驶模型

将自备模型放入 `public/models/ship.glb` 和 `public/models/station.glb`。可单独替换任意一个。重启 Vite 或重新构建后，首次进入驾驶模式会并行加载已有文件。加载期间和失败时使用对应的程序化模型。Draco 解码器位于同源的 `/draco/`。模型自带的动画会循环播放，金属与玻璃共用驾驶场景的冷色环境反射。

飞船采用 +Y 向上、−Z 向前，自动居中并等比缩放到原艇长度。若模型缺少可识别船首的挂点，可以在 `src/pilot/model-config.js` 调整 `SHIP_ROTATION_OFFSET`，例如将 Y 轴角度设为 `Math.PI` 翻转船首。空间站按最长边归一化。

可在建模工具中导出以下命名的空节点。节点可挂在动画骨骼或活动部件上。

| 节点 | 放置方式 |
| --- | --- |
| `Thruster_L`、`Thruster_R` | 位于左右喷口中心，节点局部 +Z 指向尾焰喷出方向。缺少的喷口使用配置中的 `THRUSTER_OFFSETS`。 |
| `Wingtip_L`、`Wingtip_R` | 位于翼尖航迹的起点。无节点时可调整 `WINGTIP_OFFSETS`。 |
| `Nose` | 位于船首扫描光束发射点，也用于识别船首朝向。 |
| `DockingPort` | 位于空间站实体对接口中心，局部 +Z 向舱外。青色引导圈位于其正前方。无节点时使用模型正面包围盒中心。 |

- Vite + Three.js + GSAP ScrollTrigger + Lenis，依赖版本由 `package-lock.json` 固定。
- 页面总高度 800vh，`scrub: 1.8` 驱动八幕航行。前五幕继续使用原有的球面坐标路径，实际滚动距离与镜头映射保持一致；后三幕接续超光速跃迁、黑洞近观与最终远眺。
- 六倍频 simplex FBM、差速云带、涡旋、细粒度纹理、定向光照、镜面与昼夜边界、星环投影。
- 三层 Fresnel / Additive 大气；EffectComposer → RenderPass → UnrealBloomPass → OutputPass → 颗粒、暗角与轻微色散。
- 桌面 96,000 / 手机 32,000 颗三维星环粒子，以及 1,800 / 480 个实例化碎石；四段真实环缝，分层恒星与星云粒子。
- 限制设备像素比、根据持续帧耗时降低渲染分辨率；标签隐藏暂停绘制，减少动态效果模式下暂停环境动画并按需重绘；尊重系统减少动态效果设置。
- 字幕只有一个 DOM 实例，章节交替时先淡出再换文案；移动端独立构图。

## 文件

`src/flight.js` 原五幕航线；`src/scene/camera.js` 镜头构图；`src/scene/viewport.js` 设备预算；`src/universe.js` 场景和后期；`src/shaders/` GLSL；`src/main.js` 滚动与字幕；`src/style.css` HUD。

`src/bootstrap.js` 轻量入口；`src/ui/preloader.js` 加载过渡；`src/space-audio.js` 程序音效；`src/exploration.js` 自由漫游与标点。原有独立模块保留位置，避免无必要的文件迁移。

## 验证

```powershell
npm test
npm run build
npm run verify:models
# 保持开发服务器运行，再在另一个终端执行：
npm run verify:browser
npm run verify:exploration
npm run verify:delivery
npm run verify:reader
npm run verify:pilot
```

浏览器验证使用本机 Chrome / Edge；其他路径可通过 `BROWSER_PATH` 指定。检查桌面、320 / 390 / 767 像素竖屏、手机横屏和减少动态效果模式的 48 个镜头，包括 GLSL 链接状态、WebGL 错误、控制台、资源请求、导航按钮、鼠标视差、滚动与字幕边界。报告及截图保存在 `.qa/`。

`verify:delivery` 检查首屏遮罩、WebGL 首帧、分享信息、原生触屏滑动及横竖屏切换。`verify:reader` 检查分类、文章直达、阅读滚动隔离、项目缩略图与航线恢复。这两项均支持通过 `PREVIEW_URL` 检查生产预览。`verify:browser` 与 `verify:exploration` 使用开发模式诊断接口。

`verify:models` 在临时生产构建中载入一份自制的 Draco 动画网格，检查同源解码、反射、挂点、独立回退，以及对接和阅读流程。正式模型目录由站主提供素材。

`npm run preview` 可在 http://127.0.0.1:4173/ 预览生产构建。

程序噪声的第三方许可见 `THIRD_PARTY_NOTICES.md`。全部天体和航行内容为艺术化视觉创作，非天文测量模型。

## 沉浸感增量

新增代码位于 `src/immersion.js`、`src/immersion-math.js` 和 `src/shaders/lens-flare.frag.glsl`。原行星、大气与星环着色器保持原样。

- **日食**：太阳仍位于原主光源方向；第四幕在基础航线上叠加短暂侧移。由太阳/行星视圆的重叠面积计算可见比例，镜头耀斑跟随可见日缘；完全遮挡时不显示耀斑。
- **尺度**：远侧卫星使用真实凹坑与隆起的网格，缓慢公转；近轨道微型探测器包含太阳能翼、网格、天线、抛物面外形天线碟与青色脉冲信标。
- **星云**：十二层远景尘埃云使用运行时生成的 FBM 透明纹理，分布在不同方位和深度，无外链素材。
- **遥测与速度线**：ALTITUDE 从摄像机到行星表面的距离计算，VELOCITY 从摄像机位移/帧时间计算并平滑，TEMP 随受光、接近程度和速度变化。显示采用电影模拟尺度：每场景单位 25,000 km，每现实秒 1,000 模拟秒，温度单位为 K；并非实际航天器传感器数据。
- 快速滚动使背景恒星沿视野径向短暂拉伸，停下后平滑恢复圆点。星环与星云粒子不参与拉伸；暂停或减少动态效果模式下禁用速度线。

增量前的源码快照与保护文件校验记录存放于 `.qa/before-immersion-20261117-230628/`。

## 自由探索与声音

- **FREE ORBIT / EXIT ORBIT**：在当前位置冻结航线。鼠标左键拖拽、滚轮缩放；手机单指环绕、双指缩放。OrbitControls 带阻尼，并以当前天体为中心保持安全距离；退出通过球面弧线回到进入时的航行进度。跃迁途中暂时禁用漫游，抵达黑洞后恢复。
- **三个空间标点**：风暴巨眼跟随原云层着色器的漂移；卡西尼环缝随星环转动；极光电离层随行星转动。标点由世界坐标投影，背向或被行星遮挡时隐藏。点击后飞向特写，侧边显示非模态的模拟考察记录。关闭记录继续漫游；Escape 关闭记录或返回航线。
- **SOUND**：替换原顶部环境动画暂停按钮。默认不创建 AudioContext，首次点击后才合成低频振荡器、棕色噪声与双声道混响。镜头运动推动低通滤波，声音淡入淡出；关闭或页面隐藏时挂起音频。不加载 MP3 或其他音频资源。
- 交互模块：`src/exploration.js`、`src/exploration-math.js`；声音模块：`src/space-audio.js`。原行星、星环、光晕着色器均保持原样；改动前快照位于 `.qa/before-exploration-20261117-232459/`。
- `verify:exploration` 使用真实浏览器验证环绕拖拽、滚轮/双指缩放、航线恢复、三种考察记录、快速切换、默认静音、非零音频输出、滤波响应、静音回落及重复开关的音频节点复用。

## 第六至八幕：跃迁与奇点

- `src/journey.js` 把全程进度前 `4/7` 映射到原有五幕的 `0…1`；原 `src/flight.js`、行星、星环、日食着色器未修改。第六幕从原终点连续移动至远方第二天体，拉伸 FOV，叠加轻微震动与 3,000 / 1,400 条实例化三维光流；减少动态效果模式取消震动并限制 FOV 变化。
- `src/singularity.js` 与 `src/shaders/singularity.frag.glsl` 提供不透明黑色视界球体、旋转吸积盘、弯曲光线与独立深空恒星。着色器在三维空间中积分有效零测地线，并求光线与盘面的交点，形成多重盘面光像；差速旋转、细密湍流和多普勒式明暗变化产生橙金与青白色层次。
- 这是电影化的 Schwarzschild 型近似，不是精确 Kerr 时空求解器。实时黑洞渲染的背景可参阅 [Eric Bruneton 的研究说明](https://ebruneton.github.io/black_hole_shader/)；本项目没有复制其实现或使用其预计算资源。
- 黑洞输出接入现有 UnrealBloomPass，使用独立的捕获光线遮罩保护纯黑视界；前五幕的泛光参数完全保留。镜头抵达后光流归零，第八幕拉远收尾，支持反向滚动返回原行星。
- 第七、八幕的 FREE ORBIT 以黑洞为中心，保留阻尼、缩放和返回航线；原行星的三个考察标点在离开该星系后隐藏。SOUND 默认静音机制不变，跃迁进度也驱动推进音滤波。
- 扩展前备份：`.qa/before-singularity-20261118-122654/`；原材质与镜头保留检查：`.qa/singularity-preservation.json`。

## 上线整理与移动端

- Git 初始存档为 `e1ecb00`（`v1.0 live planet base`）。`node_modules/`、`dist/`、本地验证截图和日志不进入版本库；`npm ci` 可恢复锁定依赖，`npm run build` 生成 `dist/`。
- 纯黑加载层及其样式直接包含在 HTML 中，先于大体积模块显示。百分比表示脚本就绪、场景建立、着色器编译和首帧绘制等启动阶段，不是网络下载字节百分比。完成实际绘制后等候浏览器绘制机会，再淡出；减少动态效果模式直接退出遮罩。
- 窄屏竖屏的宽景按外环半径与水平视角计算安全距离，行星略偏下；穿环和大气近景保留原镜头距离。字幕移至导航下方，小屏单独缩小字号与间距，并为刘海及底部手势区留出空间。黑洞取景也为上方字幕留白；跃迁及自由漫游交接时继续插值竖向构图，避免镜头跳动。
- 像素比始终不超过 `Math.min(devicePixelRatio, 2)`；保留桌面 1.5 的原有预算，手机上限为 1.25。手机减少背景恒星、尘埃、星环碎石与跃迁光流数量；着色器、光照、环缝及后期效果保持原样。持续低帧率时沿用原有分辨率回退，触屏航线使用原生纵向滚动。
- 标题、内联轨道 SVG Favicon、canonical 和 OpenGraph 信息指向个人域名。无需外链图片或字体。基本分享信息不依赖客户端 JavaScript。
- `tests/fixtures/desktop-camera.json` 从初始 Git 存档提取 18 组桌面镜头作为回归基准；测试还覆盖手机外环完整可见、日食遮挡比例和跃迁交接连续性。浏览器移动视口验证不能替代真实手机的持续温度与帧率测量。
