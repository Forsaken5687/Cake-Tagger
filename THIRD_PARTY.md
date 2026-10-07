# Third-party components

Bundled components retain their own licenses. This document does not grant an additional license for the project's source code.

| Component | Version / provenance | License notices |
| --- | --- | --- |
| JoyTag FP32 | Official ONNX model; pinned revision and SHA-256 in `model/provenance.json` | `model/LICENSE.txt` |
| CPython | 3.13.16, Windows x64 embeddable distribution | Upstream `LICENSE.txt` inside the verified runtime ZIP |
| ONNX Runtime CPU | 1.30.0 | License and third-party notices inside the wheel and installed package; retained `vendor/LICENSE-ONNX.txt` and `vendor/ThirdPartyNotices.txt` |
| NumPy | 2.4.4 | Upstream wheel license metadata |
| flatbuffers | 25.12.19 | Upstream wheel license metadata |
| packaging | 26.3 | Upstream wheel license metadata |
| protobuf | 7.36.2 | Upstream wheel license metadata |

Windows wheel URLs and SHA-256 values are pinned in `scripts/assets.json`; `scripts/python-requirements.txt` provides the matching hash lock. Setup installs them into the application-local interpreter and preserves package metadata and legal notices. Runtime releases contain the interpreter and installed wheels assembled from verified archives, including their license metadata, and the model weight. Installation archives and private project state are excluded.

The browser-module test suite uses Node.js 24.19.0 solely as an ignored development tool; it is absent from application and core releases. Its checksum is listed separately under `development` in the asset manifest, and its legal text is retained at `work/tools/LICENSE-JavaScript.txt` beside the development test binary.

Sources: [CPython Windows distribution](https://docs.python.org/3.13/using/windows.html#the-embeddable-package), [JoyTag](https://github.com/fpgaminer/joytag), [official model weights](https://huggingface.co/fancyfeast/joytag), [ONNX Runtime](https://github.com/microsoft/onnxruntime), [NumPy](https://numpy.org/), [PyPI](https://pypi.org/).

Keep upstream license texts, dependency metadata and checksums with distributions. Do not translate or alter legal notices. Cake Tagger is an independent project and is not an official cake.ski application.
