// src/json.ts — a strict RFC 8259 parser that keeps the TEXT of every number token (design 29 section 3 stage 2: integers are
// judged by token text), reads a duplicate key last-wins, and never recurses (hostile nesting cannot overflow the stack).

/** A JSON number as written. */
export class JNum {
  readonly token: string;
  constructor(token: string) { this.token = token; }
}

export class JsonSyntaxError extends Error {
  constructor(message: string) { super(message); this.name = "JsonSyntaxError"; }
}

type Frame = { arr: true; v: unknown[] } | { arr: false; v: Record<string, unknown>; key: string };

const NUMBER = /-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?/y;

export function parseJson(text: string): unknown {
  const n = text.length;
  let i = 0;
  const fail = (m: string): never => { throw new JsonSyntaxError(`${m} at ${i}`); };
  const ws = (): void => { while (i < n) { const c = text.charCodeAt(i); if (c === 0x20 || c === 0x0a || c === 0x0d || c === 0x09) i++; else break; } };

  const readString = (): string => {
    // text[i] is the opening quote
    i++;
    let out = "";
    let start = i;
    for (;;) {
      if (i >= n) fail("unterminated string");
      const c = text.charCodeAt(i);
      if (c === 0x22) { out += text.slice(start, i); i++; return out; }
      if (c < 0x20) fail("control character in string");
      if (c !== 0x5c) { i++; continue; }
      out += text.slice(start, i);
      i++;
      const e = text[i];
      switch (e) {
        case '"': out += '"'; break;
        case "\\": out += "\\"; break;
        case "/": out += "/"; break;
        case "b": out += "\b"; break;
        case "f": out += "\f"; break;
        case "n": out += "\n"; break;
        case "r": out += "\r"; break;
        case "t": out += "\t"; break;
        case "u": {
          const h = text.slice(i + 1, i + 5);
          if (!/^[0-9a-fA-F]{4}$/.test(h)) fail("bad unicode escape");
          out += String.fromCharCode(parseInt(h, 16));
          i += 4;
          break;
        }
        default: fail("bad escape");
      }
      i++;
      start = i;
    }
  };

  const readKey = (): string => {
    ws();
    if (text[i] !== '"') fail("object key expected");
    const k = readString();
    ws();
    if (text[i] !== ":") fail("colon expected");
    i++;
    return k;
  };

  const stack: Frame[] = [];
  let result: unknown;
  outer: for (;;) {
    ws();
    const c = text[i];
    let val: unknown;
    if (c === "{") {
      i++; ws();
      if (text[i] === "}") { i++; val = Object.create(null); }
      else { stack.push({ arr: false, v: Object.create(null) as Record<string, unknown>, key: readKey() }); continue; }
    } else if (c === "[") {
      i++; ws();
      if (text[i] === "]") { i++; val = []; }
      else { stack.push({ arr: true, v: [] }); continue; }
    } else if (c === '"') val = readString();
    else if (c === "t") { if (text.startsWith("true", i)) { i += 4; val = true; } else fail("bad literal"); }
    else if (c === "f") { if (text.startsWith("false", i)) { i += 5; val = false; } else fail("bad literal"); }
    else if (c === "n") { if (text.startsWith("null", i)) { i += 4; val = null; } else fail("bad literal"); }
    else if (c === "-" || (c !== undefined && c >= "0" && c <= "9")) {
      NUMBER.lastIndex = i;
      const m = NUMBER.exec(text);
      if (m === null) return fail("bad number");
      i += m[0].length;
      val = new JNum(m[0]);
    } else return fail("value expected");

    for (;;) {
      const f = stack[stack.length - 1];
      if (f === undefined) { result = val; break outer; }
      if (f.arr) f.v.push(val); else f.v[f.key] = val;
      ws();
      const d = text[i];
      if (d === ",") { i++; if (!f.arr) f.key = readKey(); break; }
      if (d === (f.arr ? "]" : "}")) { i++; stack.pop(); val = f.v; continue; }
      fail("comma or end expected");
    }
  }
  ws();
  if (i !== n) fail("trailing characters");
  return result;
}
