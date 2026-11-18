# V12 performance evidence: reference results

Status: the one full run of `node scripts/bench.mjs --browser --heap-mb 24576` on the machine below, then `node scripts/bench.mjs --merge-probes` (the compileScene probe was added
after the workloads had run; it re-runs only that probe and merges it into the same report), then `npm run report`; hand-reviewed. **Single machine, noisy single run, not a
qualification, not a conformance claim.** The tables between the `BEGIN GENERATED` markers are written by `npm run report` from `out/report.json` (git-ignored, produced by the run); nothing in them is
typed in. The prose around them is hand-written and quotes only figures that appear in those tables or in the report. No limit of any package was changed: every
"recommendation" below is a proposal with its evidence (changing a limit would change a frozen-draft contract and its oracle rows).

What is measured and how is in [README.md](README.md). Short version: seeded synthetic workloads (sparse, DAG, dense, hubs, hierarchy, groups; 100, 1,000, 10,000, 20,000 and
100,000 nodes) go through every Node stage of the committed packages under their default limits; a stage that a default limit refuses is recorded and measured again with
per-call limits raised (`*`); an optional Chromium pass measures the real DOM, Canvas 2D and WebGL2 paint of the same artifacts. Delta, timeline and downstream workloads do
not exist here (V9, V10 and V13 are blocked).

## Environment

<!-- BEGIN GENERATED environment -->
- CPU: Intel(R) Core(TM) i9-14900HX, 32 logical cores; RAM 47.7 GiB; OS Windows_NT 10.0.26300 x64
- Node v24.18.0 (V8 13.6.233.17-node.50); heap limit per worker 24576 MiB
- Chromium 159.0.8154.6 headless; GL profiles: `default-gl` = ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero) (0x0000C0DE)), SwiftShader driver) (software rendering); `angle-d3d11` = ANGLE (Intel, Intel(R) UHD Graphics (0x0000A788) Direct3D11 vs_5_0 ps_5_0, D3D11) (hardware GPU)
- Seed 20261118; sizes S = 100 nodes, M = 1000 nodes, L = 10000 nodes, N20000 = 20000 nodes, XL = 100000 nodes; shapes sparse, dag, dense, hubs, hierarchy, groups
- Repetitions (warmup + measured): S 3+15, M 2+9, L 1+5, N20000 1+5, XL 0+2; per-stage time budget 60 s; the run took 3158 s
<!-- END GENERATED environment -->

The full run took about 53 minutes, one child process per workload (heap limit 24,576 MiB). No workload crashed or was killed; two refusals are worth knowing about
beforehand (see "What the refusals say"): the default limits refuse every XL workload at the render-model step, and Core refuses to compile more than about 125,000 edges
in one relation.

## Medians per size

Times are medians in milliseconds of the measured repetitions (warmup excluded); `*` means the stage ran with raised per-call limits because the package default refused it;
a cell reading `refused ...` or `failed ...` is the outcome of the stage. Interaction columns (`hitTest`, `step key`) are per call.

<!-- BEGIN GENERATED medians -->
#### S (100 nodes): medians, ms (`*` = raised per-call limits)

| shape | scene build | layout bind | render model | SVG string | display list | Canvas stream | GL plan | tree | export | hitTest/call | step key/call | LOD view | stable update |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| sparse | 4.010 | 2.644 | 3.302 | 3.112 | 2.221 | 1.695 | 0.892 | 2.265 | 6.954 | 0.0697 | 0.0563 | 3.966 | 10.38 |
| dag | 3.981 | 2.551 | 3.028 | 2.966 | 1.919 | 1.588 | 0.836 | 2.215 | 6.554 | 0.0638 | 0.0461 | 3.649 | 9.146 |
| dense | 14.93 | 7.487 | 8.916 | 11.37 | 7.713 | 6.112 | 2.999 | 2.085 | 17.79 | 0.131 | 0.0974 | 10.18 | 25.36 |
| hubs | 3.449 | 2.635 | 3.247 | 3.291 | 2.162 | 1.746 | 0.776 | 2.414 | 7.408 | 0.0626 | 0.0514 | 3.722 | 9.634 |
| hierarchy | 2.161 | 1.994 | 2.235 | 2.000 | 1.175 | 1.079 | 0.591 | 1.649 | 2.804 | 0.0451 | 0.0436 | 3.481 | 6.916 |
| groups | 5.464 | 3.443 | 4.170 | 4.431 | 2.972 | 2.392 | 1.043 | 3.243 | 8.111 | 0.0776 | 0.0584 | 4.642 | 11.76 |

Output sizes and process peak RSS:

| shape | nodes | edges | scene | layout | SVG | display list | Canvas stream | GL buffers | tree | bundle | peak RSS |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| sparse | 100 | 200 | 29.51 KiB | 5.84 KiB | 151.04 KiB | 53.26 KiB | 73.31 KiB | 14.84 KiB | 116.61 KiB | 187.71 KiB | 137 MiB |
| dag | 100 | 182 | 26.59 KiB | 5.61 KiB | 138.58 KiB | 48.84 KiB | 68.45 KiB | 13.65 KiB | 106.03 KiB | 172.10 KiB | 136 MiB |
| dense | 100 | 800 | 99.96 KiB | 5.61 KiB | 514.53 KiB | 191.80 KiB | 258.61 KiB | 54.69 KiB | 70.19 KiB | 621.43 KiB | 205 MiB |
| hubs | 100 | 197 | 31.21 KiB | 5.85 KiB | 155.52 KiB | 54.71 KiB | 73.60 KiB | 14.64 KiB | 120.21 KiB | 193.91 KiB | 137 MiB |
| hierarchy | 100 | 99 | 19.10 KiB | 5.98 KiB | 95.57 KiB | 32.13 KiB | 44.15 KiB | 8.14 KiB | 73.00 KiB | 121.97 KiB | 136 MiB |
| groups | 100 | 301 | 41.59 KiB | 5.57 KiB | 213.33 KiB | 76.57 KiB | 104.64 KiB | 21.55 KiB | 164.06 KiB | 261.82 KiB | 137 MiB |

#### M (1000 nodes): medians, ms (`*` = raised per-call limits)

| shape | scene build | layout bind | render model | SVG string | display list | Canvas stream | GL plan | tree | export | hitTest/call | step key/call | LOD view | stable update |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| sparse | 37.21 | 23.51 | 28.75 | 26.88 | 18.24 | 16.12 | 8.509 | 2.986 | 45.51 | 0.321 | 0.215 | 32.10 | 85.15 |
| dag | 35.24 | 22.76 | 27.20 | 26.50 | 17.54 | 16.31 | 8.419 | 2.971 | 42.59 | 0.319 | 0.210 | 31.14 | 82.74 |
| dense | 143.9 | 71.34 | 87.34 | 90.10 | 53.47 | 50.69 | 28.34 | 7.173 | 138.8 | 0.949 | 0.681 | 94.98 | 248.1 |
| hubs | 30.36 | 23.77 | 28.34 | 28.06 | 18.48 | 17.20 | 8.213 | 3.041 | 46.16 | 0.343 | 0.218 | 32.15 | 84.13 |
| hierarchy | 17.75 | 16.25 | 19.10 | 13.09 | 6.312 | 10.99 | 4.792 | 2.364 | 23.26 | 0.231 | 0.143 | 29.86 | 59.41 |
| groups | 45.42 | 31.18 | 37.80 | 35.29 | 20.98 | 22.09 | 12.15 | 3.776 | 59.03 | 0.444 | 0.307 | 40.53 | 111.9 |

Output sizes and process peak RSS:

