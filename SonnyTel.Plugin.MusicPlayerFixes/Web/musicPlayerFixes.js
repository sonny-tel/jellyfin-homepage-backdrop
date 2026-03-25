// Music Player Fixes — makes keyboard / Media Session "previous track"
// match the skip-back button behaviour: restart the current track when
// position >= 5 s, go to previous track only when < 5 s in.
//
// Strategy: intercept at two layers we *can* reach from an injected
// script (playbackManager is an ES module and not globally accessible):
//   1. Capture-phase keydown for MediaTrackPrevious — fires before
//      Jellyfin's keyboardNavigation handler.
//   2. Wrap navigator.mediaSession.setActionHandler so the OS-level
//      "previous track" control also gets the restart logic.
// Seeking is done directly on the DOM <audio> element.
(function () {
    'use strict';

    var RESTART_THRESHOLD_S = 5;

    /** Find the currently-playing <audio> element Jellyfin creates. */
    function getActiveAudio() {
        var audios = document.querySelectorAll('audio');
        for (var i = 0; i < audios.length; i++) {
            if (!audios[i].paused) return audios[i];
        }
        return null;
    }

    /**
     * If audio is playing and position >= threshold, seek to 0.
     * Returns true if we handled it (caller should suppress default).
     */
    function tryRestart() {
        var audio = getActiveAudio();
        if (!audio) return false;

        if (audio.currentTime >= RESTART_THRESHOLD_S) {
            var pos = audio.currentTime;
            audio.currentTime = 0;
            console.debug('[MusicPlayerFixes] Restarted track (was at ' + Math.round(pos) + 's)');
            return true;
        }
        return false;
    }

    // --- 1. Keyboard interception (capture phase) -------------------
    document.addEventListener('keydown', function (e) {
        if (e.key === 'MediaTrackPrevious') {
            if (tryRestart()) {
                e.preventDefault();
                e.stopImmediatePropagation();
            }
        }
    }, true);

    // --- 2. Media Session wrapper -----------------------------------
    if (navigator.mediaSession) {
        var _origSetAction = navigator.mediaSession.setActionHandler.bind(navigator.mediaSession);
        var _prevTrackHandler = null;

        navigator.mediaSession.setActionHandler = function (action, handler) {
            if (action === 'previoustrack') {
                _prevTrackHandler = handler;
                _origSetAction(action, function () {
                    if (!tryRestart() && _prevTrackHandler) {
                        _prevTrackHandler();
                    }
                });
            } else {
                _origSetAction(action, handler);
            }
        };
    }

    console.info('[MusicPlayerFixes] Loaded');
})();
