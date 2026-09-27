<p align="center">
  <img src="images/pomelo-logo.svg" width="360" alt="Pomelo PCB Viewer logo">
</p>

<h1 align="center">Pomelo · PCB Viewer</h1>

<p align="center">
  <strong>See every connection, layer by layer.</strong><br>
  A WebGPU-powered PCB viewer for Cadence Allegro, Altium Designer, ODB++,<br>
  PADS, Ansys HFSS 3D Layout, and KiCad in your browser, with your files kept local.
</p>

<p align="center">
  English · <a href="REAME_cn.md">简体中文</a>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/rendering-WebGPU-58752c" alt="WebGPU rendering">
  <img src="https://img.shields.io/badge/built_with-TypeScript-3178c6" alt="Built with TypeScript">
  <img src="https://img.shields.io/badge/board_files-stay_local-58752c" alt="Board files stay local">
  <img src="https://img.shields.io/badge/status-early_development-d77d8a" alt="Early development">
</p>

<p align="center">
  <a href="#quick-start">Quick start</a> ·
  <a href="#supported-formats">Supported formats</a> ·
  <a href="https://github.com/HaiwenZhang/pomelo/issues">Report an issue</a> ·
  <a href="#contributing">Contribute</a>
</p>

![Pomelo PCB viewer displaying a multilayer board with net colors, layer controls, and object details](images/sceenshot01.png)

<p align="center"><em>From the whole board to an individual trace, via, or copper region.</em></p>

## Your board, a clearer view

Sometimes you just need to understand a board: find a component, follow a signal, or see what is happening on an inner layer. Pomelo brings that workflow to a focused browser workspace, with importers for **Cadence Allegro, Altium Designer, KiCad, PADS, ODB++, and Ansys HFSS 3D Layout**.

Drag in a file, isolate the layers you care about, and inspect the connections. No account, board upload, or installed EDA suite is needed to view supported files.

- **Keep your designs local.** Board files are parsed in your browser and are not uploaded. Viewing does not modify the source file.
- **Explore with WebGPU.** GPU-rendered geometry, board text, and net labels bring traces, pads, vias, and copper regions into the same interactive view.
- **Follow the signal.** Search by net name or component reference, jump to a result, and highlight an object, a connected trace, a whole net, or a component.
- **Make dense layouts readable.** Color by layer or net, isolate layers, adjust display priority, and control copper opacity, pad fills, and labels.
- **Inspect the details.** Hover for object information or use the inspector to examine properties; trace and net selections include routed length.
- **Make room for the board.** Collapsible panels, a compact navigation toolbar, and English / 简体中文 interfaces keep the workspace easy to explore.

> **Early development:** format coverage and visual fidelity are still evolving. Pomelo is a read-only viewer; it does not edit boards, run DRC, or replace verification in the source EDA tool. See the format notes below and the import diagnostics in **File information**.

## Supported formats

The following importers are available. Support depends on the file version and the objects it contains; an accepted extension does not imply complete format coverage.

| Source                                | Files                     | Current scope and notes                                                                                                                         |
| ------------------------------------- | ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| **Cadence Allegro / package layouts** | `.brd`, `.mcm`            | Traces, arcs, pads, vias, copper, board text, and supported package objects. Binary-version coverage and display rules are still being refined. |
| **Altium Designer**                   | `.PcbDoc`                 | Partial binary import, including routes, pads, vias, saved copper, and text. Remaining differences are reported in diagnostics.                 |
| **KiCad**                             | `.kicad_pcb`              | Routes, pads, vias, outlines, and saved zone fills. Board text and footprint graphics/text are not yet displayed; zones are not refilled.       |
| **PADS**                              | `.pcb`                    | Partial binary import of connectivity, routes, pads, vias, and copper. Check the copper preview; graphics and text are not yet displayed.       |
| **ODB++**                             | `.tgz`, `.tar.gz`, `.tar` | Single board-level step. Panel step-repeat and negative-polarity layers are not supported.                                                      |
| **HFSS 3D Layout**                    | `.def`                    | Imports supported layout geometry, layers, nets, and padstacks. Some component transforms still need validation.                                |

