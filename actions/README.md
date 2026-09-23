# CI actions shared across design4pro repositories

## `artifact-upload` / `artifact-download`

Drop-in replacements for `actions/upload-artifact@v7` and `actions/download-artifact@v8`.

GitHub Team includes 2 GB of Actions storage, measured in GB-hours over the month. Playwright
reports burned through it in September 2026 and every upload after that failed with
`Artifact storage quota has been hit`. The self-hosted CI pool on the OVH VPS (see
`design4pro/cezar`, `docs/host/README.md`, "Linux host") mounts `/srv/ci-artifacts` into each
CI container at `/ci-artifacts`. When that mount is present these actions copy files there and
nothing reaches GitHub storage. When it is not - `RUNNER_CI` set to `["ubuntu-latest"]`, a
Blacksmith runner, the Mac pool - they call the upstream actions with the same inputs, so the
kill switch keeps working.

```yaml
- uses: design4pro/.github/actions/artifact-upload@main
  with:
    name: coverage
    path: coverage
    retention-days: 3          # used only on the GitHub fallback
    if-no-files-found: ignore

- uses: design4pro/.github/actions/artifact-download@main
  with:
    pattern: e2e-blob-*
    path: all-blob-reports
    merge-multiple: true
```

Layout on the host: `/srv/ci-artifacts/<owner>__<repo>/<run_id>/<artifact name>/`, the same
tree `actions/upload-artifact` would have zipped (paths relative to the least common ancestor
of the inputs). Artifacts on the host are not visible in the GitHub UI; fetch them with
`scp -r ubuntu@<vps>:/srv/ci-artifacts/<owner>__<repo>/<run_id>/<name> .`. The job's step
summary names the exact path. A systemd timer on the host deletes runs older than 14 days.

Not supported on the host path: `artifact-id`/`artifact-url` outputs, `compression-level`,
`overwrite: false`, cross-run downloads (`run-id`, `github-token`). The fallback path supports
everything the upstream actions do only through the inputs listed in each `action.yml`.
