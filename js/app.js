/* ============================================================
   ФИНАНСОВЫЙ ТРЕКЕР — APP.JS
   Часть 1: Конфигурация, Утилиты, БД, Авторизация, UI-ядро
   ============================================================ */

'use strict';

/* ========================
   1. КОНФИГУРАЦИЯ
   ======================== */

const CONFIG = {
    APP_NAME: 'finance-tracker',
    VERSION: '1.0.0',
    PIN_LENGTH: 4,
    MAX_PIN_ATTEMPTS: 5,
    LOCK_DURATION: 60000, // 1 минута блокировки
    TOAST_DURATION: 3500,
    ITEMS_PER_PAGE: 20,
    BASE_CURRENCY: 'BYN',

    CURRENCIES: {
        BYN: { symbol: 'BYN', flag: '🇧🇾', name: 'Белорусский рубль', decimals: 2 },
        USD: { symbol: 'USD', flag: '🇺🇸', name: 'Доллар США', decimals: 2 },
        EUR: { symbol: 'EUR', flag: '🇪🇺', name: 'Евро', decimals: 2 },
        RUB: { symbol: 'RUB', flag: '🇷🇺', name: 'Российский рубль', decimals: 2 },
        USDT: { symbol: 'USDT', flag: '💎', name: 'Tether', decimals: 2 },
        BTC: { symbol: 'BTC', flag: '₿', name: 'Биткоин', decimals: 8 },
        ETH: { symbol: 'ETH', flag: '⟠', name: 'Эфириум', decimals: 8 }
    },

API: {
    FIAT_URL: 'https://api.exchangerate-api.com/v4/latest/BYN',
    CRYPTO_URL: 'https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,ethereum,tether&vs_currencies=usd',
    NBRB_URL: 'https://api.nbrb.by/exrates/rates?periodicity=0',
    CACHE_DURATION: 3600000
},

    DEFAULT_CATEGORIES: {
        expense: [
            { name: 'Еда и продукты', icon: '🍔', color: '#EF4444' },
            { name: 'Жильё / коммуналка', icon: '🏠', color: '#F59E0B' },
            { name: 'Транспорт', icon: '🚗', color: '#0EA5E9' },
            { name: 'Одежда', icon: '👕', color: '#8B5CF6' },
            { name: 'Здоровье', icon: '💊', color: '#10B981' },
            { name: 'Развлечения', icon: '🎮', color: '#EC4899' },
            { name: 'Связь / интернет', icon: '📱', color: '#6366F1' },
            { name: 'Образование', icon: '📚', color: '#14B8A6' },
            { name: 'Кафе / рестораны', icon: '🍺', color: '#F97316' },
            { name: 'Подарки', icon: '🎁', color: '#E11D48' },
            { name: 'Спорт', icon: '🏋️', color: '#22C55E' },
            { name: 'Красота / уход', icon: '💇', color: '#D946EF' },
            { name: 'Путешествия', icon: '✈️', color: '#0284C7' },
            { name: 'Прочее', icon: '🔧', color: '#6B7280' }
        ],
        income: [
            { name: 'Зарплата', icon: '💼', color: '#10B981' },
            { name: 'Фриланс', icon: '💻', color: '#0EA5E9' },
            { name: 'Инвестиции', icon: '📈', color: '#8B5CF6' },
            { name: 'Подарки', icon: '🎁', color: '#F59E0B' },
            { name: 'Кэшбэк', icon: '💰', color: '#14B8A6' },
            { name: 'Продажа вещей', icon: '📦', color: '#F97316' },
            { name: 'Прочее', icon: '🔧', color: '#6B7280' }
        ]
    }
};


/* ========================
   2. СОСТОЯНИЕ ПРИЛОЖЕНИЯ
   ======================== */

const State = {
    currentUser: null,
    currentPage: 'dashboard',
    currentAnalyticsPeriod: 'month',
    customDateFrom: null,
    customDateTo: null,
    transactionsPage: 1,
    transactionsFilters: {
        type: 'all',
        account: 'all',
        category: 'all',
        dateFrom: '',
        dateTo: '',
        search: ''
    },
    exchangeRates: {},
    ratesLastUpdated: null,
    charts: {},
    pinInput: '',
    pinMode: '', // 'login' | 'set' | 'confirm'
    tempPin: '',
    tempRegName: '',
    pinAttempts: 0,
    lockUntil: null,
    confirmCallback: null
};


/* ========================
   3. УТИЛИТЫ
   ======================== */

const Utils = {

    // Генерация уникального ID
    generateId() {
        return Date.now().toString(36) + Math.random().toString(36).substr(2, 9);
    },

    // Форматирование числа с разделителями
    formatNumber(num, decimals = 2) {
        if (num === null || num === undefined || isNaN(num)) return '0.00';
        return Number(num).toLocaleString('ru-RU', {
            minimumFractionDigits: decimals,
            maximumFractionDigits: decimals
        });
    },

    // Форматирование денег
    formatMoney(amount, currency = 'BYN') {
        const cur = CONFIG.CURRENCIES[currency];
        if (!cur) return `${amount} ${currency}`;
        const decimals = cur.decimals;
        const formatted = this.formatNumber(amount, decimals);
        return `${formatted} ${currency}`;
    },

    // Короткий формат денег (для виджетов)
    formatMoneyShort(amount, currency = 'BYN') {
        if (Math.abs(amount) >= 1000000) {
            return `${(amount / 1000000).toFixed(1)}M ${currency}`;
        }
        if (Math.abs(amount) >= 10000) {
            return `${(amount / 1000).toFixed(1)}K ${currency}`;
        }
        return this.formatMoney(amount, currency);
    },

    // Форматирование даты
    formatDate(dateStr) {
        const date = new Date(dateStr);
        return date.toLocaleDateString('ru-RU', {
            day: 'numeric',
            month: 'short'
        });
    },

    // Полная дата
    formatDateFull(dateStr) {
        const date = new Date(dateStr);
        return date.toLocaleDateString('ru-RU', {
            day: 'numeric',
            month: 'long',
            year: 'numeric'
        });
    },

    // Относительная дата
    formatDateRelative(dateStr) {
        const date = new Date(dateStr);
        const now = new Date();
        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const target = new Date(date.getFullYear(), date.getMonth(), date.getDate());
        const diff = Math.floor((today - target) / (1000 * 60 * 60 * 24));

        if (diff === 0) return 'Сегодня';
        if (diff === 1) return 'Вчера';
        if (diff === 2) return 'Позавчера';
        if (diff <= 7) return `${diff} дн. назад`;
        return this.formatDate(dateStr);
    },

    // Текущая дата в формате YYYY-MM-DD
    today() {
        return new Date().toISOString().split('T')[0];
    },

    // Получить название месяца
    getMonthName(monthIndex) {
        const months = [
            'Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь',
            'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'
        ];
        return months[monthIndex] || '';
    },

    // Короткое название месяца
    getMonthShort(monthIndex) {
        const months = ['Янв', 'Фев', 'Мар', 'Апр', 'Май', 'Июн',
            'Июл', 'Авг', 'Сен', 'Окт', 'Ноя', 'Дек'];
        return months[monthIndex] || '';
    },

    // Начало и конец периода
    getPeriodRange(period) {
        const now = new Date();
        const year = now.getFullYear();
        const month = now.getMonth();
        const day = now.getDate();
        let from, to;

        switch (period) {
            case 'week':
                const dayOfWeek = now.getDay() || 7; // Пн = 1
                from = new Date(year, month, day - dayOfWeek + 1);
                to = new Date(year, month, day);
                break;
            case 'month':
                from = new Date(year, month, 1);
                to = new Date(year, month + 1, 0);
                break;
            case 'quarter':
                const qMonth = Math.floor(month / 3) * 3;
                from = new Date(year, qMonth, 1);
                to = new Date(year, qMonth + 3, 0);
                break;
            case 'year':
                from = new Date(year, 0, 1);
                to = new Date(year, 11, 31);
                break;
            case 'custom':
                from = State.customDateFrom ? new Date(State.customDateFrom) : new Date(year, month, 1);
                to = State.customDateTo ? new Date(State.customDateTo) : now;
                break;
            default:
                from = new Date(year, month, 1);
                to = now;
        }

        return {
            from: from.toISOString().split('T')[0],
            to: to.toISOString().split('T')[0]
        };
    },

    // Группировка массива по ключу
    groupBy(arr, keyFn) {
        return arr.reduce((groups, item) => {
            const key = typeof keyFn === 'function' ? keyFn(item) : item[keyFn];
            (groups[key] = groups[key] || []).push(item);
            return groups;
        }, {});
    },

    // Сумма массива
    sumBy(arr, keyFn) {
        return arr.reduce((sum, item) => {
            const val = typeof keyFn === 'function' ? keyFn(item) : item[keyFn];
            return sum + (Number(val) || 0);
        }, 0);
    },

    // Debounce
    debounce(fn, delay = 300) {
        let timer;
        return function (...args) {
            clearTimeout(timer);
            timer = setTimeout(() => fn.apply(this, args), delay);
        };
    },

    // Простое хеширование PIN (не для безопасности, а для обфускации)
    hashPin(pin) {
        let hash = 0;
        const str = pin + CONFIG.APP_NAME;
        for (let i = 0; i < str.length; i++) {
            const char = str.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash;
        }
        return Math.abs(hash).toString(36);
    },

    // Палитра цветов для графиков
    chartColors: [
        '#4F46E5', '#0EA5E9', '#10B981', '#F59E0B', '#EF4444',
        '#8B5CF6', '#EC4899', '#14B8A6', '#F97316', '#6366F1',
        '#22C55E', '#E11D48', '#0284C7', '#D946EF'
    ],

    // Escape HTML
    escapeHtml(str) {
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    },

    // Дней между датами
    daysBetween(date1, date2) {
        const d1 = new Date(date1);
        const d2 = new Date(date2);
        return Math.ceil((d2 - d1) / (1000 * 60 * 60 * 24));
    }
};


/* ========================
   4. БАЗА ДАННЫХ (localStorage)
   ======================== */

const DB = {

    _key(name) {
        return `${CONFIG.APP_NAME}_${name}`;
    },

    // Получить данные
    get(name) {
        try {
            const data = localStorage.getItem(this._key(name));
            return data ? JSON.parse(data) : null;
        } catch (e) {
            console.error(`[DB] Ошибка чтения "${name}":`, e);
            return null;
        }
    },

    // Сохранить данные
    set(name, data) {
        try {
            localStorage.setItem(this._key(name), JSON.stringify(data));
            return true;
        } catch (e) {
            console.error(`[DB] Ошибка записи "${name}":`, e);
            if (e.name === 'QuotaExceededError') {
                UI.toast('Память заполнена! Экспортируйте данные.', 'error');
            }
            return false;
        }
    },

    // Удалить данные
    remove(name) {
        localStorage.removeItem(this._key(name));
    },

    // === Пользователь ===
    getUser() {
        return this.get('user');
    },

    saveUser(user) {
        return this.set('user', user);
    },

    // === Счета ===
    getAccounts() {
        return this.get('accounts') || [];
    },

    saveAccounts(accounts) {
        return this.set('accounts', accounts);
    },

    // === Транзакции ===
    getTransactions() {
        return this.get('transactions') || [];
    },

    saveTransactions(transactions) {
        return this.set('transactions', transactions);
    },

    // === Категории ===
    getCategories() {
        return this.get('categories') || [];
    },

    saveCategories(categories) {
        return this.set('categories', categories);
    },

    // === Цели ===
    getGoals() {
        return this.get('goals') || [];
    },

    saveGoals(goals) {
        return this.set('goals', goals);
    },

    // === Курсы валют ===
    getRates() {
        return this.get('rates') || {};
    },

    saveRates(rates) {
        return this.set('rates', rates);
    },

    getRatesTimestamp() {
        return this.get('rates_timestamp') || 0;
    },

    saveRatesTimestamp(ts) {
        return this.set('rates_timestamp', ts);
    },

    // === Настройки ===
    getSettings() {
        return this.get('settings') || {};
    },

    saveSettings(settings) {
        return this.set('settings', settings);
    },

    // === Полный экспорт ===
    exportAll() {
        return {
            version: CONFIG.VERSION,
            exportDate: new Date().toISOString(),
            user: this.getUser(),
            accounts: this.getAccounts(),
            transactions: this.getTransactions(),
            categories: this.getCategories(),
            goals: this.getGoals(),
            rates: this.getRates(),
            settings: this.getSettings()
        };
    },

    // === Полный импорт ===
    importAll(data) {
        if (!data || !data.version) {
            throw new Error('Неверный формат файла');
        }
        if (data.user) this.saveUser(data.user);
        if (data.accounts) this.saveAccounts(data.accounts);
        if (data.transactions) this.saveTransactions(data.transactions);
        if (data.categories) this.saveCategories(data.categories);
        if (data.goals) this.saveGoals(data.goals);
        if (data.rates) this.saveRates(data.rates);
        if (data.settings) this.saveSettings(data.settings);
        return true;
    },

    // === Сброс всех данных ===
    resetAll() {
        const keys = ['user', 'accounts', 'transactions', 'categories',
            'goals', 'rates', 'rates_timestamp', 'settings'];
        keys.forEach(key => this.remove(key));
    }
};


/* ========================
   5. АВТОРИЗАЦИЯ
   ======================== */

const Auth = {

    init() {
        this.bindEvents();

        const user = DB.getUser();
        if (user) {
            // Есть сохранённый аккаунт → вход по PIN
            this.showLogin(user.name);
        } else {
            // Нет аккаунта → регистрация
            this.showRegister();
        }
    },

    bindEvents() {
        // === Переключение экранов ===

        // "Создать аккаунт" (на экране входа по PIN)
        document.getElementById('btn-go-register').addEventListener('click', () => {
            // Предупреждаем что старый аккаунт будет удалён
            const user = DB.getUser();
            if (user) {
                if (confirm(`Создать новый аккаунт? Данные аккаунта "${user.name}" будут удалены.`)) {
                    DB.resetAll();
                    this.showRegister();
                }
            } else {
                this.showRegister();
            }
        });

        // "Уже есть аккаунт" (на экране регистрации)
        document.getElementById('btn-go-login').addEventListener('click', () => {
            const user = DB.getUser();
            if (user) {
                this.showLogin(user.name);
            } else {
                // Нет аккаунта — показываем сообщение
                const errorEl = document.getElementById('reg-name-error');
                if (errorEl) {
                    errorEl.textContent = 'Аккаунт не найден. Создайте новый.';
                    setTimeout(() => { errorEl.textContent = ''; }, 3000);
                }
            }
        });

        // "Назад" (на экране установки PIN → назад к вводу имени)
        document.getElementById('btn-back-register').addEventListener('click', () => {
            State.pinInput = '';
            State.tempPin = '';
            this.showRegister();
        });

        // "Назад" (на экране подтверждения PIN → назад к установке PIN)
        document.getElementById('btn-back-set-pin').addEventListener('click', () => {
            State.pinInput = '';
            State.tempPin = '';
            this.showSetPin();
        });

        // === Регистрация ===

        // Кнопка "Далее" (после ввода имени)
        document.getElementById('btn-reg-next').addEventListener('click', () => {
            this.onRegisterNext();
        });

        // Enter на поле имени
        document.getElementById('reg-name').addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                this.onRegisterNext();
            }
        });

        // === PIN-пады ===
        this.bindPinPad('pin-pad-login', 'login');
        this.bindPinPad('pin-pad-set', 'set');
        this.bindPinPad('pin-pad-confirm', 'confirm');

        // === Физическая клавиатура для PIN ===
        document.addEventListener('keydown', (e) => {
            const authScreen = document.getElementById('auth-screen');
            if (!authScreen || authScreen.style.display === 'none') return;

            const activeMode = State.pinMode;
            if (!activeMode) return;

            // Цифры 0-9
            if (/^[0-9]$/.test(e.key)) {
                e.preventDefault();
                this.pinInput(e.key, activeMode);
            }
            // Backspace / Delete
            else if (e.key === 'Backspace' || e.key === 'Delete') {
                e.preventDefault();
                this.pinDelete(activeMode);
            }
        });
    },

    // === PIN-PAD ===

    bindPinPad(padId, mode) {
        const pad = document.getElementById(padId);
        if (!pad) return;

        pad.addEventListener('click', (e) => {
            const btn = e.target.closest('.pin-key');
            if (!btn || btn.disabled) return;

            const key = btn.dataset.key;
            if (key === undefined || key === null) return;

            // Вибрация на мобилке
            if (navigator.vibrate) navigator.vibrate(30);

            if (key === 'delete') {
                this.pinDelete(mode);
            } else {
                this.pinInput(key, mode);
            }
        });
    },

    pinInput(digit, mode) {
        if (State.pinInput.length >= CONFIG.PIN_LENGTH) return;

        // Проверяем блокировку
        if (State.lockUntil && Date.now() < State.lockUntil) {
            const secs = Math.ceil((State.lockUntil - Date.now()) / 1000);
            this.showPinError(mode, `Заблокировано. Подождите ${secs} сек.`);
            return;
        }

        State.pinInput += digit;
        this.updatePinDots(mode);

        // Когда набрали полный PIN
        if (State.pinInput.length === CONFIG.PIN_LENGTH) {
            setTimeout(() => this.onPinComplete(mode), 250);
        }
    },

    pinDelete(mode) {
        if (State.pinInput.length === 0) return;
        State.pinInput = State.pinInput.slice(0, -1);
        this.updatePinDots(mode);
        this.clearPinError(mode);
    },

    updatePinDots(mode) {
        const dotsId = {
            login: 'pin-dots-login',
            set: 'pin-dots-set',
            confirm: 'pin-dots-confirm'
        };
        const container = document.getElementById(dotsId[mode]);
        if (!container) return;

        const dots = container.querySelectorAll('.pin-dot');
        dots.forEach((dot, i) => {
            dot.classList.toggle('filled', i < State.pinInput.length);
            dot.classList.remove('error');
        });
    },

    // === ОБРАБОТКА ЗАВЕРШЕНИЯ ВВОДА PIN ===

    onPinComplete(mode) {
        const pin = State.pinInput;

        switch (mode) {
            case 'login':
                this.verifyPin(pin);
                break;
            case 'set':
                State.tempPin = pin;
                State.pinInput = '';
                this.showConfirmPin();
                break;
            case 'confirm':
                this.confirmPin(pin);
                break;
        }
    },

    // Проверка PIN при входе
    verifyPin(pin) {
        const user = DB.getUser();
        if (!user) {
            this.showPinError('login', 'Ошибка: аккаунт не найден');
            State.pinInput = '';
            return;
        }

        const pinHash = Utils.hashPin(pin);

        if (pinHash === user.pinHash) {
            // ✅ Верный PIN
            State.pinAttempts = 0;
            State.lockUntil = null;
            State.currentUser = user;
            State.pinInput = '';
            this.onLoginSuccess();
        } else {
            // ❌ Неверный PIN
            State.pinAttempts++;
            State.pinInput = '';

            if (State.pinAttempts >= CONFIG.MAX_PIN_ATTEMPTS) {
                // Блокировка
                State.lockUntil = Date.now() + CONFIG.LOCK_DURATION;
                this.showPinError('login',
                    `Слишком много попыток. Блокировка на ${CONFIG.LOCK_DURATION / 1000} сек.`
                );

                setTimeout(() => {
                    State.pinAttempts = 0;
                    State.lockUntil = null;
                    this.clearPinError('login');
                }, CONFIG.LOCK_DURATION);
            } else {
                const remaining = CONFIG.MAX_PIN_ATTEMPTS - State.pinAttempts;
                this.showPinError('login', `Неверный PIN. Осталось попыток: ${remaining}`);
            }

            this.shakePin('login');
        }
    },

    // Подтверждение PIN при регистрации
    confirmPin(pin) {
        if (pin === State.tempPin) {
            // ✅ PIN совпал — создаём аккаунт
            const user = {
                name: State.tempRegName,
                pinHash: Utils.hashPin(pin),
                createdAt: new Date().toISOString()
            };

            DB.saveUser(user);
            State.currentUser = user;
            State.pinInput = '';
            State.tempPin = '';
            State.tempRegName = '';

            // Создаём дефолтные категории
            this.createDefaultCategories();

            this.onLoginSuccess();
        } else {
            // ❌ PIN не совпал
            State.pinInput = '';
            this.showPinError('confirm', 'PIN-коды не совпадают');
            this.shakePin('confirm');

            // Через 1.5 сек → назад к установке PIN
            setTimeout(() => {
                State.tempPin = '';
                this.clearPinError('confirm');
                this.showSetPin();
            }, 1500);
        }
    },

    // === СОЗДАНИЕ ДЕФОЛТНЫХ КАТЕГОРИЙ ===

    createDefaultCategories() {
        const categories = [];

        CONFIG.DEFAULT_CATEGORIES.expense.forEach(cat => {
            categories.push({
                id: Utils.generateId(),
                type: 'expense',
                name: cat.name,
                icon: cat.icon,
                color: cat.color,
                budget: 0
            });
        });

        CONFIG.DEFAULT_CATEGORIES.income.forEach(cat => {
            categories.push({
                id: Utils.generateId(),
                type: 'income',
                name: cat.name,
                icon: cat.icon,
                color: cat.color,
                budget: 0
            });
        });

        DB.saveCategories(categories);
    },

    // === РЕГИСТРАЦИЯ: ВВОД ИМЕНИ ===

    onRegisterNext() {
        const nameInput = document.getElementById('reg-name');
        const name = nameInput.value.trim();
        const errorEl = document.getElementById('reg-name-error');

        // Очищаем ошибку
        errorEl.textContent = '';

        if (!name) {
            errorEl.textContent = 'Введите ваше имя';
            nameInput.focus();
            return;
        }

        if (name.length < 2) {
            errorEl.textContent = 'Минимум 2 символа';
            nameInput.focus();
            return;
        }

        // Сохраняем имя и переходим к PIN
        State.tempRegName = name;
        State.pinInput = '';
        State.tempPin = '';
        this.showSetPin();
    },

    // === УСПЕШНЫЙ ВХОД ===

    onLoginSuccess() {
        const authScreen = document.getElementById('auth-screen');
        const app = document.getElementById('app');

        if (authScreen) authScreen.style.display = 'none';
        if (app) app.style.display = 'flex';

        State.pinMode = '';

        App.initAfterLogin();
    },

    // === ВЫХОД ===

    logout() {
        State.currentUser = null;
        State.pinInput = '';
        State.tempPin = '';
        State.tempRegName = '';
        State.pinMode = '';

        const authScreen = document.getElementById('auth-screen');
        const app = document.getElementById('app');

        if (app) app.style.display = 'none';
        if (authScreen) authScreen.style.display = 'flex';

        // Уничтожаем графики
        Object.values(State.charts).forEach(chart => {
            if (chart && typeof chart.destroy === 'function') chart.destroy();
        });
        State.charts = {};

        // Показываем нужный экран
        const user = DB.getUser();
        if (user) {
            this.showLogin(user.name);
        } else {
            this.showRegister();
        }
    },

    // === ПОКАЗ ЭКРАНОВ ===

    hideAllAuth() {
        document.querySelectorAll('#auth-screen .auth-container').forEach(el => {
            el.style.display = 'none';
        });
    },

    showLogin(name) {
        this.hideAllAuth();
        document.getElementById('auth-login').style.display = 'flex';
        document.getElementById('auth-greeting').textContent = `С возвращением, ${name}!`;
        State.pinInput = '';
        State.pinMode = 'login';
        this.resetPinDots('login');
        this.clearPinError('login');
    },

    showRegister() {
        this.hideAllAuth();
        document.getElementById('auth-register').style.display = 'flex';

        const nameInput = document.getElementById('reg-name');
        nameInput.value = State.tempRegName || '';
        document.getElementById('reg-name-error').textContent = '';

        State.pinInput = '';
        State.tempPin = '';
        State.pinMode = '';

        setTimeout(() => nameInput.focus(), 150);
    },

    showSetPin() {
        this.hideAllAuth();
        document.getElementById('auth-set-pin').style.display = 'flex';
        document.getElementById('set-pin-label').textContent = 'Введите 4-значный PIN-код';
        State.pinInput = '';
        State.pinMode = 'set';
        this.resetPinDots('set');
        this.clearPinError('set');
    },

    showConfirmPin() {
        this.hideAllAuth();
        document.getElementById('auth-confirm-pin').style.display = 'flex';
        State.pinInput = '';
        State.pinMode = 'confirm';
        this.resetPinDots('confirm');
        this.clearPinError('confirm');
    },

    // === УТИЛИТЫ PIN ===

    resetPinDots(mode) {
        const dotsId = {
            login: 'pin-dots-login',
            set: 'pin-dots-set',
            confirm: 'pin-dots-confirm'
        };
        const container = document.getElementById(dotsId[mode]);
        if (!container) return;

        container.querySelectorAll('.pin-dot').forEach(dot => {
            dot.classList.remove('filled', 'error');
        });
    },

    showPinError(mode, msg) {
        const errorId = {
            login: 'pin-error-login',
            set: 'pin-error-set',
            confirm: 'pin-error-confirm'
        };
        const el = document.getElementById(errorId[mode]);
        if (el) el.textContent = msg;
    },

    clearPinError(mode) {
        const errorId = {
            login: 'pin-error-login',
            set: 'pin-error-set',
            confirm: 'pin-error-confirm'
        };
        const el = document.getElementById(errorId[mode]);
        if (el) el.textContent = '';
    },

    shakePin(mode) {
        const dotsId = {
            login: 'pin-dots-login',
            set: 'pin-dots-set',
            confirm: 'pin-dots-confirm'
        };
        const container = document.getElementById(dotsId[mode]);
        if (!container) return;

        const dots = container.querySelectorAll('.pin-dot');

        // Добавляем ошибку
        dots.forEach(dot => dot.classList.add('error'));

        // Убираем через 500мс
        setTimeout(() => {
            dots.forEach(dot => {
                dot.classList.remove('error', 'filled');
            });
        }, 500);
    }
};


