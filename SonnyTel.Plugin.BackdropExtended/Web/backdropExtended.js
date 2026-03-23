// Backdrop Extended — cycles backdrops on the homepage and non-standard library pages.
// Only active when the user's "Backdrops" display setting is enabled.
(function () {
    'use strict';

    var ROTATION_INTERVAL_MS = 10000;
    var FETCH_LIMIT = 20;
    var POLL_INTERVAL_MS = 2000;
    var MAX_RATING_ENABLED = %BACKDROP_EXTENDED_CONFIG%;

    var rotationTimer = null;
    var currentImages = [];
    var currentIndex = -1;
    var isActive = false;
    var activationGeneration = 0;
    var currentLoadingImage = null;
    var activeParentId = null; // tracks which library we're showing backdrops for

    // --- Helpers ---

    function isHomePage() {
        var hash = window.location.hash;
        if (hash === '#/home' || hash.indexOf('#/home?') === 0) {
            return true;
        }
        if (hash === '#!/home' || hash.indexOf('#!/home?') === 0) {
            return true;
        }
        return false;
    }

    // Detect non-standard collection pages that lack native backdrop support.
    // These use #/list?parentId=... (generic list view for mixed/boxset/unknown libraries).
    function getListParentId() {
        var hash = window.location.hash;
        // Normalize hashbang
        var path = hash.replace('#!', '#');
        if (path.indexOf('#/list?') !== 0 && path.indexOf('#/list&') !== 0) {
            return null;
        }
        var match = path.match(/[?&]parentId=([^&]+)/);
        return match ? match[1] : null;
    }

    function isBackdropPage() {
        return isHomePage() || getListParentId() !== null;
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

    // Detect the browser's animationend event name
    function whichAnimationEvent() {
        var el = document.createElement('div');
        var animations = {
            'animation': 'animationend',
            'OAnimation': 'oAnimationEnd',
            'MozAnimation': 'animationend',
            'WebkitAnimation': 'webkitAnimationEnd'
        };
        for (var key in animations) {
            if (el.style[key] !== undefined) {
                return animations[key];
            }
        }
        return 'animationend';
    }

    var animationEndEvent = whichAnimationEvent();

    // --- Backdrop management (matches jellyfin-web backdrop.js) ---

    function getBackdropContainer() {
        return document.querySelector('.backdropContainer');
    }

    function getBackgroundContainer() {
        return document.querySelector('.backgroundContainer');
    }

    function setBackgroundEnabled(enabled) {
        var bg = getBackgroundContainer();
        if (!bg) return;
        if (enabled) {
            bg.classList.add('withBackdrop');
        } else {
            bg.classList.remove('withBackdrop');
        }
    }

    function deactivateBackdrop() {
        ++activationGeneration;
        stopRotation();
        currentImages = [];
        currentIndex = -1;
        isActive = false;
        activeParentId = null;
        if (currentLoadingImage) {
            currentLoadingImage.onload = null;
            currentLoadingImage = null;
        }
    }

    function setBackdropImage(url) {
        var container = getBackdropContainer();
        if (!container) {
            return;
        }

        var existing = container.querySelector('.displayingBackdropImage');

        // Skip if already showing this URL (same as native code)
        if (existing && existing.getAttribute('data-url') === url) {
            return;
        }

        // Preload the image before showing it (matches native Backdrop.load)
        if (currentLoadingImage) {
            currentLoadingImage.onload = null;
        }

        var preload = new Image();
        currentLoadingImage = preload;

        preload.onload = function () {
            currentLoadingImage = null;

            if (!isActive) return;

            var backdropImage = document.createElement('div');
            backdropImage.classList.add('backdropImage');
            backdropImage.classList.add('displayingBackdropImage');
            backdropImage.style.backgroundImage = "url('" + url + "')";
            backdropImage.setAttribute('data-url', url);
            backdropImage.classList.add('backdropImageFadeIn');
            container.appendChild(backdropImage);

            setBackgroundEnabled(true);

            // Remove old image after fade-in animation completes (matches native)
            if (existing) {
                var onAnimEnd = function () {
                    backdropImage.removeEventListener(animationEndEvent, onAnimEnd);
                    if (existing.parentNode) {
                        existing.parentNode.removeChild(existing);
                    }
                };
                backdropImage.addEventListener(animationEndEvent, onAnimEnd, { once: true });
            }
        };

        preload.src = url;
    }

    function onRotationTick() {
        if (isVideoPlaying() || currentImages.length === 0) {
            return;
        }
        var newIndex = currentIndex + 1;
        if (newIndex >= currentImages.length) {
            newIndex = 0;
        }
        currentIndex = newIndex;
        setBackdropImage(currentImages[newIndex]);
    }

    function startRotation(images) {
        stopRotation();
        currentImages = images;
        currentIndex = -1;
        isActive = true;
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

    // --- Settings check ---

    // The enableBackdrops setting is stored in localStorage as "{userId}-enableBackdrops".
    // Default is false (off). It is NOT stored in server DisplayPreferences.
    function checkBackdropsEnabled() {
        var apiClient = window.ApiClient;
        if (!apiClient) return false;
        var userId = apiClient.getCurrentUserId();
        if (!userId) return false;
        var val = localStorage.getItem(userId + '-enableBackdrops');
        return val === 'true';
    }

    // --- API interaction ---

    // Matches native autoBackdrops.js: IsFavoriteOrLiked,Random sort, PG-13 max.
    // parentId is optional — when set, scopes to a specific library.
    function fetchBackdropItems(apiClient, parentId) {
        var userId = apiClient.getCurrentUserId();
        var opts = {
            SortBy: 'IsFavoriteOrLiked,Random',
            Limit: FETCH_LIMIT,
            Recursive: true,
            ImageTypes: 'Backdrop',
            EnableTotalRecordCount: false
        };
        if (parentId) {
            opts.ParentId = parentId;
        } else if (MAX_RATING_ENABLED) {
            opts.MaxOfficialRating = 'PG-13';
        }
        return apiClient.getItems(userId, opts).then(function (result) {
            return result.Items || [];
        });
    }

    // Native takes only the first backdrop tag per item.
    function buildImageUrls(apiClient, items) {
        var urls = [];
        var screenWidth = Math.round(screen.availWidth);
        for (var i = 0; i < items.length; i++) {
            var item = items[i];
            if (item.BackdropImageTags && item.BackdropImageTags.length > 0) {
                urls.push(apiClient.getScaledImageUrl(item.Id, {
                    type: 'Backdrop',
                    tag: item.BackdropImageTags[0],
                    maxWidth: screenWidth,
                    index: 0
                }));
            }
        }
        return urls;
    }

    // --- Main logic ---

    function activateBackdrop(parentId) {
        var apiClient = window.ApiClient;
        if (!apiClient || !apiClient.getCurrentUserId()) {
            return;
        }

        // If already active for the same context, skip
        if (isActive && activeParentId === (parentId || null)) {
            return;
        }

        if (!checkBackdropsEnabled()) {
            return;
        }

        // Bump generation to invalidate any in-flight activation
        var generation = ++activationGeneration;

        // Stop current rotation timer but keep the visible backdrop for crossfade
        stopRotation();

        fetchBackdropItems(apiClient, parentId).then(function (items) {
            if (generation !== activationGeneration) return;

            if (items.length === 0) {
                return;
            }

            var urls = buildImageUrls(apiClient, items);
            if (urls.length === 0) {
                return;
            }

            // Delay to let native backdrop code finish, then crossfade to ours
            setTimeout(function () {
                if (generation !== activationGeneration) return;
                if (!isBackdropPage()) return;
                activeParentId = parentId || null;
                startRotation(urls);
            }, 500);
        }).catch(function (err) {
            console.error('[BackdropExtended]', err);
        });
    }

    // --- Navigation detection ---

    function pollCheck() {
        var listParentId = getListParentId();
        if (isHomePage()) {
            if (!isActive || activeParentId !== null) {
                activateBackdrop(null);
            }
        } else if (listParentId) {
            if (!isActive || activeParentId !== listParentId) {
                activateBackdrop(listParentId);
            }
        } else if (isActive) {
            // Left all backdrop pages — stop and let native code handle cleanup
            deactivateBackdrop();
        }
    }

    setInterval(pollCheck, POLL_INTERVAL_MS);

    window.addEventListener('hashchange', function () {
        setTimeout(pollCheck, 300);
    });

    document.addEventListener('viewshow', function () {
        setTimeout(pollCheck, 300);
    });
})();
