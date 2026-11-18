"""The mutant table of design 31 rev 3, section 13.5 (oracles-dl part), transcribed: id | mutation | named killer rows."""

KTABLE = """
K01|m-px by truncation toward zero|N01
K02|m-px by `floorDiv` instead of `divRound`|N01
K03|node centre from `w/2` with integer division|G09,G10
K04|centre or pan sign wrong in `X`|G01,Y13
K05|trim 11 px instead of 12|G01
K05b|trim 13 px instead of 12|G01
K06|trim with the nearest-integer root (V1)|N16
K07|trim with `floorDiv` (V2)|N16
K08|trim computed in doubles (V3)|N16
K09|straight anchor with `floorDiv` (V4)|N17
K10|parallel anchor with `floorDiv` (V5)|N17
K11|parallel control point with `floorDiv` (V6)|N17
K12|degenerate anchor with `floorDiv` (V7)|N17
K13|parallel midpoint with `floorDiv` (V8)|N17
K14|parallel frame root nearest-integer (V9)|N17
K15|degenerate test `<` instead of `<=`|N06
K16|degenerate edge trimmed anyway|N06
K17|coincident nodes divide by zero|N05
K18|parallel offset sign flipped for reversed edges|N09,G05
K19|grouping by ordered pair|G05,N09
K20|group counts hidden members|N10
K21|loop rank counted globally|N08,G11
K22|wrong loop label anchor|G11
K23|arrow tip is not the last point of the route|G01
K24|arrow length 9 px instead of 10|G01
K24b|arrow length 11 px instead of 10|G01
K25|arrow half-width 4 px instead of 5|G01
K25b|arrow half-width 6 px instead of 5|G01
K26|arrow corner `b2` computed as the negation of `b1`'s offset|N03
K27|arrow base centre with `floorDiv`|N03
K28|arrow direction from the unrounded µpx points|N03
K29|zero-length direction left as (0, 0)|N05
K30|zero-length direction (0, 1)|N05,N07
K31|arrow on a form-1 edge uses the chord|N04
K32|arrow on a form-2 edge uses the first control point|N04,G11
K33|`A` emitted on an undirected graph|G02
K34|`A` omitted on a directed graph|G01
K35|all `A` after all `E`|G11,N09
K36|truncation at 25 units or ellipsis not counted|X01
K37|truncation splits a surrogate pair|X01
K38|TAB, LF, CR kept in the text|X03
K39|XML-illegal scalar kept|X04
K40|XML-illegal scalar deleted instead of U+FFFD|X04
K41|text NFC-normalized|X06
K42|empty label emits a `T`|X05
K43|label budget boundary exclusive|O03
K44|label budget not monotone|O06
K45|budget walk takes edge labels before node labels|X09
K46|text XML-escaped|X02
K47|`edgeLabels` default false|G01
K48|node and edge `T` ranges mixed (edge labels before node labels in file order)|G01
K49|hidden element in the table|Y07
K50|hide does not cascade to incident edges|Y07
K51|selected and focused bits swapped|Y03
K52|focus bit missing on edges|Y05
K53|pid is the scene index, not the table position|Y10
K54|category class by index modulo 8|X10
K55|category class over visible nodes only|Y17,X11
K56|header counts include hidden elements|Y07
K57|header size from the layout bounds|G08,G09
K58|header scene and layout hashes swapped|G01
K59|edges before nodes in the table|G01
K60|`readoutFromList` takes `marked.selected` from the focused bit (the two flag bits swapped in the readout)|R30
K61|final LF missing|G01
K62|table address with spaces or unsorted keys|G01,X08
K63|U+2028 or DEL written as an escape in a string|X08
K64|coordinate limit exclusive (a coordinate of exactly `2^40` refused)|N13
K65|coordinate limit not enforced|N14,N11
K66|unknown option key ignored|O07
K67|options array accepted|O12
K68|state not validated|Y14,Y15
K69|`maxBytes` boundary exclusive|F01
K70|`maxBytes` boundary accepts one byte more|F02
K71|a refused document partially returned|F03
K72|reader accepts CRLF|S28
K73|reader accepts an indented or a blank line|S29,S31
K74|reader does not require the final LF|S30
K75|reader skips the header checks (format, `W`, hash shape)|S04,S26,S27
K76|reader does not check the header counts against the table|S05
K77|reader skips the table canonical check|S07
K78|reader allows a repeated address|S08
K79|reader skips the `E` and `N` pid rules|S09,S10,S42
K80|reader skips the range of `flags` and `form` and the coordinate count|S11,S12,S13
K81|reader skips the `A` presence rule|S14,S15
K82|reader skips the `A` consistency rule|S16
K83|reader skips the `A` adjacency rule (accepts `E E A A`)|S17
K84|reader skips the `T` order and role rules|S18,S19,S23,S24
K85|reader skips the `T` text rules|S20,S21,S22
K86|reader skips the `E`/`N` coordinate bound|S25
K87|reader does not enforce the order of the kinds (D2)|S06
K88|reader accepts non-canonical number spellings|S33,S34,S35
K89|reader accepts an unknown kind|S36
K90|reader's `maxBytes` boundary exclusive|S37
K90b|reader's `maxBytes` boundary accepts one byte more|S38
K91|reader has no `maxLineUnits` bound|S39
K92|reader skips the `kcls` range|S41
K93|flatten with `floorDiv`|P02,P03
K94|flatten with 15 segments|P03
K94b|flatten with 17 segments|P03
K95|pick without the endpoint branches|P08
K96|pick tolerance 5 px|P04,P07
K97|pick tolerance 7 px|P04,P07
K98|pick boundary open|P07
K99|pick tie goes to the highest index|P09
K100|pick takes the nearest edge before a node within 12 px|P10
K101|pick uses the frozen chord for edges|P05,P06
K102|pointer converted to whole pixels|P04
K103|hidden element pickable|P11
K104|pick returns a pid instead of an address|P05
K105|a frozen edge hit is honoured|P13
K106|node bound ±18000|B01
K107|edge bound without the 6000 expansion|B02
K108|loop bound from its end points only|B03
K109|rings painted after the discs|C02
K110|halos painted after the line|C02
K111|arrowheads painted before the lines|C01
K112|style cache disabled|C01,C07
K113|style cache not reset between replays|C13
K114|dash not reassigned for the disc stroke|C02
K115|`setTransform` missing or `dprMilli` ignored|C05
K116|`clearRect` missing|C01
K117|label text altered (trimmed, normalized or wrapped)|C10
K118|font string differs|C01
K119|`ink` ignored|C06
K120|witness reads `probe()` instead of the stream|U11
K121|manifest differs from the renderer's, or `labels.edge` supported with edge labels off|U06,U12
K122|`export("svg")` returns bytes though declared unsupported|U05
K123|`displayList()` does not throw `BUSY`|U03
K124|`displayList()` returns the previous state's list|U01
K125|`pick` calls the frozen `hitTest` for edges|U14
K126|`capacity` and `dl` label budgets may differ|U07
K127|`probe().fidelity.labels` `full` while truncating|U04
K128|`render()` builds the list|U13
K129|`dprMilli` not validated|C11,C12
K130|`ink` not validated|C14,C15
K131|`layers` not validated|C17
K132|arc end angle `Math.PI` instead of `2π`|C01
K133|all edges of a layer stroked in one path|C03
K134|`save`/`restore` used|C01
K135|text styles assigned when there is no label|C08,C09
K136|element markers missing or with the wrong layer|C01
K137|the 2D calls differ without `onElement`|C18
K138|`readoutFromSvgReadout` parses decimals through a float and truncates|R20
K139|`nodes_far` guard-box rule ignored in a readout|R21,R29
K140|`compareReadouts` path or reference rule wrong|R17
K141|`compareReadouts` compares readouts with different hashes|R18
K142|stream readout lists an element whose marker has no painting call as drawn|R44
K143|`label_units` counts code points|R22
K144|`readoutFromList` puts the focus under the wrong key (node/edge)|R31,R32
K145|stream readout takes the selected nodes from layer 7 (every node)|R39
K146|stream readout takes the focus from layer 5 instead of layer 6|R39
K147|stream readout takes the arrows from layer 3 (every edge)|R42
K148|stream readout takes node centres from the layer-8 anchors|R16
K149|stream readout counts `label_units` in bytes|R43
K150|`readoutFromList` classifies `nodes_at` by the viewport rectangle instead of the guard box|R28
K151|option error class `INVALID_VALUE` instead of `SCHEMA` for a non-boolean `labels`|O08
K152|numeric option error classes confused (`NOT_FINITE`, `INVALID_VALUE`, `OUT_OF_RANGE`)|O09,O10,O11
K153|`null` option accepted as absent|O13
K154|a non-model is not rejected|O14
K155|`maxDrawnLabelUnits` boundary 2^31 exclusive|O15
K155b|`maxDrawnLabelUnits` 2^31 + 1 accepted|O16
K156|options validated in a different order than alphabetical|O17
K157|`pickDrawn` without the closed-viewport rule|P14,P15
K158|`pickDrawn` border test on the raw point instead of the quantized one|P15
K159|`pickDrawn` point validation missing|P12
K160|reader skips the `T` coordinate bound|S43
K161|reader's nesting scan is not string-aware|S01
K162|reader splits lines with `splitlines` (also on U+2028)|S01
K163|`backingSize` floors instead of `divRound`|Z01
K164|`backingSize` without the per-side cap|Z02
K165|`backingSize` without the area cap|Z03
K166|`backingSize` does not validate `dprMilli`|Z05,Z06
K167|`ink` length not validated|C21
K168|empty `layers` rejected|C22
K169|`layers` range not validated|C23
K170|`layers` duplicates accepted|C24
K171|`onElement` type not validated|C25
K172|layer-8 text styles assigned after the first marker|C01
K173|a `PALETTE` entry among k3-k8 wrong|C20
K174|halo-foc width or dash wrong|C03
K175|ring-foc dash wrong|C02,C19
K176|dash tokens not multiplied by 1000|C02
K177|form-2 route drawn with `quadraticCurveTo`|C19
K178|form-1 route drawn with `bezierCurveTo`|C03
K179|`compareReadouts` checks the version before the schema (one entry has both defects)|R19
K180|`compareReadouts` accepts an inconsistent `nodes_at`/`nodes_far` partition|R36
K181|`readoutFromSvgReadout` accepts a non-canonical or `-0` decimal|R23,R25,R27
K182|`readoutFromSvgReadout` swaps the selected and focused marks|R14
K183|`compareReadouts` reads a caller-owned `__proto__` key|R38
K184|`labels: false` still emits node `T` records|O01
K185|`edgeLabels: false` still emits edge `T` records|O02
K186|`backingSize` accepts a zero width|Z07
K187|`readoutFromSvgReadout` accepts a printed value that is not a number|R24,R26
"""

KROWS = []
for line in KTABLE.strip().splitlines():
    kid, desc, kill = line.split("|")
    KROWS.append((kid, desc, kill.split(",")))
assert len(KROWS) == 193