/* ========================
   6. UI ЯДРО (НАВИГАЦИЯ, МОДАЛКИ, ТОСТЫ)
   ======================== */

const UI = {

    init() {
        this.bindNavigation();
        this.bindModals();
        this.bindFab();
        this.bindMoreMenu();
        this.bindTabs();
        this.bindPickers();
        this.bindLogout();
        this.setCurrentDate();
    },

    // === НАВИГАЦИЯ ===

    bindNavigation() {
        // Sidebar links
        document.querySelectorAll('.sidebar-link[data-page]').forEach(link => {
            link.addEventListener('click', (e) => {
                e.preventDefault();
                this.navigateTo(link.dataset.page);
            });
        });

        // Bottom nav links
        document.querySelectorAll('.bottom-nav-item[data-page]').forEach(link => {
            link.addEventListener('click', (e) => {
                e.preventDefault();
                this.navigateTo(link.dataset.page);
            });
        });

        // More menu links
        document.querySelectorAll('.more-menu-item[data-page]').forEach(link => {
            link.addEventListener('click', (e) => {
                e.preventDefault();
                this.navigateTo(link.dataset.page);
                this.closeMoreMenu();
            });
        });

        // Кнопки data-page внутри контента
        document.addEventListener('click', (e) => {
            const btn = e.target.closest('[data-page]');
            if (btn && !btn.classList.contains('sidebar-link') &&
                !btn.classList.contains('bottom-nav-item') &&
                !btn.classList.contains('more-menu-item')) {
                e.preventDefault();
                this.navigateTo(btn.dataset.page);
            }
        });

        // Hash navigation
        window.addEventListener('hashchange', () => {
            const page = location.hash.replace('#', '') || 'dashboard';
            if (page !== State.currentPage) {
                this.navigateTo(page, false);
            }
        });
    },

    navigateTo(page, updateHash = true) {
        // Скрыть все страницы
        document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));

        // Показать нужную
        const pageEl = document.getElementById(`page-${page}`);
        if (!pageEl) return;
        pageEl.classList.add('active');

        // Обновить sidebar
        document.querySelectorAll('.sidebar-link').forEach(l => l.classList.remove('active'));
        const sidebarLink = document.querySelector(`.sidebar-link[data-page="${page}"]`);
        if (sidebarLink) sidebarLink.classList.add('active');

        // Обновить bottom nav
        document.querySelectorAll('.bottom-nav-item').forEach(l => l.classList.remove('active'));
        const bottomLink = document.querySelector(`.bottom-nav-item[data-page="${page}"]`);
        if (bottomLink) bottomLink.classList.add('active');

        // Обновить hash
        if (updateHash) {
            history.pushState(null, '', `#${page}`);
        }

        State.currentPage = page;

        // Обновить данные страницы
        this.refreshPage(page);

        // Скролл вверх
        document.getElementById('main-content').scrollTo(0, 0);

        // Закрыть мобильное меню если открыто
        this.closeMoreMenu();
    },

    refreshPage(page) {
        switch (page) {
            case 'dashboard': Dashboard.render(); break;
            case 'accounts': Accounts.render(); break;
            case 'transactions': Transactions.render(); break;
            case 'exchange': Exchange.render(); break;
            case 'analytics': Analytics.render(); break;
            case 'goals': Goals.render(); break;
            case 'categories': Categories.render(); break;
            case 'settings': Settings.render(); break;
        }
    },

    // === МОДАЛЬНЫЕ ОКНА ===

    bindModals() {
        // Закрытие по кнопке X и кнопке отмена
        document.addEventListener('click', (e) => {
            const closer = e.target.closest('[data-close]');
            if (closer) {
                const modalId = closer.dataset.close;
                this.closeModal(modalId);
            }
        });

        // Закрытие по Escape
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                const openModal = document.querySelector('.modal[style*="display: flex"], .modal[style*="display:flex"]');
                if (openModal) {
                    this.closeModal(openModal.id);
                }
                this.closeFab();
                this.closeMoreMenu();
            }
        });
    },

    openModal(id) {
        const modal = document.getElementById(id);
        if (!modal) return;
        modal.style.display = 'flex';
        document.body.style.overflow = 'hidden';

        // Focus trap
        const firstInput = modal.querySelector('input:not([type="hidden"]), select, textarea');
        if (firstInput) {
            setTimeout(() => firstInput.focus(), 100);
        }
    },

    closeModal(id) {
        const modal = document.getElementById(id);
        if (!modal) return;

        modal.classList.add('modal-closing');
        setTimeout(() => {
            modal.style.display = 'none';
            modal.classList.remove('modal-closing');
            document.body.style.overflow = '';
        }, 200);
    },

    // === ТОСТЫ ===

    toast(message, type = 'success', title = '') {
        const container = document.getElementById('toast-container');
        const toast = document.createElement('div');

        const icons = {
            success: '✅',
            error: '❌',
            warning: '⚠️',
            info: 'ℹ️'
        };

        const titles = {
            success: title || 'Успешно',
            error: title || 'Ошибка',
            warning: title || 'Внимание',
            info: title || 'Информация'
        };

        toast.className = `toast toast-${type}`;
        toast.innerHTML = `
            <span class="toast-icon">${icons[type] || '✅'}</span>
            <div class="toast-body">
                <p class="toast-title">${Utils.escapeHtml(titles[type])}</p>
                ${message ? `<p class="toast-message">${Utils.escapeHtml(message)}</p>` : ''}
            </div>
            <button class="toast-close" type="button" aria-label="Закрыть">✕</button>
        `;

        // Закрытие по клику
        toast.querySelector('.toast-close').addEventListener('click', () => {
            this.removeToast(toast);
        });

        container.appendChild(toast);

        // Автоудаление
        setTimeout(() => {
            this.removeToast(toast);
        }, CONFIG.TOAST_DURATION);
    },

    removeToast(toast) {
        if (!toast || !toast.parentNode) return;
        toast.classList.add('toast-out');
        setTimeout(() => {
            if (toast.parentNode) toast.parentNode.removeChild(toast);
        }, 300);
    },

    // === ПОДТВЕРЖДЕНИЕ ===

    confirm(title, message, callback) {
        document.getElementById('confirm-title').textContent = title;
        document.getElementById('confirm-message').textContent = message;
        State.confirmCallback = callback;

        // Убрать старый обработчик и поставить новый
        const btn = document.getElementById('btn-confirm-yes');
        const newBtn = btn.cloneNode(true);
        btn.parentNode.replaceChild(newBtn, btn);
        newBtn.addEventListener('click', () => {
            if (State.confirmCallback) {
                State.confirmCallback();
                State.confirmCallback = null;
            }
            this.closeModal('modal-confirm');
        });

        this.openModal('modal-confirm');
    },

    // === FAB МЕНЮ ===

    bindFab() {
        const fabBtn = document.getElementById('btn-fab-add');
        if (fabBtn) {
            fabBtn.addEventListener('click', (e) => {
                e.preventDefault();
                this.toggleFab();
            });
        }

        const fabOverlay = document.getElementById('fab-overlay');
        if (fabOverlay) {
            fabOverlay.addEventListener('click', () => this.closeFab());
        }

        // FAB options
        document.querySelectorAll('.fab-option').forEach(opt => {
            opt.addEventListener('click', () => {
                const action = opt.dataset.action;
                this.closeFab();
                this.handleFabAction(action);
            });
        });
    },

    toggleFab() {
        const fab = document.getElementById('fab-menu');
        if (fab.style.display === 'none' || !fab.style.display) {
            fab.style.display = 'block';
        } else {
            this.closeFab();
        }
    },

    closeFab() {
        const fab = document.getElementById('fab-menu');
        if (fab) fab.style.display = 'none';
    },

    handleFabAction(action) {
        switch (action) {
            case 'add-income':
                Transactions.openModal('income');
                break;
            case 'add-expense':
                Transactions.openModal('expense');
                break;
            case 'add-transfer':
                Transactions.openModal('transfer');
                break;
            case 'add-exchange':
                this.navigateTo('exchange');
                break;
        }
    },

    // === МЕНЮ "ЕЩЁ" ===

    bindMoreMenu() {
        const btn = document.getElementById('btn-more-menu');
        if (btn) {
            btn.addEventListener('click', (e) => {
                e.preventDefault();
                this.toggleMoreMenu();
            });
        }

        const overlay = document.getElementById('more-menu-overlay');
        if (overlay) {
            overlay.addEventListener('click', () => this.closeMoreMenu());
        }
    },

    toggleMoreMenu() {
        const menu = document.getElementById('more-menu');
        const btn = document.getElementById('btn-more-menu');
        if (menu.style.display === 'none' || !menu.style.display) {
            menu.style.display = 'block';
            if (btn) btn.setAttribute('aria-expanded', 'true');
        } else {
            this.closeMoreMenu();
        }
    },

    closeMoreMenu() {
        const menu = document.getElementById('more-menu');
        const btn = document.getElementById('btn-more-menu');
        if (menu) menu.style.display = 'none';
        if (btn) btn.setAttribute('aria-expanded', 'false');
    },

    // === ТАБЫ ===

    bindTabs() {
        document.addEventListener('click', (e) => {
            const tab = e.target.closest('.tab[data-tab]');
            if (!tab) return;

            const tabsContainer = tab.closest('.tabs');
            const parent = tabsContainer.parentElement;

            // Деактивируем все табы
            tabsContainer.querySelectorAll('.tab').forEach(t => {
                t.classList.remove('active');
                t.setAttribute('aria-selected', 'false');
            });

            // Активируем нажатый
            tab.classList.add('active');
            tab.setAttribute('aria-selected', 'true');

            // Скрываем все tab-content в том же родителе
            parent.querySelectorAll('.tab-content').forEach(tc => {
                tc.classList.remove('active');
            });

            // Показываем нужный
            const targetId = tab.dataset.tab;
            const targetContent = document.getElementById(targetId);
            if (targetContent) {
                targetContent.classList.add('active');
            }
        });
    },

    // === PICKERS (emoji, color) ===

    bindPickers() {
        document.addEventListener('click', (e) => {
            // Emoji picker
            const emojiBtn = e.target.closest('.emoji-btn');
            if (emojiBtn) {
                const picker = emojiBtn.closest('.emoji-picker');
                picker.querySelectorAll('.emoji-btn').forEach(b => {
                    b.classList.remove('active');
                    b.setAttribute('aria-checked', 'false');
                });
                emojiBtn.classList.add('active');
                emojiBtn.setAttribute('aria-checked', 'true');

                // Обновляем hidden input
                const hiddenId = picker.id.replace('-emoji-picker', '-icon')
                    .replace('picker', 'icon');
                // Пробуем разные варианты ID
                const parentModal = picker.closest('.modal-body');
                if (parentModal) {
                    const hiddenInput = parentModal.querySelector('input[type="hidden"][id$="-icon"]');
                    if (hiddenInput) {
                        hiddenInput.value = emojiBtn.dataset.emoji;
                    }
                }
            }

            // Color picker
            const colorBtn = e.target.closest('.color-btn');
            if (colorBtn) {
                const picker = colorBtn.closest('.color-picker');
                picker.querySelectorAll('.color-btn').forEach(b => {
                    b.classList.remove('active');
                    b.setAttribute('aria-checked', 'false');
                });
                colorBtn.classList.add('active');
                colorBtn.setAttribute('aria-checked', 'true');

                const parentModal = picker.closest('.modal-body');
                if (parentModal) {
                    const hiddenInput = parentModal.querySelector('input[type="hidden"][id$="-color"]');
                    if (hiddenInput) {
                        hiddenInput.value = colorBtn.dataset.color;
                    }
                }
            }
        });

        // Чекбоксы валют в модалке счёта
        document.querySelectorAll('#acc-balances .balance-check').forEach(cb => {
            cb.addEventListener('change', () => {
                const row = cb.closest('.balance-row');
                const input = row.querySelector('.form-input-sm');
                if (cb.checked) {
                    input.disabled = false;
                } else {
                    input.disabled = true;
                    input.value = 0;
                }
            });
        });
    },

    // === LOGOUT ===

    bindLogout() {
        document.getElementById('btn-logout').addEventListener('click', () => {
            Auth.logout();
        });

        const logoutMobile = document.getElementById('btn-logout-mobile');
        if (logoutMobile) {
            logoutMobile.addEventListener('click', (e) => {
                e.preventDefault();
                this.closeMoreMenu();
                Auth.logout();
            });
        }
    },

    // === ТЕКУЩАЯ ДАТА ===

    setCurrentDate() {
        const el = document.getElementById('current-date');
        if (el) {
            const now = new Date();
            el.textContent = now.toLocaleDateString('ru-RU', {
                weekday: 'long',
                day: 'numeric',
                month: 'long',
                year: 'numeric'
            });
        }
    }
};
/* ============================================================
   ФИНАНСОВЫЙ ТРЕКЕР — APP.JS
   Часть 2: Валюты (API, конвертер), Счета (CRUD), Категории (CRUD)
   ============================================================ */


/* ========================
   7. ВАЛЮТЫ И КУРСЫ
   ======================== */

