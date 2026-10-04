# Third-party components

Bundled components retain their own licenses. This document does not grant an additional license for the project's source code.

| Component | Version / provenance | License notices |
| --- | --- | --- |
| JoyTag INT8 | Community conversion; revision and checksum in `model/provenance.json` | `model/LICENSE.txt` |
| ONNX Runtime Node and Common | 1.30.0, verified npm archives in `scripts/assets.json` | Upstream notices retained inside the archives and extracted runtime packages |
| ONNX Runtime Web (retired; retained notices) | 1.30.0 | `vendor/LICENSE-ONNX.txt`, `vendor/ThirdPartyNotices.txt` |
| Node.js | 24.19.0, Windows x64 | `runtime/LICENSE-Node.txt` |

Sources: [JoyTag](https://github.com/fpgaminer/joytag), [INT8 conversion](https://huggingface.co/IamTheStormThatIsApproaching/joytag-onnx-Q8_0-quantized), [ONNX Runtime](https://github.com/microsoft/onnxruntime), [Node.js](https://nodejs.org/).

Large downloads are pinned and SHA-256 verified using `scripts/assets.json`. Keep license texts, third-party notices and version/checksum metadata with distributions. Do not translate or alter upstream legal notices.

The mapping uses the bundled cake.ski tag list. Cake Tagger is an independent project and is not an official cake.ski application.

