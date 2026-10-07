# Experimental Python inference

Available in source checkouts only; the normal distribution omits the Python starter, tools and runtime.

This separate variant keeps the existing browser interface, extension and Node HTTP/security layer. Python owns the CPU model session, video queue, preprocessing and production tag aggregation. It is not a complete rewrite of the HTTP server. The regular Node inference path remains the default.

## Local setup and start

Requirements: the normal project dependencies and CPython 3.12 x64 on Windows. From the project root:

~~~powershell
./scripts/Setup-Python.ps1 -PythonExecutable python
~~~

If Python is not on PATH, pass the full path to its executable. The script creates an isolated environment in ignored runtime/python and installs exact wheel versions with required SHA-256 hashes. Optional wheel metadata is in scripts/assets.json; this dependency set is not added to the regular release.

Quit the current backend, then run Start-Python.cmd. The existing extension continues to use port 8765. The starter refuses an occupied port. Python preferences and the session token are isolated in data/python; existing Node preferences and corrections are preserved. Quit waits for the current native call, cancels queued jobs and exits both the HTTP process and Python worker.

A different port can be used with scripts/Start-Python.ps1 -Port 8766 for diagnostics; the extension still targets 8765. Start.cmd selects the normal Node variant.

## Reusable core

src/server/python_core.py has no HTTP, browser or Node dependency. Engine accepts an ONNX file, its SHA-256, a policy snapshot and CPU capabilities. Submit a packed sequence of 448 x 448 RGBA images; Engine returns a Future with per-label scores, timings and runtime diagnostics. Cancellation is checked between native calls. Call stop() to cancel remaining work and release the session. aggregate() applies temporal support, compound rules, exclusions, confidence scores and result limits to those scores.

The local adapter supplies mapping, detail tags and manual-only exclusions from the current JavaScript policy rather than maintaining a second tag list. scripts/Package-Python-Core.mjs exports that same policy with the reusable Python source. The generated ZIP omits videos, private state, model weights and interpreter binaries. A Cake integration can load policy.json and model/provenance.json, install onnxruntime 1.30.0 and numpy 2.4.4 for its own platform, and use the same model. The hash-locked local requirements file is specific to Windows/CPython 3.12; it is not a Linux installation lockfile.

The worker bridge uses length-framed binary input over private stdin and NDJSON over stdout. It has no network listener. Frame dimensions/counts and CPU overrides are validated before processing; one warmed session processes images sequentially. Applied Windows process QoS and Python RSS are reported independently from the Node HTTP process.

## Comparison and tests

Run scripts/Test.ps1. When the optional Python environment is present, Python tests verify aggregation parity, compound/detail rules, queue saturation, active/queued cancellation, orderly shutdown and overrides above eight. When absent, those optional tests report a skip.

scripts/Compare-Backends.mjs accepts a folder of preprocessed .rgba files and an output JSON path. Each file contains one to 48 consecutive 448 x 448 RGBA images. It warms both sessions, then runs three rounds with alternating backend order, identical thread settings and identical bytes. It checks all 5,813 scores per image and tag/support decisions. Reports belong in ignored work/. Timings exclude video decoding and frame sampling; they are not end-to-end upload times. Personal video results never belong in documentation or Git.

~~~powershell
./runtime/node.exe scripts/Compare-Backends.mjs work/backend-comparison/frames work/backend-comparison/report.json
./runtime/node.exe scripts/Package-Python-Core.mjs
~~~