| shape | nodes | edges | scene | layout | SVG | display list | Canvas stream | GL buffers | tree | bundle | peak RSS |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| sparse | 1000 | 2000 | 298.66 KiB | 58.80 KiB | 1.47 MiB | 543.75 KiB | 737.29 KiB | 148.44 KiB | 49.82 KiB | 1.82 MiB | 231 MiB |
| dag | 1000 | 1923 | 280.87 KiB | 56.55 KiB | 1.40 MiB | 521.99 KiB | 718.35 KiB | 143.32 KiB | 48.55 KiB | 1.73 MiB | 231 MiB |
| dense | 1000 | 8000 | 1014.94 KiB | 56.33 KiB | 5.01 MiB | 1.89 MiB | 2.51 MiB | 546.88 KiB | 48.54 KiB | 6.06 MiB | 324 MiB |
| hubs | 1000 | 1997 | 318.85 KiB | 58.52 KiB | 1.53 MiB | 564.42 KiB | 748.29 KiB | 148.24 KiB | 49.77 KiB | 1.90 MiB | 232 MiB |
| hierarchy | 1000 | 999 | 193.80 KiB | 59.86 KiB | 935.90 KiB | 329.76 KiB | 445.40 KiB | 81.96 KiB | 51.40 KiB | 1.16 MiB | 214 MiB |
| groups | 1000 | 3014 | 421.93 KiB | 56.28 KiB | 2.08 MiB | 779.67 KiB | 1.03 MiB | 215.77 KiB | 48.40 KiB | 2.55 MiB | 245 MiB |

#### L (10000 nodes): medians, ms (`*` = raised per-call limits)

| shape | scene build | layout bind | render model | SVG string | display list | Canvas stream | GL plan | tree | export | hitTest/call | step key/call | LOD view | stable update |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| sparse | 379.9 | 239.7 | 284.8 | 287.2 | 177.4 | 153.9 | 113.8 | 29.60 | 405.6 | 2.739 | 1.890 | 320.1 | 841.9 |
| dag | 344.4 | 241.3 | 288.1 | 270.0 | 160.4 | 157.4 | 108.9 | 20.54 | 381.1 | 2.428 | 1.888 | 317.4 | 840.1 |
| dense | 1563.2 | 729.0 | 890.0* | 790.0 | 375.3 | 498.0 | 393.1 | 58.17 | 1160.1 | 7.767 | 6.826 | 962.6 | 2488.7 |
| hubs | 247.9 | 245.6 | 295.0 | 299.3 | 165.2 | 158.3 | 111.8 | 19.87 | 411.8 | 2.957 | 1.932 | 323.8 | 862.9 |
| hierarchy | 155.4 | 166.1 | 200.0 | 132.1 | 54.05 | 93.11 | 55.05 | 12.92 | 196.4 | 1.926 | 1.055 | 294.9 | 632.8 |
| groups | 405.1 | 328.2 | 390.5 | 286.3 | 133.1 | 214.7 | 150.5 | 27.07 | 450.6 | 3.720 | 2.710 | 397.2 | 1119.1 |

Output sizes and process peak RSS:

| shape | nodes | edges | scene | layout | SVG | display list | Canvas stream | GL buffers | tree | bundle | peak RSS |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| sparse | 10000 | 20000 | 2.97 MiB | 601.84 KiB | 14.88 MiB | 5.44 MiB | 7.28 MiB | 1.45 MiB | 50.02 KiB | 18.45 MiB | 634 MiB |
| dag | 10000 | 19872 | 2.87 MiB | 585.02 KiB | 14.62 MiB | 5.37 MiB | 7.28 MiB | 1.44 MiB | 48.49 KiB | 18.06 MiB | 622 MiB |
| dense | 10000 | 80000 | 10.39 MiB | 580.73 KiB | 51.24 MiB | 19.50 MiB | 25.28 MiB | 5.34 MiB | 48.90 KiB | 62.19 MiB | 1633 MiB |
| hubs | 10000 | 19997 | 3.17 MiB | 604.57 KiB | 15.48 MiB | 5.65 MiB | 7.40 MiB | 1.45 MiB | 49.44 KiB | 19.24 MiB | 656 MiB |
| hierarchy | 10000 | 9999 | 1.93 MiB | 616.41 KiB | 9.32 MiB | 3.33 MiB | 4.43 MiB | 626.62 KiB | 51.60 KiB | 11.86 MiB | 465 MiB |
| groups | 10000 | 30105 | 4.19 MiB | 580.48 KiB | 21.00 MiB | 7.78 MiB | 10.34 MiB | 2.10 MiB | 48.92 KiB | 25.76 MiB | 824 MiB |

#### N20000 (20000 nodes): medians, ms (`*` = raised per-call limits)

| shape | scene build | layout bind | render model | SVG string | display list | Canvas stream | GL plan | tree | export | hitTest/call | step key/call | LOD view | stable update |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| sparse | 801.5 | 478.2 | 584.5 | 583.6 | 342.6 | 308.7 | 223.8 | 40.79 | 804.3 | 6.230 | 3.942 | 638.4 | 1719.0* |
| dag | 732.6 | 483.2 | 588.7 | 547.5 | 304.6 | 296.2 | 207.6 | 40.28 | 758.7 | 4.887 | 4.103 | 624.9 | 1701.4* |
| dense | 3294.3 | 1509.8 | 1818.8* | 1570.1* | 751.2 | 955.8 | 745.8 | 137.9 | refused BYTES_LIMIT | 16.44 | 14.70 | 1960.5* | 5074.5* |
| hubs | 501.5 | 484.1 | 594.3 | 596.1 | 319.8 | 309.4 | 238.9 | 41.97 | 827.7 | 5.978 | 3.953 | 625.3 | 1727.8* |
| hierarchy | 283.1 | 324.7 | 388.7 | 246.6 | 104.4 | 192.0 | 117.5 | 32.91 | 400.1 | 3.894 | 2.235 | 562.0 | 1174.0* |
| groups | 800.7 | 648.9 | 797.0* | 583.1 | 255.7 | 427.1 | 309.6 | 49.01 | 906.4 | 7.050 | 5.815 | 788.8 | 2288.7* |

Output sizes and process peak RSS:

| shape | nodes | edges | scene | layout | SVG | display list | Canvas stream | GL buffers | tree | bundle | peak RSS |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| sparse | 20000 | 40000 | 6.01 MiB | 1.19 MiB | 29.95 MiB | 10.97 MiB | 14.59 MiB | 2.90 MiB | 50.02 KiB | 37.15 MiB | 998 MiB |
| dag | 20000 | 39719 | 5.79 MiB | 1.16 MiB | 29.39 MiB | 10.81 MiB | 14.59 MiB | 2.88 MiB | 48.49 KiB | 36.34 MiB | 984 MiB |
| dense | 20000 | 160000 | 20.96 MiB | 1.15 MiB | 103.01 MiB | 36.84 MiB | 47.20 MiB | 10.68 MiB | 49.10 KiB | refused BYTES_LIMIT | 2663 MiB |
| hubs | 20000 | 39997 | 6.39 MiB | 1.20 MiB | 31.13 MiB | 11.37 MiB | 14.83 MiB | 2.90 MiB | 49.32 KiB | 38.72 MiB | 1043 MiB |
| hierarchy | 20000 | 19999 | 3.89 MiB | 1.22 MiB | 18.70 MiB | 6.78 MiB | 8.96 MiB | 622.09 KiB | 51.60 KiB | 23.81 MiB | 746 MiB |
| groups | 20000 | 60200 | 8.69 MiB | 1.15 MiB | 42.94 MiB | 15.92 MiB | 20.84 MiB | 4.21 MiB | 48.92 KiB | 52.78 MiB | 1337 MiB |

#### XL (100000 nodes): medians, ms (`*` = raised per-call limits)

