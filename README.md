# Arabic Stream Providers

A Nuvio repository for Arabic-subtitled streaming sources, with each returned playable stream shown as a selectable server when supported by the Nuvio player.

## Install in Nuvio

Repository manifest:
`https://raw.githubusercontent.com/d92n9kyrsk-a11y/Streem-ara/main/manifest.json`

In Nuvio, open **Settings → Content & Discovery → Plugins → Add Repository**, paste the manifest URL, refresh, then enable the providers.

## Providers

- **Krmzy** — Turkish series and films.
- **3isk | قصة عشق** — Turkish series and films.
- **AlooyTV** — subtitles-only results; dubbed results are filtered.
- **ShoofLive** — searches the catalog and checks the selected episode's player page.
- **Qeseh | قصة عشق** — searches the series and episode pages.
- **TopCinema** — searches series, episode pages, and available watch servers.

## Validation status

The manifest now registers all six provider files. ShoofLive and Qeseh also received a small runtime-reference fix. This confirms repository wiring only; it does **not** confirm that all sites return playable streams. Each provider still needs an in-app Nuvio test for the exact title, season, episode, server list, and playback.

## Notes

- The repository does not host video content.
- Returned servers depend on source-site availability, embed hosts, and Nuvio runtime/player support.


## Additional official services (external playback)

These services offer Turkish content with Arabic subtitles, but they are **not Nuvio scrapers**. They require playback on their own website/app and may require an account or subscription.

- **RuvioTV** — Turkish original audio with Arabic subtitles; licensed catalog and subscription required: https://ruviotv.com/ar/musalsalat-wa-aflam
- **tabii (TRT)** — official TRT streaming platform with Arabic among its supported languages; subtitle availability depends on the title: https://www.tabii.com/ar
- **Netflix Saudi Arabia** — selected Turkish productions offer Turkish original audio and Arabic subtitles; availability varies by title: https://www.netflix.com/sa/

Do not list these as selectable Nuvio servers unless an official, supported playback integration becomes available. The repository does not bypass account checks, subscriptions, or DRM.