const Currency = {

    // Загрузить курсы из кэша или API
    async init() {
        const cached = DB.getRates();
        const timestamp = DB.getRatesTimestamp();
        const now = Date.now();

        if (cached && Object.keys(cached).length > 0 && (now - timestamp) < CONFIG.API.CACHE_DURATION) {
            State.exchangeRates = cached;
            State.ratesLastUpdated = new Date(timestamp);
            console.log('[Currency] Курсы загружены из кэша');
        } else {
            await this.fetchRates();
        }
    },

    // Загрузить курсы из API
    async fetchRates() {
        try {
            UI.toast('Обновление курсов...', 'info', 'Курсы валют');

            const rates = { BYN: 1 };

            // 1. Фиатные валюты через НБРБ API
            try {
                const nbrbRates = await this.fetchNBRB();
                Object.assign(rates, nbrbRates);
            } catch (e) {
                console.warn('[Currency] НБРБ API недоступен, пробуем запасной...', e);
                try {
                    const fallbackRates = await this.fetchFiatFallback();
                    Object.assign(rates, fallbackRates);
                } catch (e2) {
                    console.warn('[Currency] Запасной API тоже недоступен', e2);
                }
            }

            // 2. Крипта через CoinGecko
            try {
                const cryptoRates = await this.fetchCrypto();
                Object.assign(rates, cryptoRates);
            } catch (e) {
                console.warn('[Currency] CoinGecko API недоступен', e);
                // Ставим дефолтные крипто-курсы если нет данных
                if (!rates.BTC) rates.BTC = 100000;
                if (!rates.ETH) rates.ETH = 8000;
                if (!rates.USDT) rates.USDT = rates.USD || 3.27;
            }

            // Проверяем что есть минимум основные валюты
            if (!rates.USD) rates.USD = 3.27;
            if (!rates.EUR) rates.EUR = 3.55;
            if (!rates.RUB) rates.RUB = 0.036;

            State.exchangeRates = rates;
            State.ratesLastUpdated = new Date();

            DB.saveRates(rates);
            DB.saveRatesTimestamp(Date.now());

            console.log('[Currency] Курсы обновлены:', rates);
            return rates;

        } catch (e) {
            console.error('[Currency] Ошибка загрузки курсов:', e);

            // Используем кэш если есть
            const cached = DB.getRates();
            if (cached && Object.keys(cached).length > 0) {
                State.exchangeRates = cached;
                UI.toast('Используются кэшированные курсы', 'warning');
            } else {
                // Хардкод на крайний случай
                State.exchangeRates = {
                    BYN: 1, USD: 3.27, EUR: 3.55, RUB: 0.036,
                    USDT: 3.27, BTC: 100000, ETH: 8000
                };
                UI.toast('Не удалось загрузить курсы. Используются примерные значения.', 'warning');
            }
        }
        try {
    // Передаём текущий курс USD для конвертации
    State.exchangeRates.USD = rates.USD || 3.27;
    const cryptoRates = await this.fetchCrypto();
    Object.assign(rates, cryptoRates);
} catch (e) {
    console.warn('[Currency] CoinGecko API недоступен', e);
    if (!rates.BTC) rates.BTC = 60000;
    if (!rates.ETH) rates.ETH = 2000;
    if (!rates.USDT) rates.USDT = rates.USD || 2.87;
}
    },

    // НБРБ API (Национальный банк Республики Беларусь)
    async fetchNBRB() {
    const response = await fetch(CONFIG.API.NBRB_URL);
    if (!response.ok) throw new Error(`NBRB API: ${response.status}`);
    const data = await response.json();

    const rates = {};
    const needed = ['USD', 'EUR', 'RUB'];

    data.forEach(item => {
        if (needed.includes(item.Cur_Abbreviation)) {
            rates[item.Cur_Abbreviation] = item.Cur_OfficialRate / item.Cur_Scale;
        }
    });

    console.log('[Currency] НБРБ курсы:', rates);
    return rates;
},

    // Запасной API для фиатных валют
    async fetchFiatFallback() {
        const response = await fetch(CONFIG.API.FIAT_URL);
        if (!response.ok) throw new Error(`Fiat fallback: ${response.status}`);
        const data = await response.json();

        const rates = {};
        // В этом API курсы относительно BYN (сколько BYN за 1 единицу)
        // Нужно инвертировать: data.rates содержит сколько единиц за 1 BYN
        if (data.rates) {
            if (data.rates.USD) rates.USD = 1 / data.rates.USD;
            if (data.rates.EUR) rates.EUR = 1 / data.rates.EUR;
            if (data.rates.RUB) rates.RUB = 1 / data.rates.RUB;
        }

        return rates;
    },

    // CoinGecko API для крипты
async fetchCrypto() {
    const response = await fetch(CONFIG.API.CRYPTO_URL);
    if (!response.ok) throw new Error(`CoinGecko: ${response.status}`);
    const data = await response.json();

    const rates = {};

    // CoinGecko возвращает цены в USD, конвертируем в BYN
    const usdRate = State.exchangeRates.USD || 3.27;

    if (data.bitcoin && data.bitcoin.usd) {
        rates.BTC = data.bitcoin.usd * usdRate;
    }
    if (data.ethereum && data.ethereum.usd) {
        rates.ETH = data.ethereum.usd * usdRate;
    }
    if (data.tether && data.tether.usd) {
        rates.USDT = data.tether.usd * usdRate;
    }

    console.log('[Currency] Крипто курсы (в BYN через USD):', rates);
    return rates;
},

    // Конвертация валют
    convert(amount, fromCurrency, toCurrency) {
        if (fromCurrency === toCurrency) return amount;
        if (!amount || isNaN(amount)) return 0;

        const rates = State.exchangeRates;
        if (!rates || Object.keys(rates).length === 0) return amount;

        // Курс = сколько BYN за 1 единицу валюты
        const fromRate = rates[fromCurrency] || 1;
        const toRate = rates[toCurrency] || 1;

        // amount в fromCurrency → BYN → toCurrency
        const amountInBYN = amount * fromRate;
        const result = amountInBYN / toRate;

        return result;
    },

    // Получить курс обмена
    getRate(fromCurrency, toCurrency) {
        if (fromCurrency === toCurrency) return 1;

        const rates = State.exchangeRates;
        const fromRate = rates[fromCurrency] || 1;
        const toRate = rates[toCurrency] || 1;

        return fromRate / toRate;
    },

    // Конвертировать в BYN
    toBYN(amount, currency) {
        return this.convert(amount, currency, 'BYN');
    },

    // Рендер курсов на дашборде
    renderRates() {
        const grid = document.getElementById('rates-grid');
        const updatedEl = document.getElementById('rates-updated');
        if (!grid) return;

        const rates = State.exchangeRates;
        if (!rates || Object.keys(rates).length === 0) {
            grid.innerHTML = '<p class="text-muted">Курсы недоступны</p>';
            return;
        }

        let html = '';
        const currencies = ['USD', 'EUR', 'RUB', 'USDT', 'BTC', 'ETH'];

        currencies.forEach(code => {
            const cur = CONFIG.CURRENCIES[code];
            const rate = rates[code];
            if (!cur || !rate) return;

            let displayRate;
            let label;

            if (code === 'BTC' || code === 'ETH') {
    displayRate = Utils.formatNumber(rate, 2);
    label = `1 ${code} = ${displayRate} BYN`;
} else if (code === 'RUB') {
    // rate уже за 1 RUB, показываем за 100 для удобства
    displayRate = Utils.formatNumber(rate * 100, 4);
    label = `100 ${code} = ${displayRate} BYN`;
} else {
                displayRate = Utils.formatNumber(rate, 4);
                label = `1 ${code} = ${displayRate} BYN`;
            }

            html += `
                <div class="rate-item">
                    <span class="rate-flag">${cur.flag}</span>
                    <div class="rate-info">
                        <div class="rate-code">${code}</div>
                        <div class="rate-value">${label}</div>
                    </div>
                </div>
            `;
        });

        grid.innerHTML = html;

        if (updatedEl && State.ratesLastUpdated) {
            updatedEl.textContent = `Обновлено: ${State.ratesLastUpdated.toLocaleTimeString('ru-RU', {
                hour: '2-digit',
                minute: '2-digit'
            })}`;
        }
    },

    // Рендер ручных курсов в настройках
    renderManualRates() {
        const container = document.getElementById('manual-rates');
        if (!container) return;

        const cryptos = ['USDT', 'BTC', 'ETH'];
        const rates = State.exchangeRates;

        let html = '';
        cryptos.forEach(code => {
            const cur = CONFIG.CURRENCIES[code];
            const currentRate = rates[code] || 0;

            html += `
                <div class="manual-rate-row">
                    <span class="manual-rate-label">${cur.flag} ${code}</span>
                    <input type="number" class="form-input form-input-sm manual-rate-input"
                           id="manual-rate-${code}" value="${currentRate}"
                           step="0.01" min="0" inputmode="decimal">
                    <span class="manual-rate-unit">BYN за 1 ${code}</span>
                </div>
            `;
        });

        container.innerHTML = html;
    }
};


/* ========================
   8. СЧЕТА
   ======================== */

const Accounts = {

    init() {
        this.bindEvents();
    },

    bindEvents() {
        // Кнопки добавления
        document.getElementById('btn-add-account').addEventListener('click', () => this.openModal());
        const btnEmpty = document.getElementById('btn-add-account-empty');
        if (btnEmpty) {
            btnEmpty.addEventListener('click', () => this.openModal());
        }

        // Сохранение
        document.getElementById('btn-save-account').addEventListener('click', () => this.save());

        // Удаление
        document.getElementById('btn-delete-account').addEventListener('click', () => this.delete());
        document.addEventListener('keydown', (e) => {
    // Только когда видна auth-screen
    if (document.getElementById('auth-screen').style.display === 'none') return;

    const activeMode = State.pinMode;
    if (!activeMode) return;

    if (e.key >= '0' && e.key <= '9') {
        e.preventDefault();
        this.pinInput(e.key, activeMode);
    } else if (e.key === 'Backspace' || e.key === 'Delete') {
        e.preventDefault();
        this.pinDelete(activeMode);
    }
});
    },

    // Получить все счета
    getAll() {
        return DB.getAccounts();
    },

    // Получить счёт по ID
    getById(id) {
        return this.getAll().find(a => a.id === id);
    },

    // Открыть модалку создания/редактирования
    openModal(accountId = null) {
        const modal = document.getElementById('modal-account');
        const title = document.getElementById('modal-account-title');
        const deleteBtn = document.getElementById('btn-delete-account');

        // Сброс формы
        document.getElementById('acc-id').value = '';
        document.getElementById('acc-name').value = '';
        document.getElementById('acc-icon').value = '💵';
        document.getElementById('acc-color').value = '#4F46E5';

        // Сброс emoji picker
        document.querySelectorAll('#acc-emoji-picker .emoji-btn').forEach(b => {
            b.classList.remove('active');
            b.setAttribute('aria-checked', 'false');
        });
        const defaultEmoji = document.querySelector('#acc-emoji-picker .emoji-btn[data-emoji="💵"]');
        if (defaultEmoji) {
            defaultEmoji.classList.add('active');
            defaultEmoji.setAttribute('aria-checked', 'true');
        }

        // Сброс color picker
        document.querySelectorAll('#acc-color-picker .color-btn').forEach(b => {
            b.classList.remove('active');
            b.setAttribute('aria-checked', 'false');
        });
        const defaultColor = document.querySelector('#acc-color-picker .color-btn[data-color="#4F46E5"]');
        if (defaultColor) {
            defaultColor.classList.add('active');
            defaultColor.setAttribute('aria-checked', 'true');
        }

        // Сброс валют
        document.querySelectorAll('#acc-balances .balance-check').forEach(cb => {
            const isBYN = cb.value === 'BYN';
            cb.checked = isBYN;
            const input = cb.closest('.balance-row').querySelector('.form-input-sm');
            input.value = 0;
            input.disabled = !isBYN;
        });

        if (accountId) {
            // Редактирование
            const account = this.getById(accountId);
            if (!account) return;

            title.textContent = 'Редактировать счёт';
            deleteBtn.style.display = 'inline-flex';
            document.getElementById('acc-id').value = account.id;
            document.getElementById('acc-name').value = account.name;
            document.getElementById('acc-icon').value = account.icon;
            document.getElementById('acc-color').value = account.color;

            // Установить emoji
            document.querySelectorAll('#acc-emoji-picker .emoji-btn').forEach(b => {
                const isActive = b.dataset.emoji === account.icon;
                b.classList.toggle('active', isActive);
                b.setAttribute('aria-checked', isActive ? 'true' : 'false');
            });

            // Установить цвет
            document.querySelectorAll('#acc-color-picker .color-btn').forEach(b => {
                const isActive = b.dataset.color === account.color;
                b.classList.toggle('active', isActive);
                b.setAttribute('aria-checked', isActive ? 'true' : 'false');
            });

            // Установить валюты и балансы
            document.querySelectorAll('#acc-balances .balance-check').forEach(cb => {
                const currency = cb.value;
                const balance = account.balances ? account.balances[currency] : undefined;
                const hasBalance = balance !== undefined && balance !== null;
                cb.checked = hasBalance;
                const input = cb.closest('.balance-row').querySelector('.form-input-sm');
                input.value = hasBalance ? balance : 0;
                input.disabled = !hasBalance;
            });
        } else {
            title.textContent = 'Новый счёт';
            deleteBtn.style.display = 'none';
        }

        UI.openModal('modal-account');
    },

    // Сохранить счёт
    save() {
        const id = document.getElementById('acc-id').value;
        const name = document.getElementById('acc-name').value.trim();
        const icon = document.getElementById('acc-icon').value;
        const color = document.getElementById('acc-color').value;

        // Валидация
        if (!name) {
            UI.toast('Введите название счёта', 'error');
            document.getElementById('acc-name').focus();
            return;
        }

        // Собираем балансы
        const balances = {};
        let hasAnyCurrency = false;

        document.querySelectorAll('#acc-balances .balance-check').forEach(cb => {
            if (cb.checked) {
                const currency = cb.value;
                const input = cb.closest('.balance-row').querySelector('.form-input-sm');
                balances[currency] = parseFloat(input.value) || 0;
                hasAnyCurrency = true;
            }
        });

        if (!hasAnyCurrency) {
            UI.toast('Выберите хотя бы одну валюту', 'error');
            return;
        }

        const accounts = this.getAll();

        if (id) {
            // Редактирование
            const index = accounts.findIndex(a => a.id === id);
            if (index === -1) return;

            // Сохраняем старые балансы для валют, которые не были изменены через транзакции
            const oldAccount = accounts[index];
            const mergedBalances = {};

            // Для каждой выбранной валюты:
            // - Если валюта была и раньше, сохраняем текущий баланс (мог измениться через транзакции)
            // - Если валюта новая, берём введённое значение
            Object.keys(balances).forEach(cur => {
                if (oldAccount.balances && oldAccount.balances[cur] !== undefined) {
                    // Валюта была — проверяем, изменил ли пользователь начальный баланс
                    const input = document.querySelector(`#acc-balances .form-input-sm[data-currency="${cur}"]`);
                    const inputVal = parseFloat(input.value) || 0;
                    // Если юзер явно поменял значение в поле — берём новое, иначе оставляем текущее
                    mergedBalances[cur] = inputVal;
                } else {
                    // Новая валюта
                    mergedBalances[cur] = balances[cur];
                }
            });

            accounts[index] = {
                ...oldAccount,
                name,
                icon,
                color,
                balances: mergedBalances,
                updatedAt: new Date().toISOString()
            };

            UI.toast(`Счёт «${name}» обновлён`);
        } else {
            // Создание
            const newAccount = {
                id: Utils.generateId(),
                name,
                icon,
                color,
                balances,
                createdAt: new Date().toISOString()
            };
            accounts.push(newAccount);
            UI.toast(`Счёт «${name}» создан`);
        }

        DB.saveAccounts(accounts);
        UI.closeModal('modal-account');
        this.render();

        // Обновляем дашборд если на нём
        if (State.currentPage === 'dashboard') {
            Dashboard.render();
        }
    },

    // Удалить счёт
    delete() {
        const id = document.getElementById('acc-id').value;
        if (!id) return;

        const account = this.getById(id);
        if (!account) return;

        UI.confirm(
            'Удалить счёт',
            `Удалить счёт «${account.name}»? Транзакции, связанные с этим счётом, останутся, но потеряют привязку.`,
            () => {
                let accounts = this.getAll().filter(a => a.id !== id);
                DB.saveAccounts(accounts);

                UI.closeModal('modal-account');
                UI.toast(`Счёт «${account.name}» удалён`);
                this.render();

                if (State.currentPage === 'dashboard') {
                    Dashboard.render();
                }
            }
        );
    },

    // Обновить баланс счёта (при транзакции)
    updateBalance(accountId, currency, amount) {
        const accounts = this.getAll();
        const index = accounts.findIndex(a => a.id === accountId);
        if (index === -1) return;

        if (!accounts[index].balances) {
            accounts[index].balances = {};
        }

        const current = accounts[index].balances[currency] || 0;
        accounts[index].balances[currency] = current + amount;

        DB.saveAccounts(accounts);
    },

    // Получить общий баланс в BYN по всем счетам
    getTotalBalanceBYN() {
        const accounts = this.getAll();
        let total = 0;

        accounts.forEach(account => {
            if (!account.balances) return;
            Object.entries(account.balances).forEach(([currency, amount]) => {
                total += Currency.toBYN(amount, currency);
            });
        });

        return total;
    },

    // Получить балансы по валютам (суммарно по всем счетам)
    getCurrencyTotals() {
        const accounts = this.getAll();
        const totals = {};

        accounts.forEach(account => {
            if (!account.balances) return;
            Object.entries(account.balances).forEach(([currency, amount]) => {
                if (amount !== 0) {
                    totals[currency] = (totals[currency] || 0) + amount;
                }
            });
        });

        return totals;
    },

    // Заполнить <select> со счетами
    populateSelect(selectId, selectedId = '', includeAll = false) {
        const select = document.getElementById(selectId);
        if (!select) return;

        const accounts = this.getAll();

        let html = '';
        if (includeAll) {
            html = '<option value="all">Все счета</option>';
        }

        accounts.forEach(acc => {
            html += `<option value="${acc.id}" ${acc.id === selectedId ? 'selected' : ''}>
                ${acc.icon} ${Utils.escapeHtml(acc.name)}
            </option>`;
        });

        if (accounts.length === 0 && !includeAll) {
            html = '<option value="" disabled>Нет счетов</option>';
        }

        select.innerHTML = html;
    },

    // Рендер страницы счетов
    render() {
        this.renderGrid();
        this.renderSummary();
    },

    renderGrid() {
        const grid = document.getElementById('accounts-grid');
        if (!grid) return;

        const accounts = this.getAll();

        if (accounts.length === 0) {
            grid.innerHTML = `
                <div class="empty-state">
                    <span class="empty-icon" aria-hidden="true">💳</span>
                    <p>Добавьте ваш первый счёт</p>
                    <button class="btn btn-primary btn-sm" type="button"
                            onclick="Accounts.openModal()">+ Добавить счёт</button>
                </div>
            `;
            return;
        }

        let html = '';

        accounts.forEach(account => {
            // Считаем общий баланс в BYN
            let totalBYN = 0;
            let balancesHtml = '';

            if (account.balances) {
                Object.entries(account.balances).forEach(([currency, amount]) => {
                    totalBYN += Currency.toBYN(amount, currency);
                    const amountClass = amount > 0 ? 'positive' : amount < 0 ? 'negative' : '';
                    const cur = CONFIG.CURRENCIES[currency];

                    balancesHtml += `
                        <div class="account-balance-item">
                            <span class="account-balance-currency">
                                ${cur ? cur.flag : ''} ${currency}
                            </span>
                            <span class="account-balance-amount ${amountClass}">
                                ${Utils.formatMoney(amount, currency)}
                            </span>
                        </div>
                    `;
                });
            }

            html += `
    <div class="account-card" data-id="${account.id}"
         style="--account-color: ${account.color}">
        <div class="account-card-header">
                        <div class="account-card-info">
                            <div class="account-card-icon" style="background-color: ${account.color}15">
                                ${account.icon}
                            </div>
                            <div>
                                <div class="account-card-name">${Utils.escapeHtml(account.name)}</div>
                                <div class="account-card-total">≈ ${Utils.formatMoney(totalBYN, 'BYN')}</div>
                            </div>
                        </div>
                        <div class="account-card-actions">
                            <button class="btn-icon" type="button" aria-label="Редактировать"
                                    onclick="Accounts.openModal('${account.id}')">✏️</button>
                        </div>
                    </div>
                    <div class="account-card-balances">
                        ${balancesHtml || '<div class="text-muted text-sm">Нет валют</div>'}
                    </div>
                </div>
            `;
        });

        grid.innerHTML = html;
    },

    renderSummary() {
        const container = document.getElementById('accounts-summary');
        if (!container) return;

        const totals = this.getCurrencyTotals();

        if (Object.keys(totals).length === 0) {
            container.innerHTML = '';
            container.style.display = 'none';
            return;
        }

        container.style.display = 'flex';
        let html = '';

        Object.entries(totals).forEach(([currency, amount]) => {
            const cur = CONFIG.CURRENCIES[currency];
            html += `
                <div class="accounts-summary-item">
                    <span class="currency-flag">${cur ? cur.flag : ''}</span>
                    ${Utils.formatMoney(amount, currency)}
                </div>
            `;
        });

        container.innerHTML = html;
    }
};


/* ========================
   9. КАТЕГОРИИ
   ======================== */

