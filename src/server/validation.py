"""Strict wire-format validation for corrections and exported diagnostics."""

import datetime
import math
import re

SAFE_INTEGER = 9007199254740991


def number(value, low=0, high=SAFE_INTEGER, integer=False):
    return (
        type(value) in (int, float)
        and math.isfinite(value)
        and low <= value <= high
        and (not integer or int(value) == value)
    )


def require(condition, error):
    if not condition:
        raise ValueError(error)


def now():
    return (
        datetime.datetime.now(datetime.timezone.utc)
        .isoformat(timespec="milliseconds")
        .replace("+00:00", "Z")
    )


def date(value):
    if not isinstance(value, str):
        return None
    try:
        datetime.datetime.fromisoformat(value.replace("Z", "+00:00"))
        return value
    except ValueError:
        return None


def analysis_policy(value):
    if value is None:
        return None
    import json

    require(
        isinstance(value, str) and len(value) <= 32768, "error.invalidAnalysisPolicy"
    )
    match = re.fullmatch(r"coverage-v[234567]:(majority|brief)(?::(.+))?", value)
    require(match is not None, "error.invalidAnalysisPolicy")
    if match[2]:
        try:
            items = json.loads(match[2])
            require(
                isinstance(items, list)
                and len(items) <= 303
                and all(
                    isinstance(x, str) and x.strip() and len(x) <= 80 for x in items
                ),
                "error.invalidAnalysisPolicy",
            )
        except (ValueError, TypeError):
            raise ValueError("error.invalidAnalysisPolicy") from None
    return value


def timings(value):
    if value is None:
        return None
    keys = [
        "samplingSeconds",
        "modelLoadSeconds",
        "preprocessSeconds",
        "inferenceSeconds",
        "totalSeconds",
    ]
    optional = [
        "queueSeconds",
        "cpuSeconds",
        "workerWallSeconds",
        "requestSeconds",
        "transportSeconds",
    ]
    require(
        isinstance(value, dict)
        and all(number(value.get(key), 0, 86400) for key in keys),
        "error.invalidAnalysisTimings",
    )
    require(
        all(value.get(key) is None or number(value[key], 0, 86400) for key in optional),
        "error.invalidAnalysisTimings",
    )
    return {key: value[key] for key in keys + optional if value.get(key) is not None}


