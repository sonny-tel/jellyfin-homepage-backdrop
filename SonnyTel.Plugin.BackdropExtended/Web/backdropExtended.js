// Backdrop Extended — takes over backdrop management from native autoBackdrops.js
// to provide seamless crossfade transitions across all page types.
// Native uses the 'selfBackdropPage' class to skip pages; we add this class in the
// capture phase of 'pageshow' to prevent native from ever clearing or setting backdrops
// on pages we manage.
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
    var activeParentId = undefined; // undefined=not set, null=home, string=library
    var pluginContainer = null;

    // --- Settings check (must be defined early for capture handler) ---

    function checkBackdropsEnabled() {
        var apiClient = window.ApiClient;
        if (!apiClient) return false;
        var userId = apiClient.getCurrentUserId();
        if (!userId) return false;
        var val = localStorage.getItem(userId + '-enableBackdrops');
        return val === 'true';
    }

    // --- Page detection helpers ---

    function isHomePage() {
        var hash = window.location.hash;
        if (hash === '#/home' || hash.indexOf('#/home?') === 0) return true;
        if (hash === '#!/home' || hash.indexOf('#!/home?') === 0) return true;
        return false;
    }

    function getListParentId() {
        var hash = window.location.hash;
        var path = hash.replace('#!', '#');
        if (path.indexOf('#/list?') !== 0 && path.indexOf('#/list&') !== 0) return null;
        var match = path.match(/[?&]parentId=([^&]+)/);
        return match ? match[1] : null;
    }

    function getTopParentId() {
        var hash = window.location.hash;
        var path = hash.replace('#!', '#');
        // Don't match detail/item pages — those use selfBackdropPage natively
        if (path.indexOf('#/details') === 0 || path.indexOf('#/item') === 0) return null;
        var match = hash.match(/[?&]topParentId=([^&]+)/);
        return match ? match[1] : null;
    }

    // Returns null for home (all items), a parentId string for library pages,
    // or false if the page is not a backdrop page we manage.
    function getPageBackdropContext() {
        if (isHomePage()) return null;
        var listId = getListParentId();
        if (listId) return listId;
        var topId = getTopParentId();
        if (topId) return topId;
        return false;
    }

    // --- Native backdrop suppression ---
    // autoBackdrops.js registers a bubble-phase 'pageshow' handler via pageClassOn.
    // It skips pages with 'selfBackdropPage' class. By adding this class in the
    // CAPTURE phase, we ensure native never touches these pages — no clearBackdrop(),
    // no showBackdrop(), no innerHTML='', no withBackdrop removal.

    document.addEventListener('pageshow', function (e) {
        var page = e.target;
        if (!page || !page.classList) return;
        if (!page.classList.contains('page')) return;
        // Don't suppress if user has backdrops disabled or isn't logged in
        if (!checkBackdropsEnabled()) return;
        // Don't touch pages that already manage their own backdrop (detail pages etc.)
        if (page.classList.contains('selfBackdropPage')) return;
        // Only suppress on pages we'll handle (backdrop pages + non-standard libraries)
        if (page.classList.contains('backdropPage') || getListParentId()) {
            page.classList.add('selfBackdropPage');
        }
    }, true); // capture phase fires before native's bubble handler

    // --- Utilities ---

    function isVideoPlaying() {
        var videos = document.querySelectorAll('video');
        for (var i = 0; i < videos.length; i++) {
            if (!videos[i].paused) return true;
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
            if (el.style[key] !== undefined) return animations[key];
        }
        return 'animationend';
    }

    var animationEndEvent = whichAnimationEvent();

    // --- Plugin container ---
    // Our own container inside .backgroundContainer, rendered on top of native's
    // .backdropContainer. Native can clear .backdropContainer freely — our images
    // are in a separate element it doesn't know about.

    function getBackgroundContainer() {
        return document.querySelector('.backgroundContainer');
    }

    function getPluginContainer() {
        if (pluginContainer && pluginContainer.parentNode) return pluginContainer;
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

    // --- Backdrop image management ---

    function deactivateBackdrop() {
        ++activationGeneration;
        stopRotation();
        currentImages = [];
        currentIndex = -1;
        isActive = false;
        activeParentId = undefined;
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
        if (!container) return;

        var existing = container.querySelector('.displayingBackdropImage');
        if (existing && existing.getAttribute('data-url') === url) return;

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
        if (isVideoPlaying() || currentImages.length === 0) return;
        var newIndex = currentIndex + 1;
        if (newIndex >= currentImages.length) newIndex = 0;
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

    // --- API ---

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
        if (!apiClient || !apiClient.getCurrentUserId()) return;

        if (isActive && activeParentId === parentId) return;

        if (!checkBackdropsEnabled()) return;

        var generation = ++activationGeneration;
        stopRotation();

        fetchBackdropItems(apiClient, parentId).then(function (items) {
            if (generation !== activationGeneration) return;
            if (items.length === 0) return;

            var urls = buildImageUrls(apiClient, items);
            if (urls.length === 0) return;

            setTimeout(function () {
                if (generation !== activationGeneration) return;
                if (getPageBackdropContext() === false) return;
                activeParentId = parentId;
                startRotation(urls);
            }, 500);
        }).catch(function (err) {
            console.error('[BackdropExtended]', err);
        });
    }

    // --- Navigation detection ---

    function pollCheck() {
        var context = getPageBackdropContext();
        if (context === false) {
            // Not a page we manage — deactivate if active
            if (isActive) deactivateBackdrop();
            return;
        }
        // context is null (home) or a parentId string (library)
        if (!isActive || activeParentId !== context) {
            activateBackdrop(context);
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
