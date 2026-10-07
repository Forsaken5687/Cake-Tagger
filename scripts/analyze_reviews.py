"""Analyze reviewed exports offline without changing the original annotations."""

import argparse
import json
import re
from pathlib import Path

from cake_tagger.config import load_catalog
from cake_tagger.core import aggregate
from cake_tagger.validation import analysis_policy, number, require

ROOT = Path(__file__).resolve().parents[1]


def metrics(rows, eligible_only=False):

    tp = fp = fn = 0

    for row in rows:
        expected = (
            row["expected"] & row["eligible"] if eligible_only else row["expected"]
        )

        tp += len(row["baseline"] & expected)
        fp += len(row["baseline"] - expected)
        fn += len(expected - row["baseline"])

    return dict(
        truePositive=tp,
        falsePositive=fp,
        falseNegative=fn,
        precision=tp / (tp + fp) if tp + fp else None,
        recall=tp / (tp + fn) if tp + fn else None,
        f1=2 * tp / (2 * tp + fp + fn) if 2 * tp + fp + fn else None,
    )


def analyze_reviews(input, mapping, allowed, policy):

    require(
        isinstance(input, dict) and isinstance(input.get("items"), list),
        "Missing review items",
    )

    renames = policy["renames"]

    def canonical(tag):
        return renames.get(tag, tag)

    normalized = {}

    for tag, indices in mapping.items():
        name = canonical(tag)

        require(
            name not in normalized or normalized[name] == indices,
            "Conflicting mappings for renamed tag: " + name,
        )

        normalized[name] = indices

    mapping = normalized
    unique = {}
    historical = set()
    unreviewed = duplicates = 0

    def valid(tag):
        return (
            isinstance(tag, str)
            and 0 < len(tag) <= 80
            and tag == tag.strip()
            and not re.search(r"[\x00-\x1f\x7f|<>`]", tag)
        )

    for index, item in enumerate(input["items"]):
        if item.get("reviewed") is not True:
            unreviewed += 1
            continue

        result = item.get("result", item)
        video = (
            item.get("evaluation")
            or (input.get("evaluation") or {}).get(
                "videos", [None] * len(input["items"])
            )[index]
        )

        require(
            isinstance(item.get("sha256"), str)
            and re.fullmatch("[a-f0-9]{64}", item["sha256"])
            and isinstance(item.get("tags"), list)
            and all(valid(x) for x in item["tags"]),
            "Invalid reviewed labels",
        )

        require(
            isinstance(video, dict)
            and video.get("sha256", item["sha256"]) == item["sha256"]
            and isinstance(video.get("modelScores"), list)
            and len(video["modelScores"]) == result.get("sampledFrames")
            and all(
                isinstance(row, list)
                and len(row) == 5813
                and all(number(x, 0, 1) for x in row)
                for row in video["modelScores"]
            ),
            "Invalid review score association",
        )

        originals = (item.get("result") or {}).get(
            "tags", item.get("originalSuggestions")
        )

        require(
            isinstance(originals, list)
            and all(
                isinstance(row, dict) and valid(row.get("tag")) for row in originals
            ),
            "Original suggestions are required",
        )

        value = analysis_policy(result.get("analysisPolicy"))

        match = re.fullmatch(
            r"coverage-v[23456]:(majority|brief)(?::(.+))?", value or ""
        )

        require(
            match is not None and number(result.get("threshold"), 0, 1),
            "Original policy is required",
        )

        blocked = set(
            map(canonical, json.loads(match[2]) if match[2] else ["hairy", "watermark"])
        )

        eligible = {
            tag
            for tag in mapping
            if tag not in blocked
            and (tag not in policy["manualOnly"] or tag in ("hairy", "watermark"))
        }

        ignored = video.get("ignoredTags", [])
        partition = video.get("partition", "auto")

        require(
            isinstance(ignored, list)
            and all(valid(x) for x in ignored)
            and partition in ("auto", "development", "holdout"),
            "Invalid review metadata",
        )

        ignored = set(map(canonical, ignored))

        historical.update(
            canonical(tag)
            for tag in item["tags"] + [row["tag"] for row in originals] + list(ignored)
            if canonical(tag) not in allowed
        )

        row = dict(
            sha256=item["sha256"],
            partition=partition,
            ignored=ignored,
            eligible=eligible,
            expected=set(map(canonical, item["tags"])) - ignored,
            baseline={canonical(x["tag"]) for x in originals} - ignored,
        )

        row["reproduced"] = {
            x["tag"]
            for x in aggregate(
                video["modelScores"],
                dict(policy, mapping=mapping),
                result["threshold"],
                match[1],
                list(blocked),
            )["tags"]
        } - ignored

        previous = unique.get(item["sha256"])

        if previous:
            require(
                all(
                    previous[key] == row[key]
                    for key in ("partition", "ignored", "expected")
                ),
                "Conflicting reviews for identical content",
            )
            duplicates += 1
            continue

        unique[item["sha256"]] = row

    rows = sorted(unique.values(), key=lambda row: row["sha256"])

    def split(row):
        return (
            row["partition"]
            if row["partition"] != "auto"
            else "holdout"
            if int(row["sha256"][:8], 16) % 4 == 3
            else "development"
        )

    partitions = {
        name: [row for row in rows if split(row) == name]
        for name in ("development", "holdout")
    }

    tags = (
        set().union(*(row["expected"] | row["baseline"] for row in rows))
        if rows
        else set()
    )

    per_tag = []

    for tag in tags:
        positives = [row for row in rows if tag in row["expected"]]
        tp = sum(tag in row["baseline"] for row in positives)

        per_tag.append(
            dict(
                tag=tag,
                positives=len(positives),
                truePositive=tp,
                falsePositive=sum(
                    tag not in row["ignored"]
                    and tag not in row["expected"]
                    and tag in row["baseline"]
                    for row in rows
                ),
                falseNegative=len(positives) - tp,
                mapped=tag in mapping,
                manualOnly=tag in policy["manualOnly"],
                eligiblePositives=sum(tag in row["eligible"] for row in positives),
            )
        )

    return dict(
        version=1,
        historicalTags=sorted(historical),
        reviewed=len(rows),
        unreviewed=unreviewed,
        duplicates=duplicates,
        baselineMismatches=sum(row["baseline"] != row["reproduced"] for row in rows),
        all=metrics(rows),
        automaticallyEligible=metrics(rows, True),
        perTag=sorted(per_tag, key=lambda row: (-row["falseNegative"], row["tag"])),
        **{
            name: dict(count=len(group), metrics=metrics(group))
            for name, group in partitions.items()
        },
    )


