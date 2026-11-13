# Arabic Stream Providers

A Nuvio plugin repository focused on Arabic-subtitled sources.

## Install in Nuvio

Repository manifest:
`https://raw.githubusercontent.com/d92n9kyrsk-a11y/Streem-ara/main/manifest.json`

In Nuvio, open **Settings → Content & Discovery → Plugins → Add Repository**, paste the manifest URL, refresh, then enable the providers.

## Providers

- **Krmzy** — initial scraper; requires in-app playback validation.
- **3isk | قصة عشق** — added using a Nuvio-compatible provider implementation; requires in-app playback validation.

## Validation status

A provider appearing in the plugin list does not prove that it returns playable streams. Each source must be tested against a real title and episode in Nuvio. Providers that have not passed that test are not described as working.

## Notes

- The repository does not host video content.
- Playback depends on third-party site availability, embed hosts, and Nuvio runtime support.