const Categories = {

    init() {
        this.bindEvents();
    },

    bindEvents() {
        // Кнопка добавления
        document.getElementById('btn-add-category').addEventListener('click', () => this.openModal());

        // Сохранение
        document.getElementById('btn-save-category').addEventListener('click', () => this.save());

        // Удаление
        document.getElementById('btn-delete-category').addEventListener('click', () => this.delete());

        // Переключение типа — показ/скрытие бюджета
        document.getElementById('cat-type').addEventListener('change', (e) => {
            const budgetGroup = document.getElementById('cat-budget-group');
            if (budgetGroup) {
                budgetGroup.style.display = e.target.value === 'expense' ? 'block' : 'none';
            }
        });
    },

    // Получить все категории
    getAll() {
        return DB.getCategories();
    },

    // По ID
    getById(id) {
        return this.getAll().find(c => c.id === id);
    },

    // По типу
    getByType(type) {
        return this.getAll().filter(c => c.type === type);
    },

    // Открыть модалку
    openModal(categoryId = null) {
        const title = document.getElementById('modal-category-title');
        const deleteBtn = document.getElementById('btn-delete-category');
        const budgetGroup = document.getElementById('cat-budget-group');

        // Сброс
        document.getElementById('cat-id').value = '';
        document.getElementById('cat-type').value = 'expense';
        document.getElementById('cat-name').value = '';
        document.getElementById('cat-icon').value = '🍔';
        document.getElementById('cat-color').value = '#EF4444';
        document.getElementById('cat-budget').value = '';
        budgetGroup.style.display = 'block';

        // Сброс emoji picker
        document.querySelectorAll('#cat-emoji-picker .emoji-btn').forEach(b => {
            b.classList.remove('active');
            b.setAttribute('aria-checked', 'false');
        });
        const defEmoji = document.querySelector('#cat-emoji-picker .emoji-btn[data-emoji="🍔"]');
        if (defEmoji) {
            defEmoji.classList.add('active');
            defEmoji.setAttribute('aria-checked', 'true');
        }

        // Сброс color picker
        document.querySelectorAll('#cat-color-picker .color-btn').forEach(b => {
            b.classList.remove('active');
            b.setAttribute('aria-checked', 'false');
        });
        const defColor = document.querySelector('#cat-color-picker .color-btn[data-color="#EF4444"]');
        if (defColor) {
            defColor.classList.add('active');
            defColor.setAttribute('aria-checked', 'true');
        }

        if (categoryId) {
            const cat = this.getById(categoryId);
            if (!cat) return;

            title.textContent = 'Редактировать категорию';
            deleteBtn.style.display = 'inline-flex';

            document.getElementById('cat-id').value = cat.id;
            document.getElementById('cat-type').value = cat.type;
            document.getElementById('cat-name').value = cat.name;
            document.getElementById('cat-icon').value = cat.icon;
            document.getElementById('cat-color').value = cat.color;
            document.getElementById('cat-budget').value = cat.budget || '';

            budgetGroup.style.display = cat.type === 'expense' ? 'block' : 'none';

            // Emoji
            document.querySelectorAll('#cat-emoji-picker .emoji-btn').forEach(b => {
                const isActive = b.dataset.emoji === cat.icon;
                b.classList.toggle('active', isActive);
                b.setAttribute('aria-checked', isActive ? 'true' : 'false');
            });

            // Color
            document.querySelectorAll('#cat-color-picker .color-btn').forEach(b => {
                const isActive = b.dataset.color === cat.color;
                b.classList.toggle('active', isActive);
                b.setAttribute('aria-checked', isActive ? 'true' : 'false');
            });
        } else {
            title.textContent = 'Новая категория';
            deleteBtn.style.display = 'none';
        }

        UI.openModal('modal-category');
    },

    // Сохранить
    save() {
        const id = document.getElementById('cat-id').value;
        const type = document.getElementById('cat-type').value;
        const name = document.getElementById('cat-name').value.trim();
        const icon = document.getElementById('cat-icon').value;
        const color = document.getElementById('cat-color').value;
        const budget = parseFloat(document.getElementById('cat-budget').value) || 0;

        if (!name) {
            UI.toast('Введите название категории', 'error');
            document.getElementById('cat-name').focus();
            return;
        }

        const categories = this.getAll();

        // Проверка дубликатов (в рамках одного типа)
        const duplicate = categories.find(c =>
            c.type === type && c.name.toLowerCase() === name.toLowerCase() && c.id !== id
        );
        if (duplicate) {
            UI.toast(`Категория «${name}» уже существует`, 'error');
            return;
        }

        if (id) {
            // Редактирование
            const index = categories.findIndex(c => c.id === id);
            if (index === -1) return;

            categories[index] = {
                ...categories[index],
                type,
                name,
                icon,
                color,
                budget: type === 'expense' ? budget : 0
            };

            UI.toast(`Категория «${name}» обновлена`);
        } else {
            // Создание
            categories.push({
                id: Utils.generateId(),
                type,
                name,
                icon,
                color,
                budget: type === 'expense' ? budget : 0
            });
            UI.toast(`Категория «${name}» создана`);
        }

        DB.saveCategories(categories);
        UI.closeModal('modal-category');
        this.render();
    },

    // Удалить
    delete() {
        const id = document.getElementById('cat-id').value;
        if (!id) return;

        const cat = this.getById(id);
        if (!cat) return;

        // Проверяем, есть ли транзакции с этой категорией
        const transactions = DB.getTransactions();
        const linked = transactions.filter(t => t.categoryId === id).length;

        const msg = linked > 0
            ? `Удалить категорию «${cat.name}»? ${linked} транзакций потеряют привязку к категории.`
            : `Удалить категорию «${cat.name}»?`;

        UI.confirm('Удалить категорию', msg, () => {
            const categories = this.getAll().filter(c => c.id !== id);
            DB.saveCategories(categories);

            UI.closeModal('modal-category');
            UI.toast(`Категория «${cat.name}» удалена`);
            this.render();
        });
    },

    // Заполнить <select> с категориями
    populateSelect(selectId, type = 'expense', selectedId = '', includeAll = false) {
        const select = document.getElementById(selectId);
        if (!select) return;

        const categories = this.getByType(type);

        let html = '';
        if (includeAll) {
            html = '<option value="all">Все категории</option>';
        }

        categories.forEach(cat => {
            html += `<option value="${cat.id}" ${cat.id === selectedId ? 'selected' : ''}>
                ${cat.icon} ${Utils.escapeHtml(cat.name)}
            </option>`;
        });

        if (categories.length === 0 && !includeAll) {
            html = '<option value="" disabled>Нет категорий</option>';
        }

        select.innerHTML = html;
    },

    // Получить потраченное по категории за период
    getSpent(categoryId, dateFrom, dateTo) {
        const transactions = DB.getTransactions();
        return transactions
            .filter(t => {
                if (t.categoryId !== categoryId) return false;
                if (t.type !== 'expense') return false;
                if (dateFrom && t.date < dateFrom) return false;
                if (dateTo && t.date > dateTo) return false;
                return true;
            })
            .reduce((sum, t) => sum + Currency.toBYN(t.amount, t.currency), 0);
    },

    // Рендер страницы категорий
    render() {
        this.renderList('expense', 'categories-expense-list');
        this.renderList('income', 'categories-income-list');
    },

    renderList(type, containerId) {
        const container = document.getElementById(containerId);
        if (!container) return;

        const categories = this.getByType(type);

        if (categories.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <span class="empty-icon" aria-hidden="true">🏷️</span>
                    <p>Нет категорий ${type === 'expense' ? 'расходов' : 'доходов'}</p>
                </div>
            `;
            return;
        }

        // Получаем текущий месяц для расчёта потраченного
        const now = new Date();
        const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
        const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split('T')[0];

        let html = '';

        categories.forEach(cat => {
            let budgetHtml = '';
            let spentHtml = '';

            if (type === 'expense') {
                const spent = this.getSpent(cat.id, monthStart, monthEnd);

                if (cat.budget > 0) {
                    const percent = Math.min(100, (spent / cat.budget) * 100);
                    const progressClass = percent >= 100 ? 'progress-danger' :
                        percent >= 75 ? 'progress-warning' : 'progress-success';

                    budgetHtml = `
                        <div class="category-budget">
                            Бюджет: ${Utils.formatMoney(cat.budget, 'BYN')}
                        </div>
                        <div class="progress-bar" style="margin-top: 6px; height: 6px;">
                            <div class="progress-fill ${progressClass}"
                                 style="width: ${percent}%"></div>
                        </div>
                    `;
                    spentHtml = `
                        <span class="category-spent ${percent >= 100 ? 'text-expense' : ''}">
                            ${Utils.formatMoney(spent, 'BYN')} / ${Utils.formatMoney(cat.budget, 'BYN')}
                        </span>
                    `;
                } else if (spent > 0) {
                    spentHtml = `
                        <span class="category-spent text-muted">
                            Потрачено: ${Utils.formatMoney(spent, 'BYN')}
                        </span>
                    `;
                }
            }

            html += `
                <div class="category-item" onclick="Categories.openModal('${cat.id}')">
                    <div class="category-icon-wrapper"
                         style="background-color: ${cat.color}15; color: ${cat.color}">
                        ${cat.icon}
                    </div>
                    <div class="category-info">
                        <div class="category-name">${Utils.escapeHtml(cat.name)}</div>
                        ${spentHtml}
                        ${budgetHtml}
                    </div>
                    <div class="category-actions">
                        <button class="btn-icon" type="button" aria-label="Редактировать"
                                onclick="event.stopPropagation(); Categories.openModal('${cat.id}')">✏️</button>
                    </div>
                </div>
            `;
        });

        container.innerHTML = html;
    }
};
/* ============================================================
   ФИНАНСОВЫЙ ТРЕКЕР — APP.JS
   Часть 3: Транзакции (CRUD, фильтры, пагинация), Обмен валют
   ============================================================ */


/* ========================
   10. ТРАНЗАКЦИИ
   ======================== */

const Transactions = {

    init() {
        this.bindEvents();
    },

    bindEvents() {
        // Кнопки добавления
        document.getElementById('btn-add-transaction').addEventListener('click', () => this.openModal('expense'));

        // Сохранение
        document.getElementById('btn-save-transaction').addEventListener('click', () => this.save());

        // Удаление
        document.getElementById('btn-delete-transaction').addEventListener('click', () => this.delete());

        // Табы типа транзакции
        document.querySelectorAll('.type-tab[data-type]').forEach(tab => {
            tab.addEventListener('click', () => {
                const type = tab.dataset.type;
                this.setTransactionType(type);
            });
        });

        // Фильтры
        document.getElementById('filter-type').addEventListener('change', () => this.applyFilters());
        document.getElementById('filter-account').addEventListener('change', () => this.applyFilters());
        document.getElementById('filter-category').addEventListener('change', () => this.applyFilters());
        document.getElementById('filter-date-from').addEventListener('change', () => this.applyFilters());
        document.getElementById('filter-date-to').addEventListener('change', () => this.applyFilters());

        // Поиск с debounce
        const searchInput = document.getElementById('filter-search');
        searchInput.addEventListener('input', Utils.debounce(() => {
            this.applyFilters();
        }, 300));

        // Пагинация
        document.getElementById('btn-prev-page').addEventListener('click', () => {
            if (State.transactionsPage > 1) {
                State.transactionsPage--;
                this.renderList();
            }
        });

        document.getElementById('btn-next-page').addEventListener('click', () => {
            State.transactionsPage++;
            this.renderList();
        });

        // Смена валюты в модалке — обновляем список счетов, на которых есть эта валюта
        document.getElementById('tr-currency').addEventListener('change', () => {
            this.updateAccountsForCurrency();
        });
    },

    // Получить все
    getAll() {
        return DB.getTransactions();
    },

    // По ID
    getById(id) {
        return this.getAll().find(t => t.id === id);
    },

    // Установить тип транзакции в модалке
    setTransactionType(type) {
        document.getElementById('tr-type').value = type;

        // Обновляем табы
        document.querySelectorAll('.type-tab').forEach(tab => {
            const isActive = tab.dataset.type === type;
            tab.classList.toggle('active', isActive);
            tab.setAttribute('aria-selected', isActive ? 'true' : 'false');
        });

        // Показать/скрыть поля
        const categoryGroup = document.getElementById('tr-category-group');
        const accountToGroup = document.getElementById('tr-account-to-group');

        if (type === 'transfer') {
            categoryGroup.style.display = 'none';
            accountToGroup.style.display = 'block';
        } else {
            categoryGroup.style.display = 'block';
            accountToGroup.style.display = 'none';

            // Обновляем категории для выбранного типа
            Categories.populateSelect('tr-category', type);
        }
    },

    // Обновить список счетов по выбранной валюте
    updateAccountsForCurrency() {
        const currency = document.getElementById('tr-currency').value;
        const accounts = Accounts.getAll();

        // Фильтруем счета, у которых есть выбранная валюта
        const filteredAccounts = accounts.filter(acc => {
            if (!acc.balances) return false;
            return acc.balances.hasOwnProperty(currency);
        });

        const selectFrom = document.getElementById('tr-account');
        const selectTo = document.getElementById('tr-account-to');

        let html = '';
        if (filteredAccounts.length === 0) {
            html = `<option value="" disabled>Нет счетов с ${currency}</option>`;
        } else {
            filteredAccounts.forEach(acc => {
                const bal = acc.balances[currency] || 0;
                html += `<option value="${acc.id}">
                    ${acc.icon} ${Utils.escapeHtml(acc.name)} (${Utils.formatMoney(bal, currency)})
                </option>`;
            });
        }

        if (selectFrom) selectFrom.innerHTML = html;
        if (selectTo) selectTo.innerHTML = html;
    },

    // Открыть модалку
    openModal(type = 'expense', transactionId = null) {
        const titleEl = document.getElementById('modal-transaction-title');
        const deleteBtn = document.getElementById('btn-delete-transaction');

        // Сброс формы
        document.getElementById('tr-id').value = '';
        document.getElementById('tr-amount').value = '';
        document.getElementById('tr-currency').value = 'BYN';
        document.getElementById('tr-date').value = Utils.today();
        document.getElementById('tr-description').value = '';

        if (transactionId) {
            // Редактирование
            const tr = this.getById(transactionId);
            if (!tr) return;

            titleEl.textContent = 'Редактировать транзакцию';
            deleteBtn.style.display = 'inline-flex';

            document.getElementById('tr-id').value = tr.id;
            document.getElementById('tr-amount').value = tr.amount;
            document.getElementById('tr-currency').value = tr.currency;
            document.getElementById('tr-date').value = tr.date;
            document.getElementById('tr-description').value = tr.description || '';

            type = tr.type;
            this.setTransactionType(type);

            // Устанавливаем счета
            this.updateAccountsForCurrency();

            setTimeout(() => {
                document.getElementById('tr-account').value = tr.accountId || '';
                if (tr.type === 'transfer') {
                    document.getElementById('tr-account-to').value = tr.accountToId || '';
                } else {
                    Categories.populateSelect('tr-category', type, tr.categoryId);
                }
            }, 50);
        } else {
            // Создание
            titleEl.textContent = 'Новая транзакция';
            deleteBtn.style.display = 'none';

            this.setTransactionType(type);
            this.updateAccountsForCurrency();
        }

        UI.openModal('modal-transaction');

        // Фокус на сумму
        setTimeout(() => {
            document.getElementById('tr-amount').focus();
        }, 200);
    },

    // Сохранить транзакцию
    save() {
        const id = document.getElementById('tr-id').value;
        const type = document.getElementById('tr-type').value;
        const amount = parseFloat(document.getElementById('tr-amount').value);
        const currency = document.getElementById('tr-currency').value;
        const accountId = document.getElementById('tr-account').value;
        const date = document.getElementById('tr-date').value;
        const description = document.getElementById('tr-description').value.trim();

        // Валидация
        if (!amount || amount <= 0) {
            UI.toast('Введите сумму', 'error');
            document.getElementById('tr-amount').focus();
            return;
        }

        if (!accountId) {
            UI.toast('Выберите счёт', 'error');
            return;
        }

        if (!date) {
            UI.toast('Выберите дату', 'error');
            return;
        }

        let categoryId = '';
        let accountToId = '';

        if (type === 'transfer') {
            accountToId = document.getElementById('tr-account-to').value;
            if (!accountToId) {
                UI.toast('Выберите счёт назначения', 'error');
                return;
            }
            if (accountId === accountToId) {
                UI.toast('Выберите разные счета', 'error');
                return;
            }
        } else {
            categoryId = document.getElementById('tr-category').value;
            if (!categoryId) {
                UI.toast('Выберите категорию', 'error');
                return;
            }
        }

        const transactions = this.getAll();

        if (id) {
            // Редактирование — сначала откатываем старую транзакцию
            const oldTr = transactions.find(t => t.id === id);
            if (oldTr) {
                this.revertBalanceChange(oldTr);
            }

            // Обновляем
            const index = transactions.findIndex(t => t.id === id);
            if (index === -1) return;

            transactions[index] = {
                ...transactions[index],
                type,
                amount,
                currency,
                categoryId,
                accountId,
                accountToId,
                date,
                description,
                updatedAt: new Date().toISOString()
            };

            // Применяем новый баланс
            this.applyBalanceChange(transactions[index]);

            UI.toast('Транзакция обновлена');
        } else {
            // Создание
            const newTransaction = {
                id: Utils.generateId(),
                type,
                amount,
                currency,
                categoryId,
                accountId,
                accountToId,
                date,
                description,
                createdAt: new Date().toISOString()
            };

            transactions.push(newTransaction);
            this.applyBalanceChange(newTransaction);

            UI.toast(type === 'income' ? 'Доход добавлен' : type === 'expense' ? 'Расход добавлен' : 'Перевод выполнен');
        }

        DB.saveTransactions(transactions);
        UI.closeModal('modal-transaction');

        // Обновляем страницы
        this.render();
        if (State.currentPage === 'dashboard') {
            Dashboard.render();
        }
    },

    // Применить изменение баланса
    applyBalanceChange(tr) {
    switch (tr.type) {
        case 'income':
            Accounts.updateBalance(tr.accountId, tr.currency, tr.amount);
            break;
        case 'expense':
            Accounts.updateBalance(tr.accountId, tr.currency, -tr.amount);
            break;
        case 'transfer':
            Accounts.updateBalance(tr.accountId, tr.currency, -tr.amount);
            Accounts.updateBalance(tr.accountToId, tr.currency, tr.amount);
            break;
        case 'exchange':
            if (tr.exchangeDirection === 'from') {
                Accounts.updateBalance(tr.accountId, tr.currency, -tr.amount);
            } else if (tr.exchangeDirection === 'to') {
                Accounts.updateBalance(tr.accountId, tr.currency, tr.amount);
            }
            break;
    }
},

revertBalanceChange(tr) {
    switch (tr.type) {
        case 'income':
            Accounts.updateBalance(tr.accountId, tr.currency, -tr.amount);
            break;
        case 'expense':
            Accounts.updateBalance(tr.accountId, tr.currency, tr.amount);
            break;
        case 'transfer':
            Accounts.updateBalance(tr.accountId, tr.currency, tr.amount);
            Accounts.updateBalance(tr.accountToId, tr.currency, -tr.amount);
            break;
        case 'exchange':
            if (tr.exchangeDirection === 'from') {
                Accounts.updateBalance(tr.accountId, tr.currency, tr.amount);
            } else if (tr.exchangeDirection === 'to') {
                Accounts.updateBalance(tr.accountId, tr.currency, -tr.amount);
            }
            break;
    }
},

    // Удалить транзакцию
    delete() {
    const id = document.getElementById('tr-id').value;
    if (!id) return;

    const tr = this.getById(id);
    if (!tr) return;

    const typeNames = { income: 'доход', expense: 'расход', transfer: 'перевод', exchange: 'обмен' };

    UI.confirm(
        'Удалить транзакцию',
        `Удалить ${typeNames[tr.type] || 'транзакцию'} на ${Utils.formatMoney(tr.amount, tr.currency)}?`,
        () => {
            // Откатываем баланс
            this.revertBalanceChange(tr);

            let transactions = this.getAll();

            // Для обмена удаляем обе связанные транзакции
            if (tr.type === 'exchange' && tr.exchangeId) {
                // Находим парную транзакцию и откатываем её тоже
                const linkedTr = transactions.find(t =>
                    t.exchangeId === tr.exchangeId && t.id !== tr.id
                );
                if (linkedTr) {
                    this.revertBalanceChange(linkedTr);
                }
                // Удаляем обе
                transactions = transactions.filter(t => t.exchangeId !== tr.exchangeId);
            } else {
                transactions = transactions.filter(t => t.id !== id);
            }

            DB.saveTransactions(transactions);

            UI.closeModal('modal-transaction');
            UI.toast('Транзакция удалена');
            this.render();

            if (State.currentPage === 'dashboard') {
                Dashboard.render();
            }
        }
    );
},

    // Применить фильтры
    applyFilters() {
        State.transactionsFilters = {
            type: document.getElementById('filter-type').value,
            account: document.getElementById('filter-account').value,
            category: document.getElementById('filter-category').value,
            dateFrom: document.getElementById('filter-date-from').value,
            dateTo: document.getElementById('filter-date-to').value,
            search: document.getElementById('filter-search').value.trim().toLowerCase()
        };
        State.transactionsPage = 1;
        this.renderList();
    },

    // Получить отфильтрованные транзакции
    getFiltered() {
        let transactions = this.getAll();
        const f = State.transactionsFilters;

        // Тип
        if (f.type !== 'all') {
            transactions = transactions.filter(t => t.type === f.type);
        }

        // Счёт
        if (f.account !== 'all') {
            transactions = transactions.filter(t =>
                t.accountId === f.account || t.accountToId === f.account
            );
        }

        // Категория
        if (f.category !== 'all') {
            transactions = transactions.filter(t => t.categoryId === f.category);
        }

        // Дата от
        if (f.dateFrom) {
            transactions = transactions.filter(t => t.date >= f.dateFrom);
        }

        // Дата до
        if (f.dateTo) {
            transactions = transactions.filter(t => t.date <= f.dateTo);
        }

        // Поиск
        if (f.search) {
            transactions = transactions.filter(t => {
                const cat = Categories.getById(t.categoryId);
                const acc = Accounts.getById(t.accountId);
                const searchStr = [
                    t.description || '',
                    cat ? cat.name : '',
                    acc ? acc.name : '',
                    t.amount.toString(),
                    t.currency
                ].join(' ').toLowerCase();
                return searchStr.includes(f.search);
            });
        }
        transactions = transactions.filter(t => {
    if (t.type === 'exchange' && t.exchangeDirection === 'to') return false;
    return true;
});
        // Сортировка по дате (новые сверху), потом по времени создания
        transactions.sort((a, b) => {
            if (a.date !== b.date) return b.date.localeCompare(a.date);
            return (b.createdAt || '').localeCompare(a.createdAt || '');
        });

        return transactions;
    },

    // Получить транзакции за период (для аналитики)
    getByPeriod(dateFrom, dateTo, type = null) {
        let transactions = this.getAll();

        transactions = transactions.filter(t => {
            if (t.date < dateFrom || t.date > dateTo) return false;
            if (type && t.type !== type) return false;
            return true;
        });

        return transactions;
    },

    // Рендер страницы
    render() {
        // Обновляем фильтры-селекты
        Accounts.populateSelect('filter-account', '', true);
        this.populateCategoryFilter();

        // Устанавливаем значения фильтров
        document.getElementById('filter-type').value = State.transactionsFilters.type;
        document.getElementById('filter-account').value = State.transactionsFilters.account;
        document.getElementById('filter-category').value = State.transactionsFilters.category;
        document.getElementById('filter-date-from').value = State.transactionsFilters.dateFrom;
        document.getElementById('filter-date-to').value = State.transactionsFilters.dateTo;
        document.getElementById('filter-search').value = State.transactionsFilters.search;

        this.renderList();
    },

    // Заполнить фильтр категорий (все типы)
    populateCategoryFilter() {
        const select = document.getElementById('filter-category');
        if (!select) return;

        const categories = Categories.getAll();
        let html = '<option value="all">Все категории</option>';

        const expenses = categories.filter(c => c.type === 'expense');
        const incomes = categories.filter(c => c.type === 'income');

        if (expenses.length > 0) {
            html += '<optgroup label="📤 Расходы">';
            expenses.forEach(cat => {
                html += `<option value="${cat.id}">${cat.icon} ${Utils.escapeHtml(cat.name)}</option>`;
            });
            html += '</optgroup>';
        }

        if (incomes.length > 0) {
            html += '<optgroup label="📥 Доходы">';
            incomes.forEach(cat => {
                html += `<option value="${cat.id}">${cat.icon} ${Utils.escapeHtml(cat.name)}</option>`;
            });
            html += '</optgroup>';
        }

        select.innerHTML = html;
    },

    // Рендер списка с пагинацией
    renderList() {
        const container = document.getElementById('transactions-list');
        const summaryEl = document.getElementById('transactions-summary');
        const paginationEl = document.getElementById('transactions-pagination');
        if (!container) return;

        const filtered = this.getFiltered();
        const total = filtered.length;
        const totalPages = Math.max(1, Math.ceil(total / CONFIG.ITEMS_PER_PAGE));

        // Корректируем страницу
        if (State.transactionsPage > totalPages) {
            State.transactionsPage = totalPages;
        }

        const start = (State.transactionsPage - 1) * CONFIG.ITEMS_PER_PAGE;
        const pageItems = filtered.slice(start, start + CONFIG.ITEMS_PER_PAGE);

        // Сводка
        if (summaryEl) {
            const totalIncome = filtered
                .filter(t => t.type === 'income')
                .reduce((s, t) => s + Currency.toBYN(t.amount, t.currency), 0);
            const totalExpense = filtered
                .filter(t => t.type === 'expense')
                .reduce((s, t) => s + Currency.toBYN(t.amount, t.currency), 0);

            summaryEl.innerHTML = `
                Показано: <span>${total}</span>
                ${totalIncome > 0 ? `&nbsp;·&nbsp; Доходы: <span class="text-income">${Utils.formatMoney(totalIncome, 'BYN')}</span>` : ''}
                ${totalExpense > 0 ? `&nbsp;·&nbsp; Расходы: <span class="text-expense">${Utils.formatMoney(totalExpense, 'BYN')}</span>` : ''}
            `;
        }

        // Пустое состояние
        if (total === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <span class="empty-icon" aria-hidden="true">📋</span>
                    <p>${State.transactionsFilters.search || State.transactionsFilters.type !== 'all'
                    ? 'Ничего не найдено' : 'Транзакций пока нет'}</p>
                </div>
            `;
            if (paginationEl) paginationEl.style.display = 'none';
            return;
        }

        // Группируем по дате
        const grouped = Utils.groupBy(pageItems, 'date');
        let html = '';

        Object.entries(grouped).forEach(([date, items]) => {
            html += `<div class="transaction-date-header">${Utils.formatDateRelative(date)} — ${Utils.formatDateFull(date)}</div>`;

            items.forEach(tr => {
                html += this.renderItem(tr);
            });
        });

        container.innerHTML = html;

        // Пагинация
        if (paginationEl) {
            if (totalPages > 1) {
                paginationEl.style.display = 'flex';
                document.getElementById('pagination-info').textContent = `${State.transactionsPage} / ${totalPages}`;
                document.getElementById('btn-prev-page').disabled = State.transactionsPage <= 1;
                document.getElementById('btn-next-page').disabled = State.transactionsPage >= totalPages;
            } else {
                paginationEl.style.display = 'none';
            }
        }
    },

    // Рендер одной транзакции
    renderItem(tr) {
        const category = Categories.getById(tr.categoryId);
        const account = Accounts.getById(tr.accountId);
        const accountTo = tr.accountToId ? Accounts.getById(tr.accountToId) : null;

        let icon, iconClass, categoryName, amountPrefix, amountClass;

        switch (tr.type) {
            case 'income':
                icon = category ? category.icon : '📥';
                iconClass = 'income';
                categoryName = category ? category.name : 'Доход';
                amountPrefix = '+';
                amountClass = 'income';
                break;
            case 'expense':
                icon = category ? category.icon : '📤';
                iconClass = 'expense';
                categoryName = category ? category.name : 'Расход';
                amountPrefix = '−';
                amountClass = 'expense';
                break;
            case 'transfer':
                icon = '🔄';
                iconClass = 'transfer';
                categoryName = `${account ? account.name : '?'} → ${accountTo ? accountTo.name : '?'}`;
                amountPrefix = '';
                amountClass = 'transfer';
                break;
case 'exchange':
    icon = '💱';
    iconClass = 'exchange';
    categoryName = tr.description || `${tr.currency} → ${tr.linkedCurrency || '?'}`;
    amountPrefix = '−';
    amountClass = 'expense';
    break;
            default:
                icon = '📋';
                iconClass = '';
                categoryName = 'Транзакция';
                amountPrefix = '';
                amountClass = '';
        }

        // Сумма в BYN (если валюта не BYN)
let amountBynHtml = '';
if (tr.type === 'exchange' && tr.linkedAmount && tr.linkedCurrency) {
    amountBynHtml = `<div class="transaction-amount-byn" style="color: var(--income-color);">+${Utils.formatMoney(tr.linkedAmount, tr.linkedCurrency)}</div>`;
} else if (tr.currency !== 'BYN') {
    const amountByn = Currency.toBYN(tr.amount, tr.currency);
    amountBynHtml = `<div class="transaction-amount-byn">≈ ${Utils.formatMoney(amountByn, 'BYN')}</div>`;
}

        // Описание
        const descHtml = tr.description
            ? `<span class="transaction-dot"></span><span class="transaction-description">${Utils.escapeHtml(tr.description)}</span>`
            : '';
        const onclickAttr = tr.type === 'exchange'
    ? ''
    : `onclick="Transactions.openModal('${tr.type}', '${tr.id}')"`;
        return `
            <div class="transaction-item" ${onclickAttr} ${tr.type === 'exchange' ? 'style="cursor:default;"' : ''}>
                <div class="transaction-icon ${iconClass}">${icon}</div>
                <div class="transaction-details">
                    <div class="transaction-category">${Utils.escapeHtml(categoryName)}</div>
                    <div class="transaction-meta">
                        <span class="transaction-account">
                            ${account ? account.icon : ''} ${account ? Utils.escapeHtml(account.name) : ''}
                        </span>
                        ${descHtml}
                    </div>
                </div>
                <div class="transaction-right">
                    <div class="transaction-amount ${amountClass}">
                        ${amountPrefix}${Utils.formatMoney(tr.amount, tr.currency)}
                    </div>
                    ${amountBynHtml}
                </div>
            </div>
        `;
    },

    // Рендер последних транзакций на дашборде
    renderRecent(limit = 5) {
        const container = document.getElementById('recent-transactions');
        if (!container) return;

        let transactions = this.getAll();
        transactions.sort((a, b) => {
            if (a.date !== b.date) return b.date.localeCompare(a.date);
            return (b.createdAt || '').localeCompare(a.createdAt || '');
        });

        const recent = transactions.slice(0, limit);

        if (recent.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <span class="empty-icon" aria-hidden="true">📋</span>
                    <p>Транзакций пока нет</p>
                </div>
            `;
            return;
        }

        let html = '';
        recent.forEach(tr => {
            html += this.renderItem(tr);
        });

        container.innerHTML = html;
    },

    // Получить суммы за текущий месяц
    getCurrentMonthTotals() {
        const now = new Date();
        const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
        const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split('T')[0];

        const transactions = this.getByPeriod(monthStart, monthEnd);

        let income = 0;
        let expense = 0;

        transactions.forEach(tr => {
            if (tr.type === 'income') {
                income += Currency.toBYN(tr.amount, tr.currency);
            } else if (tr.type === 'expense') {
                expense += Currency.toBYN(tr.amount, tr.currency);
            }
        });

        return { income, expense, savings: income - expense };
    },

    // Экспорт в CSV
    exportCSV() {
        const transactions = this.getAll();
        if (transactions.length === 0) {
            UI.toast('Нет транзакций для экспорта', 'warning');
            return;
        }

        // Заголовки
        const headers = ['Дата', 'Тип', 'Категория', 'Счёт', 'Сумма', 'Валюта', 'Сумма BYN', 'Описание'];

        // Строки
        const rows = transactions.map(tr => {
            const category = Categories.getById(tr.categoryId);
            const account = Accounts.getById(tr.accountId);
            const typeNames = { income: 'Доход', expense: 'Расход', transfer: 'Перевод', exchange: 'Обмен' };

            return [
                tr.date,
                typeNames[tr.type] || tr.type,
                category ? category.name : '',
                account ? account.name : '',
                tr.amount,
                tr.currency,
                Currency.toBYN(tr.amount, tr.currency).toFixed(2),
                tr.description || ''
            ];
        });

        // Собираем CSV
        const csvContent = [
            headers.join(';'),
            ...rows.map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(';'))
        ].join('\n');

        // BOM для корректного отображения кириллицы
        const BOM = '\uFEFF';
        const blob = new Blob([BOM + csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);

        const link = document.createElement('a');
        link.href = url;
        link.download = `finance-transactions-${Utils.today()}.csv`;
        link.click();

        URL.revokeObjectURL(url);
        UI.toast('CSV файл скачан');
    }
};


/* ========================
   11. ОБМЕН ВАЛЮТ
   ======================== */

const Exchange = {

    init() {
        this.bindEvents();
    },

    bindEvents() {
        // Кнопка обмена
        document.getElementById('btn-do-exchange').addEventListener('click', () => this.doExchange());

        // Кнопка swap
        document.getElementById('btn-swap-currencies').addEventListener('click', () => this.swapCurrencies());

        // При изменении суммы "от" — рассчитать сумму "до"
        document.getElementById('exchange-amount-from').addEventListener('input', () => this.calculateTo());

        // При изменении суммы "до" — рассчитать сумму "от"
        document.getElementById('exchange-amount-to').addEventListener('input', () => this.calculateFrom());

        // При смене валюты — пересчитать
        document.getElementById('exchange-currency-from').addEventListener('change', () => {
            this.updateRate();
            this.calculateTo();
            this.updateAccountSelects();
        });

        document.getElementById('exchange-currency-to').addEventListener('change', () => {
            this.updateRate();
            this.calculateTo();
            this.updateAccountSelects();
        });
    },

    // Обновить отображаемый курс
    updateRate() {
        const fromCur = document.getElementById('exchange-currency-from').value;
        const toCur = document.getElementById('exchange-currency-to').value;
        const rateEl = document.getElementById('exchange-rate-info');

        if (fromCur === toCur) {
            rateEl.textContent = 'Выберите разные валюты';
            return;
        }

        const rate = Currency.getRate(fromCur, toCur);
        const fromInfo = CONFIG.CURRENCIES[fromCur];
        const toInfo = CONFIG.CURRENCIES[toCur];

        rateEl.textContent = `1 ${fromInfo.flag} ${fromCur} = ${Utils.formatNumber(rate, toInfo.decimals > 2 ? 8 : 4)} ${toInfo.flag} ${toCur}`;
    },

    // Рассчитать сумму "до"
    calculateTo() {
        const fromAmount = parseFloat(document.getElementById('exchange-amount-from').value) || 0;
        const fromCur = document.getElementById('exchange-currency-from').value;
        const toCur = document.getElementById('exchange-currency-to').value;

        if (fromAmount > 0 && fromCur !== toCur) {
            const toAmount = Currency.convert(fromAmount, fromCur, toCur);
            const decimals = CONFIG.CURRENCIES[toCur].decimals;
            document.getElementById('exchange-amount-to').value = toAmount.toFixed(decimals);
        }
    },

    // Рассчитать сумму "от"
    calculateFrom() {
        const toAmount = parseFloat(document.getElementById('exchange-amount-to').value) || 0;
        const fromCur = document.getElementById('exchange-currency-from').value;
        const toCur = document.getElementById('exchange-currency-to').value;

        if (toAmount > 0 && fromCur !== toCur) {
            const fromAmount = Currency.convert(toAmount, toCur, fromCur);
            const decimals = CONFIG.CURRENCIES[fromCur].decimals;
            document.getElementById('exchange-amount-from').value = fromAmount.toFixed(decimals);
        }
    },

    // Поменять валюты местами
    swapCurrencies() {
        const fromCur = document.getElementById('exchange-currency-from');
        const toCur = document.getElementById('exchange-currency-to');
        const fromAmount = document.getElementById('exchange-amount-from');
        const toAmount = document.getElementById('exchange-amount-to');

        const tempCur = fromCur.value;
        fromCur.value = toCur.value;
        toCur.value = tempCur;

        const tempAmount = fromAmount.value;
        fromAmount.value = toAmount.value;
        toAmount.value = tempAmount;

        this.updateRate();
        this.updateAccountSelects();
    },

    // Обновить селекты счетов по выбранным валютам
    updateAccountSelects() {
        const fromCur = document.getElementById('exchange-currency-from').value;
        const toCur = document.getElementById('exchange-currency-to').value;
        const accounts = Accounts.getAll();

        // Счета с валютой "от"
        const fromAccounts = accounts.filter(acc =>
            acc.balances && acc.balances.hasOwnProperty(fromCur)
        );

        // Счета с валютой "до"
        const toAccounts = accounts.filter(acc =>
            acc.balances && acc.balances.hasOwnProperty(toCur)
        );

        const selectFrom = document.getElementById('exchange-account-from');
        const selectTo = document.getElementById('exchange-account-to');

        let htmlFrom = '';
        if (fromAccounts.length === 0) {
            htmlFrom = `<option value="" disabled>Нет счетов с ${fromCur}</option>`;
        } else {
            fromAccounts.forEach(acc => {
                const bal = acc.balances[fromCur] || 0;
                htmlFrom += `<option value="${acc.id}">
                    ${acc.icon} ${Utils.escapeHtml(acc.name)} (${Utils.formatMoney(bal, fromCur)})
                </option>`;
            });
        }

        let htmlTo = '';
        if (toAccounts.length === 0) {
            htmlTo = `<option value="" disabled>Нет счетов с ${toCur}</option>`;
        } else {
            toAccounts.forEach(acc => {
                const bal = acc.balances[toCur] || 0;
                htmlTo += `<option value="${acc.id}">
                    ${acc.icon} ${Utils.escapeHtml(acc.name)} (${Utils.formatMoney(bal, toCur)})
                </option>`;
            });
        }

        if (selectFrom) selectFrom.innerHTML = htmlFrom;
        if (selectTo) selectTo.innerHTML = htmlTo;
    },

    // Выполнить обмен
    doExchange() {
        const fromAmount = parseFloat(document.getElementById('exchange-amount-from').value);
        const toAmount = parseFloat(document.getElementById('exchange-amount-to').value);
        const fromCur = document.getElementById('exchange-currency-from').value;
        const toCur = document.getElementById('exchange-currency-to').value;
        const fromAccountId = document.getElementById('exchange-account-from').value;
        const toAccountId = document.getElementById('exchange-account-to').value;
        const date = document.getElementById('exchange-date').value || Utils.today();
        const note = document.getElementById('exchange-note').value.trim();

        // Валидация
        if (!fromAmount || fromAmount <= 0) {
            UI.toast('Введите сумму для обмена', 'error');
            return;
        }

        if (!toAmount || toAmount <= 0) {
            UI.toast('Введите сумму получения', 'error');
            return;
        }

        if (fromCur === toCur) {
            UI.toast('Выберите разные валюты', 'error');
            return;
        }

        if (!fromAccountId) {
            UI.toast('Выберите счёт списания', 'error');
            return;
        }

        if (!toAccountId) {
            UI.toast('Выберите счёт зачисления', 'error');
            return;
        }

        // Проверяем достаточно ли средств
        const fromAccount = Accounts.getById(fromAccountId);
        if (fromAccount && fromAccount.balances) {
            const available = fromAccount.balances[fromCur] || 0;
            if (available < fromAmount) {
                UI.toast(`Недостаточно средств. Доступно: ${Utils.formatMoney(available, fromCur)}`, 'error');
                return;
            }
        }

        // Создаём транзакцию обмена
        const transactions = DB.getTransactions();

        const exchangeId = Utils.generateId();

        // Транзакция-расход (списание)
        const debitTx = {
            id: exchangeId + '_debit',
            type: 'exchange',
            amount: fromAmount,
            currency: fromCur,
            accountId: fromAccountId,
            accountToId: toAccountId,
            categoryId: '',
            date,
            description: note || `Обмен ${fromCur} → ${toCur}`,
            exchangeId,
            exchangeDirection: 'from',
            exchangeRate: toAmount / fromAmount,
            linkedCurrency: toCur,
            linkedAmount: toAmount,
            createdAt: new Date().toISOString()
        };

        // Транзакция-доход (зачисление)
        const creditTx = {
            id: exchangeId + '_credit',
            type: 'exchange',
            amount: toAmount,
            currency: toCur,
            accountId: toAccountId,
            accountToId: fromAccountId,
            categoryId: '',
            date,
            description: note || `Обмен ${fromCur} → ${toCur}`,
            exchangeId,
            exchangeDirection: 'to',
            exchangeRate: fromAmount / toAmount,
            linkedCurrency: fromCur,
            linkedAmount: fromAmount,
            createdAt: new Date().toISOString()
        };

        transactions.push(debitTx, creditTx);
        DB.saveTransactions(transactions);

        // Обновляем балансы
        Accounts.updateBalance(fromAccountId, fromCur, -fromAmount);
        Accounts.updateBalance(toAccountId, toCur, toAmount);

        // Очистка формы
        document.getElementById('exchange-amount-from').value = '';
        document.getElementById('exchange-amount-to').value = '';
        document.getElementById('exchange-note').value = '';

        UI.toast(`Обмен выполнен: ${Utils.formatMoney(fromAmount, fromCur)} → ${Utils.formatMoney(toAmount, toCur)}`);

        // Обновляем
        this.renderHistory();

        if (State.currentPage === 'dashboard') {
            Dashboard.render();
        }
    },

    // Рендер страницы обмена
    render() {
        // Устанавливаем дату
        document.getElementById('exchange-date').value = Utils.today();

        // Обновляем курс
        this.updateRate();

        // Обновляем счета
        this.updateAccountSelects();

        // Рендерим историю
        this.renderHistory();
    },

    // Рендер истории обменов
    renderHistory() {
        const container = document.getElementById('exchange-history');
        if (!container) return;

        const transactions = DB.getTransactions();

        // Берём только exchange-debit (чтобы не дублировать)
        const exchanges = transactions
            .filter(t => t.type === 'exchange' && t.exchangeDirection === 'from')
            .sort((a, b) => {
                if (a.date !== b.date) return b.date.localeCompare(a.date);
                return (b.createdAt || '').localeCompare(a.createdAt || '');
            })
            .slice(0, 20); // Последние 20

        if (exchanges.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <span class="empty-icon" aria-hidden="true">💱</span>
                    <p>Обменов пока не было</p>
                </div>
            `;
            return;
        }

        let html = '';

        exchanges.forEach(ex => {
            const fromCur = CONFIG.CURRENCIES[ex.currency];
            const toCur = CONFIG.CURRENCIES[ex.linkedCurrency];
            const fromAcc = Accounts.getById(ex.accountId);
            const toAcc = Accounts.getById(ex.accountToId);

            html += `
                <div class="exchange-history-item">
                    <div class="exchange-history-icon">💱</div>
                    <div class="exchange-history-details">
                        <div class="exchange-history-currencies">
                            ${fromCur ? fromCur.flag : ''} ${ex.currency}
                            <span class="exchange-history-arrow">→</span>
                            ${toCur ? toCur.flag : ''} ${ex.linkedCurrency}
                        </div>
                        <div class="exchange-history-meta">
                            <span>${Utils.formatDateRelative(ex.date)}</span>
                            <span class="transaction-dot"></span>
                            <span>${fromAcc ? fromAcc.name : '?'} → ${toAcc ? toAcc.name : '?'}</span>
                        </div>
                    </div>
                    <div class="exchange-history-amounts">
                        <div class="exchange-history-from">−${Utils.formatMoney(ex.amount, ex.currency)}</div>
                        <div class="exchange-history-to">+${Utils.formatMoney(ex.linkedAmount, ex.linkedCurrency)}</div>
                    </div>
                </div>
            `;
        });

        container.innerHTML = html;
    }
};
/* ============================================================
   ФИНАНСОВЫЙ ТРЕКЕР — APP.JS
   Часть 4: Дашборд, Графики (Chart.js), Аналитика
   ============================================================ */


