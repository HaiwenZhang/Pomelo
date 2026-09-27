<p align="center">
  <img src="images/pomelo-logo.svg" width="360" alt="Pomelo PCB Viewer 标志">
</p>

<h1 align="center">Pomelo · PCB Viewer</h1>

<p align="center">
  <strong><a href="https://haiwenzhang.github.io/pomelo/">在线使用 Pomelo</a></strong>
</p>

<p align="center">
  <strong>看清每一层，读懂每一条连接。</strong><br>
  基于 WebGPU 的 PCB 查看器，支持 Cadence Allegro、Altium Designer、ODB++、<br>
  PADS、Ansys HFSS 3D Layout 和 KiCad。在浏览器中探索电路板，文件始终留在本地。
</p>

<p align="center">
  <a href="README.md">English</a> · 简体中文
</p>

<p align="center">
  <img src="https://img.shields.io/badge/rendering-WebGPU-58752c" alt="WebGPU 渲染">
  <img src="https://img.shields.io/badge/built_with-TypeScript-3178c6" alt="使用 TypeScript 构建">
  <img src="https://img.shields.io/badge/board_files-stay_local-58752c" alt="板文件本地处理">
  <img src="https://img.shields.io/badge/status-early_development-d77d8a" alt="早期开发阶段">
</p>

<p align="center">
  <a href="#快速开始">快速开始</a> ·
  <a href="#支持的格式">支持的格式</a> ·
  <a href="https://github.com/HaiwenZhang/pomelo/issues">问题反馈</a> ·
  <a href="#参与贡献">参与贡献</a>
</p>

![Pomelo PCB 查看器：多层电路板、网络配色、图层控制与对象详情](images/sceenshot01.png)

<p align="center"><em>从整板布局，到一条走线、一个过孔、一片铜皮。</em></p>

## 让复杂电路板，更容易读懂

有时，你只是想看懂一块板：找到一个器件、追踪一条信号，或看看内层究竟如何布线。Pomelo 将这些操作带进清晰、专注的浏览器工作台，提供 **Cadence Allegro、Altium Designer、KiCad、PADS、ODB++ 和 Ansys HFSS 3D Layout** 格式导入。

拖入文件，显示关心的图层，点击查看连接。查看支持的文件无需注册账号、上传板文件，也无需安装原始 EDA 软件。

- **设计留在本地。** 板文件在浏览器内解析，不会上传；查看过程不会修改源文件。
- **用 WebGPU 探索细节。** 几何、板载文字和网络标注通过 GPU 绘制，在同一视图中查看走线、焊盘、过孔与铜皮。
- **顺着信号看设计。** 按网络名称或器件位号搜索并定位，支持单对象、整条走线、整网和器件高亮。
- **让密集布线清晰起来。** 按层或网络着色，单独显示指定图层，调整显示优先级、铜皮透明度、焊盘填充与各类标注。
- **随手检查对象属性。** 悬停查看摘要，点击后在检查器中查看属性；走线与网络选择可显示已布线长度。
- **把空间留给电路板。** 可收起的侧栏、紧凑的导航工具栏，以及英文 / 简体中文界面，让浏览更顺手。

> **项目处于早期开发阶段：** 格式覆盖和显示精度仍在完善。Pomelo 是只读查看器，不提供电路板编辑或 DRC，也不能替代原始 EDA 工具中的设计验证。各格式的当前范围见下表，具体导入诊断可在界面的「文件信息」中查看。

## 支持的格式

目前提供以下导入器。实际支持情况取决于文件版本及包含的对象类型；能够选择某种扩展名，并不代表完整兼容该格式。

| 来源                           | 文件                      | 当前范围与说明                                                                               |
| ------------------------------ | ------------------------- | -------------------------------------------------------------------------------------------- |
| **Cadence Allegro / 封装布局** | `.brd`、`.mcm`            | 走线、圆弧、焊盘、过孔、铜皮、板载文字及已适配的封装对象。二进制版本覆盖与显示规则仍在完善。 |
| **Altium Designer**            | `.PcbDoc`                 | 部分支持二进制文件，包含走线、焊盘、过孔、已保存铜区和文字；其余差异通过诊断提示。           |
| **KiCad**                      | `.kicad_pcb`              | 走线、焊盘、过孔、板框和已保存的铜区填充。暂不显示板级文字、封装图形及文字，不重新铺铜。     |
| **PADS**                       | `.pcb`                    | 部分支持二进制文件中的连接关系、走线、焊盘、过孔与铜皮。铜皮预览需核对，暂不显示图形与文字。 |
| **ODB++**                      | `.tgz`、`.tar.gz`、`.tar` | 支持单个板级 step，暂不支持拼板 step-repeat 和负片层。                                       |
| **HFSS 3D Layout**             | `.def`                    | 导入已适配的布局几何、图层、网络与 Padstack；部分器件变换仍待验证。                          |

