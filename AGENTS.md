# Agent Instructions - Habit Kingdom (KidHabit)

## graphify
This project has a knowledge graph at `graphify-out/` with god nodes, community structure, and cross-file relationships.

Rules:
- For any codebase questions, first run `graphify query "<question>"` (or `/Users/openclaw/.hermes/hermes-agent/venv/bin/graphify query "<question>"`) when `graphify-out/graph.json` exists. Use `graphify path "<A>" "<B>"` for relationships and `graphify explain "<concept>"` for focused concepts.
- After modifying code, always run `graphify update .` (or `/Users/openclaw/.hermes/hermes-agent/venv/bin/graphify update .`) to keep the graph current (AST-only, no API/token cost).
- Read `graphify-out/GRAPH_REPORT.md` only for broad architecture reviews.
