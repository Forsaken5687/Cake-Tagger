# Third-party components

Bundled components retain their own licenses. This document does not grant an additional license for the project's source code.

| Component | Version / provenance | License notices |
| --- | --- | --- |
| JoyTag FP32 | Official ONNX model; revision and checksum in `model/provenance.json` | `model/LICENSE.txt` |
| ONNX Runtime Node and Common | 1.30.0, verified npm archives in `scripts/assets.json` | Upstream notices retained inside the archives and extracted runtime packages |
| ONNX Runtime Web (retired; retained notices) | 1.30.0 | `vendor/LICENSE-ONNX.txt`, `vendor/ThirdPartyNotices.txt` |
| Node.js | 24.19.0, Windows x64 | `runtime/LICENSE-Node.txt` |

The optional Python variant installs ONNX Runtime 1.30.0, NumPy 2.4.4, flatbuffers 25.12.19, packaging 26.3 and protobuf 7.36.2 from PyPI. Exact Windows wheel hashes are recorded under `python` in `scripts/assets.json` and enforced by `scripts/python-requirements.txt`. Installed wheels retain upstream license and dependency notices; no Python binaries are added to the normal release.

Sources: [JoyTag](https://github.com/fpgaminer/joytag), [Official model weights](https://huggingface.co/fancyfeast/joytag), [ONNX Runtime](https://github.com/microsoft/onnxruntime), [Node.js](https://nodejs.org/).

Large downloads are pinned and SHA-256 verified using `scripts/assets.json`. Keep license texts, third-party notices and version/checksum metadata with distributions. Do not translate or alter upstream legal notices.

The mapping uses the bundled cake.ski tag list. Cake Tagger is an independent project and is not an official cake.ski application.