/* ========================
   12. ДАШБОРД
   ======================== */

const Dashboard = {

    render() {
        this.renderBalance();
        this.renderWidgets();
        Currency.renderRates();
        Transactions.renderRecent();
        this.renderCharts();
    },

    // Общий баланс
    renderBalance() {
        const totalEl = document.getElementById('total-balance');
        const currenciesEl = document.getElementById('balance-currencies');
        if (!totalEl) return;

        const totalBYN = Accounts.getTotalBalanceBYN();
        totalEl.textContent = Utils.formatMoney(totalBYN, 'BYN');

        // Балансы по валютам
        const totals = Accounts.getCurrencyTotals();
        if (currenciesEl) {
            let html = '';
            Object.entries(totals).forEach(([currency, amount]) => {
                if (currency === 'BYN' || amount === 0) return;
                const cur = CONFIG.CURRENCIES[currency];
                html += `
                    <div class="balance-currency-item">
                        <span>${cur ? cur.flag : ''}</span>
                        <span>${Utils.formatMoney(amount, currency)}</span>
                    </div>
                `;
            });
            currenciesEl.innerHTML = html;
        }

        // Пульс-анимация
        const card = document.getElementById('total-balance-card');
        if (card) {
            card.classList.add('updated');
            setTimeout(() => card.classList.remove('updated'), 700);
        }
    },

    // Виджеты
    renderWidgets() {
        const totals = Transactions.getCurrentMonthTotals();
        const goals = DB.getGoals();
        const completedGoals = goals.filter(g => {
            const percent = g.targetAmount > 0 ? (g.currentAmount / g.targetAmount) * 100 : 0;
            return percent >= 100;
        }).length;

        document.getElementById('widget-income').textContent = Utils.formatMoney(totals.income, 'BYN');
        document.getElementById('widget-expense').textContent = Utils.formatMoney(totals.expense, 'BYN');
        document.getElementById('widget-savings').textContent = Utils.formatMoney(totals.savings, 'BYN');
        document.getElementById('widget-goals').textContent = `${completedGoals} / ${goals.length}`;

        // Цвет экономии
        const savingsEl = document.getElementById('widget-savings');
        if (savingsEl) {
            savingsEl.style.color = totals.savings >= 0 ? 'var(--income-color)' : 'var(--expense-color)';
        }
    },

    // Все графики дашборда
    renderCharts() {
        this.renderIncomeExpenseChart();
        this.renderExpensesPieChart();
        this.renderIncomePieChart();
        this.renderBalanceLineChart();
    },

    // Столбчатая: Доходы vs Расходы (6 месяцев)
    renderIncomeExpenseChart() {
        const ctx = document.getElementById('chart-income-expense');
        if (!ctx) return;

        // Уничтожаем старый график
        if (State.charts['income-expense']) {
            State.charts['income-expense'].destroy();
        }

        const now = new Date();
        const labels = [];
        const incomeData = [];
        const expenseData = [];

        for (let i = 5; i >= 0; i--) {
            const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
            const monthStart = new Date(date.getFullYear(), date.getMonth(), 1).toISOString().split('T')[0];
            const monthEnd = new Date(date.getFullYear(), date.getMonth() + 1, 0).toISOString().split('T')[0];

            labels.push(Utils.getMonthShort(date.getMonth()));

            const transactions = Transactions.getByPeriod(monthStart, monthEnd);

            let income = 0;
            let expense = 0;
            transactions.forEach(t => {
                if (t.type === 'income') income += Currency.toBYN(t.amount, t.currency);
                if (t.type === 'expense') expense += Currency.toBYN(t.amount, t.currency);
            });

            incomeData.push(Math.round(income * 100) / 100);
            expenseData.push(Math.round(expense * 100) / 100);
        }

        State.charts['income-expense'] = new Chart(ctx, {
            type: 'bar',
            data: {
                labels,
                datasets: [
                    {
                        label: 'Доходы',
                        data: incomeData,
                        backgroundColor: 'rgba(16, 185, 129, 0.7)',
                        borderColor: 'rgba(16, 185, 129, 1)',
                        borderWidth: 1,
                        borderRadius: 6,
                        borderSkipped: false
                    },
                    {
                        label: 'Расходы',
                        data: expenseData,
                        backgroundColor: 'rgba(239, 68, 68, 0.7)',
                        borderColor: 'rgba(239, 68, 68, 1)',
                        borderWidth: 1,
                        borderRadius: 6,
                        borderSkipped: false
                    }
                ]
            },
            options: this.getBarOptions('BYN')
        });
    },

    // Круговая: Расходы по категориям (текущий месяц)
    renderExpensesPieChart() {
        const ctx = document.getElementById('chart-expenses-pie');
        if (!ctx) return;

        if (State.charts['expenses-pie']) {
            State.charts['expenses-pie'].destroy();
        }

        const data = this.getCategoryData('expense');

        if (data.labels.length === 0) {
            State.charts['expenses-pie'] = new Chart(ctx, {
                type: 'doughnut',
                data: {
                    labels: ['Нет данных'],
                    datasets: [{
                        data: [1],
                        backgroundColor: ['#E5E7EB'],
                        borderWidth: 0
                    }]
                },
                options: this.getDoughnutOptions()
            });
            return;
        }

        State.charts['expenses-pie'] = new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels: data.labels,
                datasets: [{
                    data: data.values,
                    backgroundColor: data.colors,
                    borderWidth: 2,
                    borderColor: '#ffffff',
                    hoverBorderWidth: 3
                }]
            },
            options: this.getDoughnutOptions()
        });
    },

    // Круговая: Доходы по категориям (текущий месяц)
    renderIncomePieChart() {
        const ctx = document.getElementById('chart-income-pie');
        if (!ctx) return;

        if (State.charts['income-pie']) {
            State.charts['income-pie'].destroy();
        }

        const data = this.getCategoryData('income');

        if (data.labels.length === 0) {
            State.charts['income-pie'] = new Chart(ctx, {
                type: 'doughnut',
                data: {
                    labels: ['Нет данных'],
                    datasets: [{
                        data: [1],
                        backgroundColor: ['#E5E7EB'],
                        borderWidth: 0
                    }]
                },
                options: this.getDoughnutOptions()
            });
            return;
        }

        State.charts['income-pie'] = new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels: data.labels,
                datasets: [{
                    data: data.values,
                    backgroundColor: data.colors,
                    borderWidth: 2,
                    borderColor: '#ffffff',
                    hoverBorderWidth: 3
                }]
            },
            options: this.getDoughnutOptions()
        });
    },

    // Линейная: Динамика баланса (12 месяцев)
    renderBalanceLineChart() {
        const ctx = document.getElementById('chart-balance-line');
        if (!ctx) return;

        if (State.charts['balance-line']) {
            State.charts['balance-line'].destroy();
        }

        const now = new Date();
        const labels = [];
        const balanceData = [];
        let runningBalance = 0;

        // Начальный баланс = текущий баланс - все транзакции за 12 мес
        const totalNow = Accounts.getTotalBalanceBYN();
        const allTransactions = Transactions.getAll();

        // Считаем общий эффект транзакций за 12 месяцев
        const twelveMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 11, 1).toISOString().split('T')[0];
        let totalEffect = 0;

        allTransactions.forEach(t => {
            if (t.date >= twelveMonthsAgo) {
                if (t.type === 'income') totalEffect += Currency.toBYN(t.amount, t.currency);
                else if (t.type === 'expense') totalEffect -= Currency.toBYN(t.amount, t.currency);
            }
        });

        runningBalance = totalNow - totalEffect;

        for (let i = 11; i >= 0; i--) {
            const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
            const monthStart = new Date(date.getFullYear(), date.getMonth(), 1).toISOString().split('T')[0];
            const monthEnd = new Date(date.getFullYear(), date.getMonth() + 1, 0).toISOString().split('T')[0];

            labels.push(Utils.getMonthShort(date.getMonth()));

            const transactions = Transactions.getByPeriod(monthStart, monthEnd);
            transactions.forEach(t => {
                if (t.type === 'income') runningBalance += Currency.toBYN(t.amount, t.currency);
                else if (t.type === 'expense') runningBalance -= Currency.toBYN(t.amount, t.currency);
            });

            balanceData.push(Math.round(runningBalance * 100) / 100);
        }

        State.charts['balance-line'] = new Chart(ctx, {
            type: 'line',
            data: {
                labels,
                datasets: [{
                    label: 'Баланс',
                    data: balanceData,
                    borderColor: '#4F46E5',
                    backgroundColor: 'rgba(79, 70, 229, 0.1)',
                    borderWidth: 2.5,
                    fill: true,
                    tension: 0.4,
                    pointRadius: 4,
                    pointHoverRadius: 6,
                    pointBackgroundColor: '#4F46E5',
                    pointBorderColor: '#ffffff',
                    pointBorderWidth: 2
                }]
            },
            options: this.getLineOptions('BYN')
        });
    },

    // Получить данные по категориям за текущий месяц
    getCategoryData(type) {
        const now = new Date();
        const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
        const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split('T')[0];

        const transactions = Transactions.getByPeriod(monthStart, monthEnd, type);

        // Группировка по категориям
        const grouped = {};
        transactions.forEach(t => {
            const cat = Categories.getById(t.categoryId);
            const catName = cat ? cat.name : 'Прочее';
            const catColor = cat ? cat.color : '#6B7280';

            if (!grouped[t.categoryId || 'none']) {
                grouped[t.categoryId || 'none'] = {
                    name: catName,
                    color: catColor,
                    total: 0
                };
            }
            grouped[t.categoryId || 'none'].total += Currency.toBYN(t.amount, t.currency);
        });

        // Сортировка по сумме
        const sorted = Object.values(grouped).sort((a, b) => b.total - a.total);

        return {
            labels: sorted.map(s => s.name),
            values: sorted.map(s => Math.round(s.total * 100) / 100),
            colors: sorted.map(s => s.color)
        };
    },

    // === Общие опции для графиков ===

    getBarOptions(currency) {
        return {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'top',
                    labels: {
                        usePointStyle: true,
                        pointStyle: 'rectRounded',
                        padding: 16,
                        font: { family: 'Inter', size: 12, weight: '500' }
                    }
                },
                tooltip: {
                    backgroundColor: '#1F2937',
                    titleFont: { family: 'Inter', size: 13, weight: '600' },
                    bodyFont: { family: 'Inter', size: 12 },
                    padding: 12,
                    cornerRadius: 8,
                    displayColors: true,
                    callbacks: {
                        label: (ctx) => `${ctx.dataset.label}: ${Utils.formatMoney(ctx.parsed.y, currency)}`
                    }
                }
            },
            scales: {
                x: {
                    grid: { display: false },
                    ticks: {
                        font: { family: 'Inter', size: 11 },
                        color: '#9CA3AF'
                    }
                },
                y: {
                    grid: { color: 'rgba(0,0,0,0.05)' },
                    ticks: {
                        font: { family: 'Inter', size: 11 },
                        color: '#9CA3AF',
                        callback: (val) => {
                            if (val >= 1000) return (val / 1000).toFixed(0) + 'K';
                            return val;
                        }
                    },
                    beginAtZero: true
                }
            },
            interaction: {
                intersect: false,
                mode: 'index'
            },
            animation: {
                duration: 600,
                easing: 'easeOutQuart'
            }
        };
    },

    getLineOptions(currency) {
        return {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    display: false
                },
                tooltip: {
                    backgroundColor: '#1F2937',
                    titleFont: { family: 'Inter', size: 13, weight: '600' },
                    bodyFont: { family: 'Inter', size: 12 },
                    padding: 12,
                    cornerRadius: 8,
                    callbacks: {
                        label: (ctx) => `Баланс: ${Utils.formatMoney(ctx.parsed.y, currency)}`
                    }
                }
            },
            scales: {
                x: {
                    grid: { display: false },
                    ticks: {
                        font: { family: 'Inter', size: 11 },
                        color: '#9CA3AF'
                    }
                },
                y: {
                    grid: { color: 'rgba(0,0,0,0.05)' },
                    ticks: {
                        font: { family: 'Inter', size: 11 },
                        color: '#9CA3AF',
                        callback: (val) => {
                            if (Math.abs(val) >= 1000) return (val / 1000).toFixed(1) + 'K';
                            return val;
                        }
                    }
                }
            },
            interaction: {
                intersect: false,
                mode: 'index'
            },
            animation: {
                duration: 800,
                easing: 'easeOutQuart'
            }
        };
    },

    getDoughnutOptions() {
        return {
            responsive: true,
            maintainAspectRatio: false,
            cutout: '60%',
            plugins: {
                legend: {
                    position: 'bottom',
                    labels: {
                        usePointStyle: true,
                        pointStyle: 'circle',
                        padding: 12,
                        font: { family: 'Inter', size: 11, weight: '500' },
                        generateLabels: (chart) => {
                            const data = chart.data;
                            if (!data.labels.length) return [];
                            return data.labels.map((label, i) => ({
                                text: label.length > 15 ? label.substring(0, 15) + '…' : label,
                                fillStyle: data.datasets[0].backgroundColor[i],
                                strokeStyle: 'transparent',
                                hidden: false,
                                index: i,
                                pointStyle: 'circle'
                            }));
                        }
                    }
                },
                tooltip: {
                    backgroundColor: '#1F2937',
                    titleFont: { family: 'Inter', size: 13, weight: '600' },
                    bodyFont: { family: 'Inter', size: 12 },
                    padding: 12,
                    cornerRadius: 8,
                    callbacks: {
                        label: (ctx) => {
                            const total = ctx.dataset.data.reduce((a, b) => a + b, 0);
                            const percent = total > 0 ? ((ctx.parsed / total) * 100).toFixed(1) : 0;
                            return `${ctx.label}: ${Utils.formatMoney(ctx.parsed, 'BYN')} (${percent}%)`;
                        }
                    }
                }
            },
            animation: {
                duration: 700,
                easing: 'easeOutQuart'
            }
        };
    }
};


