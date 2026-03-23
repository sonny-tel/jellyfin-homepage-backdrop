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
    var activeParentId = null;
    var lastBackdropUrl = null;
    var pluginContainer = null;

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

    function getListParentId() {
        var hash = window.location.hash;
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

    // --- Plugin's own backdrop container ---
    // We render into our own container so native autoBackdrops.js can freely
    // clear/replace .backdropContainer without affecting our images at all.
    // Our container sits on top of the native one inside .backgroundContainer.

    function getBackgroundContainer() {
        return document.querySelector('.backgroundContainer');
    }

    function getPluginContainer() {
        if (pluginContainer && pluginContainer.parentNode) {
            return pluginContainer;
        }
        var bg = getBackgroundContainer();
        if (!bg) return null;

        pluginContainer = document.createElement('div');
        pluginContainer.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;';
        bg.appendChild(pluginContainer);
        return pluginContainer;
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

    // Guard the withBackdrop class on .backgroundContainer. Native code
    // removes it when it clears backdrops, but we still need it while our
    // plugin container has a visible image.
    function guardBackdropClass() {
        var bg = getBackgroundContainer();
        if (!bg) return;

        new MutationObserver(function () {
            if (lastBackdropUrl && !bg.classList.contains('withBackdrop')) {
                bg.classList.add('withBackdrop');
            }
        }).observe(bg, { attributes: true, attributeFilter: ['class'] });
    }

    // --- Backdrop image management ---

    function deactivateBackdrop() {
        ++activationGeneration;
        stopRotation();
        currentImages = [];
        currentIndex = -1;
        isActive = false;
        activeParentId = null;
        lastBackdropUrl = null;
        if (currentLoadingImage) {
            currentLoadingImage.onload = null;
            currentLoadingImage = null;
        }
        if (pluginContainer) {
            pluginContainer.innerHTML = '';
        }
    }

    function setBackdropImage(url) {
        var container = getPluginContainer();
        if (!container) {
            return;
        }

        var existing = container.querySelector('.displayingBackdropImage');

        if (existing && existing.getAttribute('data-url') === url) {
            return;
        }

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
            lastBackdropUrl = url;

            setBackgroundEnabled(true);

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

    function checkBackdropsEnabled() {
        var apiClient = window.ApiClient;
        if (!apiClient) return false;
        var userId = apiClient.getCurrentUserId();
        if (!userId) return false;
        var val = localStorage.getItem(userId + '-enableBackdrops');
        return val === 'true';
    }

    // --- API interaction ---

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

        if (isActive && activeParentId === (parentId || null)) {
            return;
        }

        if (!checkBackdropsEnabled()) {
            return;
        }

        var generation = ++activationGeneration;
        stopRotation();

        fetchBackdropItems(apiClient, parentId).then(function (items) {
            if (generation !== activationGeneration) return;

            if (items.length === 0) return;

            var urls = buildImageUrls(apiClient, items);
            if (urls.length === 0) return;

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
            deactivateBackdrop();
        }
    }

    guardBackdropClass();

    setInterval(pollCheck, POLL_INTERVAL_MS);

    window.addEventListener('hashchange', function () {
        setTimeout(pollCheck, 300);
    });

    document.addEventListener('viewshow', function () {
        setTimeout(pollCheck, 300);
    });
})();
