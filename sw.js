const CACHE_NAME = 'finance-tracker-v1';

const ASSETS_TO_CACHE = [
    './',
    './index.html',
    './css/main.css',
    './js/app.js',
    './manifest.json',
    './assets/icons/icon-192.png',
    './assets/icons/icon-512.png'
];

// Внешние ресурсы кэшируем отдельно (могут быть недоступны)
const EXTERNAL_ASSETS = [
    'https://cdn.jsdelivr.net/npm/chart.js@4.4.7/dist/chart.umd.min.js'
];

// Установка — кэшируем локальные ресурсы
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then((cache) => {
                console.log('[SW] Кэширование локальных ресурсов...');
                // Сначала кэшируем обязательные ресурсы
                return cache.addAll(ASSETS_TO_CACHE)
                    .then(() => {
                        // Затем пытаемся кэшировать внешние (без ошибки если не удалось)
                        return Promise.allSettled(
                            EXTERNAL_ASSETS.map((url) =>
                                cache.add(url).catch((err) => {
                                    console.warn('[SW] Не удалось кэшировать:', url, err);
                                })
                            )
                        );
                    });
            })
            .then(() => {
                console.log('[SW] Все ресурсы кэшированы');
                return self.skipWaiting();
            })
            .catch((err) => {
                console.error('[SW] Ошибка при установке:', err);
            })
    );
});

// Активация — удаляем устаревший кэш
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys()
            .then((cacheNames) => {
                return Promise.all(
                    cacheNames
                        .filter((name) => name !== CACHE_NAME)
                        .map((name) => {
                            console.log('[SW] Удаление устаревшего кэша:', name);
                            return caches.delete(name);
                        })
                );
            })
            .then(() => {
                console.log('[SW] Активирован');
                return self.clients.claim();
            })
    );
});

// Перехват запросов
self.addEventListener('fetch', (event) => {
    const request = event.request;
    const url = new URL(request.url);

    // Пропускаем не-GET запросы
    if (request.method !== 'GET') {
        return;
    }

    // API запросы (курсы валют) — Network First с кэш-фолбэком
    if (url.hostname.includes('api') ||
        url.hostname.includes('exchangerate') ||
        url.hostname.includes('coingecko') ||
        url.hostname.includes('nbrb')) {

        event.respondWith(
            fetch(request)
                .then((response) => {
                    if (response && response.ok) {
                        const responseClone = response.clone();
                        caches.open(CACHE_NAME).then((cache) => {
                            cache.put(request, responseClone);
                        });
                    }
                    return response;
                })
                .catch(() => {
                    console.log('[SW] API недоступен, пробуем кэш:', url.href);
                    return caches.match(request);
                })
        );
        return;
    }

    // Google Fonts — Cache First (они редко меняются)
    if (url.hostname.includes('fonts.googleapis.com') ||
        url.hostname.includes('fonts.gstatic.com')) {

        event.respondWith(
            caches.match(request)
                .then((cachedResponse) => {
                    if (cachedResponse) {
                        return cachedResponse;
                    }
                    return fetch(request)
                        .then((response) => {
                            if (response && response.ok) {
                                const responseClone = response.clone();
                                caches.open(CACHE_NAME).then((cache) => {
                                    cache.put(request, responseClone);
                                });
                            }
                            return response;
                        })
                        .catch(() => {
                            // Шрифты недоступны — не критично
                            return new Response('', { status: 204 });
                        });
                })
        );
        return;
    }

    // CDN ресурсы (Chart.js) — Cache First
    if (url.hostname.includes('cdn.jsdelivr.net')) {
        event.respondWith(
            caches.match(request)
                .then((cachedResponse) => {
                    if (cachedResponse) {
                        return cachedResponse;
                    }
                    return fetch(request)
                        .then((response) => {
                            if (response && response.ok) {
                                const responseClone = response.clone();
                                caches.open(CACHE_NAME).then((cache) => {
                                    cache.put(request, responseClone);
                                });
                            }
                            return response;
                        });
                })
        );
        return;
    }

    // Локальные ресурсы — Cache First, затем Network
    event.respondWith(
        caches.match(request)
            .then((cachedResponse) => {
                if (cachedResponse) {
                    return cachedResponse;
                }

                return fetch(request)
                    .then((response) => {
                        if (!response || response.status !== 200) {
                            return response;
                        }

                        const responseClone = response.clone();
                        caches.open(CACHE_NAME).then((cache) => {
                            cache.put(request, responseClone);
                        });

                        return response;
                    })
                    .catch(() => {
                        // Оффлайн fallback для HTML-страниц
                        if (request.headers.get('Accept') &&
                            request.headers.get('Accept').includes('text/html')) {
                            return caches.match('./index.html');
                        }
                        return new Response('Оффлайн', { status: 503 });
                    });
            })
    );
});