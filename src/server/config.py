"""Configuration and catalog loading, independent of the HTTP adapter."""

import json
import os
from pathlib import Path


def capabilities(cores=None):
    if cores is None:
        cores = getattr(os, "process_cpu_count", os.cpu_count)() or 1
        if hasattr(os, "sched_getaffinity"):
            cores = len(os.sched_getaffinity(0))
    cores = max(1, int(cores))
    return dict(
        logicalProcessors=cores,
        recommendedThreads=max(1, cores // 3),
        testMaximum=cores,
        reason="logical-processors",
        queueCapacity=8,
    )


def load_catalog(directory):
    """Validate policy and mapping before accepting any model work."""
    directory = Path(directory)
    tags = list(
        dict.fromkeys(
            x.strip()
            for x in (directory / "tags.txt")
            .read_text(encoding="utf-8-sig")
            .splitlines()
            if x.strip()
        )
    )
    policy = json.loads((directory / "policy.json").read_text(encoding="utf-8"))
    mapping = json.loads((directory / "mapping.json").read_text(encoding="utf-8"))
    if policy["version"] != "coverage-v6" or not isinstance(mapping, dict):
        raise ValueError("Invalid catalog policy")
    for tag, rule in mapping.items():
        groups = [rule] if isinstance(rule, list) else rule.get("all", [])
        if tag not in tags or not groups:
            raise ValueError("Invalid catalog mapping")
        for group in groups:
            if (
                not isinstance(group, list)
                or not group
                or len(set(group)) != len(group)
                or any(type(i) is not int or not 0 <= i < 5813 for i in group)
            ):
                raise ValueError("Invalid catalog indices")
    for key in ("manualOnly", "details"):
        if not isinstance(policy[key], list) or any(
            tag not in tags for tag in policy[key]
        ):
            raise ValueError("Invalid catalog tags")
    policy = dict(policy, mapping=mapping)
    provenance = json.loads((directory / "provenance.json").read_text(encoding="utf-8"))
    return tags, policy, provenance


def normalize_settings(value=None):
    value = value if isinstance(value, dict) else {}
    parallelism = str(value.get("parallelism", "auto"))
    import re

    if (
        len(parallelism) > 16
        or not re.fullmatch("[1-9][0-9]*", parallelism)
        or int(parallelism) > 9007199254740991
    ):
        parallelism = "auto"
    exclusions = value.get("excludedTags", ["hairy", "watermark"])
    if not isinstance(exclusions, list):
        exclusions = ["hairy", "watermark"]
    exclusions = list(
        dict.fromkeys(
            tag.strip().lower()
            for tag in exclusions
            if isinstance(tag, str) and 0 < len(tag.strip()) <= 80
        )
    )[:303]
    frames = str(value.get("frames", "auto"))
    result = dict(
        language=value.get("language")
        if value.get("language") in ("auto", "de", "en")
        else "auto",
        frames=frames
        if frames in ("auto", "4", "6", "8", "12", "16", "24", "32", "48")
        else "auto",
        parallelism=parallelism,
        excludedTags=exclusions,
    )
    threshold = value.get("suggestionThreshold")
    result["suggestionThreshold"] = threshold if type(threshold) in (int, float) and 0 <= threshold <= 1 else 0.4
    for key, minimum, fallback in [("suggestionLimit", 1, 20), ("uncertainLimit", 0, 15)]:
        limit = value.get(key)
        result[key] = limit if type(limit) is int and minimum <= limit <= 303 else fallback
    for key, fallback in [
        ("showScores", True),
        ("showUncertain", True),
        ("autoAnalyzeEmbed", True),
        ("hideSiteAI", False),
    ]:
        result[key] = value[key] if type(value.get(key)) is bool else fallback
    return result
