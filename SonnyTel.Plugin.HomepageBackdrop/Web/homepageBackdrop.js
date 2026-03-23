// Homepage Backdrop — cycles backdrops on the homepage from all media sources.
// Only active when the user's "Backdrops" display setting is enabled.
(function () {
    'use strict';

    var ROTATION_INTERVAL_MS = 10000;
    var FETCH_LIMIT = 20;
    var POLL_INTERVAL_MS = 2000;

    var rotationTimer = null;
    var currentImages = [];
    var currentIndex = -1;
    var isActive = false;
    var isActivating = false;
    var currentLoadingImage = null;

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

    function clearPluginBackdrop() {
        if (!isActive) {
            return;
        }
        stopRotation();
        currentImages = [];
        currentIndex = -1;
        isActive = false;
        isActivating = false;
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

    // Matches native autoBackdrops.js: IsFavoriteOrLiked,Random sort, PG-13 max,
    // no IncludeItemTypes filter (all media sources).
    function fetchBackdropItems(apiClient) {
        var userId = apiClient.getCurrentUserId();
        return apiClient.getItems(userId, {
            SortBy: 'IsFavoriteOrLiked,Random',
            Limit: FETCH_LIMIT,
            Recursive: true,
            ImageTypes: 'Backdrop',
            EnableTotalRecordCount: false,
            MaxOfficialRating: 'PG-13'
        }).then(function (result) {
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

    function activateHomepageBackdrop() {
        var apiClient = window.ApiClient;
        if (!apiClient || !apiClient.getCurrentUserId()) {
            return;
        }

        if (isActive || isActivating) {
            return;
        }

        isActivating = true;

        if (!checkBackdropsEnabled()) {
            isActivating = false;
            return;
        }

        fetchBackdropItems(apiClient).then(function (items) {
            if (items.length === 0) {
                isActivating = false;
                return;
            }

            var urls = buildImageUrls(apiClient, items);
            if (urls.length === 0) {
                isActivating = false;
                return;
            }

            // Delay to let native backdrop code finish, then replace
            setTimeout(function () {
                isActivating = false;
                if (!isHomePage()) {
                    return;
                }
                var container = getBackdropContainer();
                if (container) {
                    container.innerHTML = '';
                }
                startRotation(urls);
            }, 500);
        }).catch(function (err) {
            isActivating = false;
            console.error('[HomepageBackdrop]', err);
        });
    }

    // --- Navigation detection ---

    function pollCheck() {
        if (isHomePage()) {
            if (!isActive) {
                activateHomepageBackdrop();
            }
        } else {
            clearPluginBackdrop();
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