| shape | scene build | layout bind | render model | SVG string | display list | Canvas stream | GL plan | tree | export | hitTest/call | step key/call | LOD view | stable update |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| sparse | 4644.1 | 2636.0 | 3124.1* | 2957.7* | 1747.3 | 1432.1 | 1106.1 | 297.5 | refused BYTES_LIMIT | 34.16 | 23.08 | 3415.5* | 9153.2* |
| dag | 3783.5 | 2550.7 | 3051.2* | 2864.6* | 1656.4 | 1400.2 | 1022.6 | 268.7 | refused BYTES_LIMIT | 27.42 | 21.04 | 3310.3* | 9023.8* |
| dense | 18431 | 8148.1 | 9503.8* | refused BYTES_LIMIT | 3611.0 | 4458.4 | 3799.7 | 1046.0 | refused BYTES_LIMIT | 86.13 | 81.05 | skipped | 28015* |
| hubs | 2620.0 | 2586.9 | 3150.6* | 3011.2* | 1632.8 | 1341.3 | 1109.8 | 316.6 | refused BYTES_LIMIT | 32.86 | 21.08 | 3458.5* | 9259.5* |
| hierarchy | 1452.1 | 1685.0 | 2043.9* | 1285.4* | 451.8 | 878.8 | 613.6 | 151.7 | refused BYTES_LIMIT | 20.94 | 11.32 | 2960.5* | 6189.1* |
| groups | 4081.6 | 3361.3 | 4049.1* | 2881.7* | 1147.6 | 1865.7 | 1408.7 | 366.4 | refused BYTES_LIMIT | 35.47 | 31.61 | 4140.2* | 11893* |

Output sizes and process peak RSS:

| shape | nodes | edges | scene | layout | SVG | display list | Canvas stream | GL buffers | tree | bundle | peak RSS |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| sparse | 100000 | 200000 | 30.55 MiB | 6.10 MiB | 151.22 MiB | 52.89 MiB | 69.26 MiB | 14.50 MiB | 50.22 KiB | refused BYTES_LIMIT | 3862 MiB |
| dag | 100000 | 199308 | 30.07 MiB | 5.90 MiB | 150.38 MiB | 51.43 MiB | 67.83 MiB | 14.45 MiB | 48.69 KiB | refused BYTES_LIMIT | 3761 MiB |
| dense | 100000 | 800000 | 106.01 MiB | 5.88 MiB | refused BYTES_LIMIT | 169.42 MiB | 213.38 MiB | 53.41 MiB | 49.11 KiB | refused BYTES_LIMIT | 9094 MiB |
| hubs | 100000 | 199997 | 33.03 MiB | 6.08 MiB | 158.80 MiB | 52.13 MiB | 66.29 MiB | 14.50 MiB | 49.46 KiB | refused BYTES_LIMIT | 4013 MiB |
| hierarchy | 100000 | 99999 | 20.06 MiB | 6.29 MiB | 96.11 MiB | 33.54 MiB | 43.33 MiB | 617.37 KiB | 51.80 KiB | refused BYTES_LIMIT | 2544 MiB |
| groups | 100000 | 301021 | 43.82 MiB | 5.89 MiB | 215.70 MiB | 71.06 MiB | 91.35 MiB | 21.05 MiB | 49.13 KiB | refused BYTES_LIMIT | 4681 MiB |

#### Refusals and failures

- `layout-force`: refused RESOURCE_LIMIT/NODE_LIMIT (no raised run) at L (all shapes); N20000 (all shapes); XL (all shapes)
- `stable-cold`: refused RESOURCE_LIMIT/NODE_LIMIT (no raised run) at L (all shapes); N20000 (sparse, dag, hubs, hierarchy, groups)
- `render-model`: default refused RESOURCE_LIMIT/BYTES_LIMIT; measured with raised per-call limits at L (dense); N20000 (dense, groups); XL (all shapes)
- `companion-tree-all`: default refused RESOURCE_LIMIT/BYTES_LIMIT; measured with raised per-call limits at L (dense, groups); N20000 (sparse, dag, dense, hubs, groups)
- `export-verify`: refused RESOURCE_LIMIT/BYTES_LIMIT (no raised run) at L (dense); N20000 (groups)
- `headless`: default refused RESOURCE_LIMIT/BYTES_LIMIT; measured with raised per-call limits at L (dense); N20000 (dense, groups); XL (sparse, dag, hubs, hierarchy)
- `stable-diff`: default refused RESOURCE_LIMIT/NODE_LIMIT; measured with raised per-call limits at N20000 (sparse, dag, hubs, hierarchy, groups)
- `stable-update`: default refused RESOURCE_LIMIT/NODE_LIMIT; measured with raised per-call limits at N20000 (sparse, dag, hubs, hierarchy, groups)
- `svg`: default refused RESOURCE_LIMIT/BYTES_LIMIT; measured with raised per-call limits at N20000 (dense); XL (sparse, dag, hubs, hierarchy, groups)
- `svg-read`: default refused RESOURCE_LIMIT/BYTES_LIMIT; measured with raised per-call limits at N20000 (dense); XL (sparse, dag, hubs, hierarchy, groups)
- `export-bundle`: default refused RESOURCE_LIMIT/BYTES_LIMIT; still refused when raised (RESOURCE_LIMIT/BYTES_LIMIT) at N20000 (dense); XL (all shapes)
- `lod-view-flat`: default refused RESOURCE_LIMIT/EDGE_LIMIT; measured with raised per-call limits at N20000 (dense)
- `lod-suggest`: default refused RESOURCE_LIMIT/EDGE_LIMIT; measured with raised per-call limits at N20000 (dense)
- `lod-view-collapsed`: default refused RESOURCE_LIMIT/EDGE_LIMIT; measured with raised per-call limits at N20000 (dense)
- `stable-diff`: default refused RESOURCE_LIMIT/INPUT_BYTES; measured with raised per-call limits at N20000 (dense); XL (all shapes)
- `stable-update`: default refused RESOURCE_LIMIT/INPUT_BYTES; measured with raised per-call limits at N20000 (dense); XL (all shapes)
- `stable-cold`: refused RESOURCE_LIMIT/INPUT_BYTES (no raised run) at N20000 (dense); XL (all shapes)
- `lod-view-flat`: default refused RESOURCE_LIMIT/NODE_LIMIT; measured with raised per-call limits at XL (sparse, dag, hubs, hierarchy, groups)
- `lod-suggest`: default refused RESOURCE_LIMIT/NODE_LIMIT; measured with raised per-call limits at XL (sparse, dag, hubs, hierarchy, groups)
- `lod-view-collapsed`: default refused RESOURCE_LIMIT/NODE_LIMIT; measured with raised per-call limits at XL (sparse, dag, hubs, hierarchy, groups)
- `svg`: default refused RESOURCE_LIMIT/BYTES_LIMIT; still refused when raised (RESOURCE_LIMIT/BYTES_LIMIT) at XL (dense)
- `svg-stream`: default refused RESOURCE_LIMIT/BYTES_LIMIT; measured with raised per-call limits at XL (dense)
- `display-list-serialize`: default refused RESOURCE_LIMIT/BYTES_LIMIT; measured with raised per-call limits at XL (dense, groups)
- `display-list-parse`: default refused RESOURCE_LIMIT/BYTES_LIMIT; measured with raised per-call limits at XL (dense, groups)
- `headless`: default refused RESOURCE_LIMIT/BYTES_LIMIT; still refused when raised (RESOURCE_LIMIT/BYTES_LIMIT) at XL (dense, groups)
- `lod-view-flat`: default refused RESOURCE_LIMIT/NODE_LIMIT; still refused when raised (RESOURCE_LIMIT/EDGE_LIMIT) at XL (dense)
- `lod-suggest`: default refused RESOURCE_LIMIT/NODE_LIMIT; still refused when raised (RESOURCE_LIMIT/EDGE_LIMIT) at XL (dense)
<!-- END GENERATED medians -->

### Reading the tables

- **Everything is linear in elements, the constant is large.** Building the scene from text, verifying and binding the layout, building the model, the SVG string, the display
  list and the GL plan all grow about tenfold per tenfold of nodes. The slowest shape is always `dense` (eight edges per node). From L (10,000 nodes) up, a single stage is
  already hundreds of milliseconds to seconds; at XL (100,000 nodes) the scene build alone is seconds. Nothing is faster than O(N + E), and none of it is incremental: every
  commit rebuilds.
- **Per-event costs cross a frame between 20,000 and 100,000 nodes.** `hitTest`, `reduce` and keyboard navigation are O(N + E): the worst shape stays at or under one display frame
  (16.7 ms) up to the 20,000-node tier and is over it at 100,000 nodes. Pointer-move and wheel steps of the gesture machine cost microseconds at every size.