/* ========================
   13. АНАЛИТИКА
   ======================== */

const Analytics = {

    init() {
        this.bindEvents();
    },

    bindEvents() {
        // Кнопки периода
        document.querySelectorAll('.period-btn[data-period]').forEach(btn => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('.period-btn').forEach(b => {
                    b.classList.remove('active');
                    b.setAttribute('aria-selected', 'false');
                });
                btn.classList.add('active');
                btn.setAttribute('aria-selected', 'true');

                State.currentAnalyticsPeriod = btn.dataset.period;

                const customPeriod = document.getElementById('custom-period');
                if (btn.dataset.period === 'custom') {
                    customPeriod.style.display = 'flex';
                } else {
                    customPeriod.style.display = 'none';
                    this.render();
                }
            });
        });

        // Применить кастомный период
        document.getElementById('btn-apply-period').addEventListener('click', () => {
            State.customDateFrom = document.getElementById('analytics-date-from').value;
            State.customDateTo = document.getElementById('analytics-date-to').value;
            this.render();
        });
    },

    // Получить диапазон дат текущего периода
    getRange() {
        return Utils.getPeriodRange(State.currentAnalyticsPeriod);
    },

    // Главный рендер
    render() {
        const range = this.getRange();
        this.renderExpenses(range);
        this.renderIncomes(range);
        this.renderCompare(range);
        this.renderBudget();
    },

    // === РАСХОДЫ ===

    renderExpenses(range) {
        const transactions = Transactions.getByPeriod(range.from, range.to, 'expense');

        // Пирог
        this.renderCategoryPie('chart-an-expenses-pie', transactions);

        // Столбцы
        this.renderCategoryBar('chart-an-expenses-bar', transactions);

        // Тренд
        this.renderTrend('chart-an-expenses-trend', range, 'expense');

        // Статистика
        this.renderExpensesStats(transactions, range);

        // Топ-5
        this.renderTopExpenses(transactions);
    },

    renderCategoryPie(canvasId, transactions) {
        const ctx = document.getElementById(canvasId);
        if (!ctx) return;

        if (State.charts[canvasId]) {
            State.charts[canvasId].destroy();
        }

        const grouped = {};
        transactions.forEach(t => {
            const cat = Categories.getById(t.categoryId);
            const key = t.categoryId || 'none';
            if (!grouped[key]) {
                grouped[key] = {
                    name: cat ? cat.name : 'Прочее',
                    color: cat ? cat.color : '#6B7280',
                    total: 0
                };
            }
            grouped[key].total += Currency.toBYN(t.amount, t.currency);
        });

        const sorted = Object.values(grouped).sort((a, b) => b.total - a.total);

        if (sorted.length === 0) {
            State.charts[canvasId] = new Chart(ctx, {
                type: 'doughnut',
                data: {
                    labels: ['Нет данных'],
                    datasets: [{ data: [1], backgroundColor: ['#E5E7EB'], borderWidth: 0 }]
                },
                options: Dashboard.getDoughnutOptions()
            });
            return;
        }

        State.charts[canvasId] = new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels: sorted.map(s => s.name),
                datasets: [{
                    data: sorted.map(s => Math.round(s.total * 100) / 100),
                    backgroundColor: sorted.map(s => s.color),
                    borderWidth: 2,
                    borderColor: '#ffffff'
                }]
            },
            options: Dashboard.getDoughnutOptions()
        });
    },

    renderCategoryBar(canvasId, transactions) {
        const ctx = document.getElementById(canvasId);
        if (!ctx) return;

        if (State.charts[canvasId]) {
            State.charts[canvasId].destroy();
        }

        const grouped = {};
        transactions.forEach(t => {
            const cat = Categories.getById(t.categoryId);
            const key = t.categoryId || 'none';
            if (!grouped[key]) {
                grouped[key] = {
                    name: cat ? cat.name : 'Прочее',
                    color: cat ? cat.color : '#6B7280',
                    total: 0
                };
            }
            grouped[key].total += Currency.toBYN(t.amount, t.currency);
        });

        const sorted = Object.values(grouped).sort((a, b) => b.total - a.total).slice(0, 10);

        State.charts[canvasId] = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: sorted.map(s => s.name.length > 12 ? s.name.substring(0, 12) + '…' : s.name),
                datasets: [{
                    data: sorted.map(s => Math.round(s.total * 100) / 100),
                    backgroundColor: sorted.map(s => s.color + 'CC'),
                    borderColor: sorted.map(s => s.color),
                    borderWidth: 1,
                    borderRadius: 6,
                    borderSkipped: false
                }]
            },
            options: {
                ...Dashboard.getBarOptions('BYN'),
                indexAxis: 'y',
                plugins: {
                    ...Dashboard.getBarOptions('BYN').plugins,
                    legend: { display: false },
                    tooltip: {
                        ...Dashboard.getBarOptions('BYN').plugins.tooltip,
                        callbacks: {
                            label: (ctx) => Utils.formatMoney(ctx.parsed.x, 'BYN')
                        }
                    }
                },
                scales: {
                    x: {
                        grid: { color: 'rgba(0,0,0,0.05)' },
                        ticks: {
                            font: { family: 'Inter', size: 11 },
                            color: '#9CA3AF',
                            callback: (val) => val >= 1000 ? (val / 1000).toFixed(0) + 'K' : val
                        },
                        beginAtZero: true
                    },
                    y: {
                        grid: { display: false },
                        ticks: {
                            font: { family: 'Inter', size: 11 },
                            color: '#374151'
                        }
                    }
                }
            }
        });
    },

    renderTrend(canvasId, range, type) {
        const ctx = document.getElementById(canvasId);
        if (!ctx) return;

        if (State.charts[canvasId]) {
            State.charts[canvasId].destroy();
        }

        const from = new Date(range.from);
        const to = new Date(range.to);
        const labels = [];
        const data = [];

        // Определяем интервал группировки
        const daysDiff = Utils.daysBetween(range.from, range.to);
        let groupBy = 'day';
        if (daysDiff > 90) groupBy = 'month';
        else if (daysDiff > 31) groupBy = 'week';

        if (groupBy === 'month') {
            // Группировка по месяцам
            let current = new Date(from.getFullYear(), from.getMonth(), 1);
            while (current <= to) {
                const mStart = new Date(current.getFullYear(), current.getMonth(), 1).toISOString().split('T')[0];
                const mEnd = new Date(current.getFullYear(), current.getMonth() + 1, 0).toISOString().split('T')[0];

                labels.push(Utils.getMonthShort(current.getMonth()));

                const transactions = Transactions.getByPeriod(mStart, mEnd, type);
                const total = transactions.reduce((s, t) => s + Currency.toBYN(t.amount, t.currency), 0);
                data.push(Math.round(total * 100) / 100);

                current = new Date(current.getFullYear(), current.getMonth() + 1, 1);
            }
        } else if (groupBy === 'week') {
            // Группировка по неделям
            let current = new Date(from);
            let weekNum = 1;
            while (current <= to) {
                const wEnd = new Date(current);
                wEnd.setDate(wEnd.getDate() + 6);
                const wEndClamped = wEnd > to ? to : wEnd;

                const wStart = current.toISOString().split('T')[0];
                const wEndStr = wEndClamped.toISOString().split('T')[0];

                labels.push(`Нед ${weekNum}`);

                const transactions = Transactions.getByPeriod(wStart, wEndStr, type);
                const total = transactions.reduce((s, t) => s + Currency.toBYN(t.amount, t.currency), 0);
                data.push(Math.round(total * 100) / 100);

                current.setDate(current.getDate() + 7);
                weekNum++;
            }
        } else {
            // Группировка по дням
            let current = new Date(from);
            while (current <= to) {
                const dateStr = current.toISOString().split('T')[0];
                labels.push(current.getDate().toString());

                const transactions = Transactions.getByPeriod(dateStr, dateStr, type);
                const total = transactions.reduce((s, t) => s + Currency.toBYN(t.amount, t.currency), 0);
                data.push(Math.round(total * 100) / 100);

                current.setDate(current.getDate() + 1);
            }
        }

        const color = type === 'expense' ? '#EF4444' : '#10B981';

        State.charts[canvasId] = new Chart(ctx, {
            type: 'line',
            data: {
                labels,
                datasets: [{
                    label: type === 'expense' ? 'Расходы' : 'Доходы',
                    data,
                    borderColor: color,
                    backgroundColor: color + '15',
                    borderWidth: 2.5,
                    fill: true,
                    tension: 0.3,
                    pointRadius: data.length > 30 ? 0 : 3,
                    pointHoverRadius: 5,
                    pointBackgroundColor: color,
                    pointBorderColor: '#ffffff',
                    pointBorderWidth: 2
                }]
            },
            options: Dashboard.getLineOptions('BYN')
        });
    },

    renderExpensesStats(transactions, range) {
        const container = document.getElementById('expenses-stats');
        if (!container) return;

        const totalBYN = transactions.reduce((s, t) => s + Currency.toBYN(t.amount, t.currency), 0);
        const days = Math.max(1, Utils.daysBetween(range.from, range.to));
        const avgDaily = totalBYN / days;
        const count = transactions.length;

        // Самая дорогая категория
        const grouped = {};
        transactions.forEach(t => {
            const cat = Categories.getById(t.categoryId);
            const key = t.categoryId || 'none';
            if (!grouped[key]) grouped[key] = { name: cat ? cat.name : 'Прочее', total: 0 };
            grouped[key].total += Currency.toBYN(t.amount, t.currency);
        });
        const topCat = Object.values(grouped).sort((a, b) => b.total - a.total)[0];

        container.innerHTML = `
            <div class="analytics-stat-item">
                <span class="analytics-stat-label">Всего расходов</span>
                <span class="analytics-stat-value text-expense">${Utils.formatMoney(totalBYN, 'BYN')}</span>
            </div>
            <div class="analytics-stat-item">
                <span class="analytics-stat-label">Средний в день</span>
                <span class="analytics-stat-value">${Utils.formatMoney(avgDaily, 'BYN')}</span>
            </div>
            <div class="analytics-stat-item">
                <span class="analytics-stat-label">Транзакций</span>
                <span class="analytics-stat-value">${count}</span>
            </div>
            <div class="analytics-stat-item">
                <span class="analytics-stat-label">Топ категория</span>
                <span class="analytics-stat-value">${topCat ? topCat.name : '—'}</span>
            </div>
        `;
    },

    renderTopExpenses(transactions) {
        const container = document.getElementById('top-expenses');
        if (!container) return;

        const sorted = [...transactions]
            .sort((a, b) => Currency.toBYN(b.amount, b.currency) - Currency.toBYN(a.amount, a.currency))
            .slice(0, 5);

        if (sorted.length === 0) {
            container.innerHTML = '<p class="text-muted text-center" style="padding: 16px;">Нет данных</p>';
            return;
        }

        let html = '';
        sorted.forEach((tr, index) => {
            const cat = Categories.getById(tr.categoryId);
            html += `
                <div class="top-list-item">
                    <div class="top-list-rank">${index + 1}</div>
                    <div class="top-list-info">
                        <div class="top-list-name">${cat ? cat.icon : '📤'} ${cat ? Utils.escapeHtml(cat.name) : 'Расход'}</div>
                        <div class="top-list-date">${Utils.formatDate(tr.date)}${tr.description ? ' · ' + Utils.escapeHtml(tr.description) : ''}</div>
                    </div>
                    <div class="top-list-amount">${Utils.formatMoney(tr.amount, tr.currency)}</div>
                </div>
            `;
        });

        container.innerHTML = html;
    },

    // === ДОХОДЫ ===

    renderIncomes(range) {
        const transactions = Transactions.getByPeriod(range.from, range.to, 'income');

        this.renderCategoryPie('chart-an-income-pie', transactions);
        this.renderCategoryBar('chart-an-income-bar', transactions);
        this.renderTrend('chart-an-income-trend', range, 'income');
        this.renderIncomeStats(transactions, range);
    },

    renderIncomeStats(transactions, range) {
        const container = document.getElementById('income-stats');
        if (!container) return;

        const totalBYN = transactions.reduce((s, t) => s + Currency.toBYN(t.amount, t.currency), 0);
        const days = Math.max(1, Utils.daysBetween(range.from, range.to));
        const avgDaily = totalBYN / days;
        const count = transactions.length;

        const grouped = {};
        transactions.forEach(t => {
            const cat = Categories.getById(t.categoryId);
            const key = t.categoryId || 'none';
            if (!grouped[key]) grouped[key] = { name: cat ? cat.name : 'Прочее', total: 0 };
            grouped[key].total += Currency.toBYN(t.amount, t.currency);
        });
        const topCat = Object.values(grouped).sort((a, b) => b.total - a.total)[0];

        container.innerHTML = `
            <div class="analytics-stat-item">
                <span class="analytics-stat-label">Всего доходов</span>
                <span class="analytics-stat-value text-income">${Utils.formatMoney(totalBYN, 'BYN')}</span>
            </div>
            <div class="analytics-stat-item">
                <span class="analytics-stat-label">Средний в день</span>
                <span class="analytics-stat-value">${Utils.formatMoney(avgDaily, 'BYN')}</span>
            </div>
            <div class="analytics-stat-item">
                <span class="analytics-stat-label">Транзакций</span>
                <span class="analytics-stat-value">${count}</span>
            </div>
            <div class="analytics-stat-item">
                <span class="analytics-stat-label">Топ источник</span>
                <span class="analytics-stat-value">${topCat ? topCat.name : '—'}</span>
            </div>
        `;
    },

    // === СРАВНЕНИЕ ===

    renderCompare(range) {
        this.renderCompareChart(range);
        this.renderProfitChart(range);
        this.renderCompareWidgets(range);
    },

    renderCompareChart(range) {
        const ctx = document.getElementById('chart-an-compare');
        if (!ctx) return;

        if (State.charts['an-compare']) {
            State.charts['an-compare'].destroy();
        }

        const from = new Date(range.from);
        const to = new Date(range.to);
        const labels = [];
        const incomeData = [];
        const expenseData = [];

        // По месяцам
        let current = new Date(from.getFullYear(), from.getMonth(), 1);
        while (current <= to) {
            const mStart = new Date(current.getFullYear(), current.getMonth(), 1).toISOString().split('T')[0];
            const mEnd = new Date(current.getFullYear(), current.getMonth() + 1, 0).toISOString().split('T')[0];

            labels.push(Utils.getMonthShort(current.getMonth()));

            const transactions = Transactions.getByPeriod(mStart, mEnd);
            let income = 0, expense = 0;
            transactions.forEach(t => {
                if (t.type === 'income') income += Currency.toBYN(t.amount, t.currency);
                if (t.type === 'expense') expense += Currency.toBYN(t.amount, t.currency);
            });

            incomeData.push(Math.round(income * 100) / 100);
            expenseData.push(Math.round(expense * 100) / 100);

            current = new Date(current.getFullYear(), current.getMonth() + 1, 1);
        }

        // Если только 1 месяц — показываем по неделям
        if (labels.length <= 1) {
            labels.length = 0;
            incomeData.length = 0;
            expenseData.length = 0;

            let weekCurrent = new Date(from);
            let weekNum = 1;
            while (weekCurrent <= to) {
                const wEnd = new Date(weekCurrent);
                wEnd.setDate(wEnd.getDate() + 6);
                const wEndClamped = wEnd > to ? to : wEnd;

                labels.push(`Нед ${weekNum}`);

                const transactions = Transactions.getByPeriod(
                    weekCurrent.toISOString().split('T')[0],
                    wEndClamped.toISOString().split('T')[0]
                );
                let income = 0, expense = 0;
                transactions.forEach(t => {
                    if (t.type === 'income') income += Currency.toBYN(t.amount, t.currency);
                    if (t.type === 'expense') expense += Currency.toBYN(t.amount, t.currency);
                });

                incomeData.push(Math.round(income * 100) / 100);
                expenseData.push(Math.round(expense * 100) / 100);

                weekCurrent.setDate(weekCurrent.getDate() + 7);
                weekNum++;
            }
        }

        State.charts['an-compare'] = new Chart(ctx, {
            type: 'bar',
            data: {
                labels,
                datasets: [
                    {
                        label: 'Доходы',
                        data: incomeData,
                        backgroundColor: 'rgba(16, 185, 129, 0.7)',
                        borderColor: '#10B981',
                        borderWidth: 1,
                        borderRadius: 6,
                        borderSkipped: false
                    },
                    {
                        label: 'Расходы',
                        data: expenseData,
                        backgroundColor: 'rgba(239, 68, 68, 0.7)',
                        borderColor: '#EF4444',
                        borderWidth: 1,
                        borderRadius: 6,
                        borderSkipped: false
                    }
                ]
            },
            options: Dashboard.getBarOptions('BYN')
        });
    },

    renderProfitChart(range) {
        const ctx = document.getElementById('chart-an-profit');
        if (!ctx) return;

        if (State.charts['an-profit']) {
            State.charts['an-profit'].destroy();
        }

        const from = new Date(range.from);
        const to = new Date(range.to);
        const labels = [];
        const profitData = [];
        const colors = [];

        let current = new Date(from.getFullYear(), from.getMonth(), 1);
        while (current <= to) {
            const mStart = new Date(current.getFullYear(), current.getMonth(), 1).toISOString().split('T')[0];
            const mEnd = new Date(current.getFullYear(), current.getMonth() + 1, 0).toISOString().split('T')[0];

            labels.push(Utils.getMonthShort(current.getMonth()));

            const transactions = Transactions.getByPeriod(mStart, mEnd);
            let income = 0, expense = 0;
            transactions.forEach(t => {
                if (t.type === 'income') income += Currency.toBYN(t.amount, t.currency);
                if (t.type === 'expense') expense += Currency.toBYN(t.amount, t.currency);
            });

            const profit = income - expense;
            profitData.push(Math.round(profit * 100) / 100);
            colors.push(profit >= 0 ? 'rgba(16, 185, 129, 0.7)' : 'rgba(239, 68, 68, 0.7)');

            current = new Date(current.getFullYear(), current.getMonth() + 1, 1);
        }

        // Если 1 месяц — по неделям
        if (labels.length <= 1) {
            labels.length = 0;
            profitData.length = 0;
            colors.length = 0;

            let weekCurrent = new Date(from);
            let weekNum = 1;
            while (weekCurrent <= to) {
                const wEnd = new Date(weekCurrent);
                wEnd.setDate(wEnd.getDate() + 6);
                const wEndClamped = wEnd > to ? to : wEnd;

                labels.push(`Нед ${weekNum}`);

                const transactions = Transactions.getByPeriod(
                    weekCurrent.toISOString().split('T')[0],
                    wEndClamped.toISOString().split('T')[0]
                );
                let income = 0, expense = 0;
                transactions.forEach(t => {
                    if (t.type === 'income') income += Currency.toBYN(t.amount, t.currency);
                    if (t.type === 'expense') expense += Currency.toBYN(t.amount, t.currency);
                });

                const profit = income - expense;
                profitData.push(Math.round(profit * 100) / 100);
                colors.push(profit >= 0 ? 'rgba(16, 185, 129, 0.7)' : 'rgba(239, 68, 68, 0.7)');

                weekCurrent.setDate(weekCurrent.getDate() + 7);
                weekNum++;
            }
        }

        State.charts['an-profit'] = new Chart(ctx, {
            type: 'bar',
            data: {
                labels,
                datasets: [{
                    label: 'Чистая прибыль',
                    data: profitData,
                    backgroundColor: colors,
                    borderColor: colors.map(c => c.replace('0.7', '1')),
                    borderWidth: 1,
                    borderRadius: 6,
                    borderSkipped: false
                }]
            },
            options: {
                ...Dashboard.getBarOptions('BYN'),
                plugins: {
                    ...Dashboard.getBarOptions('BYN').plugins,
                    legend: { display: false }
                }
            }
        });
    },

    renderCompareWidgets(range) {
        const transactions = Transactions.getByPeriod(range.from, range.to);

        let totalIncome = 0;
        let totalExpense = 0;

        transactions.forEach(t => {
            if (t.type === 'income') totalIncome += Currency.toBYN(t.amount, t.currency);
            if (t.type === 'expense') totalExpense += Currency.toBYN(t.amount, t.currency);
        });

        const savingsRate = totalIncome > 0 ? ((totalIncome - totalExpense) / totalIncome * 100) : 0;
        const days = Math.max(1, Utils.daysBetween(range.from, range.to));
        const avgDaily = totalExpense / days;

        document.getElementById('an-total-income').textContent = Utils.formatMoney(totalIncome, 'BYN');
        document.getElementById('an-total-expense').textContent = Utils.formatMoney(totalExpense, 'BYN');
        document.getElementById('an-savings-rate').textContent = `${savingsRate.toFixed(1)}%`;
        document.getElementById('an-avg-daily').textContent = Utils.formatMoney(avgDaily, 'BYN');

        // Цвет нормы сбережений
        const srEl = document.getElementById('an-savings-rate');
        if (srEl) {
            srEl.style.color = savingsRate >= 0 ? 'var(--income-color)' : 'var(--expense-color)';
        }
    },

    // === БЮДЖЕТ ===

    renderBudget() {
        const container = document.getElementById('budget-list');
        if (!container) return;

        const categories = Categories.getByType('expense').filter(c => c.budget > 0);

        if (categories.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <span class="empty-icon" aria-hidden="true">📊</span>
                    <p>Установите бюджеты в разделе «Категории»</p>
                    <button class="btn btn-primary btn-sm" type="button"
                            onclick="UI.navigateTo('categories')">Перейти к категориям</button>
                </div>
            `;
            return;
        }

        const now = new Date();
        const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
        const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split('T')[0];
        const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
        const dayOfMonth = now.getDate();

        let html = '';

        categories.forEach(cat => {
            const spent = Categories.getSpent(cat.id, monthStart, monthEnd);
            const percent = Math.min(100, (spent / cat.budget) * 100);
            const remaining = cat.budget - spent;

            let progressClass, percentClass;
            if (percent >= 100) {
                progressClass = 'progress-danger';
                percentClass = 'danger';
            } else if (percent >= 75) {
                progressClass = 'progress-warning';
                percentClass = 'warning';
            } else {
                progressClass = 'progress-success';
                percentClass = 'safe';
            }

            // Прогноз
            const dailyRate = dayOfMonth > 0 ? spent / dayOfMonth : 0;
            const projected = dailyRate * daysInMonth;
            let forecastHtml = '';
            if (dailyRate > 0 && percent < 100) {
                const daysToLimit = remaining / dailyRate;
                forecastHtml = `При текущем темпе: ~${Utils.formatMoney(projected, 'BYN')} / мес`;
                if (projected > cat.budget) {
                    forecastHtml = `⚠️ Превышение через ~${Math.round(daysToLimit)} дн.`;
                }
            }

            html += `
                <div class="budget-item">
                    <div class="budget-item-header">
                        <div class="budget-item-info">
                            <span class="budget-item-icon">${cat.icon}</span>
                            <span class="budget-item-name">${Utils.escapeHtml(cat.name)}</span>
                        </div>
                        <div class="budget-item-amounts">
                            <strong class="${percent >= 100 ? 'over-budget' : ''}">${Utils.formatMoney(spent, 'BYN')}</strong>
                            / ${Utils.formatMoney(cat.budget, 'BYN')}
                        </div>
                    </div>
                    <div class="progress-bar">
                        <div class="progress-fill ${progressClass} animate" style="width: ${percent}%"></div>
                    </div>
                    <div class="budget-item-footer">
                        <span class="budget-item-percent ${percentClass}">${percent.toFixed(0)}%</span>
                        <span class="budget-item-remaining">
                            ${remaining >= 0
                    ? `Осталось: ${Utils.formatMoney(remaining, 'BYN')}`
                    : `Превышено на ${Utils.formatMoney(Math.abs(remaining), 'BYN')}`
                }
                        </span>
                    </div>
                    ${forecastHtml ? `<div class="text-muted text-sm" style="margin-top: 4px;">${forecastHtml}</div>` : ''}
                </div>
            `;
        });

        container.innerHTML = html;
    }
};
/* ============================================================
   ФИНАНСОВЫЙ ТРЕКЕР — APP.JS
   Часть 5: Цели, Настройки, Service Worker, Инициализация
   ============================================================ */


/* ========================
   14. ЦЕЛИ СБЕРЕЖЕНИЙ
   ======================== */

const Goals = {

    init() {
        this.bindEvents();
    },

    bindEvents() {
        // Кнопки добавления
        document.getElementById('btn-add-goal').addEventListener('click', () => this.openModal());
        const btnEmpty = document.getElementById('btn-add-goal-empty');
        if (btnEmpty) {
            btnEmpty.addEventListener('click', () => this.openModal());
        }

        // Сохранение
        document.getElementById('btn-save-goal').addEventListener('click', () => this.save());

        // Удаление
        document.getElementById('btn-delete-goal').addEventListener('click', () => this.delete());

        // Пополнение
        document.getElementById('btn-save-contribution').addEventListener('click', () => this.saveContribution());
    },

    // Получить все
    getAll() {
        return DB.getGoals();
    },

    // По ID
    getById(id) {
        return this.getAll().find(g => g.id === id);
    },

    // Открыть модалку создания/редактирования
    openModal(goalId = null) {
        const titleEl = document.getElementById('modal-goal-title');
        const deleteBtn = document.getElementById('btn-delete-goal');

        // Сброс формы
        document.getElementById('goal-id').value = '';
        document.getElementById('goal-name').value = '';
        document.getElementById('goal-target').value = '';
        document.getElementById('goal-current').value = '0';
        document.getElementById('goal-currency').value = 'BYN';
        document.getElementById('goal-deadline').value = '';
        document.getElementById('goal-icon').value = '🎯';
        document.getElementById('goal-color').value = '#4F46E5';

        // Сброс emoji
        document.querySelectorAll('#goal-emoji-picker .emoji-btn').forEach(b => {
            b.classList.remove('active');
            b.setAttribute('aria-checked', 'false');
        });
        const defEmoji = document.querySelector('#goal-emoji-picker .emoji-btn[data-emoji="🎯"]');
        if (defEmoji) {
            defEmoji.classList.add('active');
            defEmoji.setAttribute('aria-checked', 'true');
        }

        // Сброс color
        document.querySelectorAll('#goal-color-picker .color-btn').forEach(b => {
            b.classList.remove('active');
            b.setAttribute('aria-checked', 'false');
        });
        const defColor = document.querySelector('#goal-color-picker .color-btn[data-color="#4F46E5"]');
        if (defColor) {
            defColor.classList.add('active');
            defColor.setAttribute('aria-checked', 'true');
        }

        if (goalId) {
            const goal = this.getById(goalId);
            if (!goal) return;

            titleEl.textContent = 'Редактировать цель';
            deleteBtn.style.display = 'inline-flex';

            document.getElementById('goal-id').value = goal.id;
            document.getElementById('goal-name').value = goal.name;
            document.getElementById('goal-target').value = goal.targetAmount;
            document.getElementById('goal-current').value = goal.currentAmount || 0;
            document.getElementById('goal-currency').value = goal.currency || 'BYN';
            document.getElementById('goal-deadline').value = goal.deadline || '';
            document.getElementById('goal-icon').value = goal.icon || '🎯';
            document.getElementById('goal-color').value = goal.color || '#4F46E5';

            // Emoji
            document.querySelectorAll('#goal-emoji-picker .emoji-btn').forEach(b => {
                const isActive = b.dataset.emoji === goal.icon;
                b.classList.toggle('active', isActive);
                b.setAttribute('aria-checked', isActive ? 'true' : 'false');
            });

            // Color
            document.querySelectorAll('#goal-color-picker .color-btn').forEach(b => {
                const isActive = b.dataset.color === goal.color;
                b.classList.toggle('active', isActive);
                b.setAttribute('aria-checked', isActive ? 'true' : 'false');
            });
        } else {
            titleEl.textContent = 'Новая цель';
            deleteBtn.style.display = 'none';

            // Дефолтный дедлайн через 3 месяца
            const defaultDeadline = new Date();
            defaultDeadline.setMonth(defaultDeadline.getMonth() + 3);
            document.getElementById('goal-deadline').value = defaultDeadline.toISOString().split('T')[0];
        }

        UI.openModal('modal-goal');
    },

    // Сохранить цель
    save() {
        const id = document.getElementById('goal-id').value;
        const name = document.getElementById('goal-name').value.trim();
        const targetAmount = parseFloat(document.getElementById('goal-target').value);
        const currentAmount = parseFloat(document.getElementById('goal-current').value) || 0;
        const currency = document.getElementById('goal-currency').value;
        const deadline = document.getElementById('goal-deadline').value;
        const icon = document.getElementById('goal-icon').value;
        const color = document.getElementById('goal-color').value;

        // Валидация
        if (!name) {
            UI.toast('Введите название цели', 'error');
            document.getElementById('goal-name').focus();
            return;
        }

        if (!targetAmount || targetAmount <= 0) {
            UI.toast('Введите целевую сумму', 'error');
            document.getElementById('goal-target').focus();
            return;
        }

        if (currentAmount < 0) {
            UI.toast('Сумма накоплений не может быть отрицательной', 'error');
            return;
        }

        const goals = this.getAll();

        if (id) {
            // Редактирование
            const index = goals.findIndex(g => g.id === id);
            if (index === -1) return;

            goals[index] = {
                ...goals[index],
                name,
                targetAmount,
                currentAmount,
                currency,
                deadline,
                icon,
                color,
                updatedAt: new Date().toISOString()
            };

            UI.toast(`Цель «${name}» обновлена`);
        } else {
            // Создание
            goals.push({
                id: Utils.generateId(),
                name,
                targetAmount,
                currentAmount,
                currency,
                deadline,
                icon,
                color,
                contributions: [],
                createdAt: new Date().toISOString()
            });

            UI.toast(`Цель «${name}» создана`);
        }

        DB.saveGoals(goals);
        UI.closeModal('modal-goal');
        this.render();

        if (State.currentPage === 'dashboard') {
            Dashboard.renderWidgets();
        }
    },

    // Удалить цель
    delete() {
        const id = document.getElementById('goal-id').value;
        if (!id) return;

        const goal = this.getById(id);
        if (!goal) return;

        UI.confirm(
            'Удалить цель',
            `Удалить цель «${goal.name}»?`,
            () => {
                const goals = this.getAll().filter(g => g.id !== id);
                DB.saveGoals(goals);

                UI.closeModal('modal-goal');
                UI.toast(`Цель «${goal.name}» удалена`);
                this.render();

                if (State.currentPage === 'dashboard') {
                    Dashboard.renderWidgets();
                }
            }
        );
    },

    // Открыть модалку пополнения
    openContributeModal(goalId) {
        const goal = this.getById(goalId);
        if (!goal) return;

        document.getElementById('contrib-goal-id').value = goalId;

        const remaining = goal.targetAmount - goal.currentAmount;
        const cur = CONFIG.CURRENCIES[goal.currency];

        document.getElementById('contrib-goal-info').textContent =
            `${goal.icon} ${goal.name} — осталось ${Utils.formatMoney(Math.max(0, remaining), goal.currency)}`;

        document.getElementById('contrib-amount').value = '';

        UI.openModal('modal-goal-contribute');
        setTimeout(() => document.getElementById('contrib-amount').focus(), 200);
    },

    // Сохранить пополнение
    saveContribution() {
        const goalId = document.getElementById('contrib-goal-id').value;
        const amount = parseFloat(document.getElementById('contrib-amount').value);

        if (!amount || amount <= 0) {
            UI.toast('Введите сумму пополнения', 'error');
            document.getElementById('contrib-amount').focus();
            return;
        }

        const goals = this.getAll();
        const index = goals.findIndex(g => g.id === goalId);
        if (index === -1) return;

        const goal = goals[index];

        // Добавляем запись о пополнении
        if (!goal.contributions) goal.contributions = [];
        goal.contributions.push({
            date: Utils.today(),
            amount: amount
        });

        // Обновляем текущую сумму
        goal.currentAmount = (goal.currentAmount || 0) + amount;
        goal.updatedAt = new Date().toISOString();

        goals[index] = goal;
        DB.saveGoals(goals);

        UI.closeModal('modal-goal-contribute');

        // Проверяем достижение цели
        const percent = (goal.currentAmount / goal.targetAmount) * 100;
        if (percent >= 100) {
            UI.toast(`🎉 Цель «${goal.name}» достигнута!`, 'success', 'Поздравляем!');
        } else {
            UI.toast(`+${Utils.formatMoney(amount, goal.currency)} к цели «${goal.name}»`);
        }

        this.render();

        if (State.currentPage === 'dashboard') {
            Dashboard.renderWidgets();
        }
    },

    // Рассчитать прогноз достижения
    getForecast(goal) {
        if (!goal.contributions || goal.contributions.length === 0) return null;
        if (goal.currentAmount >= goal.targetAmount) return { achieved: true };

        // Средний вклад в месяц
        const firstContrib = new Date(goal.contributions[0].date);
        const now = new Date();
        const monthsDiff = Math.max(1,
            (now.getFullYear() - firstContrib.getFullYear()) * 12 +
            (now.getMonth() - firstContrib.getMonth())
        );

        const totalContributed = goal.contributions.reduce((s, c) => s + c.amount, 0);
        const avgPerMonth = totalContributed / monthsDiff;

        if (avgPerMonth <= 0) return null;

        const remaining = goal.targetAmount - goal.currentAmount;
        const monthsNeeded = remaining / avgPerMonth;

        const forecastDate = new Date();
        forecastDate.setMonth(forecastDate.getMonth() + Math.ceil(monthsNeeded));

        return {
            achieved: false,
            monthsNeeded: Math.ceil(monthsNeeded),
            forecastDate: forecastDate.toISOString().split('T')[0],
            avgPerMonth
        };
    },

    // Рендер страницы
    render() {
        this.renderSummary();
        this.renderGrid();
    },

    renderSummary() {
        const container = document.getElementById('goals-summary');
        if (!container) return;

        const goals = this.getAll();
        if (goals.length === 0) {
            container.innerHTML = '';
            container.style.display = 'none';
            return;
        }

        container.style.display = 'flex';

        const active = goals.filter(g => (g.currentAmount / g.targetAmount) < 1).length;
        const completed = goals.filter(g => (g.currentAmount / g.targetAmount) >= 1).length;
        const totalTarget = goals.reduce((s, g) => s + Currency.toBYN(g.targetAmount, g.currency), 0);
        const totalCurrent = goals.reduce((s, g) => s + Currency.toBYN(g.currentAmount || 0, g.currency), 0);

        container.innerHTML = `
            Активных: <span>${active}</span> &nbsp;·&nbsp;
            Достигнутых: <span>${completed}</span> &nbsp;·&nbsp;
            Всего: <span>${Utils.formatMoney(totalCurrent, 'BYN')}</span> из <span>${Utils.formatMoney(totalTarget, 'BYN')}</span>
        `;
    },

    renderGrid() {
        const container = document.getElementById('goals-grid');
        if (!container) return;

        const goals = this.getAll();

        if (goals.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <span class="empty-icon" aria-hidden="true">🎯</span>
                    <p>Поставьте вашу первую цель!</p>
                    <button class="btn btn-primary btn-sm" type="button"
                            onclick="Goals.openModal()">+ Создать цель</button>
                </div>
            `;
            return;
        }

        // Сортировка: активные сверху, потом по дедлайну
        const sorted = [...goals].sort((a, b) => {
            const aComplete = (a.currentAmount / a.targetAmount) >= 1;
            const bComplete = (b.currentAmount / b.targetAmount) >= 1;
            if (aComplete !== bComplete) return aComplete ? 1 : -1;
            if (a.deadline && b.deadline) return a.deadline.localeCompare(b.deadline);
            return 0;
        });

        let html = '';

        sorted.forEach(goal => {
            const percent = goal.targetAmount > 0
                ? Math.min(100, (goal.currentAmount / goal.targetAmount) * 100)
                : 0;
            const isCompleted = percent >= 100;
            const remaining = goal.targetAmount - (goal.currentAmount || 0);

            // Дедлайн
            let deadlineHtml = '';
            let isOverdue = false;
            if (goal.deadline) {
                const daysLeft = Utils.daysBetween(Utils.today(), goal.deadline);
                if (isCompleted) {
                    deadlineHtml = `<span class="goal-card-deadline">✅ Достигнута</span>`;
                } else if (daysLeft < 0) {
                    isOverdue = true;
                    deadlineHtml = `<span class="goal-card-deadline overdue">Просрочена на ${Math.abs(daysLeft)} дн.</span>`;
                } else if (daysLeft === 0) {
                    deadlineHtml = `<span class="goal-card-deadline overdue">Сегодня последний день!</span>`;
                } else if (daysLeft <= 7) {
                    deadlineHtml = `<span class="goal-card-deadline" style="color: var(--warning);">Осталось ${daysLeft} дн.</span>`;
                } else {
                    deadlineHtml = `<span class="goal-card-deadline">До ${Utils.formatDate(goal.deadline)} (${daysLeft} дн.)</span>`;
                }
            }

            // Прогресс-бар цвет
            let progressClass = 'progress-fill';
            if (isCompleted) progressClass += ' progress-success';
            else if (isOverdue) progressClass += ' progress-danger';

            // Прогноз
            const forecast = this.getForecast(goal);
            let forecastHtml = '';
            if (forecast && !forecast.achieved) {
                forecastHtml = `
                    <span class="goal-forecast">
                        Прогноз: ${Utils.getMonthName(new Date(forecast.forecastDate).getMonth())} 
                        ${new Date(forecast.forecastDate).getFullYear()} 
                        (~${Utils.formatMoney(forecast.avgPerMonth, goal.currency)}/мес)
                    </span>
                `;
            }

            // Стиль карточки
            const cardClasses = ['goal-card'];
            if (isCompleted) cardClasses.push('completed');
            if (isOverdue && !isCompleted) cardClasses.push('overdue');

            html += `
                <div class="${cardClasses.join(' ')}" style="--goal-color: ${goal.color}">
                    <div class="goal-card-header">
                        <div class="goal-card-info">
                            <div class="goal-card-icon" style="background-color: ${goal.color}15;">
                                ${goal.icon}
                            </div>
                            <div>
                                <div class="goal-card-name">${Utils.escapeHtml(goal.name)}</div>
                                ${deadlineHtml}
                            </div>
                        </div>
                        <div class="goal-card-actions">
                            <button class="btn-icon" type="button" aria-label="Редактировать"
                                    onclick="event.stopPropagation(); Goals.openModal('${goal.id}')">✏️</button>
                        </div>
                    </div>

                    <div class="goal-progress">
                        <div class="goal-progress-header">
                            <span class="goal-progress-amounts">
                                <strong>${Utils.formatMoney(goal.currentAmount || 0, goal.currency)}</strong>
                                из ${Utils.formatMoney(goal.targetAmount, goal.currency)}
                            </span>
                            <span class="goal-progress-percent" style="color: ${goal.color}">
                                ${percent.toFixed(0)}%
                            </span>
                        </div>
                        <div class="progress-bar">
                            <div class="${progressClass} animate" style="width: ${percent}%; background: ${isCompleted ? 'var(--success)' : goal.color}"></div>
                        </div>
                    </div>

                    <div class="goal-card-footer">
                        <div>
                            ${!isCompleted ? `<span class="goal-remaining">Осталось: ${Utils.formatMoney(Math.max(0, remaining), goal.currency)}</span>` : ''}
                            ${forecastHtml}
                        </div>
                        ${isCompleted
                    ? `<span class="goal-completed-badge">🎉 Достигнута!</span>`
                    : `<button class="btn btn-sm btn-primary" type="button"
                                    onclick="event.stopPropagation(); Goals.openContributeModal('${goal.id}')">
                                    + Пополнить
                                </button>`
                }
                    </div>
                </div>
            `;
        });

        container.innerHTML = html;
    }
};