`.brd` 导入器面向 **Cadence Allegro 二进制文件**，并非所有使用同名扩展名的 EDA 格式。

## 快速开始

### 环境要求

- 项目默认使用 **Bun** 管理依赖和运行开发脚本，仓库已包含 `bun.lock`。
- **Node.js 24.x**，供 JavaScript 工具链使用。也支持使用 npm 替代 Bun。
- 浏览器和显卡设备需要支持并启用 **WebGPU**，且硬件加速可用。目前没有 WebGL 回退方案。

### 本地运行

```sh
git clone https://github.com/HaiwenZhang/pomelo.git
cd pomelo
bun install --frozen-lockfile
bun run dev
```

打开 Vite 在终端中输出的本地地址，通常为 [http://127.0.0.1:5173](http://127.0.0.1:5173)。等待 GPU 就绪后：

1. 点击「打开文件」，或直接将支持的文件拖入工作台。
2. 在「图层」中单独显示关心的铜层，或将「配色」切换为「网络」，区分不同连接。
3. 搜索网络名称或器件位号，定位后通过悬停或点击检查细节。

如果使用 npm，克隆仓库后执行：

```sh
npm install
npm run dev
```

### 常用操作

| 操作         | 方式                             |
| ------------ | -------------------------------- |
| 缩放         | 鼠标滚轮或工具栏缩放控件         |
| 平移         | 在画布上拖动，或按住鼠标中键拖动 |
| 选择 / 检查  | 使用选择工具点击对象             |
| 切换选择工具 | `V`                              |
| 切换平移工具 | `H`                              |
| 整板适应视图 | `F2` 或「适应」按钮              |
| 清除选择     | `Esc`                            |
| 切换界面语言 | 右上角语言选择器                 |

如果 WebGPU 无法初始化，请检查硬件加速，以及当前浏览器、操作系统和显卡驱动是否支持 WebGPU。大文件的加载与交互也受可用内存和显存影响。

## 构建与开发

Pomelo 使用 **TypeScript、React、Vite、Tailwind CSS、Zustand 和 WebGPU / WGSL**。格式解析与几何处理独立于 React 界面，各导入器通过统一的板图模型连接渲染器。

```sh
bun run build       # 检查应用类型并构建到 dist/
bun run preview     # 在本地预览生产构建
bun run typecheck   # 检查应用与测试代码的类型
bun run test        # 运行 Vitest 测试套件
```

使用 npm 时，将上述命令中的 `bun run` 替换为 `npm run` 即可。Bun 用户请使用 `bun run test` 调用项目的 Vitest 测试脚本。

构建产物是静态网站，可将 `dist/` 部署在站点根路径并通过 HTTPS 访问，本地查看可使用 localhost；WebGPU 需要安全上下文。无需提供处理板文件的后端服务。

| 目录                               | 职责                         |
| ---------------------------------- | ---------------------------- |
| [`src/app`](src/app)               | 工作台组合与渲染器生命周期   |
| [`src/components`](src/components) | 图层、搜索、检查器和显示控制 |
| [`src/lib`](src/lib)               | 各格式导入器、交互与几何处理 |
| [`src/lib/board`](src/lib/board)   | 统一板图模型与显示逻辑       |
| [`src/lib/render`](src/lib/render) | WebGPU 渲染器与 WGSL 着色器  |
| [`src/i18n`](src/i18n)             | 英文与简体中文资源           |
| [`tests`](tests)                   | 解析、几何、渲染与交互测试   |

## 参与贡献

一起让更多电路板变得容易探索。欢迎参与格式兼容、渲染精度、大板性能、翻译与文档改进。

- **遇到导入或显示问题？** 请[提交 Issue](https://github.com/HaiwenZhang/pomelo/issues)，附上来源软件及文件版本、浏览器 / 系统 / GPU 信息、复现步骤与导入诊断。可公开的小型样例或原软件对照截图尤其有帮助，分享前请移除机密设计数据。
- **准备提交改进？** 解析器或几何变更请附上针对性的回归测试，视觉变更请提供截图；涉及已记录行为的调整，请同步更新中英文 README。
- **觉得 Pomelo 有帮助？** 欢迎点亮 Star，也可以分享给经常需要查看 PCB 的朋友。真实使用反馈能帮助项目确定下一步兼容性改进的优先级。