- **The companion tree is windowed but not free.** Its cost is O(N + E) because the accessible model is derived over every element: the windowed tree, worst shape per size, takes
  3.2 ms at S, 7.2 ms at M, 58.2 ms at L, 137.9 ms at the 20,000-node tier and 1,046 ms at XL.
- **Memory is not the constraint it looked like.** The XL workloads peak at 2,544 MiB (hierarchy) to 4,681 MiB (groups) of resident memory; the dense XL workload (800,000 edges) peaks at
  9,094 MiB. One XL workload takes between 104 s (hierarchy) and 439 s (dense) from source to every stage.
- **FIXED layouts are cheap, FORCE is a budgeted exception.** `computeFixedLayout` costs about as much as one scene verification (it verifies the scene, then builds the layout). The real FORCE family only ran inside its documented budget
  (see below); above 2,000 nodes it refuses by design (`NODE_LIMIT`), which is the evidence the PlanMap asks for, not a failure.
- **Noise is real.** Same DOM work, two runs of the same workload in the two Chromium profiles, differ by large factors in places (for example `hierarchy/N20000`
  SVG insertion, in the browser tables below). Treat any single cell as plus or minus tens of percent, and a single outlier as noise.

## What the refusals say

The "Refusals and failures" lists in the tables above are complete. In summary:

- **`render-model` refuses at XL for every shape** with `BYTES_LIMIT` (the 8 MiB scene cap binds before the 20,000-node cap) and at L and the 20,000 tier for the edge-heavy
  shapes. At the 20,000-node tier the `sparse` workload (exactly 20,000 nodes and 40,000 edges), `dag`, `hubs` and `hierarchy` are accepted by the default limits; `dense` and `groups` are not.
- **`svg` refuses at XL** (`maxSvgBytes`, 64 MiB), `display-list-serialize` for the XL workloads whose list exceeds 64 MiB. `export-bundle` is refused even with raised limits where its
  SVG exceeds the default `maxSvgBytes`, because `ExportOptions` cannot raise it; `export-verify` rebuilds the model with default limits and refuses sooner still.
- **LOD and stable layout** refuse by their own budgets: `NODE_LIMIT` above 20,000 nodes, `INPUT_BYTES` above 16 MiB of scene; `lod-view-flat` and `lod-suggest` on the 800,000-edge workload
  stay refused even at the hard limits (`EDGE_LIMIT`, hard cap 500,000). `stable-update` at exactly 20,000 nodes refuses because the second version has 1 % more nodes than the cap.
- **FORCE** (`layout-force`, `stable-cold`) refuses everywhere above 2,000 nodes with `NODE_LIMIT` (or `INPUT_BYTES` for stable cold start at XL).

## FORCE budget probe

The real FORCE family, only inside its documented budget (2,000 nodes, 100,000,000 work units), plus the two documented refusals just above it.

<!-- BEGIN GENERATED force-probe -->
| nodes | edges | iterations | estimated work units | outcome | median ms | ms per million units |
| --- | --- | --- | --- | --- | --- | --- |
| 250 | 500 | 100 | 3612900 | ok | 65.73 | 18.19 |
| 500 | 1000 | 100 | 13475400 | ok | 200.3 | 14.86 |
| 1000 | 2000 | 50 | 26275200 | ok | 423.5 | 16.12 |
| 1000 | 2000 | 100 | 51950400 | ok | 832.5 | 16.02 |
| 1000 | 2000 | 170 | 87895680 | ok | 1330.5 | 15.14 |
| 1500 | 3000 | 60 | 69615240 | ok | 1018.6 | 14.63 |
| 2000 | 4000 | 24 | 49848096 | ok | 840.0 | 16.85 |
| 2000 | 4000 | 50 | 102550200 | refused WORK_LIMIT | - | - |
| 2001 | 4002 | 10 | 21490780 | refused NODE_LIMIT | - | - |
<!-- END GENERATED force-probe -->

Wall time tracks the documented work formula closely: a fairly constant cost per million work units across 250 to 2,000 nodes. The whole budget costs on the order of seconds.

## compileScene edge-list probe

Found while building the workloads: Core's edge list overflows the call stack when one relation holds enough edges. The first attempt at the dense and large workloads put
every edge in one relation and failed with a `RangeError` (not a contract error); the generators now split edges over relations at 60,000 per relation. The probe puts all edges of a
20,000-node scene in one relation:

<!-- BEGIN GENERATED compile-probe -->
| nodes | edges in one relation | outcome | ms |
| --- | --- | --- | --- |
| 20000 | 60000 | ok | 713.4 |
| 20000 | 100000 | ok | 1050.1 |
| 20000 | 120000 | ok | 1181.5 |
| 20000 | 125000 | failed RangeError: Maximum call stack size exceeded | - |
| 20000 | 130000 | failed RangeError: Maximum call stack size exceeded | - |
| 20000 | 160000 | failed RangeError: Maximum call stack size exceeded | - |
<!-- END GENERATED compile-probe -->

## Browser mode

Real paint in headless Chromium for every workload up to the 20,000-node tier (XL was not drawn in a browser). Two GL stacks, labelled by the string the browser reports:
the default headless GL is **software rendering (SwiftShader)**; the second profile is this machine's integrated GPU through ANGLE on Direct3D 11 (**hardware**). One machine, one
engine. SVG, Canvas replay and WebGL draw are paint costs only; the Node-side build of the artifact is in the tables above.

<!-- BEGIN GENERATED browser -->
Chromium 159.0.8154.6 (headless, 1280x800, device pixel ratio 1), 10 repetitions after 2 warmup. One machine, one engine, one run: figures are noisy and not a qualification. Headless Chromium paints into an offscreen surface; frame times include the compositor's vsync wait (about 16.7 ms floor).

### Browser profile `default-gl`: GL ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero) (0x0000C0DE)), SwiftShader driver) (SOFTWARE rendering)

| workload | elements | SVG insert+layout | SVG to frame | SVG DOM nodes | Canvas replay (JS) | Canvas replay+flush | WebGL issue (JS) | WebGL draw+sync | WebGL label layer |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| sparse/S | 300 | 5.050 | 33.35 | 1609 | 0.500 | 4.100 | 0.100 | 8.300 | 0.200 |
| dag/S | 282 | 4.300 | 33.00 | 1501 | 0.300 | 3.000 | 0.1000 | 7.500 | 0.200 |
| dense/S | 900 | 15.05 | 33.90 | 5209 | 1.050 | 8.100 | 0.0000 | 19.05 | 0.500 |
| hubs/S | 297 | 4.750 | 33.60 | 1591 | 0.400 | 3.000 | 0.1000 | 7.350 | 0.200 |
| hierarchy/S | 199 | 3.150 | 33.10 | 1003 | 0.300 | 1.800 | 0.0500 | 5.450 | 0.150 |
| groups/S | 401 | 6.350 | 33.10 | 2215 | 0.500 | 3.200 | 0.0000 | 8.900 | 0.300 |
| sparse/M | 3000 | 47.60 | 66.60 | 16009 | 3.050 | 31.00 | 0.0500 | 56.55 | 1.400 |
| dag/M | 2923 | 40.80 | 67.00 | 15547 | 2.900 | 22.50 | 0.1000 | 47.00 | 1.300 |
| dense/M | 9000 | 143.8 | 204.4 | 52009 | 51.80 | 54.00 | 0.100 | 149.9 | 3.800 |
| hubs/M | 2997 | 43.25 | 66.20 | 15991 | 2.900 | 21.90 | 0.1000 | 46.30 | 1.300 |
| hierarchy/M | 1999 | 26.05 | 49.00 | 10003 | 2.350 | 12.20 | 0.1000 | 31.40 | 1.050 |
| groups/M | 4014 | 58.30 | 83.30 | 22093 | 4.300 | 21.15 | 0.0000 | 62.30 | 1.700 |
| sparse/L | 30000 | 480.2 | 629.8 | 160009 | 295.5 | 302.0 | 0.200 | 568.9 | 28.10 |
| dag/L | 29872 | 481.8 | 635.2 | 159241 | 205.8 | 212.0 | 0.200 | 533.7 | 31.70 |
| dense/L | 90000 | 1867.9 | 2441.8 | 520009 | 482.8 | 499.4 | 0.500 | 1740.4 | 125.7 |
| hubs/L | 29997 | 497.8 | 658.9 | 159991 | 199.8 | 209.6 | 0.200 | 528.3 | 38.10 |
| hierarchy/L | 19999 | 300.3 | 372.6 | 100003 | 62.80 | 66.95 | 0.150 | 228.9 | 9.000 |
| groups/L | 40105 | 683.5 | 926.1 | 220639 | 179.4 | 191.4 | 0.250 | 685.3 | 37.90 |
| sparse/N20000 | 60000 | 1135.8 | 1500.9 | 320009 | 604.7 | 617.8 | 0.400 | 1359.4 | 87.70 |
| dag/N20000 | 59719 | 1009.0 | 1308.6 | 318323 | 408.9 | 421.6 | 0.300 | 1142.5 | 73.55 |
| dense/N20000 | 180000 | 4839.9 | 6048.6 | 1040009 | 889.9 | 898.4 | 0.800 | 3448.4 | 166.1 |
| hubs/N20000 | 59997 | 1036.7 | 1385.6 | 319991 | 403.7 | 424.5 | 0.350 | 1188.8 | 79.50 |
| hierarchy/N20000 | 39999 | 1914.6 | 2228.6 | 200003 | 190.1 | 200.0 | 0.300 | 398.6 | 34.60 |
| groups/N20000 | 80200 | 4424.7 | 5931.9 | 441209 | 1002.2 | 1023.5 | 1.100 | 2274.3 | 238.8 |

