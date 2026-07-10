#!/usr/bin/env python3
"""
Local Graphify substitute for habit-kingdom.

The upstream Graphify CLI (documented at
/Users/openclaw/.hermes/hermes-agent/venv/bin/graphify) is NOT installed in this
environment, and per the graphify skill it is not on public pip/npm registries,
so `graphify update .` cannot run.

This script reproduces the AST-only extraction the CLI performs, using only the
Python stdlib, and emits the same artifact shape the skill documents:
  - graphify-out/graph.json   (nodes: id,label,source_file,source_location;
                               edges: source,target,relation,confidence)
  - graphify-out/GRAPH_REPORT.md
  - graphify-out/manifest.json

It is intentionally dependency-free so it runs anywhere without install.
Run:  python3 scripts/graphify_local.py
"""
import ast
import json
import os
import re
import sys
from collections import defaultdict, deque

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT_DIR = os.path.join(ROOT, "graphify-out")

# Files/dirs to ignore
IGNORE_DIRS = {
    "node_modules", ".git", ".expo", "dist", "server/node_modules",
    "server/dist", "__tests__", ".dreaming", ".hermes", "android", "ios",
    "backups", "scripts", "patches",
}
TS_EXTS = {".ts", ".tsx"}

# Regexes (AST-only-ish: handles the static forms the real CLI captures)
IMPORT_RE = re.compile(
    r"""(?x)
    (?: import \s+ [^;]*? \s+ from \s+ | import \s+ | export \s+ [^;]*? \s+ from \s+ )
    ['"]([^'"]+)['"]
    |
    (?: require|import ) \s* \( \s* ['"]([^'"]+)['"] \s* \)
    """,
    re.VERBOSE,
)
DECL_RE = re.compile(
    r"""(?x)
    (?: export \s+ (?: default \s+ )? )?
    (?:
        function \s+ ([A-Za-z_$][\w$]*)              # function name
      | class \s+ ([A-Za-z_$][\w$]*)                # class name
      | (?: const | let | var ) \s+ ([A-Za-z_$][\w$]*)  # const/let/var name
    )
    """,
)
ARROW_RE = re.compile(r"(?: const | let | var ) \s+ ([A-Za-z_$][\w$]*) \s*:")


def rel(path: str) -> str:
    return os.path.relpath(path, ROOT)


def ext_is_ts(path: str) -> bool:
    return os.path.splitext(path)[1] in TS_EXTS


def walk_sources():
    for dirpath, dirnames, filenames in os.walk(ROOT):
        dirnames[:] = [d for d in dirnames if d not in IGNORE_DIRS]
        for fn in filenames:
            p = os.path.join(dirpath, fn)
            if ext_is_ts(p):
                yield p


def resolve_import(imp, from_file):
    # type: (str, str) -> "str | None"
    """Resolve a relative or alias import to a concrete source file."""
    if not imp.startswith(".") and not imp.startswith("@/"):
        return None  # external package — skip (AST-only, local graph)
    base = from_file
    if imp.startswith("@/"):
        target = os.path.join(ROOT, imp[2:])
    else:
        target = os.path.normpath(os.path.join(os.path.dirname(from_file), imp))
    for cand in (target, target + ".ts", target + ".tsx",
                 os.path.join(target, "index.ts"),
                 os.path.join(target, "index.tsx")):
        if os.path.isfile(cand) and ext_is_ts(cand):
            return cand
    return None