The `.brd` importer targets **Cadence Allegro binary files**, not every EDA format that uses the same extension.

## Quick start

### Requirements

- **Bun** is the default package manager and script runner for development. The repository includes `bun.lock`.
- **Node.js 24.x** for the JavaScript toolchain. npm is also supported as an alternative to Bun.
- A browser and graphics device with **WebGPU** enabled, with hardware acceleration available. There is currently no WebGL fallback.

### Run locally

```sh
git clone https://github.com/HaiwenZhang/pomelo.git
cd pomelo
bun install --frozen-lockfile
bun run dev
```

Open the local URL printed by Vite, usually [http://127.0.0.1:5173](http://127.0.0.1:5173). Once the GPU is ready:

1. Click **Open file** or drag a supported file into the workspace.
2. Use **Layers** to isolate a copper layer, or switch **Color mode** to **Net** to distinguish connections.
3. Search for a net or component reference, then hover or click to inspect it.

To use npm instead, run the following after cloning:

```sh
npm install
npm run dev
```

### Navigation at a glance

| Action                    | Control                                                 |
| ------------------------- | ------------------------------------------------------- |
| Zoom                      | Mouse wheel or toolbar zoom controls                    |
| Pan                       | Drag on the canvas or drag with the middle mouse button |
| Select / inspect          | Click an object in the selection tool                   |
| Switch to selection tool  | `V`                                                     |
| Switch to pan tool        | `H`                                                     |
| Fit the board to the view | `F2` or **Fit**                                         |
| Clear selection           | `Esc`                                                   |
| Change interface language | Language selector in the top-right corner               |

If WebGPU cannot initialize, check hardware acceleration and WebGPU availability for your browser, OS, and graphics driver. Large files also depend on available system and GPU memory.

## Build and development

Pomelo uses **TypeScript, React, Vite, Tailwind CSS, Zustand, and WebGPU / WGSL**. Format parsers and geometry code are separate from the React interface, with a shared board model feeding the renderer.

```sh
bun run build       # Type-check the app and produce dist/
bun run preview     # Preview the production build locally
bun run typecheck   # Check app and test types
bun run test        # Run the Vitest test suite
```

With npm, replace `bun run` with `npm run` in the commands above. Use `bun run test` to invoke the project's Vitest script.

The production output is a static site. Serve `dist/` from the site root over HTTPS, or use localhost for local viewing; WebGPU requires a secure context. No board-processing backend is needed.

| Location                           | Purpose                                              |
| ---------------------------------- | ---------------------------------------------------- |
| [`src/app`](src/app)               | Workspace composition and renderer lifecycle         |
| [`src/components`](src/components) | Layers, search, inspector, and display controls      |
| [`src/lib`](src/lib)               | Format-specific importers, interaction, and geometry |
| [`src/lib/board`](src/lib/board)   | Shared board model and display logic                 |
| [`src/lib/render`](src/lib/render) | WebGPU renderer and WGSL shaders                     |
| [`src/i18n`](src/i18n)             | English and Simplified Chinese resources             |
| [`tests`](tests)                   | Parser, geometry, rendering, and interaction tests   |

## Contributing

Help make more boards easier to explore. Contributions are welcome in format compatibility, rendering accuracy, large-board performance, translations, and documentation.

- **Found an import or display issue?** [Open an issue](https://github.com/HaiwenZhang/pomelo/issues) with the source tool and file version, browser / OS / GPU details, reproduction steps, and import diagnostics. A small, shareable sample or comparison screenshot is especially useful; remove confidential design data first.
- **Working on a fix?** Include a focused regression test for parser or geometry changes and screenshots for visual changes. Keep the English and Chinese READMEs in sync when changing documented behavior.
- **Finding Pomelo useful?** Star the repository and share it with someone who spends time exploring PCBs. Real-world feedback helps prioritize the next compatibility improvements.