### Browser profile `angle-d3d11`: GL ANGLE (Intel, Intel(R) UHD Graphics (0x0000A788) Direct3D11 vs_5_0 ps_5_0, D3D11) (hardware GPU)

| workload | elements | SVG insert+layout | SVG to frame | SVG DOM nodes | Canvas replay (JS) | Canvas replay+flush | WebGL issue (JS) | WebGL draw+sync | WebGL label layer |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| sparse/S | 300 | 5.000 | 32.95 | 1609 | 0.500 | 5.400 | 0.100 | 6.900 | 0.200 |
| dag/S | 282 | 4.550 | 33.15 | 1501 | 0.350 | 3.600 | 0.1000 | 4.700 | 0.200 |
| dense/S | 900 | 15.80 | 33.45 | 5209 | 1.100 | 9.150 | 0.1000 | 12.20 | 0.500 |
| hubs/S | 297 | 4.650 | 33.05 | 1591 | 0.400 | 3.700 | 0.100 | 5.000 | 0.200 |
| hierarchy/S | 199 | 3.000 | 33.00 | 1003 | 0.300 | 2.300 | 0.100 | 2.900 | 0.200 |
| groups/S | 401 | 6.350 | 33.20 | 2215 | 0.500 | 3.750 | 0.100 | 5.200 | 0.200 |
| sparse/M | 3000 | 50.70 | 70.80 | 16009 | 3.050 | 32.25 | 0.100 | 41.10 | 1.350 |
| dag/M | 2923 | 42.00 | 67.30 | 15547 | 2.900 | 23.35 | 0.100 | 37.85 | 1.300 |
| dense/M | 9000 | 164.1 | 224.9 | 52009 | 52.95 | 54.95 | 0.100 | 46.15 | 3.650 |
| hubs/M | 2997 | 45.55 | 68.75 | 15991 | 3.150 | 22.95 | 0.100 | 23.10 | 1.500 |
| hierarchy/M | 1999 | 26.55 | 49.80 | 10003 | 2.350 | 12.60 | 0.100 | 8.700 | 1.000 |
| groups/M | 4014 | 60.05 | 82.85 | 22093 | 4.400 | 22.05 | 0.100 | 14.60 | 1.850 |
| sparse/L | 30000 | 501.8 | 665.1 | 160009 | 297.8 | 305.1 | 0.300 | 145.4 | 29.05 |
| dag/L | 29872 | 486.2 | 643.8 | 159241 | 206.9 | 213.2 | 0.200 | 94.30 | 29.05 |
| dense/L | 90000 | 1824.1 | 2370.8 | 520009 | 487.0 | 503.1 | 0.500 | 191.6 | 175.1 |
| hubs/L | 29997 | 512.2 | 683.8 | 159991 | 195.8 | 205.8 | 0.250 | 74.70 | 32.00 |
| hierarchy/L | 19999 | 299.7 | 372.2 | 100003 | 62.20 | 66.45 | 0.100 | 35.05 | 7.500 |
| groups/L | 40105 | 703.4 | 929.4 | 220639 | 178.4 | 190.7 | 0.300 | 67.35 | 33.70 |
| sparse/N20000 | 60000 | 1054.8 | 1393.8 | 320009 | 602.6 | 616.0 | 0.350 | 177.8 | 57.65 |
| dag/N20000 | 59719 | 1047.9 | 1408.0 | 318323 | 415.1 | 427.9 | 0.250 | 123.2 | 56.95 |
| dense/N20000 | 180000 | 4868.5 | 6019.4 | 1040009 | 915.9 | 924.9 | 0.950 | 198.7 | 283.3 |
| hubs/N20000 | 59997 | 1096.0 | 1459.6 | 319991 | 462.7 | 483.7 | 0.300 | 111.1 | 73.35 |
| hierarchy/N20000 | 39999 | 631.0 | 733.5 | 200003 | 75.15 | 79.50 | 0.100 | 39.15 | 14.55 |
| groups/N20000 | 80200 | 1813.6 | 2321.7 | 441209 | 389.9 | 397.9 | 0.400 | 110.1 | 153.9 |
<!-- END GENERATED browser -->

### Reading the browser tables

- SVG insertion (DOM parse, style, layout) grows with the element count and is about the same in both profiles, as expected for CPU work.
- Canvas 2D replay plus flush costs between about a tenth and about the same as the SVG insertion of the same workload (ratio 0.10 to 0.81 in the default profile, 0.13 to 1.08 in the second).
- WebGL is the slowest paint on software GL at every size (a lower bound for a machine without a GPU). On the integrated GPU it is slower than Canvas below about 10,000 elements and two
  to five times faster above 20,000 elements (30,000 to 180,000 elements: 145 to 199 ms against 305 to 925 ms for Canvas on the largest workloads). The label layer (a 2D canvas over the GL
  one) is a visible share of the WebGL total at large sizes. The WebGL plan is rebuilt per commit like every other artifact.
- Frame times in headless Chromium include the compositor's wait for the next frame (about 16.7 ms), so differences below that are not visible in `to frame` figures.

## Limits and constants: evidence and recommendations

Every limit or constant that designs 27 to 32 name as PROVISIONAL or UNMEASURED has a row, plus one limit found here (compileScene edges per relation). The rule behind each
recommendation is in its cell. Reference budgets used by the rules (assumptions of this report, not requirements): one frame 16.7 ms, a responsive command 100 ms, a visible wait
1,000 ms.