def runtime(value):
    if value is None:
        return None
    error = "error.invalidAnalysisRuntime"
    require(
        isinstance(value, dict) and value.get("provider") in ("wasm", "native-cpu"),
        error,
    )
    native = value["provider"] == "native-cpu"
    cores = value.get("hardwareConcurrency")
    require(number(cores, 1, integer=True), error)
    keys = ["provider", "hardwareConcurrency"]
    if native:
        require(
            number(value.get("configuredNativeThreads"), 1, cores, True)
            and isinstance(value.get("runtimeVersion"), str)
            and re.fullmatch(r"\d+\.\d+\.\d+", value["runtimeVersion"])
            and isinstance(value.get("modelSha256"), str)
            and re.fullmatch("[a-f0-9]{64}", value["modelSha256"]),
            error,
        )
        keys += ["configuredNativeThreads", "runtimeVersion", "modelSha256"]
    else:
        require(
            number(value.get("configuredWasmThreads"), 1, 8, True)
            and type(value.get("crossOriginIsolated")) is bool
            and type(value.get("sharedArrayBufferAvailable")) is bool
            and value.get("browser") in ("firefox", "chromium", "other"),
            error,
        )
        keys += [
            "configuredWasmThreads",
            "crossOriginIsolated",
            "sharedArrayBufferAvailable",
            "browser",
        ]
    if value.get("inferenceWorkers") is not None:
        require(number(value["inferenceWorkers"], 1, 8, True), error)
        keys.append("inferenceWorkers")
    if value.get("parallelismLimit") is not None:
        x = value["parallelismLimit"]
        require(
            x == "auto"
            or isinstance(x, str)
            and re.fullmatch("[1-9][0-9]*", x)
            and int(x) <= SAFE_INTEGER,
            error,
        )
        keys.append("parallelismLimit")
    if native:
        for key in [
            "logicalProcessors",
            "recommendedThreads",
            "testMaximum",
            "queueCapacity",
        ]:
            if number(value.get(key), 1, integer=True):
                keys.append(key)
        if value.get("threadsPerSession") is not None:
            threads = value["threadsPerSession"]
            require(
                isinstance(threads, list)
                and len(threads) == value.get("inferenceWorkers")
                and all(number(x, 1, integer=True) for x in threads)
                and sum(threads) == value["configuredNativeThreads"]
                and value.get("imageParallelism") in ("auto", "single")
                and number(
                    value.get("residentSessions"), value["inferenceWorkers"], 2, True
                ),
                error,
            )
            keys += ["threadsPerSession", "imageParallelism", "residentSessions"]
        for key, choices in [
            ("backendImplementation", ("python", "node")),
            ("processPriority", ("below-normal", "normal", "other", "unknown")),
            ("processPowerPolicy", ("high-qos", "unavailable")),
            ("inferenceProcessPowerPolicy", ("high-qos", "unavailable")),
        ]:
            if value.get(key) is not None:
                require(value[key] in choices, error)
                keys.append(key)
        if value.get("inferenceRssBytes") is not None:
            require(number(value["inferenceRssBytes"], integer=True), error)
            keys.append("inferenceRssBytes")
        if value.get("threadSpinning") is not None:
            require(type(value["threadSpinning"]) is bool, error)
            keys.append("threadSpinning")
    result = {key: value[key] for key in keys}
    browser = value.get("clientBrowser")
    if browser is not None:
        require(
            isinstance(browser, dict)
            and browser.get("family") in ("firefox", "chromium", "other")
            and browser.get("visibilityState") in ("visible", "hidden"),
            error,
        )
        result["clientBrowser"] = {
            key: browser[key] for key in ("family", "visibilityState")
        }
    memory = value.get("memory")
    if memory is not None:
        fields = [
            "reportedDeviceMemoryGB",
            "pageJsHeapUsedBytes",
            "pageJsHeapTotalBytes",
            "pageJsHeapLimitBytes",
        ]
        require(
            isinstance(memory, dict)
            and memory.get("scope") in ("page-js-heap", "unavailable")
            and all(
                key in memory and (memory[key] is None or number(memory[key]))
                for key in fields
            ),
            error,
        )
        result["memory"] = {key: memory[key] for key in fields + ["scope"]}
    for name, fields in [
        ("hostMemory", ["totalBytes", "freeBytes"]),
        (
            "serverMemory",
            [
                "rssBytes",
                "heapUsedBytes",
                "heapTotalBytes",
                "externalBytes",
                "arrayBuffersBytes",
            ],
        ),
    ]:
        if name not in value:
            continue
        item = value[name]
        if item is None:
            result[name] = None
            continue
        if (
            name == "serverMemory"
            and isinstance(item, dict)
            and item.get("scope") == "process-rss"
        ):
            fields = ["rssBytes"]
        require(
            isinstance(item, dict)
            and all(number(item.get(key), integer=True) for key in fields),
            error,
        )
        if name == "hostMemory":
            require(
                item["totalBytes"] > 0 and item["freeBytes"] <= item["totalBytes"],
                error,
            )
        result[name] = {key: item[key] for key in fields}
        if name == "serverMemory" and item.get("scope") == "process-rss":
            result[name]["scope"] = "process-rss"
    return result


