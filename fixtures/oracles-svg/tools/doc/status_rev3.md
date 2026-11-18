
## Status against design 30 rev 3

Entries A-01 to A-53 below were written against rev 2 and are kept verbatim (numbering is stable; counts such as 247 ids and statements such as
"K60 is unkillable" describe rev 2). Rev 3 dispositions (its change-log table): **42 FIXED in the text, 11 STANDS** (A-14, A-15, A-30, A-39, A-42,
A-47, A-48, A-49, A-50, A-51, A-52). Every FIXED and STANDS entry is marked **RESOLVED-IN-REV3** here; the last columns say whether this generator's
literal reading of the old point equals what the rev 3 text now says (the corpus was regenerated against rev 3; the changed files are listed in the hand-over).

| Old | Rev 3 | Reading matched rev 3 text? | Note |
|---|---|---|---|
| A-01 | FIXED, RESOLVED-IN-REV3 | yes | six numbers after `C` |
| A-02 | FIXED, RESOLVED-IN-REV3 | yes for X13 (c0..c9); K60 is new | K60 is now "class over visible nodes only", killed by the new row Y17 (measured: only Y17 and T14 change) |
| A-03 | FIXED, RESOLVED-IN-REV3 | yes | labels only |
| A-04 | FIXED, RESOLVED-IN-REV3 | yes, but see A-56 | T01, U06, U09 IGR-CJ/1; everything else ordinary JSON |
| A-05 | FIXED, RESOLVED-IN-REV3 | yes | `"also"` in the inline input (T17, T31) |
| A-06 | FIXED, RESOLVED-IN-REV3 | partly | U06 and U09 now use `{first case, "also": [...]}` like T17 and T31 (shape documented in README, see A-58) |
| A-07 | FIXED, RESOLVED-IN-REV3 | yes | killer lists of K01 (N01, N02, N03), K44 (X01), K68 (F01) as measured; K114 (F02) and K60 (Y17) added; all verified by the matrix |
| A-08 | FIXED, RESOLVED-IN-REV3 | yes | wire address |
| A-09 | FIXED, RESOLVED-IN-REV3 | yes | ops as 15.3 |
| A-10 | FIXED, RESOLVED-IN-REV3 | yes | outcome files U11-U13 |
| A-11 | FIXED, RESOLVED-IN-REV3 | yes | plain JSON for Y14, Y15 |
| A-12 | FIXED, RESOLVED-IN-REV3 | yes | |
| A-13 | FIXED, RESOLVED-IN-REV3 | yes | alphabetical order |
| A-14 | STANDS, RESOLVED-IN-REV3 | yes | |
| A-15 | STANDS, RESOLVED-IN-REV3 | yes | |
| A-16 | FIXED, RESOLVED-IN-REV3 | yes | twelve nodes, zoom 1999, parity of the thousands digit |
| A-17 | FIXED, RESOLVED-IN-REV3 | **no, see A-55** | the rev 3 construction ("centre at the layout origin") does not give the stated screen values |
| A-18 | FIXED, RESOLVED-IN-REV3 | yes | |
| A-19 | FIXED, RESOLVED-IN-REV3 | yes | |
| A-20 | FIXED, RESOLVED-IN-REV3 | yes | |
| A-21 | FIXED, RESOLVED-IN-REV3 | yes | |
| A-22 | FIXED, RESOLVED-IN-REV3 | yes | |
| A-23 | FIXED, RESOLVED-IN-REV3 | yes | |
| A-24 | FIXED, RESOLVED-IN-REV3 | yes | |
| A-25 | FIXED, RESOLVED-IN-REV3 | yes | T21 `aria-describedby`, T09/T10 in an edge `<desc>`, T29 with matching `aria-label` |
| A-26 | FIXED, RESOLVED-IN-REV3 | yes | |
| A-27 | FIXED, RESOLVED-IN-REV3 | yes | |
| A-28 | FIXED, RESOLVED-IN-REV3 | yes | |
| A-29 | FIXED, RESOLVED-IN-REV3 | yes | |
| A-30 | STANDS, RESOLVED-IN-REV3 | yes | |
| A-31 | FIXED, RESOLVED-IN-REV3 | yes | |
| A-32 | FIXED, RESOLVED-IN-REV3 | yes | |
| A-33 | FIXED, RESOLVED-IN-REV3 | yes | |
| A-34 | FIXED, RESOLVED-IN-REV3 | yes | |
| A-35 | FIXED, RESOLVED-IN-REV3 | yes | |
| A-36 | FIXED, RESOLVED-IN-REV3 | yes | |
| A-37 | FIXED, RESOLVED-IN-REV3 | yes | |
| A-38 | FIXED, RESOLVED-IN-REV3 | yes | |
| A-39 | STANDS, RESOLVED-IN-REV3 | yes | |
| A-40 | FIXED, RESOLVED-IN-REV3 | yes | every definition of 15.6a was compared with the implemented mutant; all agree |
| A-41 | FIXED, RESOLVED-IN-REV3 | yes | |
| A-42 | STANDS, RESOLVED-IN-REV3 | yes | |
| A-43 | FIXED, RESOLVED-IN-REV3 | yes | now 249 ids, 131 with files or inline input, 118 empty |
| A-44 | FIXED, RESOLVED-IN-REV3 | yes | |
| A-45 | FIXED, RESOLVED-IN-REV3 | yes | |
| A-46 | FIXED, RESOLVED-IN-REV3 | yes | |
| A-47 | STANDS, RESOLVED-IN-REV3 | yes | |
| A-48 | STANDS, RESOLVED-IN-REV3 | yes | |
| A-49 | STANDS, RESOLVED-IN-REV3 | yes | |
| A-50 | STANDS, RESOLVED-IN-REV3 | yes | |
| A-51 | STANDS, RESOLVED-IN-REV3 | yes | |
| A-52 | STANDS, RESOLVED-IN-REV3 | yes | |
| A-53 | FIXED, RESOLVED-IN-REV3 | yes (after the change) | default name `svg-renderer`; U06 records the default manifests (the `x-svg` override of rev 2 is gone from U06; U12 still uses it) |

