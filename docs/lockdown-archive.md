# Private LockDown Browser archive

This optional step extends the existing two-hour AppWatch checker. A successful
Windows Respondus check supplies its version to the private archiver. It seeds
the current version on the first enabled run, saves new versions once, and
retains older installers. Unchanged versions only recheck the archived asset's
metadata; they do not download the installer again.

## Storage

The fixed destination is the existing private repository
`DawsonCodes/dawson-bot` (repository ID 1422709731). The archiver refuses a
public repository or a different repository ID.

- Private configuration: `lockdown-archive/config.json`.
- Per-version index: `lockdown-archive/windows/<version>.json`.
- Actual MSI: private release asset, tag `lockdown-windows-<version>`.

The MSI is too large for a normal Git file. Release assets keep installer bytes
out of Git history and AppWatch's public deployment artifacts. The small
manifest records the version, download source, timestamp, size, SHA-256, release,
and asset ID. A manifest is created only after GitHub confirms the uploaded
asset's size and SHA-256. Manifests are create-only; older versions are not
replaced or deleted. Commits use [skip ci] and do not rebuild Dawson Bot.

## One-time activation

The normal AppWatch GITHUB_TOKEN cannot write another repository. The connector
used to edit source does not provide an exportable Actions credential.

1. Create a fine-grained GitHub personal access token for the owner account.
2. Select **only DawsonCodes/dawson-bot** under repository access.
3. Grant repository **Contents: read and write**. No Actions, administration,
   workflow, or organization permissions are required.
4. Add it to **DawsonCodes/AppWatch → Settings → Secrets and variables →
   Actions → New repository secret**, named **LOCKDOWN_ARCHIVE_TOKEN**.
5. Run **Actions → Check app updates → Run workflow**, or wait for its next
   scheduled run. The archive step reports saved, already archived, incomplete,
   or not enabled. Pick an expiration and renew the secret before it expires.

Do not put the token in source, public data, a workflow input, an issue, or chat.
Only the scheduled/manual main-branch checker receives it. Tests use synthetic
MSI bytes and mocked HTTP responses without a real token or vendor download.

## Behavior and recovery

- Missing secret: a visible setup warning; no download/upload takes place.
- Archive failure: a warning and failed archive step; ordinary metadata checking
  and site deployment continue. The next successful check retries.
- A newly announced release not yet available on the institution page is
  deferred. The old installer is never labeled as the new release.
- The actual versioned MSI link must be present in Respondus's HTML. The
  archiver never guesses old installer URLs.
- The page version, MSI URL, MSI container header, size, and SHA-256 must match.
  Installers are stored unchanged and are never installed or executed.
- Downloads and API responses have timeouts and size bounds. GitHub credentials
  go only to GitHub; vendor requests carry no archive credential. Redirects
  are rejected rather than forwarding authentication to another host.
- An upload interrupted before its manifest can reuse an already confirmed
  asset on retry. Existing assets are never deleted to resolve an error.
- No fixed retention window or automatic deletion is enabled.

This starts an archive going forward. It cannot promise every historical
installer, or a version withdrawn between checks. Keep any older installers
you already have until they have been archived separately.