def main():
    nodes = []
    edges = []
    node_id = 0
    file_node = {}
    symbol_node = {}

    def add_file_node(path):
        nonlocal node_id
        node_id += 1
        nid = f"f{node_id}"
        file_node[path] = nid
        nodes.append({
            "id": nid, "label": rel(path), "kind": "file",
            "source_file": rel(path), "source_location": "0:0",
        })
        return nid

    def add_symbol(file_path, name, kind, lineno):
        nonlocal node_id
        node_id += 1
        nid = f"s{node_id}"
        symbol_node[(file_path, name)] = nid
        nodes.append({
            "id": nid, "label": f"{name}()", "kind": kind,
            "source_file": rel(file_path), "source_location": f"{lineno}:0",
        })
        edges.append({
            "source": file_node[file_path], "target": nid,
            "relation": "contains", "confidence": 1.0,
        })
        return nid

    files = list(walk_sources())
    for fp in files:
        add_file_node(fp)

    import_graph = defaultdict(set)
    # Pass 1: symbols
    for fp in files:
        try:
            with open(fp, "r", encoding="utf-8", errors="ignore") as fh:
                src = fh.read()
        except OSError:
            continue
        for m in DECL_RE.finditer(src):
            name = m.group(1) or m.group(2) or m.group(3)
            if not name:
                continue
            kind = "function" if m.group(1) else ("class" if m.group(2) else "const")
            lineno = src.count("\n", 0, m.start()) + 1
            add_symbol(fp, name, kind, lineno)
        # imports
        for im in IMPORT_RE.finditer(src):
            imp = im.group(1) or im.group(2)
            if not imp:
                continue
            resolved = resolve_import(imp, fp)
            if resolved and resolved in file_node:
                edges.append({
                    "source": file_node[fp], "target": file_node[resolved],
                    "relation": "imports_from", "confidence": 1.0,
                })
                import_graph[rel(fp)].add(rel(resolved))

    # Analysis ----------------------------------------------------------------
    all_files = {rel(f) for f in files}
    files_with_edges = set()
    for e in edges:
        sn = next((n for n in nodes if n["id"] == e["source"]), None)
        tn = next((n for n in nodes if n["id"] == e["target"]), None)
        if sn and sn["kind"] == "file":
            files_with_edges.add(sn["source_file"])
        if tn and tn["kind"] == "file":
            files_with_edges.add(tn["source_file"])

    imported_by = defaultdict(set)
    for a, deps in import_graph.items():
        for d in deps:
            imported_by[d].add(a)
    god_nodes = sorted(imported_by.items(), key=lambda x: -len(x[1]))[:15]
    leaves = sorted(import_graph.items(), key=lambda x: -len(x[1]))[:15]
    orphans = sorted(f for f in all_files if f not in files_with_edges)

    # cycle detection
    visited, stack, cycles = set(), set(), []

    def dfs(f, path):
        visited.add(f)
        stack.add(f)
        for nxt in import_graph.get(f, ()):
            if nxt not in visited:
                dfs(nxt, path + [nxt])
            elif nxt in stack:
                idx = path.index(nxt) if nxt in path else len(path)
                cycles.append(tuple(path[idx:] + [nxt]))
        stack.discard(f)

    for f in sorted(import_graph):
        if f not in visited:
            dfs(f, [f])

    graph = {
        "nodes": nodes,
        "edges": edges,
        "meta": {
            "generator": "scripts/graphify_local.py (local AST substitute)",
            "root": ROOT,
            "file_count": len(files),
            "node_count": len(nodes),
            "edge_count": len(edges),
        },
    }
    os.makedirs(OUT_DIR, exist_ok=True)
    with open(os.path.join(OUT_DIR, "graph.json"), "w", encoding="utf-8") as fh:
        json.dump(graph, fh, indent=2)

    manifest = {
        "generator": "graphify_local.py",
        "created_at": __import__("datetime").datetime.now().isoformat(),
        "file_count": len(files),
        "node_count": len(nodes),
        "edge_count": len(edges),
        "artifacts": ["graph.json", "GRAPH_REPORT.md"],
    }
    with open(os.path.join(OUT_DIR, "manifest.json"), "w", encoding="utf-8") as fh:
        json.dump(manifest, fh, indent=2)

    report = ["# Graphify Report — Habit Kingdom (local AST extraction)", ""]
    report.append(f"**Generated:** {manifest['created_at']}")
    report.append(f"**Files scanned:** {len(files)}  |  **Nodes:** {len(nodes)}  |  **Edges:** {len(edges)}")
    report.append("")
    report.append("> Local substitute for the unavailable Graphify CLI. AST-only: "
                  "static imports + top-level declarations. Dynamic `import()`, "
                  "runtime HTTP, and event-emitter listeners are invisible — same "
                  "limitation as the upstream CLI.")
    report.append("")
    report.append("## God Nodes (most imported files)")
    for f, importers in god_nodes:
        report.append(f"- `{f}` — imported by {len(importers)} files")
    report.append("")
    report.append("## Heaviest Dependers (import the most)")
    for f, deps in leaves:
        report.append(f"- `{f}` — imports {len(deps)} files")
    report.append("")
    report.append("## Orphan Files (no graph edges)")
    if orphans:
        for f in orphans:
            report.append(f"- `{f}`")
    else:
        report.append("- none")
    report.append("")
    report.append("## Circular Dependencies")
    if cycles:
        for c in cycles[:20]:
            report.append(f"- `{' -> '.join(c)}`")
    else:
        report.append("- none detected")
    report.append("")
    report.append("---")
    report.append(f"_Generated by scripts/graphify_local.py — {len(nodes)} nodes, "
                  f"{len(edges)} edges._")
    with open(os.path.join(OUT_DIR, "GRAPH_REPORT.md"), "w", encoding="utf-8") as fh:
        fh.write("\n".join(report))

    print(f"OK: {len(files)} files, {len(nodes)} nodes, {len(edges)} edges")
    print(f"god_nodes={len(god_nodes)} orphans={len(orphans)} cycles={len(cycles)}")
    print(f"artifacts written to {OUT_DIR}")


if __name__ == "__main__":
    sys.exit(main())
