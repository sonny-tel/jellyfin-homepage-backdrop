// Music Player Fixes — patches playbackManager.previousTrack so that
// keyboard shortcuts and Media Session API match the skip-back button
// behaviour: restart the current track first when position >= 5 s,
// then go to the previous track only on a second press (or when < 5 s
// into the song).
(function () {
    'use strict';

    var RESTART_THRESHOLD_MS = 5000;

    // Wait for the playbackManager singleton to be available on the
    // global `window` scope. Jellyfin attaches it early in the boot
    // process; poll briefly to catch it.
    var attempts = 0;
    var maxAttempts = 50;

    function getPlaybackManager() {
        // eslint-disable-next-line compat/compat
        try {
            // The playback manager attaches as a named export but is
            // also reachable through the global Events bus indirectly.
            // The most reliable way from an injected script is the
            // `require` shim Jellyfin exposes.
            if (window.require) {
                var mod = window.require('components/playback/playbackmanager');
                if (mod && mod.playbackManager) {
                    return mod.playbackManager;
                }
            }
        } catch (_) {
            // ignore
        }
        return null;
    }

    function patchPreviousTrack(pbm) {
        var _originalPreviousTrack = pbm.previousTrack.bind(pbm);

        pbm.previousTrack = function (player) {
            player = player || pbm._currentPlayer || pbm.getCurrentPlayer();
            if (!player) {
                return;
            }

            // Only apply the restart-first logic for audio playback.
            var isAudio = false;
            try {
                isAudio = pbm.isPlayingAudio
                    ? pbm.isPlayingAudio(player)
                    : pbm.isPlayingMediaType('Audio', player);
            } catch (_) {
                // fall through – treat as non-audio
            }

            if (isAudio) {
                var positionMs = 0;
                try {
                    positionMs = pbm.currentTime(player);
                } catch (_) {
                    // fall through
                }

                var isFirstTrack = false;
                try {
                    isFirstTrack = pbm.getCurrentPlaylistIndex(player) <= 0;
                } catch (_) {
                    // fall through
                }

                // If we are past the threshold, or there is no previous
                // track to go to, restart the current track instead.
                if (positionMs >= RESTART_THRESHOLD_MS || isFirstTrack) {
                    try {
                        pbm.seekPercent(0, player);
                    } catch (_) {
                        try { pbm.seek(0, player); } catch (_2) { /* ignore */ }
                    }
                    console.debug('[MusicPlayerFixes] Restarted current track (position was ' + Math.round(positionMs / 1000) + 's)');
                    return;
                }
            }

            // For video, or audio with position < threshold and not
            // first track, fall through to the original behaviour.
            return _originalPreviousTrack(player);
        };

        console.info('[MusicPlayerFixes] Patched playbackManager.previousTrack');
    }

    function tryPatch() {
        var pbm = getPlaybackManager();
        if (pbm) {
            patchPreviousTrack(pbm);
            return;
        }

        attempts++;
        if (attempts < maxAttempts) {
            setTimeout(tryPatch, 200);
        } else {
            console.warn('[MusicPlayerFixes] Could not find playbackManager after ' + maxAttempts + ' attempts');
        }
    }

    // Start polling once the DOM is ready.
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', tryPatch);
    } else {
        tryPatch();
    }
})();
