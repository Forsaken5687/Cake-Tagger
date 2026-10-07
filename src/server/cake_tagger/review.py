"""Development review exports and comparison rules; no model execution."""

import math

from .validation import number, require

DEFAULT_VARIANTS = {
    name: dict(threshold=threshold, coverage=0.5, tagRules={})
    for name, threshold in [("A", 0.5), ("B", 0.65)]
}


def variants(value, allowed):
    value = DEFAULT_VARIANTS if value is None else value
    require(isinstance(value, dict), "review.invalidRules")
    output = {}
    for name in ("A", "B"):
        rule = value.get(name)
        require(
            isinstance(rule, dict)
            and number(rule.get("threshold"), 0.01, 1)
            and number(rule.get("coverage"), 0.01, 1),
            "review.invalidRules",
        )
        overrides = rule.get("tagRules") or {}
        require(
            isinstance(overrides, dict) and len(overrides) <= len(allowed),
            "review.invalidRules",
        )
        for tag, r in overrides.items():
            require(
                tag in allowed
                and tag not in ("__proto__", "constructor", "prototype")
                and isinstance(r, dict)
                and number(r.get("threshold"), 0.01, 1)
                and number(r.get("coverage"), 0.01, 1),
                "review.invalidRules",
            )
        output[name] = dict(
            threshold=rule["threshold"],
            coverage=rule["coverage"],
            tagRules={
                tag: {key: r[key] for key in ("threshold", "coverage")}
                for tag, r in overrides.items()
            },
        )
    return output


def candidates(frames, policy, rules):
    rows = []
    blocked = set(rules["excludedTags"]) | (
        set(policy["manualOnly"]) - {"hairy", "watermark"}
    )
    for tag, rule in policy["mapping"].items():
        if tag in blocked:
            continue
        groups = [rule] if isinstance(rule, list) else rule["all"]
        scores = [
            min(max(frame[i] for i in group) for group in groups) for frame in frames
        ]
        if not scores:
            continue
        r = rules["tagRules"].get(tag, rules)
        support = sum(x >= r["threshold"] for x in scores)
        if support >= max(2, math.ceil(len(frames) * r["coverage"])):
            rows.append(
                dict(
                    tag=tag,
                    confidence=sum(scores) / len(scores),
                    supportingFrames=support,
                )
            )
    return sorted(rows, key=lambda x: -x["confidence"])


def review_export(evaluation, items, policy, allowed):
    require(
        isinstance(evaluation, dict)
        and isinstance(evaluation.get("videos"), list)
        and len(evaluation["videos"]) == len(items),
        "error.invalidAnalysisData",
    )
    config = evaluation.get("comparisonRules")
    require(
        isinstance(config, dict)
        and isinstance(config.get("excludedTags"), list)
        and len(config["excludedTags"]) <= len(allowed)
        and all(x in allowed for x in config["excludedTags"]),
        "error.invalidTagsInTheCorrection",
    )
    rules = variants(dict(A=config, B=config), allowed)["A"]
    rules["excludedTags"] = list(dict.fromkeys(config["excludedTags"]))
    normalized = variants(evaluation.get("variants"), allowed)
    output = []
    for item, video in zip(items, evaluation["videos"]):
        require(isinstance(video, dict), "error.invalidAnalysisData")
        scores = video.get("modelScores")
        times = video.get("timestamps")
        duration = item["durationSeconds"]
        require(
            video.get("sha256") == item["sha256"]
            and number(duration)
            and isinstance(scores, list)
            and len(scores) == item["sampledFrames"]
            and all(
                isinstance(row, list)
                and len(row) == 5813
                and all(number(x, 0, 1) for x in row)
                for row in scores
            ),
            "error.invalidModelScores",
        )
        require(
            isinstance(times, list)
            and len(times) == len(scores)
            and all(
                number(x) and x < duration and (i == 0 or x > times[i - 1])
                for i, x in enumerate(times)
            ),
            "error.invalidModelScores",
        )
        ignored = video.get("ignoredTags", [])
        partition = video.get("partition", "auto")
        require(
            isinstance(ignored, list)
            and len(ignored) <= len(allowed)
            and all(x in allowed for x in ignored)
            and partition in ("auto", "development", "holdout"),
            "error.invalidAnalysisData",
        )
        output.append(
            dict(
                item,
                evaluation=dict(
                    timestamps=times,
                    modelScores=scores,
                    candidateSuggestions=candidates(scores, policy, rules),
                    ignoredTags=list(dict.fromkeys(ignored)),
                    partition=partition,
                ),
            )
        )
    return dict(
        evaluation=dict(
            version=1,
            preprocessVersion="preprocess-v2",
            mapping=policy["mapping"],
            comparisonRules=rules,
            baselineVersion="coverage-v6",
            variants=normalized,
        ),
        items=output,
    )