/* ========================
   15. НАСТРОЙКИ
   ======================== */

const Settings = {

    init() {
        this.bindEvents();
    },

    bindEvents() {
        // Сохранить имя
        document.getElementById('btn-save-name').addEventListener('click', () => this.saveName());

        // Смена PIN
        document.getElementById('btn-change-pin').addEventListener('click', () => {
            document.getElementById('change-pin-old').value = '';
            document.getElementById('change-pin-new').value = '';
            document.getElementById('change-pin-confirm').value = '';
            document.getElementById('pin-error-change').textContent = '';
            UI.openModal('modal-change-pin');
        });

        document.getElementById('btn-save-new-pin').addEventListener('click', () => this.changePin());

        // Экспорт БД
        document.getElementById('btn-export-db').addEventListener('click', () => this.exportDB());

        // Импорт БД
        document.getElementById('import-file').addEventListener('change', (e) => this.importDB(e));

        // Экспорт CSV
        document.getElementById('btn-export-csv').addEventListener('click', () => Transactions.exportCSV());

        // Сохранить ручные курсы
        document.getElementById('btn-save-rates').addEventListener('click', () => this.saveManualRates());

        // Обновить курсы
        document.getElementById('btn-refresh-rates').addEventListener('click', async () => {
            const btn = document.getElementById('btn-refresh-rates');
            btn.classList.add('animate-spin');
            btn.disabled = true;
            await Currency.fetchRates();
            Currency.renderRates();
            Currency.renderManualRates();
            btn.classList.remove('animate-spin');
            btn.disabled = false;
            UI.toast('Курсы обновлены');
        });

        // Сброс данных
        document.getElementById('btn-reset-data').addEventListener('click', () => this.resetData());
    },

    // Рендер страницы
    render() {
        const user = DB.getUser();
        if (user) {
            document.getElementById('settings-name').value = user.name;
        }
        Currency.renderManualRates();
    },

    // Сохранить имя
    saveName() {
        const name = document.getElementById('settings-name').value.trim();
        if (!name) {
            UI.toast('Введите имя', 'error');
            return;
        }
        if (name.length < 2) {
            UI.toast('Имя слишком короткое', 'error');
            return;
        }

        const user = DB.getUser();
        if (user) {
            user.name = name;
            DB.saveUser(user);
            State.currentUser = user;

            // Обновляем sidebar
            const sidebarName = document.getElementById('sidebar-username');
            if (sidebarName) sidebarName.textContent = name;

            UI.toast('Имя обновлено');
        }
    },

    // Смена PIN
    changePin() {
        const oldPin = document.getElementById('change-pin-old').value;
        const newPin = document.getElementById('change-pin-new').value;
        const confirmPin = document.getElementById('change-pin-confirm').value;
        const errorEl = document.getElementById('pin-error-change');

        errorEl.textContent = '';

        const user = DB.getUser();
        if (!user) return;

        // Проверка старого PIN
        if (Utils.hashPin(oldPin) !== user.pinHash) {
            errorEl.textContent = 'Неверный текущий PIN-код';
            return;
        }

        // Валидация нового PIN
        if (newPin.length !== CONFIG.PIN_LENGTH) {
            errorEl.textContent = `PIN должен быть ${CONFIG.PIN_LENGTH} цифры`;
            return;
        }

        if (!/^\d+$/.test(newPin)) {
            errorEl.textContent = 'PIN должен содержать только цифры';
            return;
        }

        if (newPin !== confirmPin) {
            errorEl.textContent = 'PIN-коды не совпадают';
            return;
        }

        if (newPin === oldPin) {
            errorEl.textContent = 'Новый PIN совпадает со старым';
            return;
        }

        // Сохраняем
        user.pinHash = Utils.hashPin(newPin);
        DB.saveUser(user);
        State.currentUser = user;

        UI.closeModal('modal-change-pin');
        UI.toast('PIN-код изменён');
    },

    // Экспорт БД
    exportDB() {
        try {
            const data = DB.exportAll();
            const json = JSON.stringify(data, null, 2);
            const blob = new Blob([json], { type: 'application/json' });
            const url = URL.createObjectURL(blob);

            const link = document.createElement('a');
            link.href = url;
            link.download = `finance-backup-${Utils.today()}.json`;
            link.click();

            URL.revokeObjectURL(url);
            UI.toast('База данных экспортирована');
        } catch (e) {
            console.error('[Settings] Ошибка экспорта:', e);
            UI.toast('Ошибка при экспорте', 'error');
        }
    },

    // Импорт БД
    importDB(event) {
        const file = event.target.files[0];
        if (!file) return;

        // Проверка формата
        if (!file.name.endsWith('.json')) {
            UI.toast('Выберите JSON файл', 'error');
            event.target.value = '';
            return;
        }

        // Проверка размера (макс 10MB)
        if (file.size > 10 * 1024 * 1024) {
            UI.toast('Файл слишком большой (макс. 10 МБ)', 'error');
            event.target.value = '';
            return;
        }

        UI.confirm(
            'Импорт данных',
            'Текущие данные будут заменены данными из файла. Рекомендуем сначала сделать экспорт. Продолжить?',
            () => {
                const reader = new FileReader();

                reader.onload = (e) => {
                    try {
                        const data = JSON.parse(e.target.result);

                        // Валидация структуры
                        if (!data.version) {
                            throw new Error('Неверный формат: отсутствует версия');
                        }

                        DB.importAll(data);

                        // Обновляем состояние
                        State.currentUser = DB.getUser();
                        State.exchangeRates = DB.getRates() || {};

                        UI.toast('Данные импортированы! Страница обновится.', 'success');

                        // Перезагружаем через 1.5 сек
                        setTimeout(() => {
                            location.reload();
                        }, 1500);

                    } catch (err) {
                        console.error('[Settings] Ошибка импорта:', err);
                        UI.toast(`Ошибка: ${err.message}`, 'error');
                    }
                };

                reader.onerror = () => {
                    UI.toast('Ошибка чтения файла', 'error');
                };

                reader.readAsText(file);
            }
        );

        // Сброс input для повторного выбора того же файла
        event.target.value = '';
    },

    // Сохранить ручные курсы крипто
    saveManualRates() {
        const cryptos = ['USDT', 'BTC', 'ETH'];
        let updated = false;

        cryptos.forEach(code => {
            const input = document.getElementById(`manual-rate-${code}`);
            if (input) {
                const rate = parseFloat(input.value);
                if (rate > 0) {
                    State.exchangeRates[code] = rate;
                    updated = true;
                }
            }
        });

        if (updated) {
            DB.saveRates(State.exchangeRates);
            DB.saveRatesTimestamp(Date.now());
            Currency.renderRates();
            UI.toast('Курсы сохранены');

            // Обновляем дашборд
            if (State.currentPage === 'dashboard') {
                Dashboard.render();
            }
        }
    },

    // Сброс всех данных
    resetData() {
        UI.confirm(
            '⚠️ Удалить все данные',
            'ВСЕ данные будут безвозвратно удалены: счета, транзакции, категории, цели. Сделайте экспорт перед удалением! Продолжить?',
            () => {
                DB.resetAll();

                // Уничтожаем графики
                Object.values(State.charts).forEach(chart => {
                    if (chart && chart.destroy) chart.destroy();
                });
                State.charts = {};

                UI.toast('Все данные удалены. Страница обновится.', 'warning');

                setTimeout(() => {
                    location.reload();
                }, 1500);
            }
        );
    }
};


