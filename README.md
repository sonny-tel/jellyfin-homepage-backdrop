# Backdrop Extended

A Jellyfin plugin that extends backdrop functionality with additional features.

## Features

- Fetches random items with backdrop images from every library (movies, series, music, photos, books, etc.)
- Cycles through backdrops every 10 seconds with the native fade-in animation
- Respects the standard **Backdrops** user display setting
- Pauses rotation while a video is playing locally
- Only runs on the homepage; other pages use their normal backdrop behavior
- Works with both legacy and experimental Jellyfin web clients

## Installation

### Manual Install

1. In Jellyfin, go to **Dashboard → Plugins → Repositories**.
2. Add a new repository with this URL:
   ```
   https://raw.githubusercontent.com/sonny-tel/jellyfin-homepage-backdrop/main/manifest.json
   ```
3. Go to **Catalog**, find **Backdrop Extended** under General, and install it.
4. Restart Jellyfin.

### Enable Backdrops

The plugin uses the existing Jellyfin user setting:

1. Go to **Settings → Display**.
2. Check **Backdrops** under the Libraries section.
3. Save. The homepage will now cycle through backdrops from all your media.

## Requirements

- Jellyfin Server 10.11.x or later
