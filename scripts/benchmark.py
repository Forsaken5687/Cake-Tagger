"""Measure identical prepared RGBA inputs, optionally checking a prior baseline."""

import argparse
import json
import statistics
import time
from pathlib import Path

from server import create_engine
from server.core import aggregate

ROOT = Path(__file__).resolve().parents[1]


def benchmark(folder, output, baseline=None, rounds=3):
    folder = Path(folder).resolve()
    output = Path(output).resolve()
    if not output.is_relative_to(ROOT / "work"):
        raise ValueError("Reports must stay inside ignored work/")
    files = sorted(folder.glob("*.rgba"))
    if not files:
        raise ValueError("No prepared RGBA inputs found")
    report = {
        "runs": [],
        "cold": None,
        "maxScoreDifference": 0,
        "allTagDecisionsMatch": True,
    }
    with create_engine(ROOT / "model") as engine:
        start = time.perf_counter()
        cold = engine.submit("warmup", files[0].read_bytes()).result()
        report["cold"] = {
            "seconds": time.perf_counter() - start,
            "timings": cold["timings"],
            "runtime": cold["runtime"],
        }
        for round in range(rounds):
            for file in files:
                start = time.perf_counter()
                result = engine.submit(
                    f"{round}-{file.name}", file.read_bytes()
                ).result()
                seconds = time.perf_counter() - start
                analysis = aggregate(result["scores"], engine.policy)
                row = {
                    "round": round,
                    "file": file.name,
                    "seconds": seconds,
                    "timings": result["timings"],
                    "runtime": result["runtime"],
                    "analysis": analysis,
                }
                if baseline:
                    prior = json.loads(
                        (Path(baseline) / (file.name + ".baseline.json")).read_text()
                    )
                    delta = max(
                        abs(x - y)
                        for actual, expected in zip(
                            result["scores"], prior["scores"], strict=True
                        )
                        for x, y in zip(actual, expected, strict=True)
                    )
                    row["maxScoreDifference"] = delta
                    row["sameTagDecisions"] = analysis == prior["analysis"]
                    row["baselineSeconds"] = prior["seconds"]
                    report["maxScoreDifference"] = max(
                        report["maxScoreDifference"], delta
                    )
                    report["allTagDecisionsMatch"] &= row["sameTagDecisions"]
                report["runs"].append(row)
                print(f"Round {round + 1}, {file.name}: {seconds:.3f}s", flush=True)
    report["medianVideoSeconds"] = statistics.median(
        x["seconds"] for x in report["runs"]
    )
    if baseline:
        report["baselineMedianVideoSeconds"] = statistics.median(
            x["baselineSeconds"] for x in report["runs"]
        )
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(report, indent=2), encoding="utf-8")
    print(
        json.dumps(
            {key: value for key, value in report.items() if key not in ("runs", "cold")}
        )
    )
    if not report["allTagDecisionsMatch"] or report["maxScoreDifference"] > 1e-6:
        raise ValueError("Baseline parity mismatch")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("folder", type=Path)
    parser.add_argument("output", type=Path)
    parser.add_argument("--baseline", type=Path)
    parser.add_argument("--rounds", type=int, default=3)
    args = parser.parse_args()
    if not 1 <= args.rounds <= 10:
        parser.error("Rounds must be between 1 and 10")
    benchmark(args.folder, args.output, args.baseline, args.rounds)
