"""Appendix A extraction (rules X1 to X3) and figure parsing, straight from design 32."""
import os
import re

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
DESIGN = os.path.join(os.path.dirname(os.path.dirname(ROOT)), "docs", "isongraph-visualize-blueprint",
                      "32-INTERACTION-A11Y-EXPORT-DESIGN.md")

HEAD = re.compile(r"^\((lines, |hex, )?(\d+) bytes, SHA-256 `([0-9a-f]{64})`\):$")


def load_design():
    with open(DESIGN, "rb") as f:
        raw = f.read()
    assert b"\r" not in raw, "design file has CR"
    return raw.decode("utf-8")


def extract_blocks(text):
    """returns list of dict(kind, size, sha, data, label) for every gated block of Appendix A"""
    i = text.index("## Appendix A.")
    lines = text[i:].split("\n")   # split on LF only
    out = []
    k = 0
    last_label = ""
    while k < len(lines):
        ln = lines[k]
        if ln.startswith("**A."):
            last_label = ln.split("**")[1]
        m = HEAD.match(ln)
        if m:
            kind = {None: "text", "lines, ": "lines", "hex, ": "hex"}[m.group(1)]
            size, h = int(m.group(2)), m.group(3)
            j = k + 1
            while lines[j].strip() == "":
                j += 1
            assert lines[j].startswith("```"), lines[j]
            j += 1
            body = []
            while not lines[j].startswith("```"):
                body.append(lines[j])
                j += 1
            blk = "\n".join(body)
            if kind == "text":
                data = blk.encode("utf-8")
            elif kind == "lines":
                data = (blk + "\n").encode("utf-8")
            else:
                data = bytes.fromhex(blk.strip())
            out.append({"kind": kind, "size": size, "sha": h, "data": data, "label": last_label})
            k = j
        k += 1
    return out


def figures(text):
    """figures quoted without blocks: name -> dict"""
    n = lambda s: int(s.replace(",", ""))
    f = {}

    def g(name, pat, conv):
        m = re.search(pat, text, re.S)
        assert m, "figure not found: " + name
        f[name] = conv(m)
    g("A.2 C02", r"The tree is ([\d,]+) bytes, SHA-256 `([0-9a-f]{64})`", lambda m: {"bytes": n(m.group(1)), "sha": m.group(2)})
    g("A.7 P01", r"Row `P01` \(first realization[^)]*\) is (\d+) lines, ([\d,]+) bytes, SHA-256 `([0-9a-f]{64})`",
      lambda m: {"lines": int(m.group(1)), "bytes": n(m.group(2)), "sha": m.group(3)})
    for r in ("P04", "P07", "P08", "P09"):
        g("A.7 " + r, r"`%s` (\d+) lines, ([\d,]+) bytes, SHA-256 `([0-9a-f]{64})`" % r,
          lambda m: {"lines": int(m.group(1)), "bytes": n(m.group(2)), "sha": m.group(3)})
    for r in ("Q01", "Q02", "Q03", "Q04"):
        g("A.7 " + r, r"`%s` \(executor log\) (\d+) lines, ([\d,]+) bytes, SHA-256 `([0-9a-f]{64})`" % r,
          lambda m: {"lines": int(m.group(1)), "bytes": n(m.group(2)), "sha": m.group(3)})
    g("A.8 crc", r"and is `([0-9a-f]{8})`\. The result:", lambda m: {"crc": m.group(1)})
    g("A.9 state", r"`state` (\d+) bytes \(the A\.2 state of 27, SHA-256 `([0-9a-f]{64})`\)", lambda m: {"bytes": n(m.group(1)), "sha": m.group(2)})
    g("A.9 svg", r"`svg` (\d+) bytes \(the 38-byte declaration.*?SHA-256 `([0-9a-f]{64})`\)", lambda m: {"bytes": n(m.group(1)), "sha": m.group(2)})
    g("A.9 X02", r"Without the PNG \(`X02`\) the manifest is (\d+) bytes, SHA-256 `([0-9a-f]{64})`", lambda m: {"bytes": n(m.group(1)), "sha": m.group(2)})
    g("A.9 X01", r"\(`X01`\) it is (\d+) bytes, SHA-256 `([0-9a-f]{64})`", lambda m: {"bytes": n(m.group(1)), "sha": m.group(2)})
    g("A.10 state", r"`state` is (\d+) bytes, SHA-256 `([0-9a-f]{64})`", lambda m: {"bytes": n(m.group(1)), "sha": m.group(2)})
    g("A.10 svg", r"`svg` is the ([\d,]+) bytes of `renderSvg` without the declaration \(SHA-256 `([0-9a-f]{64})`", lambda m: {"bytes": n(m.group(1)), "sha": m.group(2)})
    g("A.13 C05", r"positions 200 to 399; the tab stop is the focused item\), tree (\d+) bytes", lambda m: {"bytes": n(m.group(1))})
    g("A.13 C07", r"\(row `C07`, (\d+) bytes\)", lambda m: {"bytes": n(m.group(1))})
    return f
