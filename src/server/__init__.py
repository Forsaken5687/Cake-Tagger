"""Reusable Cake Tagger inference API. Local HTTP is an optional adapter."""

import logging

logging.getLogger(__name__).addHandler(logging.NullHandler())

__version__ = "1.0.0"


def create_engine(catalog_directory, model_file=None, cpu_capabilities=None):
    """Create one owned engine; callers must stop it or use a context manager."""
    from pathlib import Path

    from .config import capabilities, load_catalog
    from .core import Engine

    directory = Path(catalog_directory)
    _, policy, provenance = load_catalog(directory)
    return Engine(
        model_file or directory / "joytag.onnx",
        provenance["sha256"],
        policy,
        cpu_capabilities or capabilities(),
    )
