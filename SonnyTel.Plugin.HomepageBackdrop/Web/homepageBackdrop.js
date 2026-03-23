// Homepage Backdrop — cycles backdrops on the homepage from all media sources.
// Only active when the user's "Backdrops" display setting is enabled.
(function () {
    'use strict';

    var LOG_PREFIX = '[HomepageBackdrop]';
    var ROTATION_INTERVAL_MS = 10000;
    var FETCH_LIMIT = 20;
    var POLL_INTERVAL_MS = 2000;

    var rotationTimer = null;
    var pollTimer = null;
    var currentImages = [];
    var currentIndex = -1;
    var isActive = false;

    console.log(LOG_PREFIX, 'Script loaded');

    // --- Helpers ---

    function isHomePage() {
        var hash = window.location.hash;
        // Jellyfin 10.11.x uses hash router: #/home, #/home?tab=0, etc.
        if (hash === '#/home' || hash.indexOf('#/home?') === 0) {
            return true;
        }
        // Legacy formats (redirected by Jellyfin but check anyway)
        if (hash === '#!/home' || hash.indexOf('#!/home?') === 0) {
            return true;
        }
        return false;
    }

    function isVideoPlaying() {
        var videos = document.querySelectorAll('video');
        for (var i = 0; i < videos.length; i++) {
            if (!videos[i].paused) {
                return true;
            }
        }
        return false;
    }

    // --- Backdrop management ---

    function clearPluginBackdrop() {
        if (!isActive) {
            return;
        }
        console.log(LOG_PREFIX, 'Clearing backdrop rotation');
        stopRotation();
        currentImages = [];
        currentIndex = -1;
        isActive = false;
    }

    function setBackdropImage(url) {
        var container = document.querySelector('.backdropContainer');
        if (!container) {
            console.warn(LOG_PREFIX, 'No .backdropContainer found');
            return;
        }

        var existing = container.querySelector('.displayingBackdropImage');

        var img = document.createElement('div');
        img.classList.add('backdropImage', 'displayingBackdropImage', 'backdropImageFadeIn');
        img.style.backgroundImage = "url('" + url + "')";
        container.appendChild(img);

        var bgContainer = document.querySelector('.backgroundContainer');
        if (bgContainer) {
            bgContainer.classList.add('withBackdrop');
        }

        if (existing) {
            setTimeout(function () {
                if (existing.parentNode) {
                    existing.parentNode.removeChild(existing);
                }
            }, 1000);
        }
    }

    function onRotationTick() {
        if (isVideoPlaying() || currentImages.length === 0) {
            return;
        }
        currentIndex = (currentIndex + 1) % currentImages.length;
        setBackdropImage(currentImages[currentIndex]);
    }

    function startRotation(images) {
        stopRotation();
        currentImages = images;
        currentIndex = -1;
        isActive = true;
        console.log(LOG_PREFIX, 'Starting rotation with', images.length, 'images');
        onRotationTick();
        if (images.length > 1) {
            rotationTimer = setInterval(onRotationTick, ROTATION_INTERVAL_MS);
        }
    }

    function stopRotation() {
        if (rotationTimer) {
            clearInterval(rotationTimer);
            rotationTimer = null;
        }
    }

    // --- API interaction ---

    function checkBackdropsEnabled(apiClient) {
        var userId = apiClient.getCurrentUserId();
        return apiClient.getDisplayPreferences('usersettings', userId, 'emby').then(function (prefs) {
            var custom = prefs && prefs.CustomPrefs;
            if (!custom) {
                return false;
            }
            return custom.enableBackdrops === 'true';
        });
    }

    function fetchBackdropItems(apiClient) {
        var userId = apiClient.getCurrentUserId();
        return apiClient.getItems(userId, {
            SortBy: 'IsFavoriteOrLiked,Random',
            Limit: FETCH_LIMIT,
            Recursive: true,
            ImageTypes: 'Backdrop',
            EnableTotalRecordCount: false
        }).then(function (result) {
            return result.Items || [];
        });
    }

    function buildImageUrls(apiClient, items) {
        var urls = [];
        for (var i = 0; i < items.length; i++) {
            var item = items[i];
            if (item.BackdropImageTags && item.BackdropImageTags.length > 0) {
                var tagIndex = Math.floor(Math.random() * item.BackdropImageTags.length);
                urls.push(apiClient.getScaledImageUrl(item.Id, {
                    type: 'Backdrop',
                    tag: item.BackdropImageTags[tagIndex],
                    maxWidth: Math.round(screen.availWidth),
                    index: tagIndex
                }));
            }
        }
        return urls;
    }

    // --- Main logic ---

    function activateHomepageBackdrop() {
        var apiClient = window.ApiClient;
        if (!apiClient || !apiClient.getCurrentUserId()) {
            console.log(LOG_PREFIX, 'ApiClient not ready yet');
            return;
        }

        if (isActive) {
            return;
        }

        console.log(LOG_PREFIX, 'Checking if backdrops enabled...');
        checkBackdropsEnabled(apiClient).then(function (enabled) {
            if (!enabled) {
                console.log(LOG_PREFIX, 'Backdrops disabled in user settings');
                return;
            }

            console.log(LOG_PREFIX, 'Fetching backdrop items...');
            return fetchBackdropItems(apiClient).then(function (items) {
                console.log(LOG_PREFIX, 'Got', items.length, 'items');
                if (items.length === 0) {
                    return;
                }

                var urls = buildImageUrls(apiClient, items);
                console.log(LOG_PREFIX, 'Built', urls.length, 'image URLs');
                if (urls.length === 0) {
                    return;
                }

                // Wait a moment for native backdrop to finish, then replace it
                setTimeout(function () {
                    if (!isHomePage()) {
                        return;
                    }
                    var container = document.querySelector('.backdropContainer');
                    if (container) {
                        container.innerHTML = '';
                    }
                    startRotation(urls);
                }, 500);
            });
        }).catch(function (err) {
            console.error(LOG_PREFIX, 'Error:', err);
        });
    }

    // --- Polling approach (robust) ---

    function pollCheck() {
        if (isHomePage()) {
            if (!isActive) {
                activateHomepageBackdrop();
            }
        } else {
            clearPluginBackdrop();
        }
    }

    // Start polling — handles initial load, SPA navigation, and any edge cases
    pollTimer = setInterval(pollCheck, POLL_INTERVAL_MS);

    // Also respond to navigation events for faster activation
    window.addEventListener('hashchange', function () {
        console.log(LOG_PREFIX, 'hashchange:', window.location.hash);
        setTimeout(pollCheck, 300);
    });

    document.addEventListener('viewshow', function () {
        setTimeout(pollCheck, 300);
    });

    document.addEventListener('pageshow', function () {
        setTimeout(pollCheck, 300);
    });

    console.log(LOG_PREFIX, 'Hooks registered, polling every', POLL_INTERVAL_MS, 'ms');
})();