/* ========================
   16. SERVICE WORKER
   ======================== */

const SW = {

    register() {
        if ('serviceWorker' in navigator) {
            window.addEventListener('load', () => {
                navigator.serviceWorker.register('./sw.js')
                    .then((registration) => {
                        console.log('[SW] Зарегистрирован:', registration.scope);

                        // Проверяем обновления каждые 30 минут
                        setInterval(() => {
                            registration.update();
                        }, 30 * 60 * 1000);

                        // Обработка обновлений
                        registration.addEventListener('updatefound', () => {
                            const newWorker = registration.installing;
                            if (newWorker) {
                                newWorker.addEventListener('statechange', () => {
                                    if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                                        UI.toast('Доступно обновление! Обновите страницу.', 'info', 'Обновление');
                                    }
                                });
                            }
                        });
                    })
                    .catch((error) => {
                        console.error('[SW] Ошибка регистрации:', error);
                    });
            });
        }
    }
};


/* ========================
   17. ГЛАВНЫЙ МОДУЛЬ ПРИЛОЖЕНИЯ
   ======================== */

const App = {

    // Запуск приложения
    init() {
        console.log(`[App] Финансовый Трекер v${CONFIG.VERSION}`);

        // Регистрация Service Worker
        SW.register();

        // Инициализация авторизации
        Auth.init();
    },

    // После успешного входа
    async initAfterLogin() {
        console.log('[App] Инициализация после входа...');

        // Показываем имя пользователя
        const user = State.currentUser;
        if (user) {
            const sidebarName = document.getElementById('sidebar-username');
            if (sidebarName) sidebarName.textContent = user.name;
        }

        // Инициализация UI
        UI.init();

        // Загрузка курсов валют
        await Currency.init();

        // Инициализация модулей
        Accounts.init();
        Categories.init();
        Transactions.init();
        Exchange.init();
        Analytics.init();
        Goals.init();
        Settings.init();

        // Навигация по hash или дефолт
        const hash = location.hash.replace('#', '');
        const validPages = ['dashboard', 'accounts', 'transactions', 'exchange', 'analytics', 'goals', 'categories', 'settings'];

        if (hash && validPages.includes(hash)) {
            UI.navigateTo(hash, false);
        } else {
            UI.navigateTo('dashboard', false);
        }

        // Авто-обновление курсов каждый час
        setInterval(async () => {
            const timestamp = DB.getRatesTimestamp();
            if (Date.now() - timestamp > CONFIG.API.CACHE_DURATION) {
                console.log('[App] Авто-обновление курсов...');
                await Currency.fetchRates();
                if (State.currentPage === 'dashboard') {
                    Currency.renderRates();
                    Dashboard.renderBalance();
                }
            }
        }, 5 * 60 * 1000); // Проверяем каждые 5 минут

        // Обновление даты в полночь
        this.scheduleMidnightRefresh();

        // Обработка видимости вкладки
        document.addEventListener('visibilitychange', () => {
            if (!document.hidden && State.currentUser) {
                UI.setCurrentDate();
                // Обновляем текущую страницу
                UI.refreshPage(State.currentPage);
            }
        });

        // Обработка online/offline
        window.addEventListener('online', () => {
            UI.toast('Подключение восстановлено', 'success', 'Сеть');
            Currency.fetchRates().then(() => {
                if (State.currentPage === 'dashboard') {
                    Currency.renderRates();
                }
            });
        });

        window.addEventListener('offline', () => {
            UI.toast('Нет подключения к интернету', 'warning', 'Сеть');
        });

        // Предупреждение перед закрытием (на случай незакрытой модалки)
        // Убрано, чтобы не раздражать пользователя
        // window.addEventListener('beforeunload', (e) => { ... });

        // Обработка кнопки "Назад" в браузере
        window.addEventListener('popstate', () => {
            const page = location.hash.replace('#', '') || 'dashboard';
            if (page !== State.currentPage) {
                UI.navigateTo(page, false);
            }
        });

        // Клавиатурные сочетания
        document.addEventListener('keydown', (e) => {
            // Ctrl+N — новая транзакция
            if ((e.ctrlKey || e.metaKey) && e.key === 'n') {
                e.preventDefault();
                Transactions.openModal('expense');
            }

            // Ctrl+E — экспорт
            if ((e.ctrlKey || e.metaKey) && e.key === 'e') {
                e.preventDefault();
                Settings.exportDB();
            }
        });

        console.log('[App] Инициализация завершена ✅');
    },

    // Обновление в полночь
    scheduleMidnightRefresh() {
        const now = new Date();
        const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 5);
        const msUntilMidnight = midnight - now;

        setTimeout(() => {
            UI.setCurrentDate();
            if (State.currentPage === 'dashboard') {
                Dashboard.render();
            }
            // Планируем следующее обновление
            this.scheduleMidnightRefresh();
        }, msUntilMidnight);
    }
};


/* ========================
   18. ЗАПУСК
   ======================== */

// Ждём полной загрузки DOM
document.addEventListener('DOMContentLoaded', () => {
    App.init();

});


