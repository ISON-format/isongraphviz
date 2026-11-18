

## New entries found against rev 3

**A-54. Y17 says "all six `company` nodes" but `mixed20` has seven (15.4 Y17, 15.8).** The scene `mixed20` has seven nodes of type `company`
(`i:1`, `i:4`, `i:7`, `i:13`, `i:16`, `i:19`, `s:n10`), seven `person` and six `project`. Reading used: hide **all** `company` nodes (seven);
their 19 incident edges cascade (`0 selected, 26 hidden.`); the 13 remaining nodes keep `igr-k1` (`person`) and `igr-k2` (`project`), which is what
the row is for. Hiding only six would leave one `company` node and no class shift for K60.

**A-55. N02: "zoom 10 with the viewport centre at the layout origin" cannot give screen values near zero (15.4 N02, rev 3).** 3.3: `X = (x - cx)*z + w*500000`. With the
centre at the layout origin (`cx = 0`) and `z = 10`, layout values -40, -50, -60, 50 (thousandths) give `X` of about 449,999,600 micro-pixels (about 450 px), not -0.0004 ... 0.0005 px. The stated screen values
need `cx = 50000*w` and `cy = 50000*h` (thousandths), i.e. the layout point that the screen origin shows. Reading kept (same bytes as rev 2): centre `(45000000, 30000000)`, zoom 10, 900 x 600; the generator
prints exactly the screen values the text names. A literal rev 3 reader would get a document with no value near zero, and the row's purpose (no `-0` text) would be lost.

**A-56. 15.3's rule for IGR-CJ/1 versus ordinary JSON contradicts its own list.** The rule says an expected JSON file that contains `null` or a non-integer number is ordinary JSON and "every other
expected JSON file is IGR-CJ/1", but the list then names `json/T14.readouts.json`, `T18`, `T27`, `T28`, `F05` and the outcome files as ordinary JSON, and some of them hold no `null` and no double. The list also
omits `json/T03.decode.json` (which holds `null`). Reading used: **the list wins**: only `json/T01.ids.json`, `json/U06.*.manifest.json` and `json/U09.*.witness.json` are IGR-CJ/1; every other file of `json/` is
ordinary JSON (`indent=1`, sorted keys, ASCII escapes, one trailing LF). Same bytes as rev 2.

**A-57. 15.3 and 15.8 say T27, T28 and F05 are "inline input and no expected file" but also list their JSON files.** The same paragraph lists `json/T27.limits.json`, `json/T28.decode.json` and `json/F05.sink.json`.
Reading used: the files exist and the `expected` cell names them (T27, T28, F05); only `U10` has no file at all. The counts of 15.8 (131 rows with files or inline input) are unaffected.

**A-58. `"also"` shape for U06 and U09 (15.3).** Author-defined: `U06` input `{"host":"headless","expected":"json/U06.headless.manifest.json","also":[{"host":"dom","expected":"json/U06.dom.manifest.json"}]}`;
`U09` input `{"svg":"svg/G01.svg","expected":"json/U09.G01.witness.json","also":[{"svg":"svg/G05.svg","expected":"json/U09.G05.witness.json","scene":...,"layout":...}]}`; `T17` and `T31` keep
`"also":{scene,layout,...}` (one object, since each has exactly one further case). The two spellings (object versus list of objects) are an inconsistency of this corpus that the README documents.

**A-59. K114 (15.6, 15.6a): "a `maxSvgBytes` boundary that accepts one byte more than the limit".** Implemented as refusing only when the running total exceeds `limit + 1`. Only a limit of exactly
the document length minus one separates it from the correct writer (row F02); F01 (limit = length) is accepted by both, F06 (limit 0) is refused by both (the first line is longer than one byte). So F02 is the only killer, as the text says.

**A-60. 12.2 / U06 versus U12.** U06 now records the default-name manifests (`svg-renderer`), U12 records a subject with `name: "x-svg"`; K106 (manifest differs, `labels.edge`, `dom` capacity defaults) is killed by both U06
(the `dom` capacity of the default manifest) and U12 (`edgeLabels: false`), as named. No further finding.

**A-61. "No other expected byte changes" is not true of `json/T14.readouts.json` (rev 3 change log, 15.4 T14).** T14 lists every non-error document of the rows G, N, X, Y and O, so the new row Y17 adds an
entry (`nodes`, `edges`, `agrees_with_model`, `readout_sha256` of `Y17`) and the file changes; no other T14 entry changes. Besides the files the change log lists, the corpus therefore also changes `json/T14.readouts.json`.
