#!/usr/bin/env python3
"""Rewrites SHA256SUMS over every file of the corpus except tools/ and SHA256SUMS itself ('<sha256> *<relative path>', byte order of the path)."""
import hashlib, os

OUT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

def main():
    files = []
    for root, dirs, names in os.walk(OUT):
        if os.path.relpath(root, OUT) == ".":
            dirs[:] = [d for d in dirs if d != "tools"]
        for n in names:
            rel = os.path.relpath(os.path.join(root, n), OUT).replace(os.sep, "/")
            if rel != "SHA256SUMS":
                files.append(rel)
    files.sort(key=lambda r: r.encode("utf-8"))
    lines = "".join("%s *%s\n" % (hashlib.sha256(open(os.path.join(OUT, r), "rb").read()).hexdigest(), r) for r in files)
    with open(os.path.join(OUT, "SHA256SUMS"), "wb") as f:
        f.write(lines.encode("utf-8"))
    print(len(files), "files")

if __name__ == "__main__":
    main()
