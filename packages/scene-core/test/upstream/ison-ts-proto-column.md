# ison-ts: a `__proto__` column re-parents the row and invents `id`/`type`

Draft issue for `ISON-format/ison` (package `ison-ts`). **Reported privately** on 2026-11-16 as the draft security advisory GHSA-4q46-pwrh-hhf9 (maintainers only). This public text is held back until the maintainers have triaged it; the source location is `ison-ts/src/index.ts:548`.
Verified against `ison-ts` 1.2.0 on Node 22.23.5 and 24.18.0.

## Summary

`parse()` builds each row as a plain object and assigns `row[column] = value`. A column named `__proto__` therefore hits the
`Object.prototype.__proto__` setter. When the cell is a reference (`:type:id`), the row's prototype becomes that `Reference`, so the
row inherits `id` and `type` that no column declared. `Object.keys(row)` does not list them, so the row looks like it has no `id`,
while `row.id` reads a value. Downstream code that reads `row.id` (for example `ison-graph-ts` `ISONGraph.fromIson`) creates a node from it.

## Minimal reproduction

```js
import { parse } from "ison-ts";

const doc = parse("nodes.p\n__proto__ name\n:q:77 a\n");
const row = doc.blocks[0].rows[0];

console.log(doc.blocks[0].fields);                         // [ '__proto__', 'name' ]
console.log(Object.keys(row));                             // [ 'name' ]            <- no own id
console.log(row.id);                                       // '77'                  <- inherited, never declared
console.log(Object.prototype.hasOwnProperty.call(row, "id")); // false
console.log(Object.getPrototypeOf(row).constructor.name);  // 'Reference'
```

With `ison-graph-ts` 1.4.1 the same text yields a node that was never written:

```js
import { ISONGraph } from "ison-graph-ts";
console.log([...ISONGraph.fromIson("nodes.p\n__proto__ name\n:q:77 a\n").nodes()].map((n) => [n.type, n.id])); // [ [ 'p', '77' ] ]
```

## Expected

Either reject a column named `__proto__` at parse time, or store rows so that column names cannot change the prototype (for example
`Object.create(null)` rows, or `Object.defineProperty` for assignment). A cell must never be able to introduce columns that the header
did not declare.

## Impact

Any consumer that treats a parsed document as the complete description of its input, such as a compiler that hashes the source and
emits a graph from it, can be made to read content that is not present in the declared columns.

## Scope notes

- Only `__proto__` has this effect. `constructor`, `toString`, `hasOwnProperty` and similar names are stored as ordinary own properties.
- A string cell assigned to `__proto__` is ignored by the setter (primitives do not re-parent), so it is silently dropped rather than stored.
- The same assignment pattern in `ison-graph-ts` may deserve a look; the repro above only needs `ison-ts`.

## Local mitigation (ISONGraph Visualize scene-core)

The adapter rejects any block that declares a `__proto__` column (`MALFORMED_SOURCE / PROTOTYPE_FIELD`) before Core sees it, and reads
required columns (`id`, `source`, `target`, `directed`, `format`) from own properties only. Canary: `test/upstream.ison-ts.test.ts`.
