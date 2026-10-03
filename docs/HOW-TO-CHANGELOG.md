# How to write release notes and publish a release

A release is published by pushing a Git tag, and only by that. Commits and
merges to `main` never build or publish anything. When a `v*` tag reaches
GitHub, [`release.yml`](../.github/workflows/release.yml) checks it, builds
every platform and creates the GitHub release, with your handwritten notes as
its description and the packages as its downloads.

## Versions and tags

Versions follow [Semantic Versioning](https://semver.org): `MAJOR.MINOR.PATCH`.
The tag is the version with a `v` in front.

| Tag                | Meaning                                  |
| ------------------ | ---------------------------------------- |
| `v0.0.1`, `v0.0.2` | Alpha series: early, anything can change |
| `v0.1.0`           | First usable version                     |
| `v1.0.0`           | Stable                                   |

- Everything starting with `0.` is unstable by definition.
- Versions are numbers only: `v0.0.1` is valid, `v0.0.1-rc.1` or `0.0.1` is
  rejected by the workflow.
- The tag must match `version` in [`package.json`](../package.json) exactly:
  `v0.2.0` requires `"version": "0.2.0"`. The workflow stops otherwise.
- Use annotated tags (`git tag -a`).
- A published tag is never moved or reused. If a release is wrong, publish the
  next patch version.

## Where the notes go

One Markdown file per version, named after the tag:

```text
docs/release-notes/
├── v0.0.1.md
├── v0.0.2.md
└── v0.1.0/          # optional: images for v0.1.0.md
    └── window.png
```

The workflow publishes `docs/release-notes/<tag>.md` as the release
description exactly as written. It refuses to release a tag without that
file. GitHub's automatic "generated release notes" are turned off.

Images live in a folder named after the version. Link them through the tag so
the link never breaks:
`https://raw.githubusercontent.com/don-linux/agenteque/v0.1.0/docs/release-notes/v0.1.0/window.png`

## What goes in the file

Write for someone deciding whether to update, not for a reviewer. Say what
changed for them, not which files changed.

Section names follow [Keep a Changelog](https://keepachangelog.com). Use only
the sections that apply, in this order:

| Section    | For                                 |
| ---------- | ----------------------------------- |
| Added      | New features                        |
| Changed    | Changes to existing behavior        |
| Deprecated | Features that will be removed later |
| Removed    | Features removed in this version    |
| Fixed      | Bug fixes                           |
| Security   | Vulnerabilities fixed               |

Each entry starts with a short bold sentence, then one or two sentences of
detail. Credit contributors and link the pull request or issue:
`By @someone; thanks @reporter. (#12)`.

## Template

Copy this into `docs/release-notes/vX.Y.Z.md` and replace every `X.Y.Z` and
`vA.B.C` (the previous tag):

```markdown
agenteque X.Y.Z <one or two sentences: what this release is about>.

**Download agenteque:** [Mac (Apple Silicon)](https://github.com/don-linux/agenteque/releases/download/vX.Y.Z/agenteque-vX.Y.Z-macos-arm64.dmg) · [Windows (portable)](https://github.com/don-linux/agenteque/releases/download/vX.Y.Z/agenteque-vX.Y.Z-x86_64-windows-portable.exe) · Linux: [AppImage](https://github.com/don-linux/agenteque/releases/download/vX.Y.Z/agenteque-vX.Y.Z-x86_64.AppImage), [.deb](https://github.com/don-linux/agenteque/releases/download/vX.Y.Z/agenteque-vX.Y.Z-x86_64.deb), [.rpm](https://github.com/don-linux/agenteque/releases/download/vX.Y.Z/agenteque-vX.Y.Z-x86_64.rpm), [.tar.gz](https://github.com/don-linux/agenteque/releases/download/vX.Y.Z/agenteque-vX.Y.Z-x86_64-linux.tar.gz)

SHA-256 checksums are in `checksums.txt`.

The Linux packages need glibc 2.25 or newer, which every currently supported release of Ubuntu, Debian and Fedora has.

- **AppImage**, to try it without installing: `chmod +x agenteque-vX.Y.Z-x86_64.AppImage`, then run it.
- **Debian and Ubuntu:** `sudo apt install ./agenteque-vX.Y.Z-x86_64.deb`
- **Fedora:** `sudo dnf install ./agenteque-vX.Y.Z-x86_64.rpm` (openSUSE Tumbleweed: `sudo zypper install` with the same file)

On Windows, `agenteque-vX.Y.Z-x86_64-windows-portable.exe` runs without installing. It is not signed yet, so SmartScreen may warn the first time: click **More info**, then **Run anyway**.

The Mac app is not signed by Apple yet. The first time, open it from Finder, then go to **System Settings → Privacy & Security** and click **Open Anyway**. From a terminal, `xattr -dr com.apple.quarantine /Applications/agenteque.app` does the same.

![What the screenshot shows](https://raw.githubusercontent.com/don-linux/agenteque/vX.Y.Z/docs/release-notes/vX.Y.Z/screenshot.png)

## Added

- **Short sentence.** Detail. By @someone. (#12)

## Fixed

- **Short sentence.** Detail. By @someone; thanks @reporter. (#13)

## Thanks

@someone, @reporter, and everyone who reported problems after A.B.C.

**Full changelog**: https://github.com/don-linux/agenteque/compare/vA.B.C...vX.Y.Z
```

Drop the screenshot line when there is no image. The first release has no
"Full changelog" line because there is no previous tag.

## Release checklist

1. **Open a pull request to `main`** containing:
   - `"version": "X.Y.Z"` in `package.json` (no lockfile change is needed: the
     version is not recorded in `pnpm-lock.yaml`);
   - `docs/release-notes/vX.Y.Z.md`.
2. **Wait for CI.** [`ci.yml`](../.github/workflows/ci.yml) runs lint,
   formatting, type checks, unit tests and the production build, then packages
   the three platforms with the same steps as a release. The packages are
   downloadable from the run's **Artifacts** for 7 days, named
   `agenteque-pr-<number>-...`; try them before tagging.
3. **Merge** the pull request.
4. **Tag the merged commit and push the tag:**

   ```bash
   git switch main
   git pull origin main
   git tag -a vX.Y.Z -m "agenteque X.Y.Z"
   git push origin vX.Y.Z
   ```

5. **Watch the Release workflow** in the Actions tab. When it finishes, the
   release is on the
   [releases page](https://github.com/don-linux/agenteque/releases).

Before building, the workflow checks that:

- the tag has the right format;
- the tag matches `package.json`;
- the notes file exists;
- the tagged commit is on `main`;
- `pnpm lint`, `pnpm fmt:check`, `pnpm check`, `pnpm test` and `pnpm build`
  pass.

## If the Release workflow fails

The release is created only after every platform has built, so a failure
leaves a tag without a release. Fix it and tag the same version again:

```bash
git push origin :refs/tags/vX.Y.Z   # delete the tag on GitHub
git tag -d vX.Y.Z                   # delete it locally
```

Fix the problem in a new pull request, merge it, and repeat step 4 of the
checklist.

Only do this while no release exists for the tag. Once a release has been
published, people may have downloaded it: leave it alone and publish the next
patch version.

## What each release contains

| File                                           | Platform                                                     |
| ---------------------------------------------- | ------------------------------------------------------------ |
| `agenteque-vX.Y.Z-macos-arm64.dmg`             | macOS on Apple Silicon, signed ad-hoc (not notarized)        |
| `agenteque-vX.Y.Z-x86_64-windows-portable.exe` | Windows x86-64, portable `.exe` that runs without installing |
| `agenteque-vX.Y.Z-x86_64.AppImage`             | Linux x86-64, runs without installing                        |
| `agenteque-vX.Y.Z-x86_64.deb`                  | Debian, Ubuntu and derivatives                               |
| `agenteque-vX.Y.Z-x86_64.rpm`                  | Fedora, openSUSE Tumbleweed                                  |
| `agenteque-vX.Y.Z-x86_64-linux.tar.gz`         | Linux x86-64, the unpacked app as a plain archive            |
| `checksums.txt`                                | SHA-256 of every file above                                  |

electron-builder produces the files under its own names
(`electron-builder.yml`), and [`build.yml`](../.github/workflows/build.yml)
renames them to the ones above, so local `pnpm dist` output is unchanged.

Electron is downloaded prebuilt, not compiled on the runner, so the glibc of
the Ubuntu 24.04 runner says nothing about where the Linux packages run. The
requirement comes from the packaged binary itself:

```bash
objdump -T dist/linux-unpacked/agenteque | grep -o 'GLIBC_[0-9.]*' | sort -uV | tail -n 1
```

With Electron 44 that prints `GLIBC_2.25`, so the Linux files need glibc 2.25
or newer. The Linux job of `build.yml` runs the same measurement and fails if
it exceeds `GLIBC_DOCUMENTED`. When an Electron upgrade raises it, update
`GLIBC_DOCUMENTED`, the glibc line in the template above and the notes of the
release that ships the upgrade.