<!-- BEGIN GENERATED limits -->
| limit or constant | package | value | design | measured evidence | recommendation | proposal (no limit changed) |
| --- | --- | --- | --- | --- | --- | --- |
| maxNodes / maxEdges (RenderLimits) | renderer-core | 20,000 / 40,000 | 27 s15 | default refusals: RESOURCE_LIMIT/BYTES_LIMIT at L, N20000, XL. Largest accepted under default limits: sparse/N20000 (20,000 nodes, 40,000 edges) in 584.5 ms. buildRenderModel worst shape per size: S 8.916 ms, M 87.34 ms, L 890.0 ms*, N20000 1818.8 ms*, XL 9503.8 ms*. hitTest per call: S 0.131 ms, M 0.949 ms, L 7.767 ms, N20000 16.44 ms, XL 86.13 ms. | keep | Keep as safety caps: the whole pipeline ran to 100,000 nodes (raised per-call limits). Interactivity is the binding concern, not memory: the per-call hitTest worst shape is at or under 16.70 ms up to 20,000 nodes, over it from 100,000 nodes; a host that needs one-frame events above that should hit-test in a worker. |
| maxSceneBytes / maxLayoutBytes | renderer-core | 8 MiB / 4 MiB | 27 s15 | scene bytes per element (node or edge): 97 to 124; the 20,000 + 40,000 element caps would need up to 7.07 MiB against 8 MiB. Layout bytes per node up to 66: 1.26 MiB at 20,000 nodes against 4 MiB. Default refusals: RESOURCE_LIMIT/BYTES_LIMIT at L, N20000, XL. | keep | Keep: the byte caps are consistent with the node and edge caps. |
| maxTotalLabelUnits, maxIntentTargets, maxStateBytes | renderer-core | 4,194,304 / 60,000 / 8 MiB | 27 s15 | a hidden set of 100 nodes (sparse/XL) adds 31 bytes per target to the serialized state (338 B to 3.34 KiB); 8 MiB holds about 271,827 targets, against maxIntentTargets 60,000 (= 20,000 nodes + 40,000 edges). Drawn label units at the largest size: 3499100 (the model's own label total is not a separate stage). | keep | Keep: a state holding the largest permitted target set fits in maxStateBytes. |
| NODE_HIT_RADIUS_PX 12, EDGE_HIT_TOLERANCE_PX 6, ZOOM_MIN/MAX/DEFAULT, FIT_PADDING_PX 32, VIEWPORT_MAX_PX 16,384 | renderer-core | constants | 27 s3 | These are ergonomic and geometric choices, not performance quantities. What the benchmark can say: hitTest costs S 0.131 ms, M 0.949 ms, L 7.767 ms, N20000 16.44 ms, XL 86.13 ms per call (worst shape) with the 12 px / 6 px radii; the pruning margins (13 px / 7 px) keep the cost O(N + E) whatever the radii. | needs more data | No change from performance evidence. Decide the radii and zoom range with a usability pass on real devices (V11 revisit); a larger radius changes no cost class. |
| FORCE budget maxNodes / maxWork; per-relation edge cap; key length | layout-core | 2,000 / 100,000,000; 50,000; 1,024 units | IGL-1 s7.3 (code) | 7 points inside the budget: 14.63 to 18.19 ms per million work units; the largest (1,000 nodes x 170 iterations, 87,895,680 units) took 1330.5 ms; at the mean rate the full 100,000,000 units would take about 1597.4 ms. Refused as documented: 2000 nodes x 50: refused WORK_LIMIT; 2001 nodes x 10: refused NODE_LIMIT. At L and XL the default refuses with NODE_LIMIT (RESOURCE_LIMIT/NODE_LIMIT at L, N20000, XL). | keep | Keep: the work model tracks wall time within a factor 1.2 across the points and the whole budget costs seconds, not minutes; FORCE above 2,000 nodes stays refused (use FIXED, V3 or a layered layout for large graphs). |
| edges per relation in compileScene (no limit in scene-core); layout-core guards FORCE at MAX_PHYSICAL_EDGES_PER_RELATION 50,000 | scene-core (through Core 1.4.1) | none; 50,000 for FORCE | IGL-1 s7.1; not in 27-32 | compileScene with every edge in ONE relation (20,000 nodes): compiled up to 120,000 edges; failed from 125,000 edges with RangeError: Maximum call stack size exceeded. A stack overflow (a RangeError), not a RESOURCE_LIMIT: no code of the contract is returned. The generators of this package split relations at 60,000 edges for that reason. | needs more data | Proposal, not applied (IGS/1 behaviour is frozen): a guard that refuses with RESOURCE_LIMIT below the overflow (the measured limit is between 120,000 and 125,000 edges on this Node and stack size, and depends on both), as layout-core already does for FORCE at 50,000. One engine and one stack size were measured; the threshold itself needs the other supported Node version and a second machine. |
| DEFAULT_STABLE_BUDGET (maxNodes, maxEdges, bytes, maxWork) | stable-layout-core | 20,000 / 100,000 / 16 MiB / 64 MiB report / 50,000,000 work | 28 s12 | incremental update (+1 % nodes): S 25.36 ms, M 248.1 ms, L 2488.7 ms, N20000 5074.5 ms*, XL 28015 ms*; default refusals: RESOURCE_LIMIT/NODE_LIMIT at N20000; RESOURCE_LIMIT/INPUT_BYTES at N20000, XL; largest accepted under default budget: sparse/L in 841.9 ms. Meter work vs wall time: 4450 to 6705 ms per million meter units, so the default maxWork of 50,000,000 would correspond to about 335244 ms of wall time; no run was refused by maxWork. The meter counts the placement model only, not verification or JSON work, so it is far from a clock. A scene at exactly 20,000 nodes plus the 1 % added nodes exceeds maxNodes: the refusal at N20000 is that boundary. | keep | Keep the node and edge caps; the default refused RESOURCE_LIMIT/NODE_LIMIT at N20000; RESOURCE_LIMIT/INPUT_BYTES at N20000, XL. Where the refusal is the byte or work cap and the raised run succeeded in 28015 ms (worst shape), raise that cap only for headless hosts. |
| DEFAULT_LOD_BUDGET and hard limits (MAX_NODES 100,000, MAX_EDGES 500,000, MAX_GROUPS 20,000, MAX_MEMBER_ENTRIES 500,000, MAX_WORK_HARD 10^9) | lod-core | 20,000 / 100,000 / 10^8 work | 29 s11 | deriveView with collapsed groups: S 10.18 ms, M 94.98 ms, L 962.6 ms, N20000 1960.5 ms*, XL 4140.2 ms*; flat view: S 10.15 ms, M 96.48 ms, L 965.9 ms, N20000 1971.0 ms*, XL 4497.6 ms*; suggestGroups: S 7.305 ms, M 71.69 ms, L 730.8 ms, N20000 1478.0 ms*, XL 3162.1 ms*. Default refusals: RESOURCE_LIMIT/EDGE_LIMIT at N20000; RESOURCE_LIMIT/NODE_LIMIT at XL; refusals even when raised to the hard limits: none. Largest view derived: sparse/XL in 3415.5 ms. | keep | Keep: the default budget refused only above its own node and edge caps, and the hard limits (MAX_NODES, MAX_EDGES) refused the one workload beyond them even with the budget raised to the hard limits; the raised runs below the hard limits all succeeded. |
| maxSvgBytes (headless default; adapter default) | renderer-svg | 64 MiB; 8 MiB (dom) | 30 s4, 12.2 | SVG bytes per element 479 to 600; the largest document 215.70 MiB (groups/XL). 64 MiB holds about 111,833 elements and 8 MiB about 13,979 at the worst density. Default refusals of renderSvg: RESOURCE_LIMIT/BYTES_LIMIT at N20000, XL. exportBundle (its SVG cannot be raised through ExportOptions): RESOURCE_LIMIT/BYTES_LIMIT at N20000, XL. | keep | Keep 64 MiB as a headless safety cap (it binds at about 111,833 elements, past the 20,000 + 40,000 caps). The 8 MiB adapter default corresponds to about 13,979 elements; see the DOM capacity row for the time side. |
| maxDrawnLabelUnits (headless 1,048,576; dom 262,144) | renderer-svg / display-list | 1,048,576; 262,144 | 30 s4; 31 s11.4 | labels elided by the default budget at: no run; most label units drawn 3,499,100; label units per element (runs with every label drawn) up to 9.6, so 1,048,576 covers about 108,890 elements and 262,144 about 27,222. Drawing every label (budget raised) costs n/a (never needed). | keep | Keep: under the default limits no measured run elided a label (the SVG byte cap refuses first at the sizes where the label budget would bind); the adapter figure is a quarter of the headless one by design and is judged by the DOM insertion times in the capacity row. |
| DOM adapter capacity maxNodes / maxEdges | renderer-svg | 2,000 / 4,000 | 30 s12.2 | real DOM insertion plus style and layout of the SVG (Chromium, default-gl), per size: S worst dense/S 900 elements 15.05 ms; M worst dense/M 9,000 elements 143.8 ms; L worst dense/L 90,000 elements 1867.9 ms; N20000 worst dense/N20000 180,000 elements 4839.9 ms. The adapter capacity is 2,000 nodes + 4,000 edges = 6,000 elements; the measured points around it: groups/M 4,014 el 58.30 ms and dense/M 9,000 el 143.8 ms; linear interpolation at 6,000 elements 92.34 ms. Insertions at or under 100.0 ms reach 4,014 elements (at the largest such point). | keep | Keep: the 6,000-element cap is where a whole-document re-insertion is still about 92.34 ms (interpolated), and the next measured point above it is 143.8 ms; a higher DOM cap would move commits over the responsive budget. |
| capacity maxNodes / maxEdges | renderer-canvas | 20,000 / 40,000 | 31 s11.4 | Canvas 2D replay plus flush (Chromium default-gl), per size: S worst dense/S 900 el 8.100 ms; M worst dense/M 9,000 el 54.00 ms; L worst dense/L 90,000 el 499.4 ms; N20000 worst groups/N20000 80,200 el 1023.5 ms. The cap is 60,000 elements (20,000 + 40,000); the largest measured point at or under it is sparse/N20000 60,000 el 617.8 ms, and the display list for that size (worst shape) takes 751.2 ms to build. | keep | Keep as a safety cap: at the cap a commit costs about 1369.1 ms (paint plus list build), usable for a static view or a slow pan, not for 60 Hz; see the selection table for where WebGL pays off. |
| capacity maxNodes / maxEdges; maxGlBytes | renderer-webgl | 100,000 / 200,000; 256 MiB | 31 s7.2, 11.4 | planGl worst shape per size: S 2.999 ms, M 28.34 ms, L 393.1 ms, N20000 745.8 ms, XL 3799.7 ms; the largest plan 53.41 MiB (dense/XL) against the 256 MiB ceiling; sparse/XL planned with default limits. Browser, largest point: software GL dense/N20000 180,000 el draw+sync 3448.4 ms; hardware GL dense/N20000 180,000 el draw+sync 198.7 ms. XL was run in Node only (the plan is built and measured, not drawn). | keep | Keep: the plan builds at 100,000 nodes within the 256 MiB ceiling; the frame cost at that size is not measured in a browser here (the XL plan was not drawn), so the 100,000 / 200,000 capacity stays a safety cap, not a performance claim. |
| maxDlBytes; DEFAULT_DL_READ_LIMITS; DEFAULT_CV_READ_LIMITS | display-list | 64 MiB; 64 MiB / 16,777,216 units; 256 MiB | 31 s4 | serialized list 165 to 227 bytes per element; largest 169.42 MiB (dense/XL); recorded Canvas stream largest 213.38 MiB. Default refusals of serializeDisplayList: RESOURCE_LIMIT/BYTES_LIMIT at XL. Reading it back (parseDisplayList): S 7.369 ms, M 75.14 ms, L 1906.5 ms, N20000 3743.6 ms, XL 18331 ms*. | keep | Keep: a list at the 20,000 + 40,000 caps is about 13.00 MiB, inside 64 MiB; the default refused only workloads beyond the node or edge caps (RESOURCE_LIMIT/BYTES_LIMIT at XL). |
| reader bounds (DEFAULT_READ_LIMITS, DL and plan read limits) | renderer-svg / display-list / renderer-webgl | 64 MiB, 16,777,216 line units | 30 s14.5; 31 s4 | readSvg: S 11.14 ms, M 107.6 ms, L 1059.2 ms, N20000 2163.5 ms*, XL 4684.1 ms*; parseDisplayList: S 7.369 ms, M 75.14 ms, L 1906.5 ms, N20000 3743.6 ms, XL 18331 ms*; parseGlPlan: S 7.855 ms, M 73.42 ms, L 740.8 ms, N20000 1362.5 ms, XL 6584.7 ms. Default refusals: svg RESOURCE_LIMIT/BYTES_LIMIT at N20000, XL; list RESOURCE_LIMIT/BYTES_LIMIT at XL; plan no default refusal in any run. | keep | Keep: the readers are conformance-time tools, linear in length; their bounds are safety caps against hostile input, not performance levers. |
| COMPANION_FULL_MAX 500, COMPANION_WINDOW 200, maxTreeBytes 16 MiB, maxPlanBytes 16 MiB, window count 5,000 | a11y-companion | 500 / 200 / 16 MiB / 16 MiB / 5,000 | 32 s9.3, 14.1 | windowed tree (200 items above 500 elements): S 3.243 ms, M 7.173 ms, L 58.17 ms, N20000 137.9 ms, XL 1046.0 ms; its gate: S 6.514 ms, M 8.373 ms, L 61.58 ms, N20000 123.8 ms, XL 807.4 ms. Full tree (window all): S 7.878 ms, M 90.20 ms, L 1016.2 ms*, N20000 2089.3 ms*, about 6.9 to 11.6 microseconds per element, so 500 items cost about 5.804 ms; refusals of window all: RESOURCE_LIMIT/BYTES_LIMIT at L, N20000. Tree bytes at the largest size: 164.06 KiB. | keep | Keep 500 and 200: a full build at 500 elements is far under the responsive budget; the windowed tree still costs O(N + E) to derive (the accessible model is built over every element), which is the real scaling term, not the window size. A host above the caps should rebuild the tree off the paint path. |
| DEFAULT_EXPORT_LIMITS (maxArtifactBytes 256 MiB, maxPngBytes 64 MiB, maxManifestBytes 1 MiB) | export-core | 256 MiB / 64 MiB / 1 MiB | 32 s3.3, 14.1 | exportBundle: S 17.79 ms, M 138.8 ms, L 1160.1 ms, N20000 906.4 ms; largest bundle 62.19 MiB (dense/L). Refusals: bundle RESOURCE_LIMIT/BYTES_LIMIT at N20000, XL; verifyExportBundle RESOURCE_LIMIT/BYTES_LIMIT at L, N20000. Note: exportBundle always renders the SVG with default svg limits (ExportOptions cannot raise maxSvgBytes) and verifyExportBundle rebuilds the model with default RenderLimits (no option), so both stop where those defaults stop. PNG bytes were not measured (no PNG is produced in Node). | needs more data | Keep the artifact caps; PNG and manifest caps are unmeasured. Propose (as an API question, not done here) that exportBundle and verifyExportBundle accept svg and render limits, since they refuse scenes the other stages accept. |
| DRAG_THRESHOLD_MILLI 4000, LONG_PRESS_MS 500, WHEEL_NOTCH_MILLI, WHEEL_MAX_NOTCHES 8, ZOOM_STEP_IN/OUT, PAN_STEP_PX 32, REVEAL_MARGIN_PX 24, COORD_MAX_MILLI, DEFAULT_MAX_TARGETS 60,000 | interaction-core | constants | 32 s3.3 | gesture machine per event (worst shape): pointermove S 0.0161 ms, M 0.0139 ms, L 0.0172 ms, N20000 0.0166 ms, XL 0.0178 ms; wheel S 0.0099 ms, M 0.0091 ms, L 0.0103 ms, N20000 0.0111 ms, XL 0.0167 ms; ArrowRight (graph navigation) S 0.0974 ms, M 0.681 ms, L 6.826 ms, N20000 14.70 ms, XL 81.05 ms; key then reduce loop S 0.177 ms, M 1.256 ms, L 11.83 ms, N20000 24.26 ms, XL 131.9 ms. Pointer and wheel events cost microseconds at every size; keyboard navigation is O(N + E) and crosses one frame (16.70 ms) at or under 16.70 ms up to 20,000 nodes, over it from 100,000 nodes. | needs more data | The thresholds and steps are ergonomic constants: no performance evidence moves them. Keep as provisional until a usability pass; for hosts above the bracket, run keyboard navigation off the main thread. |
| DL_COORD_MAX 2^40, VIEWPORT_MAX_PX 16,384, BACKING_AREA_MAX 2^26, DPR 0.25 to 8 | display-list | constants | 31 s3.5, 6.4 | Measured only at a 1280 x 800 viewport, device pixel ratio 1 (browser mode ran); large canvases (16,384 px, 2^26 backing pixels) and DPR 2 to 8 were not measured. | needs more data | No change proposed. Measure Canvas and WebGL at large backing sizes and DPR 2 before ruling; the backing-store cost scales with pixels, which this run does not vary. |
<!-- END GENERATED limits -->

### Summary of the recommendations

No row recommends changing a number in the packages. The evidence supports **keeping** the render-model, byte, FORCE, stable-layout, LOD, SVG, Canvas, WebGL, display-list, reader and
companion limits as safety caps (none of them is a performance target), and it records **needs more data** for the interaction and hit constants (ergonomic, need a usability pass),
the display-list coordinate and backing-store limits (large canvases and high-DPI were not drawn), the export limits (PNG not measured; and `exportBundle` /
`verifyExportBundle` cannot be given the SVG and render limits the other stages accept, which is an API question to put to the owner, not a limit change) and the compileScene
edge-list overflow. Proposals that touch a contract (a `RESOURCE_LIMIT` guard in `compileScene`, render-limit options on the export functions) are **not applied**.

## Renderer auto-selection: proposal

Evidence-based thresholds, as the PlanMap hard stop requires, from the browser tables above. The packages contain no auto-selection code; this is a proposal for the owner.

<!-- BEGIN GENERATED selection -->
- Assumption: Per-commit cost = the Node/V8 build time of the renderer's artifact (renderSvg; buildDisplayList; buildDisplayList + planGl) plus the browser-side paint (SVG DOM insert + style + layout; Canvas replay + flush; WebGL draw + sync + 2D label layer), medians. Every commit rebuilds everything: the packages have no incremental or cached path. Paint-only cost = the browser-side part alone, which is what an artifact reused across commits would cost.
- Assumption: Per band of element counts (nodes + edges) the cost is the median over the browser points in the band (all shapes). Under one frame every renderer is treated as equal and the first of SVG, Canvas, WebGL wins (native DOM semantics, then the simpler path); above it a renderer within 1.25 times of the cheapest is a tie with the same preference. WebGL is judged on the worse of the two GL stacks for the per-commit view and on the hardware stack only for the paint-only view.
- Assumption: Reference budgets (assumptions of this report): one frame 16.7 ms; a responsive command 100 ms; a visible wait 1000 ms.
- Assumption: Chromium only, one machine; two GL stacks (default headless GL, software SwiftShader here; ANGLE on Direct3D 11, this machine's integrated GPU). Pixels, text quality and accessibility are outside the table: SVG carries native DOM semantics, Canvas and WebGL need the companion tree.

| elements (nodes + edges) | renderer | basis | data behind it |
| --- | --- | --- | --- |
| 0 to under 1,000 | SVG (DOM) | per commit (rebuild + paint) the cheapest is 5.667 ms, within the responsive budget; paint-only view: SVG (DOM) | per commit: SVG 8.101 ms, Canvas 5.667 ms, WebGL software GL 11.05 ms, WebGL hardware GL 8.777 ms; paint only: SVG 4.900 ms, Canvas 3.100 ms, WebGL software 8.100 ms, WebGL hardware 5.300 ms; 6 points |
| 1,000 to under 5,000 | Canvas 2D | per commit (rebuild + paint) the cheapest is 40.38 ms, within the responsive budget; paint-only view: Canvas 2D | per commit: SVG 71.31 ms, Canvas 40.38 ms, WebGL software GL 74.29 ms, WebGL hardware GL 51.29 ms; paint only: SVG 43.25 ms, Canvas 21.90 ms, WebGL software 48.30 ms, WebGL hardware 24.60 ms; 5 points |
| 5,000 to under 20,000 | Canvas 2D | per commit (rebuild + paint) the cheapest is 114.2 ms, over the responsive budget but within the wait budget; paint-only view: WebGL2 (hardware GL only) | per commit: SVG 333.1 ms, Canvas 114.2 ms, WebGL software GL 291.2 ms, WebGL hardware GL 141.6 ms; paint only: SVG 222.0 ms, Canvas 60.47 ms, WebGL software 195.8 ms, WebGL hardware 46.17 ms; 2 points |
| 20,000 to under 50,000 | Canvas 2D | per commit (rebuild + paint) the cheapest is 372.4 ms, over the responsive budget but within the wait budget; paint-only view: WebGL2 (hardware GL only) | per commit: SVG 797.1 ms, Canvas 372.4 ms, WebGL software GL 843.4 ms, WebGL hardware GL 384.7 ms; paint only: SVG 497.8 ms, Canvas 209.6 ms, WebGL software 566.3 ms, WebGL hardware 106.7 ms; 5 points |
| 50,000 to under 100,000 | Canvas 2D | per commit (rebuild + paint) the cheapest is 874.7 ms, over the responsive budget but within the wait budget; paint-only view: WebGL2 (hardware GL only) | per commit: SVG 1719.4 ms, Canvas 874.7 ms, WebGL software GL 2013.6 ms, WebGL hardware GL 801.9 ms; paint only: SVG 1135.8 ms, Canvas 499.4 ms, WebGL software 1447.1 ms, WebGL hardware 235.4 ms; 5 points |
| 100,000 and above | Canvas 2D | per commit (rebuild + paint) the cheapest is 1649.7 ms, over the wait budget; paint-only view: WebGL2 (hardware GL only) | per commit: SVG 6409.9 ms, Canvas 1649.7 ms, WebGL software GL 5111.6 ms, WebGL hardware GL 1979.1 ms; paint only: SVG 4839.9 ms, Canvas 898.4 ms, WebGL software 3614.6 ms, WebGL hardware 482.1 ms; 1 point |

- Proposed thresholds (elements = nodes + edges), per commit with a rebuild: SVG below 1,000 elements, Canvas 2D above it; WebGL2 never wins the per-commit cost in any band measured, because planGl adds to the display-list build. With a reused artifact, WebGL2 on hardware GL wins the paint from the band 5,000 to under 20,000; on software GL it is not faster than Canvas, so WebGL should be offered only after probeWebgl with failIfMajorPerformanceCaveat accepts a real GPU.
- From the band 5,000 to under 20,000 the cheapest renderer already exceeds 100.0 ms per commit, because every commit rebuilds the artifact in JS: a selection threshold cannot make large views responsive; only an incremental or cached path can.
- Largest browser point: 180,000 elements. Above it nothing was drawn in a browser; the Node-side plan builds up to 900,000 elements.
- Proposal only: the packages contain no auto-selection code and no threshold. Any threshold adopted must cite this table as its evidence (PlanMap hard stop: 'Renderer thresholds require benchmark evidence'); a second machine and engine would be needed before it is more than a proposal.
<!-- END GENERATED selection -->

## Caveats

- One machine (the processor and memory above), one operating system, one Node version for the reference run (the fast tests and the S smoke were also run on Node 22), one Chromium.
- Single full run, no repeated runs of the whole benchmark: run-to-run variation of a whole stage is not measured, only repetition within a run (the harness cuts repetitions for slow stages, so
  XL cells are one or two cold runs).
- Synthetic seeded generators, directed graphs, integer identifiers of up to six digits; long identifiers (the documented quadratic hazard of verification) and undirected graphs were not measured.
- Labels are the identifiers (short); label-heavy scenes would cost more per element and would hit the label budgets sooner.
- Viewport 1280 x 800 at a device pixel ratio of 1 only.
- The `*` figures are for per-call limits raised so the stage could run; they say what it costs to lift a limit, not what a limit should be.
- RSS growth around a call is coarse; peak RSS per process is the more reliable memory figure.

## Not run

- Delta, timeline and downstream workloads (V9, V10, V13 blocked; nothing was invented).
- PNG export (no PNG is produced in Node), long identifiers, undirected graphs, large canvases, device pixel ratios above 1, a browser other than Chromium, a second machine.
- XL in a browser (the plan and list were built in Node; the SVG for XL is hundreds of MiB).