def validate_record(item, allowed):
    require(isinstance(item, dict), "error.invalidFileAssociation")
    filename = item.get("filename")
    sha = item.get("sha256")
    result = item.get("result")
    require(
        isinstance(filename, str)
        and 0 < len(filename) <= 240
        and isinstance(sha, str)
        and re.fullmatch("[a-f0-9]{64}", sha)
        and type(item.get("reviewed")) is bool
        and type(item.get("originalSuggestionsKnown")) is bool,
        "error.invalidFileAssociation",
    )
    require(isinstance(result, dict), "error.invalidAnalysisData")
    analysis_policy(result.get("analysisPolicy"))
    require(
        result.get("samplingMode") in (None, "auto", "fixed"),
        "error.invalidFrameSelection",
    )
    require(
        result.get("durationSeconds") is None
        or number(result["durationSeconds"], 0.0000000001, 600),
        "error.invalidVideoDuration",
    )
    frames = result.get("sampledFrames")
    require(
        result.get("sha256") == sha
        and isinstance(result.get("tags"), list)
        and len(result["tags"]) <= len(allowed)
        and number(frames, 1, 48, True)
        and (result.get("threshold") is None or number(result["threshold"], 0, 1))
        and isinstance(result.get("model"), str)
        and len(result["model"]) <= 120,
        "error.invalidAnalysisData",
    )

    def tags(value):
        require(
            isinstance(value, list)
            and len(value) <= len(allowed)
            and all(isinstance(x, str) and x in allowed for x in value),
            "error.invalidTagsInTheCorrection",
        )
        return list(dict.fromkeys(value))

    def scores(values, uncertain=False):
        rows = []
        for row in values:
            error = (
                "error.invalidUncertainModelScores"
                if uncertain
                else "error.invalidModelScores"
            )
            require(
                isinstance(row, dict)
                and row.get("tag") in (uncertain_tags if uncertain else allowed)
                and number(row.get("confidence"), 0, 1)
                and (
                    number(
                        row.get("supportingFrames"), 0 if uncertain else 1, frames, True
                    )
                    if uncertain or row.get("supportingFrames") is not None
                    else True
                ),
                error,
            )
            rows.append(
                {
                    key: row[key]
                    for key in ["tag", "confidence", "supportingFrames"]
                    if key in row and row[key] is not None
                }
            )
        return rows

    uncertain_tags = tags(result.get("uncertain"))
    uncertain_scores = result.get("uncertainScores")
    require(
        uncertain_scores is None
        or isinstance(uncertain_scores, list)
        and len(uncertain_scores) <= len(uncertain_tags),
        "error.invalidUncertainModelScores",
    )
    sources = item.get("tagSources")
    require(
        sources is None
        or isinstance(sources, dict)
        and all(
            tag in allowed and source in ("suggestion", "manual", "unknown")
            for tag, source in sources.items()
        ),
        "error.invalidTagOrigin",
    )
    clean = dict(
        filename=filename,
        sha256=sha,
        tags=scores(result["tags"]),
        uncertain=uncertain_tags,
        uncertainScores=None
        if uncertain_scores is None
        else scores(uncertain_scores, True),
        sampledFrames=frames,
        model=result["model"],
        createdAt=date(result.get("createdAt")),
        reviewRequired=True,
        timings=timings(result.get("timings")),
        runtime=runtime(result.get("runtime")),
    )
    for key in ["threshold", "analysisPolicy", "samplingMode", "durationSeconds"]:
        clean[key] = result.get(key)
    return dict(
        filename=filename,
        sha256=sha,
        tags=tags(item.get("tags")),
        candidateTags=tags(item.get("candidateTags")),
        reviewed=item["reviewed"],
        originalSuggestionsKnown=item["originalSuggestionsKnown"],
        result=clean,
        tagSources=sources,
        updatedAt=date(item.get("updatedAt")) or now(),
    )


def export_item(record):
    result = record["result"]
    original = [x["tag"] for x in result["tags"]]
    selected = record["tags"]
    known = record["originalSuggestionsKnown"]
    candidates = list(
        dict.fromkeys(
            original + record["candidateTags"] + selected + result["uncertain"]
        )
    )
    sources = {}
    for tag in candidates:
        source = (record["tagSources"] or {}).get(tag)
        if source is None:
            if tag not in record["candidateTags"] and tag not in selected:
                source = "suggestion"
            elif not known:
                source = "unknown"
            else:
                source = "suggestion" if tag in original else "manual"
        sources[tag] = source
    output = dict(
        filename=record["filename"],
        sha256=record["sha256"],
        tags=selected,
        reviewed=record["reviewed"],
        originalSuggestionsKnown=known,
        originalSuggestions=result["tags"] if known else None,
        tagSources=sources,
        addedTags=[x for x in selected if x not in original] if known else None,
        removedTags=[x for x in original if x not in selected] if known else None,
        deselectedTags=[x for x in candidates if x not in selected],
        candidateTags=candidates,
        analysisCreatedAt=result["createdAt"],
        editedAt=record["updatedAt"],
    )
    for key in [
        "uncertain",
        "uncertainScores",
        "sampledFrames",
        "threshold",
        "analysisPolicy",
        "samplingMode",
        "durationSeconds",
        "model",
        "timings",
        "runtime",
    ]:
        output[key] = result[key]
    return output
