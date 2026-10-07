"""Regenerate tag coverage from the catalog's audited policy metadata."""

import json
from pathlib import Path

from cake_tagger.config import load_catalog

ROOT = Path(__file__).resolve().parents[1]


def update_coverage(root=ROOT):
    root = Path(root)
    tags, policy, _ = load_catalog(root / "model")
    labels = (root / "model/top_tags.txt").read_text(encoding="utf-8-sig").splitlines()
    mapping = policy["mapping"]
    entries = []
    for tag in tags:
        rule = mapping.get(tag)
        automatic = rule is not None and tag not in policy["manualOnly"]
        groups = [rule] if isinstance(rule, list) else rule["all"] if rule else []
        row = dict(
            tag=tag,
            status="automatic"
            if automatic
            else "default-excluded"
            if tag in policy["manualOnly"]
            else "manual",
            labels=[labels[i] for group in groups for i in group],
        )
        if rule and not isinstance(rule, list):
            row["all"] = [[labels[i] for i in group] for group in groups]
        if automatic:
            if tag in policy["scopes"]:
                row["scope"] = policy["scopes"][tag]
        else:
            if tag not in policy["auditReasons"]:
                raise ValueError("Missing audit reason: " + tag)
            row["reason"] = policy["auditReasons"][tag]
        entries.append(row)
    supported = [x["tag"] for x in entries if x["status"] == "automatic"]
    manual = [tag for tag in tags if tag not in supported]
    coverage = dict(
        supportedCount=len(supported),
        totalCount=len(tags),
        supported=supported,
        manualOnly=manual,
        entries=entries,
    )
    (root / "model/coverage.json").write_text(
        json.dumps(coverage, indent=2) + "\n", encoding="utf-8"
    )

    def escape(s):
        return s.replace("|", "\\|")

    lines = [
        "# Tag coverage",
        "",
        f"Under default settings, {len(supported)} of {len(tags)} tags have an automatic model mapping. Coverage describes available signals, not recognition accuracy or calibrated probability. User exclusions further reduce coverage.",
        "",
        "Compound rules require every label group in the same image. Each group accepts alternative labels; the weakest group determines the score. Snapshot labels for motion require review.",
        "",
        "## Automatic mappings",
        "",
        "| Website tag | Pinned model labels | Scope limitation |",
        "| --- | --- | --- |",
    ]
    for row in entries:
        if row["status"] == "automatic":
            lines.append(
                "| "
                + escape(row["tag"])
                + " | "
                + " AND ".join(
                    " OR ".join("`" + escape(x) + "`" for x in group)
                    for group in row.get("all", [row["labels"]])
                )
                + " | "
                + row.get("scope", "")
                + " |"
            )
    lines += [
        "",
        "## Manual or excluded under default settings",
        "",
        "| Website tag | Status | Reason |",
        "| --- | --- | --- |",
    ]
    for row in entries:
        if row["status"] != "automatic":
            lines.append(
                "| "
                + escape(row["tag"])
                + " | "
                + row["status"]
                + " | "
                + row["reason"]
                + " |"
            )
    lines += [
        "",
        "Removing the default exclusion for `hairy` enables its existing mapping. Removing `watermark` does not create a model signal. Manual website entry remains available for all tags.",
        "",
        "## Regenerate",
        "",
        "Run `runtime/cpython/python.exe scripts/update_coverage.py` after editing the catalog. Mapping indices and policy tags are validated before writing reports.",
    ]
    (root / "docs/TAG_COVERAGE.md").write_text(
        "\n".join(lines) + "\n", encoding="utf-8"
    )
    print(f"{len(supported)}/{len(tags)} automatic mappings.")


if __name__ == "__main__":
    update_coverage()