def markdown(report):

    def percent(x):
        return "—" if x is None else f"{x * 100:.1f}%"

    lines = [
        "# Review analysis",
        "",
        f"Reviewed unique videos: {report['reviewed']}. Unreviewed omitted: {report['unreviewed']}. Duplicate reviews omitted: {report['duplicates']}.",
        "",
        "| Scope | Precision | Recall | F1 |",
        "| --- | ---: | ---: | ---: |",
    ]

    for name, m in [
        ("All annotations", report["all"]),
        ("Automatically eligible annotations", report["automaticallyEligible"]),
        ("Development partition", report["development"]["metrics"]),
        ("Holdout partition", report["holdout"]["metrics"]),
    ]:
        lines.append(
            "| "
            + name
            + " | "
            + " | ".join(percent(m[key]) for key in ("precision", "recall", "f1"))
            + " |"
        )

    if report["historicalTags"]:
        lines += [
            "",
            "Historical labels absent from the current catalog: "
            + ", ".join(report["historicalTags"])
            + ". Preserved in annotation metrics; rule replay uses the available mapping.",
        ]

    lines += [
        "",
        f"Development/holdout sizes: {report['development']['count']}/{report['holdout']['count']}. Current-rule replay mismatches: {report['baselineMismatches']}.",
        "",
        "Metrics describe agreement with annotations, not independently established accuracy. Automatic eligibility respects recorded exclusions and manual-only policy. Partitions are deterministic by content hash; related footage may still occur in both. Do not tune repeatedly against the holdout.",
        "",
        "| Tag | Reviewed positives | Correct suggestions | Wrong suggestions | Missed | Model mapping |",
        "| --- | ---: | ---: | ---: | ---: | --- |",
    ]

    for row in report["perTag"]:
        lines.append(
            "| "
            + row["tag"]
            + " | "
            + " | ".join(
                str(row[key])
                for key in (
                    "positives",
                    "truePositive",
                    "falsePositive",
                    "falseNegative",
                )
            )
            + " | "
            + ("yes" if row["mapped"] else "no")
            + " |"
        )

    return "\n".join(lines) + "\n"


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("input", type=Path)
    parser.add_argument("output", type=Path)
    args = parser.parse_args()

    output = args.output.resolve()
    require(
        output.is_relative_to(ROOT / "work") and output.suffix == ".md",
        "Reports must use an .md path inside ignored work/",
    )

    value = json.loads(args.input.read_text(encoding="utf-8-sig"))
    tags, policy, _ = load_catalog(ROOT / "model")
    mapping = (value.get("evaluation") or {}).get("mapping", policy["mapping"])

    report = analyze_reviews(value, mapping, tags, policy)
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(markdown(report), encoding="utf-8")
    output.with_suffix(".json").write_text(
        json.dumps(report, indent=2), encoding="utf-8"
    )
    print(f"{report['reviewed']} reviewed. Report: {output}")
