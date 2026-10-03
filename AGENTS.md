# Project conventions

- Keep the project ready to share. Product text describes the current workflow; do not include conversation history, personal comparisons or machine-specific test details.
- Use `README.md` as the entry point. Put technical documentation in `docs/`, reusable tooling in `scripts/`, and synthetic tests in `tests/`.
- Store temporary experiments and personal test reports under ignored `work/`. Keep corrections and session tokens in ignored `data/`; exports and packages in ignored `outputs/`.
- Never commit videos, personal feedback, generated exports, session tokens or large model/runtime binaries. Maintain `.gitignore` and the asset manifest when adding dependencies.
- Keep bundled third-party license notices and version/checksum metadata intact.
- Run `scripts/Test.ps1` after code changes and check the relevant browser flow for UI changes. Preserve users' existing corrections.
- Use focused local Git commits with clear messages. Do not publish a repository, push, or change global Git configuration without explicit user authorization.
- Update README and technical documentation when behavior or setup changes. Prefer accurate, concise documentation over one-off test narratives.
