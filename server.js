const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const path = require('path');
const db = require('./database');

// Кэш для сессий и пользователей
const sessionCache = new Map();
const userCache = new Map();
const CACHE_TTL = 5 * 60 * 1000; // 5 минут

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.json());

// Middleware для логирования всех запросов
app.use((req, res, next) => {
    console.log(`[REQ] ${new Date().toISOString()} ${req.method} ${req.url}`);
    next();
});

// Middleware для логирования ответов
app.use((req, res, next) => {
    const oldSend = res.send;
    res.send = function(body) {
        console.log(`[RES] ${req.method} ${req.url} -> ${res.statusCode}`);
        oldSend.call(this, body);
    };
    next();
});

// Глобальный обработчик ошибок (должен быть ПОСЛЕ всех маршрутов)
// Его добавим позже, после определения всех маршрутов

// Инициализация MongoDB
async function initDatabase() {
    try {
        await db.init();
        console.log('✓ База данных MongoDB подключена');
        // Проверяем, что можем получить доступ к коллекциям
        const testDb = db.getDb();
        if (!testDb) {
            throw new Error('Database object is null after init');
        }
        console.log('✓ Database object ready: OK');
    } catch (error) {
        console.error('✗ Ошибка подключения к MongoDB:', error.message);
        console.log('Попробуйте запустить MongoDB или измените MONGO_URI в database.js');
        throw error; // Пробрасываем ошибку дальше, чтобы сервер не запустился
    }
}

// Cache control
app.use((req, res, next) => {
    res.set('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.set('Pragma', 'no-cache');
    res.set('Expires', '0');
    next();
});

app.use(express.static(path.join(__dirname, 'public'), {
    maxAge: 0,
    etag: false,
    lastModified: true
}));

// ==================== КОНСТАНТЫ ====================
const ELO_CONFIG = { initial: 1000, kFactor: 32, minRating: 100, maxRating: 3000 };

// Секретный код для получения прав админа (известен только создателю)
const ADMIN_SECRET_CODE = 'PVZ_2024_SUPER_ADMIN_SECRET_KEY_xK9mL8nP2qR5tY7uW3zA1bC4dE6fG8hJ0kM1nO2pQ3rS4tU5vW6xY7zA8bC9dE0fG1hJ2kM3nO4pQ5rS6tU7vW8xY9zA0bC1dE2fG3hJ4kM5nO6pQ7rS8tU9vW0xY1zA2bC3dE4fG5hJ6kM7nO8pQ9rS0tU1vW2xY3zA4bC5dE6fG7hJ8kM9nO0pQ1rS2tU3vW4xY5zA6bC7dE8fG9hJ0kM1nO2pQ3rS4tU5vW6xY7zA8bC9dE0fG1hJ';
const ADMIN_CODE_EXPLANATION = 'Этот код известен только создателю игры и используется для получения прав администратора';

const SEASONS = [
    { id: 1, name: 'Сезон 1: Весна', startDate: '2024-03-01', endDate: '2024-05-31', reward: 1000, rewards: { top1: 500, top3: 300, top10: 150, top50: 50 } },
    { id: 2, name: 'Сезон 2: Лето', startDate: '2024-06-01', endDate: '2024-08-31', reward: 1500, rewards: { top1: 750, top3: 450, top10: 225, top50: 75 } },
    { id: 3, name: 'Сезон 3: Осень', startDate: '2024-09-01', endDate: '2024-11-30', reward: 2000, rewards: { top1: 1000, top3: 600, top10: 300, top50: 100 } },
    { id: 4, name: 'Сезон 4: Зима', startDate: '2024-12-01', endDate: '2025-02-28', reward: 2500, rewards: { top1: 1250, top3: 750, top10: 375, top50: 125 } },
    { id: 5, name: 'Сезон 5: Новая Эра', startDate: '2025-03-01', endDate: '2025-05-31', reward: 3000, rewards: { top1: 1500, top3: 900, top10: 450, top50: 150 } }
];

const BATTLE_PASS_SEASONS = [
    { id: 1, name: 'Сезон 1: Цветение', duration: 60, // 60 дней
      tiers: Array.from({length: 100}, (_, i) => ({
        tier: i + 1,
        freeReward: i % 2 === 0 ? { type: 'coins', amount: 50 } : { type: 'xp', amount: 100 },
        premiumReward: i % 10 === 0 ? { type: 'rare_unit', name: 'Эпический юнит' } : { type: 'coins', amount: 150 }
      }))
    }
];

const BATTLE_PASS_QUESTS = [
    { id: 'bp_win_1_game', name: 'Победитель', desc: 'Выиграйте 1 матч', reward: 100, type: 'wins', progress: 0, target: 1, category: 'battlepass' },
    { id: 'bp_win_3_games', name: 'Готов к битве', desc: 'Выиграйте 3 матча', reward: 250, type: 'wins', progress: 0, target: 3, category: 'battlepass' },
    { id: 'bp_play_5_games', name: 'Игроман', desc: 'Сыграйте 5 матчей', reward: 150, type: 'games', progress: 0, target: 5, category: 'battlepass' },
    { id: 'bp_earn_200_coins', name: 'Копилка', desc: 'Заработайте 200 монет', reward: 100, type: 'coins', progress: 0, target: 200, category: 'battlepass' },
    { id: 'bp_place_10_units', name: 'Командир', desc: 'Разместите 10 юнитов', reward: 120, type: 'units', progress: 0, target: 10, category: 'battlepass' },
    { id: 'bp_destroy_5_units', name: 'Разрушитель', desc: 'Уничтожьте 5 вражеских юнитов', reward: 180, type: 'destroy', progress: 0, target: 5, category: 'battlepass' },
    { id: 'bp_survive_10_minutes', name: 'Выживальщик', desc: 'Проведите в игре 10 минут', reward: 150, type: 'time', progress: 0, target: 10, category: 'battlepass' },
    { id: 'bp_use_different_plants', name: 'Коллекционер', desc: 'Используйте 5 разных растений', reward: 200, type: 'variety', progress: 0, target: 5, category: 'battlepass' }
];

// Награды за уровни Battle Pass
const BATTLE_PASS_REWARDS = {
    free: {
        1: { type: 'coins', amount: 50 },
        2: { type: 'xp', amount: 100 },
        3: { type: 'coins', amount: 75 },
        4: { type: 'xp', amount: 150 },
        5: { type: 'rare_unit', name: 'Эпический юнит', amount: 1 },
        // ... можно расширить до 100 уровней
    },
    premium: {
        1: { type: 'coins', amount: 100 },
        2: { type: 'xp', amount: 200 },
        3: { type: 'coins', amount: 150 },
        4: { type: 'xp', amount: 300 },
        5: { type: 'rare_unit', name: 'Эпический юнит', amount: 2 },
        10: { type: 'legendary_unit', name: 'Легендарный юнит', amount: 1 },
        // ... можно расширить до 100 уровней
    }
};

const ACHIEVEMENTS = [
    { id: 'first_win', name: 'Первая победа', desc: 'Выиграйте первый матч', icon: '🎉', reward: 50, category: 'wins', requirement: 1 },
    { id: 'wins_10', name: 'Новичок бой', desc: '10 побед', icon: '⭐', reward: 100, category: 'wins', requirement: 10 },
    { id: 'wins_50', name: 'Опытный боец', desc: '50 побед', icon: '🌟', reward: 250, category: 'wins', requirement: 50 },
    { id: 'wins_100', name: 'Мастер арены', desc: '100 побед', icon: '🏆', reward: 500, category: 'wins', requirement: 100 },
    { id: 'coins_1000', name: 'Тысячник', desc: 'Соберите 1000 монет', icon: '💰', reward: 100, category: 'coins', requirement: 1000 },
    { id: 'level_5', name: 'Растущий', desc: 'Достигните 5 уровня', icon: '📈', reward: 150, category: 'level', requirement: 5 },
    { id: 'level_10', name: 'Продвинутый', desc: 'Достигните 10 уровня', icon: '🚀', reward: 300, category: 'level', requirement: 10 },
    { id: 'streak_3', name: 'Серия побед', desc: '3 победы подряд', icon: '🔥', reward: 75, category: 'streak', requirement: 3 },
    { id: 'games_50', name: 'Ветеран', desc: 'Сыграйте 50 матчей', icon: '🎮', reward: 200, category: 'games', requirement: 50 }
];

const BOT_NAMES = ['ЗомбиКиллер', 'Садовник2000', 'МозгОхотник', 'Растениевод', 'ЗеленаяАрмия', 'Огородник'];
const BOT_DIFFICULTIES = {
    easy: { name: 'Легкий', spawnRate: 0.3, aggression: 0.3 },
    medium: { name: 'Средний', spawnRate: 0.5, aggression: 0.5 },
    hard: { name: 'Сложный', spawnRate: 0.8, aggression: 0.8 }
};

const UNIT_LEVELS = {
    sunflower:1, peashooter:1, wallnut:1, cherrybomb:3, snowpea:3, chomper:3, repeater:3, iceshroom:5, squash:5, twinsunflower:10, melonpult:10, cattail:10,
    zombie:1, conehead:1, buckethead:1, football:3, dancing:3, dolphin:3, digger:5, bungee:5, gargantuar:5, yeti:10, king:10, dr:10
};

const PLANT_PRICES = { sunflower:50, peashooter:50, wallnut:75, cherrybomb:150, iceshroom:75, snowpea:75, chomper:75, repeater:100, squash:100, twinsunflower:150, melonpult:200, cattail:150 };
const ZOMBIE_PRICES = { zombie:50, conehead:75, buckethead:100, football:125, dancing:100, dolphin:100, digger:125, bungee:150, gargantuar:300, yeti:200, king:250, dr:300 };

const MAPS = [
    { id: 'garden', name: 'Обычный сад', icon: '🌳', background: 'linear-gradient(180deg, #1e3a5f, #0f172a)', unlockLevel: 1, price: 0 },
    { id: 'night', name: 'Ночной сад', icon: '🌙', background: 'linear-gradient(180deg, #0c1929, #162447)', unlockLevel: 3, price: 0 },
    { id: 'desert', name: 'Пустыня', icon: '🏜️', background: 'linear-gradient(180deg, #8B4513, #654321)', unlockLevel: 5, price: 200 },
    { id: 'snow', name: 'Зимний сад', icon: '❄️', background: 'linear-gradient(180deg, #e0f7fa, #b2ebf2)', unlockLevel: 7, price: 350 },
    { id: 'volcano', name: 'Вулкан', icon: '🌋', background: 'linear-gradient(180deg, #8B0000, #4a0000)', unlockLevel: 10, price: 500 }
];

const ALL_PLANTS = ['sunflower','peashooter','wallnut','cherrybomb','iceshroom','snowpea','chomper','repeater','squash','twinsunflower','melonpult','cattail'];
const ALL_ZOMBIES = ['zombie','conehead','buckethead','football','dancing','dolphin','digger','bungee','gargantuar','yeti','king','dr'];

// Цены сундуков растений за кристаллы
const PLANT_CHEST_PRICES = {
    common: 20,
    rare: 50,
    epic: 120,
    mythic: 250,
    legendary: 500
};

// ==================== МАГАЗИН ====================
let shopItems = [];
function generateShopItems(userLevel = 1) {
    const availablePlants = ALL_PLANTS.filter(id => (UNIT_LEVELS[id] || 1) <= userLevel);
    const availableZombies = ALL_ZOMBIES.filter(id => (UNIT_LEVELS[id] || 1) <= userLevel);
    
    const plants = availablePlants.slice(0, 4).map(id => ({ id, type: 'plant', price: PLANT_PRICES[id] || 50 }));
    const zombies = availableZombies.slice(0, 3).map(id => ({ id, type: 'zombie', price: ZOMBIE_PRICES[id] || 50 }));
    
    shopItems = [...plants, ...zombies];
    console.log('Магазин обновлён для уровня ' + userLevel + ':', shopItems.map(p => `${p.type}:${p.id}`).join(', '));
}

generateShopItems();
setInterval(() => generateShopItems(), 5 * 60 * 1000);

// ==================== API ====================

// Друзья
app.post('/api/friends', async (req, res) => {
    const { sessionId } = req.body;
    const session = await db.findSession(sessionId);
    if (!session) return res.json({ success: false, message: 'Сессия недействительна', error: 'invalid_session' });
    
    let user;
    try {
        user = await db.findUser({ _id: session.userId });
    } catch(e) {
        console.error('Error finding user:', e);
        return res.json({ success: false, message: 'Ошибка поиска пользователя' });
    }
    if (!user) return res.json({ success: false, message: 'Пользователь не найден' });
    
    const friends = user.friends || [];
    const friendUsers = [];
    
    for (const friendUsername of friends) {
        const friendUser = await db.findUserByUsername(friendUsername);
        if (friendUser) {
            friendUsers.push({
                username: friendUser.username,
                level: friendUser.level || 1,
                wins: friendUser.wins || 0,
                online: false
            });
        }
    }
    
    res.json({ success: true, friends: friendUsers });
});

app.post('/api/friends/add', async (req, res) => {
    const { sessionId, friendUsername } = req.body;
    const session = await db.findSession(sessionId);
    if (!session) return res.json({ success: false, message: 'Сессия недействительна', error: 'invalid_session' });
    
    const user = await db.findUser({ _id: session.userId });
    if (!user) return res.json({ success: false, message: 'Пользователь не найден' });
    
    if (friendUsername.toLowerCase() === user.username.toLowerCase()) {
        return res.json({ success: false, message: 'Нельзя добавить себя в друзья' });
    }
    
    const friend = await db.findUserByUsername(friendUsername);
    if (!friend) return res.json({ success: false, message: 'Игрок не найден' });
    
    const friends = user.friends || [];
    if (friends.includes(friendUsername)) {
        return res.json({ success: false, message: 'Игрок уже в друзьях' });
    }
    
    friends.push(friendUsername);
    await db.updateUser(user.username, { friends });
    
    // Добавляем себя к другу
    const friendFriends = friend.friends || [];
    if (!friendFriends.includes(user.username)) {
        friendFriends.push(user.username);
        await db.updateUser(friend.username, { friends: friendFriends });
    }
    
    res.json({ success: true, message: `${friendUsername} добавлен в друзья!` });
});

app.post('/api/friends/remove', async (req, res) => {
    const { sessionId, friendUsername } = req.body;
    const session = await db.findSession(sessionId);
    if (!session) return res.json({ success: false, message: 'Сессия недействительна', error: 'invalid_session' });
    
    const user = await db.findUser({ _id: session.userId });
    if (!user) return res.json({ success: false, message: 'Пользователь не найден' });
    
    const friends = user.friends || [];
    const newFriends = friends.filter(f => f !== friendUsername);
    await db.updateUser(user.username, { friends: newFriends });
    
    res.json({ success: true, message: `${friendUsername} удалён из друзей` });
});

// ELO
app.post('/api/elo', async (req, res) => {
    const { sessionId } = req.body;
    const session = await db.findSession(sessionId);
    if (!session) return res.json({ success: false, message: 'Сессия недействительна', error: 'invalid_session' });
    
    const user = await db.findUser({ _id: session.userId });
    if (!user) return res.json({ success: false, message: 'Пользователь не найден' });
    
    const elo = user.elo || ELO_CONFIG.initial;
    const rank = getEloRank(elo);
    
    // Получаем топ игроков по ELO
    const allUsers = await db.getAllUsers();
    const sortedByElo = allUsers
        .filter(u => u.role !== 'banned')
        .sort((a, b) => (b.elo || 1000) - (a.elo || 1000))
        .slice(0, 10);
    
    const userRank = sortedByElo.findIndex(u => u.username === user.username) + 1;
    
    res.json({ 
        success: true, 
        elo: elo, 
        seasonElo: user.seasonElo || ELO_CONFIG.initial, 
        rank: rank,
        rankPosition: userRank || '—',
        topPlayers: sortedByElo.map(u => ({
            username: u.username,
            elo: u.elo || 1000,
            level: u.level || 1
        }))
    });
});

function getEloRank(elo) {
    if (elo >= 2500) return { name: 'Алмаз', icon: '💎', color: '#b9f2ff' };
    if (elo >= 2000) return { name: 'Платина', icon: '💠', color: '#e5e4e2' };
    if (elo >= 1500) return { name: 'Золото', icon: '🥇', color: '#ffd700' };
    if (elo >= 1200) return { name: 'Серебро', icon: '🥈', color: '#c0c0c0' };
    if (elo >= 1000) return { name: 'Бронза', icon: '🥉', color: '#cd7f32' };
    return { name: 'Новичок', icon: '🌱', color: '#86efac' };
}

// Магазин (персонализированный по уровню пользователя)
app.get('/api/shop', async (req, res) => {
    const { sessionId } = req.query;
    let userLevel = 1;
    
    // Если есть сессия, получаем уровень пользователя
    if (sessionId) {
        const session = await db.findSession(sessionId);
        if (session) {
            const user = await db.findUser({ _id: session.userId });
            if (user) userLevel = user.level;
        }
    }
    
    // Генерируем магазин для этого уровня
    const userShopItems = [];
    const availablePlants = ALL_PLANTS.filter(id => (UNIT_LEVELS[id] || 1) <= userLevel);
    const availableZombies = ALL_ZOMBIES.filter(id => (UNIT_LEVELS[id] || 1) <= userLevel);
    
    const plants = availablePlants.slice(0, 4).map(id => ({ id, type: 'plant', price: PLANT_PRICES[id] || 50 }));
    const zombies = availableZombies.slice(0, 3).map(id => ({ id, type: 'zombie', price: ZOMBIE_PRICES[id] || 50 }));
    
    const items = [...plants, ...zombies];
    const sales = await db.getActiveSales();
    
    res.json({ success: true, items, nextUpdate: 300000, unitLevels: UNIT_LEVELS, maps: MAPS, sales });
});

// API для получения скидок
app.get('/api/sales', async (req, res) => {
    try {
        const sales = await db.getActiveSales();
        res.json({ success: true, sales });
    } catch(e) {
        res.json({ success: true, sales: [] });
    }
});

// Инвентарь
app.post('/api/inventory', async (req, res) => {
    const { sessionId } = req.body;
    const session = await db.findSession(sessionId);
    if (!session) return res.json({ success: false, message: 'Сессия недействительна', error: 'invalid_session' });
    
    const user = await db.findUser({ _id: session.userId });
    if (!user) return res.json({ success: false, message: 'Пользователь не найден' });
    
    res.json({ success: true, inventory: user.inventory || {}, userLevel: user.level });
});

// Покупка юнита (атомарная операция)
app.post('/api/buy-unit', async (req, res) => {
    const { sessionId, unitId, unitType } = req.body;
    const session = await db.findSession(sessionId);
    if (!session) return res.json({ success: false, message: 'Сессия недействительна', error: 'invalid_session' });
    
    const user = await db.findUser({ _id: session.userId });
    if (!user) return res.json({ success: false, message: 'Пользователь не найден' });
    
    const requiredLevel = UNIT_LEVELS[unitId] || 1;
    if (user.level < requiredLevel) return res.json({ success: false, message: `Нужен уровень ${requiredLevel} для этого юнита!` });
    
    const prices = unitType === 'plant' ? PLANT_PRICES : ZOMBIE_PRICES;
    const price = prices[unitId] || 50;
    
    if (user.coins < price) return res.json({ success: false, message: 'Недостаточно монет!' });
    
    const inventory = user.inventory || {};
    if (inventory[unitId]) return res.json({ success: false, message: 'Этот юнит уже куплен!' });
    
    // Атомарное обновление: проверяем, что юнит всё ещё не куплен и монеты не изменились
    const query = { _id: user._id };
    query['inventory.' + unitId] = { $exists: false };
    
    const update = { $set: {} };
    update.$set['inventory.' + unitId] = { level: 1, type: unitType, purchased: new Date().toISOString() };
    update.$set.coins = user.coins - price;
    
    const result = await db.getDb().collection('users').findOneAndUpdate(
        query,
        update,
        { returnDocument: 'after' }
    );
    
    if (!result.value) {
        // Операция не удалась - либо юнит уже куплен, либо монеты изменились
        return res.json({ success: false, message: 'Не удалось купить юнита. Попробуйте ещё раз.' });
    }
    
    const updatedUser = result.value;
    // Инвалидируем кэш пользователя
    invalidateUserCache(user._id);
    res.json({
        success: true,
        message: `${unitId} куплен за ${price} монет!`,
        inventory: updatedUser.inventory || {},
        coins: updatedUser.coins
    });
});

// Прокачка юнита (атомарная операция)
app.post('/api/upgrade-unit', async (req, res) => {
    const { sessionId, unitId } = req.body;
    const session = await db.findSession(sessionId);
    if (!session) return res.json({ success: false, message: 'Сессия недействительна', error: 'invalid_session' });
    
    const user = await db.findUser({ _id: session.userId });
    if (!user) return res.json({ success: false, message: 'Пользователь не найден' });
    
    const inventory = user.inventory || {};
    if (!inventory[unitId]) return res.json({ success: false, message: 'У вас нет этого юнита!' });
    
    const currentLevel = inventory[unitId].level || 1;
    if (currentLevel >= 10) return res.json({ success: false, message: 'Максимальный уровень достигнут!' });
    
    const prices = inventory[unitId].type === 'plant' ? PLANT_PRICES : ZOMBIE_PRICES;
    const basePrice = prices[unitId] || 50;
    const upgradePrice = Math.floor(basePrice * (1 + currentLevel * 0.5));
    
    if (user.coins < upgradePrice) return res.json({ success: false, message: `Недостаточно монет! Нужно ${upgradePrice}` });
    
    // Атомарное обновление: проверяем, что уровень всё тот же и монеты не изменились
    const query = { _id: user._id };
    query['inventory.' + unitId + '.level'] = currentLevel;
    
    const update = { $set: {} };
    update.$set['inventory.' + unitId + '.level'] = currentLevel + 1;
    update.$set.coins = user.coins - upgradePrice;
    
    const result = await db.getDb().collection('users').findOneAndUpdate(
        query,
        update,
        { returnDocument: 'after' }
    );
    
    if (!result.value) {
        return res.json({ success: false, message: 'Не удалось улучшить юнита. Попробуйте ещё раз.' });
    }
    
    const updatedUser = result.value;
    // Инвалидируем кэш пользователя
    invalidateUserCache(user._id);
    res.json({
        success: true,
        message: `${unitId} улучшен до уровня ${currentLevel + 1}!`,
        inventory: updatedUser.inventory || {},
        coins: updatedUser.coins,
        newLevel: currentLevel + 1
    });
});

// Регистрация
app.post('/api/register', async (req, res) => {
    const { username, password } = req.body;
    
    if (!username || !password) return res.json({ success: false, message: 'Заполните все поля' });
    if (username.length < 3 || username.length > 20) return res.json({ success: false, message: 'Имя пользователя 3-20 символов' });
    if (password.length < 4) return res.json({ success: false, message: 'Пароль минимум 4 символа' });
    
    const existing = await db.findUserByUsername(username);
    if (existing) return res.json({ success: false, message: 'Пользователь уже существует' });
    
    await db.createUser({
        username,
        usernameLower: username.toLowerCase(),
        password: bcrypt.hashSync(password, 10),
        role: 'player',
        coins: 100,
        wins: 0,
        losses: 0,
        xp: 0,
        level: 1,
        elo: ELO_CONFIG.initial,
        seasonElo: ELO_CONFIG.initial,
        totalCoins: 0,
        lastDaily: null,
        totalGames: 0,
        longestWinStreak: 0,
        currentWinStreak: 0,
        achievements: [],
        dailyQuests: [],
        dailyQuestsDate: null,
        // Поля профиля
        displayName: null,
        description: ''
    });
    
    // Автоматически входим после регистрации
    const user = await db.findUserByUsername(username);
    const sessionId = uuidv4();
    await db.createSession({ sessionId, userId: user._id });
    
    res.json({
        success: true,
        sessionId,
        user: {
            username: user.username,
            displayName: user.displayName || user.username,
            description: user.description || '',
            favoritePlant: user.favoritePlant || null,
            role: user.role,
            coins: user.coins,
            crystals: user.crystals || 0,
            wins: user.wins,
            losses: user.losses,
            xp: user.xp,
            level: user.level,
            totalGames: user.totalGames,
            elo: user.elo || ELO_CONFIG.initial,
            seasonElo: user.seasonElo || ELO_CONFIG.initial
        },
        message: 'Регистрация успешна!'
    });
});

// Вход
app.post('/api/login', async (req, res) => {
    const { username, password } = req.body;
    
    const user = await db.findUserByUsername(username);
    if (!user || !bcrypt.compareSync(password, user.password)) {
        return res.json({ success: false, message: 'Неверное имя пользователя или пароль' });
    }
    
    if (user.role === 'banned') return res.json({ success: false, message: 'Ваш аккаунт заблокирован' });
    
    // Обновляем время последнего входа
    await db.updateUser(user.username, { lastLogin: new Date() });
    
    const sessionId = uuidv4();
    await db.createSession({ sessionId, userId: user._id });
    
    res.json({
        success: true,
        sessionId,
        user: {
            username: user.username,
            displayName: user.displayName || user.username,
            description: user.description || '',
            favoritePlant: user.favoritePlant || null,
            role: user.role,
            coins: user.coins,
            crystals: user.crystals || 0,
            wins: user.wins,
            losses: user.losses,
            xp: user.xp,
            level: user.level,
            totalGames: user.totalGames,
            elo: user.elo || ELO_CONFIG.initial,
            seasonElo: user.seasonElo || ELO_CONFIG.initial
        }
    });
});

// Проверка сессии
app.post('/api/check-session', async (req, res) => {
    const { sessionId } = req.body;
    const session = await getCachedSession(sessionId);
    if (!session) return res.json({ success: false });
    
    const user = await getCachedUser(session.userId);
    if (!user) return res.json({ success: false });
    
    if (user.role === 'banned') {
        await db.deleteSession(sessionId);
        // Удаляем из кэша
        sessionCache.delete(sessionId);
        userCache.delete(session.userId);
        return res.json({ success: false, message: 'Ваш аккаунт заблокирован' });
    }
    
    res.json({
        success: true,
        user: {
            username: user.username,
            displayName: user.displayName || user.username,
            description: user.description || '',
            favoritePlant: user.favoritePlant || null,
            role: user.role,
            coins: user.coins,
            crystals: user.crystals || 0,
            wins: user.wins,
            losses: user.losses,
            xp: user.xp,
            level: user.level,
            totalGames: user.totalGames
        }
    });
});

// Выход
app.post('/api/logout', async (req, res) => {
    const { sessionId } = req.body;
    await db.deleteSession(sessionId);
    res.json({ success: true });
});

// Лидерборд
app.get('/api/leaderboard', async (req, res) => {
    try {
        const users = await db.getAllUsers();
        if (!users) {
            return res.json({ success: false, message: 'База данных недоступна' });
        }
        const filteredUsers = users.filter(u => u.role !== 'banned').sort((a,b) => (b.wins || 0) - (a.wins || 0)).slice(0, 10);
        res.json({ success: true, leaders: filteredUsers.map(u => ({ username: u.username, wins: u.wins, level: u.level, xp: u.xp })) });
    } catch (error) {
        console.error('Ошибка в /api/leaderboard:', error);
        res.json({ success: false, message: 'Ошибка сервера' });
    }
});

app.get('/api/leaderboard-level', async (req, res) => {
    const users = (await db.getAllUsers()).filter(u => u.role !== 'banned').sort((a,b) => (b.xp || 0) - (a.xp || 0)).slice(0, 10);
    res.json({ success: true, leaders: users.map(u => ({ username: u.username, wins: u.wins, level: u.level, xp: u.xp })) });
});

app.get('/api/leaderboard-elo', async (req, res) => {
    const users = (await db.getAllUsers()).filter(u => u.role !== 'banned').sort((a,b) => (b.elo || 1000) - (a.elo || 1000)).slice(0, 10);
    res.json({ success: true, leaders: users.map(u => ({ username: u.username, elo: u.elo || 1000, wins: u.wins, level: u.level })) });
});



function getEloRank(elo) {
    if (elo >= 2500) return 'Алмаз';
    if (elo >= 2000) return 'Платина';
    if (elo >= 1500) return 'Золото';
    if (elo >= 1200) return 'Серебро';
    if (elo >= 1000) return 'Бронза';
    return 'Новичок';
}

// Сезоны
app.get('/api/seasons', (req, res) => {
    res.json({ success: true, seasons: SEASONS, currentSeason: SEASONS[SEASONS.length - 1] });
});

// История матчей
app.get('/api/match-history', (req, res) => {
    const matches = db.getMatches(20);
    res.json({ success: true, matches });
});

// Профиль
app.get('/api/profile/:username', async (req, res) => {
    const username = req.params.username;
    const user = await db.findUserByUsername(username);
    if (!user) return res.json({ success: false, message: 'Игрок не найден' });
    
    res.json({ success: true, profile: {
        username: user.username,
        displayName: user.displayName || user.username,
        description: user.description || '',
        favoritePlant: user.favoritePlant || null,
        wins: user.wins,
        losses: user.losses,
        level: user.level,
        xp: user.xp,
        totalGames: user.totalGames,
        longestWinStreak: user.longestWinStreak,
        createdAt: user.createdAt
    }});
});

// Обновление профиля
app.post('/api/profile/update', async (req, res) => {
    const { sessionId, displayName, description, favoritePlant } = req.body;
    
    const session = await db.findSession(sessionId);
    if (!session) return res.json({ success: false, message: 'Сессия недействительна', error: 'invalid_session' });
    
    const user = await db.findUser({ _id: session.userId });
    if (!user) return res.json({ success: false, message: 'Пользователь не найден' });
    
    // Обновляем только предоставленные поля
    const updates = {};
    if (displayName !== undefined) updates.displayName = displayName.trim() || null;
    if (description !== undefined) updates.description = description || '';
    if (favoritePlant !== undefined) updates.favoritePlant = favoritePlant || null;
    
    if (Object.keys(updates).length === 0) {
        return res.json({ success: false, message: 'Нет данных для обновления' });
    }
    
    try {
        await db.updateUser(user.username, updates);
        
        // Получаем обновленного пользователя
        const updatedUser = await db.findUser({ _id: session.userId });
        // Возвращаем полного пользователя (как в login/check-session)
        res.json({
            success: true,
            user: {
                username: updatedUser.username,
                displayName: updatedUser.displayName || updatedUser.username,
                description: updatedUser.description || '',
                favoritePlant: updatedUser.favoritePlant || null,
                role: updatedUser.role,
                coins: updatedUser.coins,
                crystals: updatedUser.crystals || 0,
                wins: updatedUser.wins,
                losses: updatedUser.losses,
                xp: updatedUser.xp,
                level: updatedUser.level,
                totalGames: updatedUser.totalGames,
                elo: updatedUser.elo || ELO_CONFIG.initial,
                seasonElo: updatedUser.seasonElo || ELO_CONFIG.initial
            },
            message: 'Профиль успешно обновлен'
        });
    } catch (error) {
        console.error('Ошибка обновления профиля:', error);
        res.json({ success: false, message: 'Ошибка сервера: ' + error.message });
    }
});

// Обновление любимого растения
app.post('/api/profile/update-favorite-plant', async (req, res) => {
    const { sessionId, favoritePlant } = req.body;
    
    const session = await db.findSession(sessionId);
    if (!session) return res.json({ success: false, message: 'Сессия недействительна', error: 'invalid_session' });
    
    const user = await db.findUser({ _id: session.userId });
    if (!user) return res.json({ success: false, message: 'Пользователь не найден' });
    
    // Проверяем, что растение существует в инвентаре пользователя
    const inventory = user.inventory || {};
    if (favoritePlant && !inventory[favoritePlant]) {
        return res.json({ success: false, message: 'У вас нет этого растения в инвентаре' });
    }
    
    try {
        const result = await db.updateFavoritePlant(user.username, favoritePlant);
        
        if (result) {
            res.json({
                success: true,
                message: 'Любимое растение обновлено',
                favoritePlant: result.favoritePlant
            });
        } else {
            res.json({ success: false, message: 'Ошибка обновления любимого растения' });
        }
    } catch (error) {
        console.error('Ошибка обновления любимого растения:', error);
        res.json({ success: false, message: 'Ошибка сервера: ' + error.message });
    }
});

// Ежедневная награда с учётом серий
app.post('/api/daily-reward', (req, res) => {
    const { sessionId } = req.body;
    const session = db.findSession(sessionId);
    if (!session) return res.json({ success: false, message: 'Сессия недействительна', error: 'invalid_session' });
    
    const user = db.findUser({ _id: session.userId });
    if (!user) return res.json({ success: false, message: 'Пользователь не найден' });
    
    const now = new Date();
    const lastDaily = user.lastDaily ? new Date(user.lastDaily) : null;
    const lastDailyStreak = user.lastDailyStreak || 0;
    const lastDailyDate = user.lastDailyDate ? new Date(user.lastDailyDate) : null;
    
    // Проверяем, получал ли игрок награду сегодня
    const today = new Date().toDateString();
    if (user.lastDailyDate === today) {
        return res.json({ success: false, message: 'Вы уже получили ежедневную награду сегодня!' });
    }
    
    // Вычисляем новую серию
    let newStreak = 1;
    if (lastDailyDate) {
        const daysSinceLastDaily = Math.floor((now - lastDailyDate) / (1000 * 60 * 60 * 24));
        if (daysSinceLastDaily === 1) {
            // Получил вчера - продолжаем серию
            newStreak = lastDailyStreak + 1;
        } else if (daysSinceLastDaily === 0) {
            // Получил сегодня (проверка уже выше)
            return res.json({ success: false, message: 'Вы уже получили ежедневную награду сегодня!' });
        }
        // Если прошло более 1 дня - сбрасываем серию
    }
    
    // Награда за серию (каждый 7й день - бонус!)
    const baseReward = 50 + user.level * 10;
    let bonusReward = 0;
    let streakMessage = '';
    
    if (newStreak >= 7) {
        bonusReward = 500;
        streakMessage = ' 🎉 Недельная серия! Бонус 500 монет!';
    } else if (newStreak >= 3) {
        bonusReward = 100;
        streakMessage = ' 🔥 Серия ' + newStreak + ' дней! Бонус 100 монет!';
    } else if (newStreak >= 2) {
        bonusReward = 25;
        streakMessage = ' ✨ Серия ' + newStreak + ' дня! Бонус 25 монет!';
    }
    
    const totalReward = baseReward + bonusReward;
    const crystalReward = 1 + Math.floor(newStreak / 3);
    db.updateUser(user.username, { 
        lastDaily: now.toISOString(),
        lastDailyDate: today,
        lastDailyStreak: newStreak,
        coins: user.coins + totalReward,
        crystals: (user.crystals || 0) + crystalReward
    });
    
    res.json({ 
        success: true, 
        message: `Получено ${totalReward} монет и ${crystalReward} кристаллов!${streakMessage}`, 
        coins: user.coins + totalReward,
        streak: newStreak,
        bonus: bonusReward,
        crystals: (user.crystals || 0) + crystalReward,
        crystalReward
    });
});

// Система сундуков как в Clash Royale - за победы!
// Шанс повышения редкости при открытии
const CHEST_RARITIES = {
    1: { name: 'Обычный', color: '#9ca3af', icon: '📦', minMult: 1, maxMult: 1.5, chance: 0 },
    2: { name: 'Редкий', color: '#3b82f6', icon: '🟦', minMult: 1.5, maxMult: 2.5, chance: 15 },
    3: { name: 'Эпик', color: '#8b5cf6', icon: '🟪', minMult: 2.5, maxMult: 4, chance: 10 },
    4: { name: 'Мифический', color: '#f59e0b', icon: '🟧', minMult: 4, maxMult: 6, chance: 5 },
    5: { name: 'Легендарный', color: '#ef4444', icon: '🟥', minMult: 6, maxMult: 10, chance: 0 }
};

const BASE_CHEST_REWARDS = [
    { min: 10, max: 30 },
    { min: 20, max: 50 },
    { min: 30, max: 70 },
    { min: 40, max: 90 },
    { min: 50, max: 120 }
];

app.post('/api/chest', (req, res) => {
    const { sessionId } = req.body;
    const session = db.findSession(sessionId);
    if (!session) return res.json({ success: false, message: 'Сессия недействительна', error: 'invalid_session' });
    
    const user = db.findUser({ _id: session.userId });
    if (!user) return res.json({ success: false, message: 'Пользователь не найден' });
    
    const today = new Date().toDateString();
    
    // Проверяем сколько сундуков уже получено сегодня
    const chestsToday = user.chestsToday || 0;
    const winsToday = user.winsToday || 0;
    
    // За каждую победу даём 1 сундук, максимум 4 в день
    const maxChestsToday = Math.min(4, winsToday);
    
    if (chestsToday >= maxChestsToday) {
        return res.json({ success: false, message: `Сегодня вы можете получить ${maxChestsToday} сундук(ов)! Выиграйте ещё ${4 - winsToday} раз(а).` });
    }
    
    // Текущая редкость (копится от предыдущих открытий)
    let currentRarity = user.chestRarity || 1;
    if (currentRarity > 5) currentRarity = 5;
    
    // Шанс повышения редкости при открытии
    let newRarity = currentRarity;
    let rarityUpgrade = false;
    const upgradeChance = CHEST_RARITIES[currentRarity].chance;
    
    if (upgradeChance > 0 && Math.random() * 100 < upgradeChance) {
        newRarity = currentRarity + 1;
        if (newRarity > 5) newRarity = 5;
        rarityUpgrade = true;
    }
    
    // Базовая награда
    const baseReward = BASE_CHEST_REWARDS[Math.floor(Math.random() * BASE_CHEST_REWARDS.length)];
    const baseAmount = Math.floor(Math.random() * (baseReward.max - baseReward.min + 1)) + baseReward.min;
    
    // Множитель редкости
    const rarityData = CHEST_RARITIES[newRarity];
    const multiplier = rarityData.minMult + Math.random() * (rarityData.maxMult - rarityData.minMult);
    const rewardAmount = Math.floor(baseAmount * multiplier);
    
    // Опыт тоже растёт с редкостью
    const xpReward = Math.floor(rewardAmount * 0.3);
    
    let newCoins = user.coins + rewardAmount;
    let newXP = user.xp + xpReward;
    
    // Проверяем повышение уровня
    const { level: newLevel, xp: newXPAfterLevel } = calculateLevel(newXP);
    
    db.updateUser(user.username, { 
        chestsToday: chestsToday + 1,
        chestRarity: newRarity,
        coins: newCoins,
        xp: newXPAfterLevel
    });
    
    let message = '';
    if (rarityUpgrade) {
        message = `🎁 Вы открыли ${rarityData.icon} ${rarityData.name} сундук!\n💰 +${rewardAmount} монет\n⭐ +${xpReward} опыта\n⬆️ Редкость повышена!`;
    } else {
        message = `🎁 Вы открыли ${rarityData.icon} ${rarityData.name} сундук!\n💰 +${rewardAmount} монет\n⭐ +${xpReward} опыта`;
    }
    
    res.json({ 
        success: true, 
        message: message,
        reward: rewardAmount,
        xpReward: xpReward,
        rarity: newRarity,
        rarityName: rarityData.name,
        rarityIcon: rarityData.icon,
        rarityColor: rarityData.color,
        rarityUpgrade: rarityUpgrade,
        chestsToday: chestsToday + 1,
        maxChestsToday: maxChestsToday,
        winsToday: winsToday,
        chestsNeeded: (chestsToday + 1) * 4 - winsToday,
        coins: newCoins,
        xp: newXPAfterLevel,
        newLevel: newLevel,
        levelUp: newLevel > user.level
    });
});

app.post('/api/chests', (req, res) => {
    const { sessionId } = req.body;
    const session = db.findSession(sessionId);
    if (!session) return res.json({ success: false });
    
    const user = db.findUser({ _id: session.userId });
    if (!user) return res.json({ success: false });
    
    const today = new Date().toDateString();
    
    let chestsToday = user.chestsToday || 0;
    let winsToday = user.winsToday || 0;
    
    if (user.lastChestDay !== today) {
        chestsToday = 0;
        winsToday = 0;
    }
    
    const maxChestsToday = Math.min(4, winsToday);
    let currentRarity = user.chestRarity || 1;
    if (currentRarity > 5) currentRarity = 5;
    
    // Получаем plant chests
    const plantChests = user.plantChests || {
        common: 0,
        rare: 0,
        epic: 0,
        mythic: 0,
        legendary: 0
    };
    
    res.json({
        success: true,
        chests: {
            // Обычные сундуки (за победы)
            common: Math.max(0, maxChestsToday - chestsToday),
            rare: 0,
            epic: 0,
            legendary: 0,
            // Plant chests (покупаются за кристаллы)
            ...plantChests
        }
    });
});

app.post('/api/open-chest', (req, res) => {
    const { sessionId, chestType } = req.body;
    const session = db.findSession(sessionId);
    if (!session) return res.json({ success: false, message: 'Сессия недействительна', error: 'invalid_session' });
    
    const user = db.findUser({ _id: session.userId });
    if (!user) return res.json({ success: false, message: 'Пользователь не найден' });
    
    // Проверяем тип сундука
    const isPlantChest = chestType.startsWith('plant_chest_');
    let plantChests = user.plantChests || { common: 0, rare: 0, epic: 0, mythic: 0, legendary: 0 };
    
    if (isPlantChest) {
        // Обработка plant chests
        const rarity = chestType.replace('plant_chest_', '');
        if (!plantChests[rarity] || plantChests[rarity] <= 0) {
            return res.json({ success: false, message: 'У вас нет такого сундука растений!' });
        }
        
        // Уменьшаем количество сундуков
        plantChests[rarity]--;
        
        // Награды за plant chests (растения и монеты)
        const plantChestRewards = {
            rare: { coins: { min: 200, max: 600 }, plants: ['peashooter', 'sunflower', 'wallnut'] },
            epic: { coins: { min: 500, max: 1200 }, plants: ['cherrybomb', 'snowpea', 'chomper'] },
            mythic: { coins: { min: 800, max: 2000 }, plants: ['repeater', 'squash', 'twinsunflower'] },
            legendary: { coins: { min: 1000, max: 3000 }, plants: ['melonpult', 'cattail', 'iceshroom'] }
        };
        
        const reward = plantChestRewards[rarity];
        const coinAmount = Math.floor(Math.random() * (reward.coins.max - reward.coins.min + 1)) + reward.coins.min;
        const randomPlant = reward.plants[Math.floor(Math.random() * reward.plants.length)];
        
        // Добавляем монеты
        const newCoins = user.coins + coinAmount;
        
        // Добавляем растение в инвентарь (если его еще нет)
        const inventory = user.inventory || {};
        if (!inventory[randomPlant]) {
            inventory[randomPlant] = { 
                level: 1, 
                type: 'plant', 
                purchased: new Date().toISOString() 
            };
        }
        
        db.updateUser(user.username, {
            plantChests: plantChests,
            coins: newCoins,
            inventory: inventory
        });
        
        res.json({
            success: true,
            message: `🎁 Вы открыли сундук растений (${rarity}) и получили ${coinAmount} монет + растение ${randomPlant}!`,
            coins: newCoins,
            plant: randomPlant,
            chestType: chestType,
            remainingChests: plantChests
        });
        
    } else {
        // Обработка обычных сундуков (за победы)
        const today = new Date().toDateString();
        let chestsToday = user.chestsToday || 0;
        let winsToday = user.winsToday || 0;
        
        if (user.lastChestDay !== today) {
            chestsToday = 0;
            winsToday = 0;
        }
        
        const maxChestsToday = Math.min(4, winsToday);
        
        if (chestsToday >= maxChestsToday) {
            return res.json({ success: false, message: 'Нет доступных сундуков! Выиграйте больше игр.' });
        }
        
        let currentRarity = user.chestRarity || 1;
        let newRarity = currentRarity;
        const upgradeChance = CHEST_RARITIES[currentRarity].chance;
        
        if (upgradeChance > 0 && Math.random() * 100 < upgradeChance) {
            newRarity = Math.min(5, currentRarity + 1);
        }
        
        const baseReward = BASE_CHEST_REWARDS[Math.floor(Math.random() * BASE_CHEST_REWARDS.length)];
        const baseAmount = Math.floor(Math.random() * (baseReward.max - baseReward.min + 1)) + baseReward.min;
        
        const rarityData = CHEST_RARITIES[newRarity];
        const multiplier = rarityData.minMult + Math.random() * (rarityData.maxMult - rarityData.minMult);
        const rewardAmount = Math.floor(baseAmount * multiplier);
        
        const xpReward = Math.floor(rewardAmount * 0.3);
        const newCoins = user.coins + rewardAmount;
        const newXP = user.xp + xpReward;
        const { level: newLevel, xp: newXPAfterLevel } = calculateLevel(newXP);
        
        db.updateUser(user.username, {
            chestsToday: chestsToday + 1,
            chestRarity: newRarity,
            coins: newCoins,
            xp: newXPAfterLevel
        });
        
        res.json({
            success: true,
            rewards: rewardAmount,
            coins: newCoins,
            xp: newXPAfterLevel,
            level: newLevel,
            message: `Вы получили ${rewardAmount} монет!`
        });
    }
});

// API для получения информации о сундуке
app.post('/api/chest-status', (req, res) => {
    const { sessionId } = req.body;
    const session = db.findSession(sessionId);
    if (!session) return res.json({ success: false });
    
    const user = db.findUser({ _id: session.userId });
    if (!user) return res.json({ success: false });
    
    const today = new Date().toDateString();
    
    // Сбрасываем счётчик если новый день
    let chestsToday = user.chestsToday || 0;
    let winsToday = user.winsToday || 0;
    
    // Проверяем новый день
    if (user.lastChestDay !== today) {
        // Новый день - сбрасываем счётчики
        chestsToday = 0;
        winsToday = 0;
    }
    
    // За каждую победу 1 сундук, максимум 4 в день
    const maxChestsToday = Math.min(4, winsToday);
    const canOpen = chestsToday < maxChestsToday;
    
    // Текущая редкость
    let currentRarity = user.chestRarity || 1;
    if (currentRarity > 5) currentRarity = 5;
    
    const rarityData = CHEST_RARITIES[currentRarity];
    const nextRarity = Math.min(5, currentRarity + 1);
    const nextRarityData = CHEST_RARITIES[nextRarity];
    const upgradeChance = rarityData.chance;
    
    // Прогресс до следующей редкости
    const chestsUntilNext = (currentRarity + 1) * 4 - (user.chestAttempts || 0);
    
    res.json({ 
        success: true, 
        canOpen: canOpen,
        chestsToday: chestsToday,
        maxChestsToday: maxChestsToday,
        winsToday: winsToday,
        chestsNeeded: maxChestsToday > chestsToday ? (chestsToday + 1) * 4 - winsToday : 0,
        currentRarity: currentRarity,
        rarity: rarityData.name,
        rarityIcon: rarityData.icon,
        rarityColor: rarityData.color,
        nextRarity: nextRarity,
        nextRarityName: nextRarityData.name,
        nextRarityIcon: nextRarityData.icon,
        upgradeChance: upgradeChance,
        chestsUntilNext: Math.max(0, chestsUntilNext),
        chestRarities: CHEST_RARITIES
    });
});

// Сундуки растений за кристаллы
app.post('/api/plant-chests', (req, res) => {
    const { sessionId } = req.body;
    const session = db.findSession(sessionId);
    if (!session) return res.json({ success: false, message: 'Сессия недействительна', error: 'invalid_session' });

    const user = db.findUser({ _id: session.userId });
    if (!user) return res.json({ success: false, message: 'Пользователь не найден' });

    res.json({
        success: true,
        crystals: user.crystals || 0,
        chests: user.plantChests || { common: 0, rare: 0, epic: 0, mythic: 0, legendary: 0 }
    });
});

app.post('/api/buy-plant-chest', (req, res) => {
    const { sessionId, rarity } = req.body;
    const session = db.findSession(sessionId);
    if (!session) return res.json({ success: false, message: 'Сессия недействительна', error: 'invalid_session' });

    const user = db.findUser({ _id: session.userId });
    if (!user) return res.json({ success: false, message: 'Пользователь не найден' });

    const price = PLANT_CHEST_PRICES[rarity];
    if (!price) return res.json({ success: false, message: 'Неизвестная редкость сундука' });

    const currentCrystals = user.crystals || 0;
    if (currentCrystals < price) {
        return res.json({ success: false, message: 'Недостаточно кристаллов' });
    }

    const chests = user.plantChests || { common: 0, rare: 0, epic: 0, mythic: 0, legendary: 0 };
    chests[rarity] = (chests[rarity] || 0) + 1;

    db.updateUser(user.username, {
        crystals: currentCrystals - price,
        plantChests: chests
    });

    res.json({
        success: true,
        message: `Куплен сундук растений (${rarity}) за ${price} кристаллов!`,
        crystals: currentCrystals - price,
        chests
    });
});

// API для засчитывания победы (вызывается после игры)
app.post('/api/add-win', async (req, res) => {
    const { sessionId } = req.body;
    const session = db.findSession(sessionId);
    if (!session) return res.json({ success: false });
    
    const user = db.findUser({ _id: session.userId });
    if (!user) return res.json({ success: false });
    
    const today = new Date().toDateString();
    let winsToday = user.winsToday || 0;
    
    // Если новый день, сбрасываем счётчик
    if (user.lastWinDay !== today) {
        winsToday = 0;
    }
    
    winsToday++;
    
    // За каждую победу даём сундук, максимум 4 в день
    const maxChests = Math.min(4, winsToday);
    const currentChests = user.chestsToday || 0;
    
    db.updateUser(user.username, { 
        winsToday: winsToday,
        lastWinDay: today,
        chestsToday: currentChests > maxChests ? maxChests : currentChests
    });
    
    res.json({ 
        success: true, 
        winsToday: winsToday,
        chestsAvailable: Math.min(4, winsToday) - currentChests,
        message: `Победа! Всего побед сегодня: ${winsToday}. Доступно сундуков: ${Math.min(4, winsToday) - currentChests}`
    });
});

function calculateLevel(totalXP) {
    const xpPerLevel = [0, 100, 250, 450, 700, 1000, 1350, 1750, 2200, 2700, 3250, 3850, 4500, 5200, 5950, 6750, 7600, 8500, 9450, 10450];
    let level = 1;
    let remainingXP = 0;
    
    for (let i = 0; i < xpPerLevel.length; i++) {
        if (totalXP >= xpPerLevel[i]) {
            level = i + 1;
            remainingXP = totalXP - xpPerLevel[i];
        } else {
            break;
        }
    }
    
    return { level, xp: remainingXP };
}

// API для получения информации о серии
app.post('/api/streak', (req, res) => {
    const { sessionId } = req.body;
    const session = db.findSession(sessionId);
    if (!session) return res.json({ success: false });
    
    const user = db.findUser({ _id: session.userId });
    if (!user) return res.json({ success: false });
    
    const today = new Date().toDateString();
    const lastDailyDate = user.lastDailyDate;
    const streak = user.lastDailyStreak || 0;
    
    // Проверяем, получал ли сегодня
    const claimedToday = lastDailyDate === today;
    
    // Проверяем, не сломалась ли серия
    let streakBroken = false;
    if (lastDailyDate) {
        const lastDate = new Date(lastDailyDate);
        const now = new Date();
        const daysDiff = Math.floor((now - lastDate) / (1000 * 60 * 60 * 24));
        if (daysDiff > 1) {
            streakBroken = true;
        }
    }
    
    // Следующая награда
    const nextBonus = streak >= 6 ? 500 : (streak >= 2 ? 100 : 25);
    const nextBonusDay = streak + 1;
    
    res.json({ 
        success: true, 
        streak: streakBroken ? 0 : streak,
        claimedToday,
        nextBonus,
        nextBonusDay
    });
});

// Промокоды
app.post('/api/promocode', (req, res) => {
    const { sessionId, code } = req.body;
    const session = db.findSession(sessionId);
    if (!session) return res.json({ success: false, message: 'Сессия недействительна', error: 'invalid_session' });
    
    const promo = db.findPromo(code);
    if (!promo) return res.json({ success: false, message: 'Неверный промокод' });
    if (promo.uses >= promo.maxUses) return res.json({ success: false, message: 'Промокод больше недействителен' });
    
    const user = db.findUser({ _id: session.userId });
    if (!user) return res.json({ success: false, message: 'Пользователь не найден' });
    
    db.updateUser(user.username, { coins: user.coins + promo.reward });
    db.updatePromo(code, { uses: promo.uses + 1 });
    
    res.json({ success: true, message: `Получено ${promo.reward} монет!`, coins: user.coins + promo.reward });
});

// Квесты
app.post('/api/daily-quests', (req, res) => {
    const { sessionId } = req.body;
    const session = db.findSession(sessionId);
    if (!session) return res.json({ success: false });
    
    const user = db.findUser({ _id: session.userId });
    if (!user) return res.json({ success: false });
    
    const today = new Date().toDateString();
    if (!user.dailyQuests || user.dailyQuestsDate !== today) {
        const quests = [
            { id: 'play_1_game', name: 'Первая игра', desc: 'Сыграйте 1 матч', reward: 30, type: 'games', progress: 0, completed: false },
            { id: 'win_1_game', name: 'Победа', desc: 'Выиграйте 1 матч', reward: 50, type: 'wins', progress: 0, completed: false },
            { id: 'earn_100_coins', name: 'Копилка', desc: 'Заработайте 100 монет', reward: 25, type: 'coins', progress: 0, completed: false }
        ];
        db.updateUser(user.username, { dailyQuests: quests, dailyQuestsDate: today });
        user.dailyQuests = quests;
    }
    
    res.json({ success: true, quests: user.dailyQuests, date: user.dailyQuestsDate });
});

// Достижения
app.post('/api/check-achievements', (req, res) => {
    const { sessionId } = req.body;
    const session = db.findSession(sessionId);
    if (!session) return res.json({ success: false });
    
    const user = db.findUser({ _id: session.userId });
    if (!user) return res.json({ success: false });
    
    res.json({ success: true, userAchievements: user.achievements || [] });
});

// Карты (maps)
app.get('/api/maps', (req, res) => res.json({ success: true, maps: MAPS }));

// Battle Pass API
app.post('/api/battle-pass/status', async (req, res) => {
    const { sessionId } = req.body;
    const session = await db.findSession(sessionId);
    if (!session) return res.json({ success: false, message: 'Сессия недействительна', error: 'invalid_session' });
    
    const user = await db.findUser({ _id: session.userId });
    if (!user) return res.json({ success: false, message: 'Пользователь не найден' });
    
    const battlePass = user.battlePass || {
        season: 1,
        level: 0,
        xp: 0,
        totalXp: 0,
        claimedRewards: [],
        quests: [],
        questsDate: null,
        currentTier: 1,
        tierXp: 0,
        maxTierXp: 1000,
        freeRewardsClaimed: [],
        premiumRewardsClaimed: []
    };
    
    // Проверяем, нужно ли обновить квесты
    const today = new Date().toDateString();
    if (!battlePass.quests || battlePass.questsDate !== today) {
        // Генерируем новые квесты для Battle Pass
        const availableQuests = BATTLE_PASS_QUESTS.filter(q => q.category === 'battlepass');
        const dailyQuests = [];
        for (let i = 0; i < 3; i++) {
            const randomQuest = availableQuests[Math.floor(Math.random() * availableQuests.length)];
            dailyQuests.push({
                ...randomQuest,
                id: `${randomQuest.id}_${Date.now()}_${i}`,
                progress: 0,
                completed: false
            });
        }
        battlePass.quests = dailyQuests;
        battlePass.questsDate = today;
        await db.updateUser(user.username, { battlePass });
    }
    
    res.json({ success: true, battlePass });
});

app.post('/api/battle-pass/claim-reward', async (req, res) => {
    const { sessionId, tier, isPremium = false } = req.body;
    const session = await db.findSession(sessionId);
    if (!session) return res.json({ success: false, message: 'Сессия недействительна', error: 'invalid_session' });
    
    const user = await db.findUser({ _id: session.userId });
    if (!user) return res.json({ success: false, message: 'Пользователь не найден' });
    
    const result = await db.claimBattlePassReward(user.username, tier, isPremium);
    if (!result) return res.json({ success: false, message: 'Ошибка получения награды' });
    
    if (!result.success) return res.json(result);
    
    // Выдаём награду пользователю
    const rewardType = isPremium ? 'premium' : 'free';
    const reward = BATTLE_PASS_REWARDS[rewardType][tier] || { type: 'coins', amount: 50 };
    
    let updateData = { coins: user.coins };
    if (reward.type === 'coins') {
        updateData.coins += reward.amount;
    } else if (reward.type === 'xp') {
        const { level: newLevel, xp: newXP } = calculateLevel(user.xp + reward.amount);
        updateData.xp = newXP;
        if (newLevel > user.level) updateData.level = newLevel;
    }
    // Для других типов наград (юниты и т.д.) можно добавить логику
    
    await db.updateUser(user.username, updateData);
    
    res.json({ success: true, reward, userData: updateData });
});

app.post('/api/battle-pass/complete-quest', async (req, res) => {
    const { sessionId, questId } = req.body;
    const session = await db.findSession(sessionId);
    if (!session) return res.json({ success: false, message: 'Сессия недействительна', error: 'invalid_session' });
    
    const user = await db.findUser({ _id: session.userId });
    if (!user) return res.json({ success: false, message: 'Пользователь не найден' });
    
    const result = await db.updateBattlePassQuestProgress(user.username, questId, 1);
    if (!result) return res.json({ success: false, message: 'Квест не найден или уже выполнен' });
    
    res.json({ success: true, battlePass: result.battlePass, quest: result.quest });
});

// Запрос на Premium Battle Pass (через Telegram-бота, логика будет реализована позже)
app.post('/api/battle-pass/request-premium', async (req, res) => {
    const { sessionId } = req.body;
    const session = await db.findSession(sessionId);
    if (!session) return res.json({ success: false, message: 'Сессия недействительна', error: 'invalid_session' });

    const user = await db.findUser({ _id: session.userId });
    if (!user) return res.json({ success: false, message: 'Пользователь не найден' });

    const battlePass = user.battlePass || {
        season: 1,
        level: 0,
        xp: 0,
        totalXp: 0,
        claimedRewards: [],
        quests: [],
        questsDate: null,
        currentTier: 1,
        tierXp: 0,
        maxTierXp: 1000,
        freeRewardsClaimed: [],
        premiumRewardsClaimed: [],
        isPremium: false,
        premiumRequestedAt: null
    };

    if (battlePass.isPremium) {
        return res.json({ success: true, message: 'У вас уже есть Premium Battle Pass!' });
    }

    battlePass.premiumRequestedAt = new Date();
    await db.updateUser(user.username, { battlePass });

    // Здесь позже можно будет связать проверочный код / Telegram ID с вашим ботом
    res.json({
        success: true,
        message: 'Заявка на Premium Battle Pass через Telegram сохранена. Свяжитесь с нашим Telegram-ботом, чтобы завершить активацию.'
    });
});

// ==================== ADMIN API ====================
function createRewardNotification({ title, subtitle, image, rarityColor, extra }) {
    return {
        id: 'reward_' + Date.now() + '_' + Math.floor(Math.random() * 100000),
        type: 'reward',
        title,
        subtitle: subtitle || '',
        image: image || '',
        rarityColor: rarityColor || '#fbbf24',
        extra: extra || {},
        createdAt: new Date().toISOString()
    };
}

function pushNotificationToUser(username, notification) {
    const target = db.findUserByUsername(username);
    if (!target) return false;
    const notifications = target.notifications || [];
    notifications.push(notification);
    db.updateUser(username, { notifications });
    return true;
}

// Забрать/получить уведомления (и очистить очередь)
app.post('/api/notifications/poll', (req, res) => {
    const { sessionId } = req.body;
    const session = db.findSession(sessionId);
    if (!session) return res.json({ success: false, message: 'Сессия недействительна', error: 'invalid_session' });
    
    const user = db.findUser({ _id: session.userId });
    if (!user) return res.json({ success: false, message: 'Пользователь не найден' });
    
    const notifications = user.notifications || [];
    if (notifications.length) {
        db.updateUser(user.username, { notifications: [] });
    }
    res.json({ success: true, notifications });
});
app.post('/api/admin/stats', (req, res) => {
    const { sessionId } = req.body;
    const session = db.findSession(sessionId);
    if (!session) return res.json({ success: false, message: 'Сессия недействительна', error: 'invalid_session' });
    
    const user = db.findUser({ _id: session.userId });
    if (!user || user.role !== 'admin') return res.json({ success: false, message: 'Доступ запрещен' });
    
    const stats = {
        totalUsers: db.getUsersCount(),
        totalWins: db.getTotalWins(),
        totalGames: db.getTotalGames(),
        totalCoins: db.getTotalCoins(),
        totalCrystals: db.getTotalCrystals(),
        promoCodes: db.getPromosCount(),
        totalMatches: db.getMatchesCount()
    };
    res.json({ success: true, stats });
});

app.post('/api/admin/users', (req, res) => {
    const { sessionId } = req.body;
    const session = db.findSession(sessionId);
    if (!session) return res.json({ success: false, message: 'Сессия недействительна', error: 'invalid_session' });
    
    const user = db.findUser({ _id: session.userId });
    if (!user || user.role !== 'admin') return res.json({ success: false, message: 'Доступ запрещен' });
    
    res.json({ success: true, users: db.getAllUsers().map(u => ({ username: u.username, role: u.role, coins: u.coins, crystals: u.crystals || 0, wins: u.wins, level: u.level, battlePassPremium: !!u.battlePass?.isPremium })) });
});

app.post('/api/admin/create-promo', (req, res) => {
    const { sessionId, code, reward, maxUses } = req.body;
    const session = db.findSession(sessionId);
    if (!session) return res.json({ success: false, message: 'Сессия недействительна', error: 'invalid_session' });
    
    const user = db.findUser({ _id: session.userId });
    if (!user || user.role !== 'admin') return res.json({ success: false, message: 'Доступ запрещен' });
    
    db.createPromo({ code: code.toUpperCase(), reward: parseInt(reward), maxUses: parseInt(maxUses), createdBy: 'admin' });
    res.json({ success: true, message: 'Промокод создан!' });
});

app.post('/api/admin/give-coins', (req, res) => {
    const { sessionId, username, coins } = req.body;
    const session = db.findSession(sessionId);
    if (!session) return res.json({ success: false, message: 'Сессия недействительна', error: 'invalid_session' });
    
    const admin = db.findUser({ _id: session.userId });
    if (!admin || admin.role !== 'admin') return res.json({ success: false, message: 'Доступ запрещен' });
    
    const target = db.findUserByUsername(username);
    if (!target) return res.json({ success: false, message: 'Игрок не найден' });
    
    db.updateUser(username, { coins: target.coins + parseInt(coins) });
    pushNotificationToUser(username, createRewardNotification({
        title: 'Получены монеты!',
        subtitle: `+${parseInt(coins)} монет`,
        image: '💰',
        rarityColor: '#fbbf24',
        extra: { kind: 'coins', amount: parseInt(coins) }
    }));
    res.json({ success: true, message: `Игроку ${username} выдано ${coins} монет!` });
});

app.post('/api/admin/set-level', (req, res) => {
    const { sessionId, username, level } = req.body;
    const session = db.findSession(sessionId);
    if (!session) return res.json({ success: false, message: 'Сессия недействительна', error: 'invalid_session' });
    
    const admin = db.findUser({ _id: session.userId });
    if (!admin || admin.role !== 'admin') return res.json({ success: false, message: 'Доступ запрещен' });
    
    // Проверяем, что уровень является допустимым числом
    const newLevel = parseInt(level);
    if (isNaN(newLevel) || newLevel < 1 || newLevel > 100) {
        return res.json({ success: false, message: 'Недопустимый уровень (1-100)' });
    }
    
    db.updateUser(username, { level: newLevel, xp: 0 });
    res.json({ success: true, message: `Уровень игрока ${username} изменён на ${newLevel}!` });
});

app.post('/api/admin/ban', (req, res) => {
    const { sessionId, username } = req.body;
    const session = db.findSession(sessionId);
    if (!session) return res.json({ success: false, message: 'Сессия недействительна', error: 'invalid_session' });
    
    const admin = db.findUser({ _id: session.userId });
    if (!admin || admin.role !== 'admin') return res.json({ success: false, message: 'Доступ запрещен' });
    
    db.updateUser(username, { role: 'banned' });
    res.json({ success: true, message: `Игрок ${username} заблокирован!` });
});

app.post('/api/admin/unban', (req, res) => {
    const { sessionId, username } = req.body;
    const session = db.findSession(sessionId);
    if (!session) return res.json({ success: false, message: 'Сессия недействительна', error: 'invalid_session' });
    
    const admin = db.findUser({ _id: session.userId });
    if (!admin || admin.role !== 'admin') return res.json({ success: false, message: 'Доступ запрещен' });
    
    db.updateUser(username, { role: 'player' });
    res.json({ success: true, message: `Игрок ${username} разблокирован!` });
});

app.post('/api/admin/reset-progress', (req, res) => {
    const { sessionId, username } = req.body;
    const session = db.findSession(sessionId);
    if (!session) return res.json({ success: false, message: 'Сессия недействительна', error: 'invalid_session' });
    
    const admin = db.findUser({ _id: session.userId });
    if (!admin || admin.role !== 'admin') return res.json({ success: false, message: 'Доступ запрещен' });
    
    db.updateUser(username, { coins: 100, wins: 0, losses: 0, xp: 0, level: 1, totalGames: 0, longestWinStreak: 0, currentWinStreak: 0, achievements: [], inventory: {} });
    res.json({ success: true, message: `Прогресс игрока ${username} сброшен!` });
});

app.post('/api/admin/clear-matches', (req, res) => {
    const { sessionId } = req.body;
    const session = db.findSession(sessionId);
    if (!session) return res.json({ success: false, message: 'Сессия недействительна', error: 'invalid_session' });
    
    const admin = db.findUser({ _id: session.userId });
    if (!admin || admin.role !== 'admin') return res.json({ success: false, message: 'Доступ запрещен' });
    
    db.clearMatches();
    res.json({ success: true, message: 'Все матчи удалены!' });
});

app.post('/api/admin/clear-promos', (req, res) => {
    const { sessionId } = req.body;
    const session = db.findSession(sessionId);
    if (!session) return res.json({ success: false, message: 'Сессия недействительна', error: 'invalid_session' });
    
    const admin = db.findUser({ _id: session.userId });
    if (!admin || admin.role !== 'admin') return res.json({ success: false, message: 'Доступ запрещен' });
    
    db.clearPromos();
    res.json({ success: true, message: 'Все промокоды удалены!' });
});

// Управление ELO
app.post('/api/admin/set-elo', (req, res) => {
    const { sessionId, username, elo } = req.body;
    const session = db.findSession(sessionId);
    if (!session) return res.json({ success: false, message: 'Сессия недействительна', error: 'invalid_session' });
    
    const admin = db.findUser({ _id: session.userId });
    if (!admin || admin.role !== 'admin') return res.json({ success: false, message: 'Доступ запрещен' });
    
    // Проверяем, что ELO является допустимым числом в разумном диапазоне
    const newElo = parseInt(elo);
    if (isNaN(newElo) || newElo < 100 || newElo > 5000) {
        return res.json({ success: false, message: 'Недопустимое значение ELO (100-5000)' });
    }
    
    db.updateUser(username, { elo: newElo, seasonElo: newElo });
    res.json({ success: true, message: `ELO игрока ${username} изменён на ${newElo}!` });
});

// Управление победами
app.post('/api/admin/set-wins', (req, res) => {
    const { sessionId, username, wins } = req.body;
    const session = db.findSession(sessionId);
    if (!session) return res.json({ success: false, message: 'Сессия недействительна', error: 'invalid_session' });
    
    const admin = db.findUser({ _id: session.userId });
    if (!admin || admin.role !== 'admin') return res.json({ success: false, message: 'Доступ запрещен' });
    
    // Проверяем, что количество побед является допустимым неотрицательным числом
    const newWins = parseInt(wins);
    if (isNaN(newWins) || newWins < 0) {
        return res.json({ success: false, message: 'Недопустимое значение побед (неотрицательное число)' });
    }
    
    db.updateUser(username, { wins: newWins });
    res.json({ success: true, message: `Победы игрока ${username} изменены на ${newWins}!` });
});

// Управление XP
app.post('/api/admin/set-xp', (req, res) => {
    const { sessionId, username, xp } = req.body;
    const session = db.findSession(sessionId);
    if (!session) return res.json({ success: false, message: 'Сессия недействительна', error: 'invalid_session' });
    
    const admin = db.findUser({ _id: session.userId });
    if (!admin || admin.role !== 'admin') return res.json({ success: false, message: 'Доступ запрещен' });
    
    // Проверяем, что XP является допустимым неотрицательным числом
    const newXp = parseInt(xp);
    if (isNaN(newXp) || newXp < 0) {
        return res.json({ success: false, message: 'Недопустимое значение XP (неотрицательное число)' });
    }
    
    db.updateUser(username, { xp: newXp });
    res.json({ success: true, message: `XP игрока ${username} изменено на ${newXp}!` });
});

// Забрать монеты
app.post('/api/admin/take-coins', (req, res) => {
    const { sessionId, username, coins } = req.body;
    const session = db.findSession(sessionId);
    if (!session) return res.json({ success: false, message: 'Сессия недействительна', error: 'invalid_session' });
    
    const admin = db.findUser({ _id: session.userId });
    if (!admin || admin.role !== 'admin') return res.json({ success: false, message: 'Доступ запрещен' });
    
    const target = db.findUserByUsername(username);
    if (!target) return res.json({ success: false, message: 'Игрок не найден' });
    
    const newCoins = Math.max(0, target.coins - parseInt(coins));
    db.updateUser(username, { coins: newCoins });
    res.json({ success: true, message: `У игрока ${username} забрано ${coins} монет!` });
});

// Выдать кристаллы
app.post('/api/admin/give-crystals', (req, res) => {
    const { sessionId, username, crystals } = req.body;
    const session = db.findSession(sessionId);
    if (!session) return res.json({ success: false, message: 'Сессия недействительна', error: 'invalid_session' });
    
    const admin = db.findUser({ _id: session.userId });
    if (!admin || admin.role !== 'admin') return res.json({ success: false, message: 'Доступ запрещен' });
    
    const target = db.findUserByUsername(username);
    if (!target) return res.json({ success: false, message: 'Игрок не найден' });
    
    const amount = parseInt(crystals);
    db.updateUser(username, { crystals: (target.crystals || 0) + amount });
    pushNotificationToUser(username, createRewardNotification({
        title: 'Получены кристаллы!',
        subtitle: `+${amount} кристаллов`,
        image: '💎',
        rarityColor: '#60a5fa',
        extra: { kind: 'crystals', amount }
    }));
    res.json({ success: true, message: `Игроку ${username} выдано ${amount} кристаллов!` });
});

// Выдать сундук растений
app.post('/api/admin/give-plant-chest', (req, res) => {
    const { sessionId, username, rarity, amount } = req.body;
    const session = db.findSession(sessionId);
    if (!session) return res.json({ success: false, message: 'Сессия недействительна', error: 'invalid_session' });
    
    const admin = db.findUser({ _id: session.userId });
    if (!admin || admin.role !== 'admin') return res.json({ success: false, message: 'Доступ запрещен' });
    
    const target = db.findUserByUsername(username);
    if (!target) return res.json({ success: false, message: 'Игрок не найден' });
    
    const chests = target.plantChests || { common: 0, rare: 0, epic: 0, mythic: 0, legendary: 0 };
    const key = rarity;
    if (chests[key] === undefined) chests[key] = 0;
    chests[key] += parseInt(amount) || 1;
    
    db.updateUser(username, { plantChests: chests });
    pushNotificationToUser(username, createRewardNotification({
        title: 'Получен сундук растений!',
        subtitle: `${rarity} x${parseInt(amount) || 1}`,
        image: '📦🌱',
        rarityColor: ({ common:'#9ca3af', rare:'#3b82f6', epic:'#8b5cf6', mythic:'#f59e0b', legendary:'#ef4444' }[rarity]) || '#fbbf24',
        extra: { kind: 'plantChest', rarity, amount: parseInt(amount) || 1 }
    }));
    res.json({ success: true, message: `Игроку ${username} выдано ${amount} сундуков растений (${rarity})!` });
});

// Управление Battle Pass (уровень)
app.post('/api/admin/set-battlepass-level', (req, res) => {
    const { sessionId, username, level } = req.body;
    const session = db.findSession(sessionId);
    if (!session) return res.json({ success: false, message: 'Сессия недействительна', error: 'invalid_session' });
    
    const admin = db.findUser({ _id: session.userId });
    if (!admin || admin.role !== 'admin') return res.json({ success: false, message: 'Доступ запрещен' });
    
    const target = db.findUserByUsername(username);
    if (!target) return res.json({ success: false, message: 'Игрок не найден' });
    
    const bp = target.battlePass || {
        season: 1,
        level: 0,
        xp: 0,
        totalXp: 0,
        claimedRewards: [],
        quests: [],
        questsDate: null,
        currentTier: 1,
        tierXp: 0,
        maxTierXp: 1000,
        freeRewardsClaimed: [],
        premiumRewardsClaimed: [],
        isPremium: false,
        premiumRequestedAt: null
    };
    bp.level = parseInt(level);
    if (bp.level < 0) bp.level = 0;
    bp.xp = 0;
    
    db.updateUser(username, { battlePass: bp });
    res.json({ success: true, message: `Уровень Battle Pass игрока ${username} изменён на ${bp.level}!` });
});

// Управление Battle Pass (Premium)
app.post('/api/admin/set-battlepass-premium', (req, res) => {
    const { sessionId, username, isPremium } = req.body;
    const session = db.findSession(sessionId);
    if (!session) return res.json({ success: false, message: 'Сессия недействительна', error: 'invalid_session' });
    
    const admin = db.findUser({ _id: session.userId });
    if (!admin || admin.role !== 'admin') return res.json({ success: false, message: 'Доступ запрещен' });
    
    const target = db.findUserByUsername(username);
    if (!target) return res.json({ success: false, message: 'Игрок не найден' });
    
    const bp = target.battlePass || {
        season: 1,
        level: 0,
        xp: 0,
        totalXp: 0,
        claimedRewards: [],
        quests: [],
        questsDate: null,
        currentTier: 1,
        tierXp: 0,
        maxTierXp: 1000,
        freeRewardsClaimed: [],
        premiumRewardsClaimed: [],
        isPremium: false,
        premiumRequestedAt: null
    };
    const premium = isPremium === true || isPremium === 'true' || isPremium === 1 || isPremium === '1';
    bp.isPremium = premium;
    if (premium) {
        bp.premiumRequestedAt = bp.premiumRequestedAt || new Date();
    }
    
    db.updateUser(username, { battlePass: bp });
    pushNotificationToUser(username, createRewardNotification({
        title: 'Battle Pass Premium',
        subtitle: premium ? 'Premium активирован!' : 'Premium отключён',
        image: '🎖️💎',
        rarityColor: premium ? '#a855f7' : '#64748b',
        extra: { kind: 'battlePassPremium', value: premium }
    }));
    res.json({ success: true, message: `Premium Battle Pass для ${username} ${premium ? 'включён' : 'отключён'}.` });
});

// Сброс квестов всем
app.post('/api/admin/reset-quests', (req, res) => {
    const { sessionId } = req.body;
    const session = db.findSession(sessionId);
    if (!session) return res.json({ success: false, message: 'Сессия недействительна', error: 'invalid_session' });
    
    const admin = db.findUser({ _id: session.userId });
    if (!admin || admin.role !== 'admin') return res.json({ success: false, message: 'Доступ запрещен' });
    
    db.resetAllQuests();
    res.json({ success: true, message: 'Квесты сброшены всем игрокам!' });
});

// Экспорт пользователей
app.post('/api/admin/export-users', (req, res) => {
    const { sessionId } = req.body;
    const session = db.findSession(sessionId);
    if (!session) return res.json({ success: false, message: 'Сессия недействительна', error: 'invalid_session' });
    
    const admin = db.findUser({ _id: session.userId });
    if (!admin || admin.role !== 'admin') return res.json({ success: false, message: 'Доступ запрещен' });
    
    const users = db.getAllUsers().map(u => ({
        username: u.username,
        role: u.role,
        coins: u.coins,
        wins: u.wins,
        losses: u.losses,
        xp: u.xp,
        level: u.level,
        elo: u.elo,
        seasonElo: u.seasonElo,
        totalGames: u.totalGames,
        createdAt: u.createdAt
    }));
    
    res.json({ success: true, users });
});

// Статистика по БД
app.post('/api/admin/db-stats', (req, res) => {
    const { sessionId } = req.body;
    const session = db.findSession(sessionId);
    if (!session) return res.json({ success: false, message: 'Сессия недействительна', error: 'invalid_session' });
    
    const admin = db.findUser({ _id: session.userId });
    if (!admin || admin.role !== 'admin') return res.json({ success: false, message: 'Доступ запрещен' });
    
    res.json({ success: true, stats: {
        users: db.getUsersCount(),
        matches: db.getMatchesCount(),
        promos: db.getPromosCount(),
        sessions: db.getSessionsCount()
    }});
});

// Настройки сервера (заглушка)
let serverSettings = {
    gameDuration: 180,
    winnerReward: 50,
    loserReward: 10,
    drawReward: 20,
    dailyRewardBase: 50,
    xpPerWin: 25
};

app.post('/api/admin/server-settings', (req, res) => {
    const { sessionId } = req.body;
    const session = db.findSession(sessionId);
    if (!session) return res.json({ success: false, message: 'Сессия недействительна', error: 'invalid_session' });
    
    const admin = db.findUser({ _id: session.userId });
    if (!admin || admin.role !== 'admin') return res.json({ success: false, message: 'Доступ запрещен' });
    
    res.json({ success: true, settings: serverSettings });
});

app.post('/api/admin/update-settings', (req, res) => {
    const { sessionId, settings } = req.body;
    const session = db.findSession(sessionId);
    if (!session) return res.json({ success: false, message: 'Сессия недействительна', error: 'invalid_session' });
    
    const admin = db.findUser({ _id: session.userId });
    if (!admin || admin.role !== 'admin') return res.json({ success: false, message: 'Доступ запрещен' });
    
    serverSettings = { ...serverSettings, ...settings };
    res.json({ success: true, message: 'Настройки сохранены!' });
});

// Статистика по уровням
app.post('/api/admin/level-stats', (req, res) => {
    const { sessionId } = req.body;
    const session = db.findSession(sessionId);
    if (!session) return res.json({ success: false, message: 'Сессия недействительна', error: 'invalid_session' });
    
    const admin = db.findUser({ _id: session.userId });
    if (!admin || admin.role !== 'admin') return res.json({ success: false, message: 'Доступ запрещен' });
    
    db.getLevelStats().then(stats => {
        res.json({ success: true, levelStats: stats });
    }).catch(() => {
        res.json({ success: true, levelStats: [] });
    });
});

// Топ по монетам
app.post('/api/admin/top-coins', (req, res) => {
    const { sessionId } = req.body;
    const session = db.findSession(sessionId);
    if (!session) return res.json({ success: false, message: 'Сессия недействительна', error: 'invalid_session' });
    
    const admin = db.findUser({ _id: session.userId });
    if (!admin || admin.role !== 'admin') return res.json({ success: false, message: 'Доступ запрещен' });
    
    db.getTopByCoins(10).then(top => {
        res.json({ success: true, top });
    }).catch(() => {
        res.json({ success: true, top: [] });
    });
});

// Изменить роль
app.post('/api/admin/set-role', (req, res) => {
    const { sessionId, username, role } = req.body;
    const session = db.findSession(sessionId);
    if (!session) return res.json({ success: false, message: 'Сессия недействительна', error: 'invalid_session' });
    
    const admin = db.findUser({ _id: session.userId });
    if (!admin || admin.role !== 'admin') return res.json({ success: false, message: 'Доступ запрещен' });
    
    db.updateUser(username, { role });
    res.json({ success: true, message: `Роль игрока ${username} изменена на ${role}!` });
});

// Создать акцию
app.post('/api/admin/create-sale', (req, res) => {
    const { sessionId, plantId, discount, duration } = req.body;
    const session = db.findSession(sessionId);
    if (!session) return res.json({ success: false, message: 'Сессия недействительна', error: 'invalid_session' });
    
    const admin = db.findUser({ _id: session.userId });
    if (!admin || admin.role !== 'admin') return res.json({ success: false, message: 'Доступ запрещен' });
    
    const expiresAt = new Date(Date.now() + parseInt(duration));
    db.createSale({ plantId, discount: parseInt(discount), expiresAt });
    res.json({ success: true, message: 'Акция создана!' });
});

app.post('/api/admin/delete-user', (req, res) => {
    const { sessionId, username } = req.body;
    const session = db.findSession(sessionId);
    if (!session) return res.json({ success: false, message: 'Сессия недействительна', error: 'invalid_session' });
    
    const admin = db.findUser({ _id: session.userId });
    if (!admin || admin.role !== 'admin') return res.json({ success: false, message: 'Доступ запрещен' });
    if (username.toLowerCase() === 'admin') return res.json({ success: false, message: 'Нельзя удалить админа' });
    
    db.deleteUser(username);
    res.json({ success: true, message: `Игрок ${username} удалён!` });
});

app.post('/api/admin/search-user', (req, res) => {
    const { sessionId, query } = req.body;
    const session = db.findSession(sessionId);
    if (!session) return res.json({ success: false, message: 'Сессия недействительна', error: 'invalid_session' });
    
    const admin = db.findUser({ _id: session.userId });
    if (!admin || admin.role !== 'admin') return res.json({ success: false, message: 'Доступ запрещен' });
    
    const users = db.getAllUsers().filter(u => u.username.toLowerCase().includes(query.toLowerCase()));
    res.json({ success: true, users: users.map(u => ({ username: u.username, role: u.role, coins: u.coins, wins: u.wins, level: u.level })) });
});

app.post('/api/admin/give-unit', (req, res) => {
    const { sessionId, username, unitId, unitType } = req.body;
    const session = db.findSession(sessionId);
    if (!session) return res.json({ success: false, message: 'Сессия недействительна', error: 'invalid_session' });
    
    const admin = db.findUser({ _id: session.userId });
    if (!admin || admin.role !== 'admin') return res.json({ success: false, message: 'Доступ запрещен' });
    
    const target = db.findUserByUsername(username);
    if (!target) return res.json({ success: false, message: 'Игрок не найден' });
    
    const inventory = target.inventory || {};
    inventory[unitId] = { level: 1, type: unitType, purchased: new Date().toISOString() };
    db.updateUser(username, { inventory });
    
    res.json({ success: true, message: `Игроку ${username} выдан юнит ${unitId}!` });
});

app.post('/api/admin/broadcast-coins', (req, res) => {
    const { sessionId, coins } = req.body;
    const session = db.findSession(sessionId);
    if (!session) return res.json({ success: false, message: 'Сессия недействительна', error: 'invalid_session' });
    
    const admin = db.findUser({ _id: session.userId });
    if (!admin || admin.role !== 'admin') return res.json({ success: false, message: 'Доступ запрещен' });
    
    const users = db.getAllUsers();
    users.forEach(u => {
        if (u.role !== 'admin') {
            db.updateUser(u.username, { coins: (u.coins || 0) + parseInt(coins) });
        }
    });
    
    res.json({ success: true, message: `Монеты выданы ${users.length - 1} игрокам!` });
});

        // ==================== ИГРОВОЙ СЕРВЕР ====================
        const gameRooms = new Map();

        function createBot(difficulty, side) {
            return {
                id: 'bot_' + uuidv4().substring(0, 8),
                username: BOT_NAMES[Math.floor(Math.random() * BOT_NAMES.length)] + Math.floor(Math.random() * 100),
                side: side,
                isBot: true,
                difficulty: difficulty,
                _id: 'bot_' + Date.now()
            };
        }

        // === ИНТЕГРАЦИЯ С ИГРОВЫМИ СОБЫТИЯМИ ===
        // Добавляем XP к Battle Pass за победы
        function addBattlePassXpForWin(username, xpAmount) {
            return battlePassSystem.addBattlePassXp(username, xpAmount);
        }

        // Добавляем XP к Battle Pass за игры
        function addBattlePassXpForGame(username, xpAmount) {
            return battlePassSystem.addBattlePassXp(username, xpAmount);
        }


        io.on('connection', (socket) => {
            console.log('Игрок подключился:', socket.id);
            
            let currentRoom = null;
            let currentUser = null;
    
    socket.on('sendMessage', (data) => {
        if (currentRoom && currentUser && !currentUser.isBot) {
            io.to(currentRoom).emit('chatMessage', { username: currentUser.username, message: data.message.substring(0, 100), time: new Date().toLocaleTimeString() });
        }
    });
    
    socket.on('findBotGame', async (data) => {
        const { sessionId, difficulty = 'medium', side: requestedSide } = data;
        const session = db.findSession(sessionId);
        
        if (!session) { socket.emit('error', { message: 'Сессия недействительна' }); return; }
        
        currentUser = db.findUser({ _id: session.userId });
        if (!currentUser) return;
        
        const roomId = uuidv4();
        const side = requestedSide || (Math.random() > 0.5 ? 'plant' : 'zombie');
        const bot = createBot(difficulty, side === 'plant' ? 'zombie' : 'plant');
        
        gameRooms.set(roomId, {
            players: [
                { id: socket.id, side, user: currentUser },
                { id: bot.id, side: bot.side, user: bot }
            ],
            state: 'playing',
            timer: null,
            isBotGame: true,
            difficulty: difficulty,
            timestamp: Date.now()
        });
        
        currentRoom = roomId;
        socket.join(roomId);
        
        io.to(roomId).emit('gameStart', {
            roomId,
            players: [
                { id: socket.id, side: side, username: currentUser.username, isBot: false },
                { id: bot.id, side: bot.side, username: bot.username, isBot: true }
            ],
            state: 'playing',
            isBotGame: true,
            difficulty: difficulty
        });
        
        let roundTime = 180;
        const room = gameRooms.get(roomId);
        room.timer = setInterval(() => {
            roundTime--;
            io.to(roomId).emit('gameTimer', { time: roundTime });
            
            if (roundTime % 5 === 0) {
                const botPlayer = room.players.find(p => p.user.isBot);
                if (botPlayer && Math.random() < BOT_DIFFICULTIES[botPlayer.user.difficulty].spawnRate) {
                    const lane = Math.floor(Math.random() * 5);
                    const unitId = botPlayer.side === 'plant' ? 'peashooter' : 'zombie';
                    const pos = botPlayer.side === 'plant' ? '15%' : '95%';
                    io.to(roomId).emit('botPlaceUnit', { lane, unitId, side: botPlayer.side, pos });
                }
            }
            
            if (roundTime <= 0) endRound(roomId, 'draw');
        }, 1000);
        
        console.log(`Игра с ботом ${difficulty} началась: ${currentUser.username} vs ${bot.username}`);
    });
    
    socket.on('findGame', async (data) => {
        const { sessionId, difficulty = 'medium' } = data;
        const session = db.findSession(sessionId);
        
        if (!session) { socket.emit('error', { message: 'Сессия недействительна' }); return; }
        
        currentUser = db.findUser({ _id: session.userId });
        if (!currentUser) return;
        
        // Поиск игрока
        for (let [roomId, room] of gameRooms) {
            if (room.players.length === 1 && room.state === 'waiting' && !room.isBotGame) {
                const side = room.players[0].side === 'plant' ? 'zombie' : 'plant';
                room.players.push({ id: socket.id, side, user: currentUser });
                currentRoom = roomId;
                socket.join(roomId);
                
                room.state = 'playing';
                room.timestamp = Date.now();
                if (room.botTimer) { clearTimeout(room.botTimer); room.botTimer = null; }
                
                io.to(roomId).emit('gameStart', {
                    roomId,
                    players: room.players.map(p => ({ id: p.id, side: p.side, username: p.user.username, isBot: p.user.isBot || false })),
                    state: room.state
                });
                
                let roundTime = 180;
                room.timer = setInterval(() => {
                    roundTime--;
                    io.to(roomId).emit('gameTimer', { time: roundTime });
                    if (roundTime <= 0) endRound(roomId, 'draw');
                }, 1000);
                
                return;
            }
        }
        
        // Нет игроков - создаём комнату и ждём или запускаем бота через 60 сек
        const roomId = uuidv4();
        const side = Math.random() > 0.5 ? 'plant' : 'zombie';
        
        gameRooms.set(roomId, {
            players: [{ id: socket.id, side, user: currentUser }],
            state: 'waiting',
            timer: null,
            botTimer: null,
            isBotGame: false,
            difficulty: difficulty,
            timestamp: Date.now()
        });
        
        currentRoom = roomId;
        socket.join(roomId);
        
        socket.emit('waiting', { message: 'Ожидание противника...', timeLeft: 60 });
        
        const room = gameRooms.get(roomId);
        room.botTimer = setTimeout(() => startBotGame(roomId, difficulty), 60000);
    });
    
    function startBotGame(roomId, difficulty) {
        const room = gameRooms.get(roomId);
        if (!room || room.state !== 'waiting') return;
        
        room.isBotGame = true;
        room.timestamp = Date.now();
        
        const playerSide = room.players[0].side;
        const botSide = playerSide === 'plant' ? 'zombie' : 'plant';
        const bot = createBot(difficulty, botSide);
        
        room.players.push({ id: bot.id, side: botSide, user: bot });
        room.state = 'playing';
        
        io.to(roomId).emit('gameStart', {
            roomId,
            players: room.players.map(p => ({ id: p.id, side: p.side, username: p.user.username, isBot: p.user.isBot || false })),
            state: room.state,
            isBotGame: true,
            difficulty: difficulty
        });
        
        let roundTime = 180;
        room.timer = setInterval(() => {
            roundTime--;
            io.to(roomId).emit('gameTimer', { time: roundTime });
            
            if (roundTime % 5 === 0) {
                const botPlayer = room.players.find(p => p.user.isBot);
                if (botPlayer && Math.random() < BOT_DIFFICULTIES[botPlayer.user.difficulty].spawnRate) {
                    const lane = Math.floor(Math.random() * 5);
                    const unitId = botSide === 'plant' ? 'peashooter' : 'zombie';
                    const pos = botSide === 'plant' ? '15%' : '95%';
                    io.to(roomId).emit('botPlaceUnit', { lane, unitId, side: botSide, pos });
                }
            }
            
            if (roundTime <= 0) endRound(roomId, 'draw');
        }, 1000);
    }
    
    socket.on('leaveQueue', () => {
        if (currentRoom) {
            const room = gameRooms.get(currentRoom);
            if (room) {
                if (room.state === 'waiting') {
                    if (room.botTimer) { clearTimeout(room.botTimer); room.botTimer = null; }
                    room.players = room.players.filter(p => p.id !== socket.id);
                    if (room.players.length === 0) gameRooms.delete(currentRoom);
                } else if (room.state === 'playing') {
                    io.to(currentRoom).emit('gameEnd', { winner: 'left', winnerSide: null, isBotGame: room.isBotGame, left: true });
                    if (room.timer) clearInterval(room.timer);
                    gameRooms.delete(currentRoom);
                }
            }
        }
        currentRoom = null;
    });
    
    socket.on('plantPlaced', (data) => { if (currentRoom) socket.to(currentRoom).emit('opponentPlanted', data); });
    socket.on('zombiePlaced', (data) => { if (currentRoom) socket.to(currentRoom).emit('opponentZombie', data); });
    
    socket.on('gameOver', (data) => {
        if (currentRoom) {
            const room = gameRooms.get(currentRoom);
            if (room && room.state === 'playing') endRound(currentRoom, data.winner);
        }
    });
    
    socket.on('disconnect', async () => {
        console.log('Игрок отключился:', socket.id);
        if (currentRoom) {
            const room = gameRooms.get(currentRoom);
            if (room) {
                if (room.state === 'waiting') {
                    if (room.botTimer) { clearTimeout(room.botTimer); room.botTimer = null; }
                    room.players = room.players.filter(p => p.id !== socket.id);
                    if (room.players.length === 0) gameRooms.delete(currentRoom);
                } else if (room.state === 'playing') {
                    io.to(currentRoom).emit('gameEnd', { winner: 'left', winnerSide: null, isBotGame: room.isBotGame, left: true });
                    if (room.timer) clearInterval(room.timer);
                    gameRooms.delete(currentRoom);
                }
            }
        }
    });
});

function endRound(roomId, result) {
    const room = gameRooms.get(roomId);
    if (!room) return;
    
    if (room.timer) clearInterval(room.timer);
    
    if (result !== 'draw') {
        const winner = room.players.find(p => p.side === result);
        const loser = room.players.find(p => p.side !== result);
        
        if (winner && loser) {
            const giveRewards = !room.isBotGame;
            
            if (!winner.user.isBot) {
                // Обновляем прогресс Battle Pass для победителя
                db.updateUser(winner.user.username, { wins: (winner.user.wins || 0) + 1, totalGames: (winner.user.totalGames || 0) + 1, coins: winner.user.coins + (giveRewards ? 50 : 0) });
                // Добавляем XP к Battle Pass за победу
                db.addBattlePassXp(winner.user.username, 50);
            }
            if (!loser.user.isBot) {
                db.updateUser(loser.user.username, { losses: (loser.user.losses || 0) + 1, totalGames: (loser.user.totalGames || 0) + 1, coins: loser.user.coins + (giveRewards ? 10 : 0) });
                // Добавляем XP к Battle Pass за игру (даже за поражение)
                db.addBattlePassXp(loser.user.username, 20);
            }
            
            if (!room.isBotGame || (winner.user.isBot === false && loser.user.isBot === false)) {
                db.createMatch({ winner: winner.user.username, loser: loser.user.username, winnerSide: winner.side });
            }
            
            io.to(roomId).emit('gameEnd', { winner: winner.user.username, winnerSide: winner.side, rewards: { winner: 50, loser: 10 }, isBotGame: room.isBotGame });
        }
    } else {
        const giveRewards = room.isBotGame && !room.players.find(p => p.user.isBot);
        
        for (const p of room.players) {
            if (!p.user.isBot) {
                db.updateUser(p.user.username, { totalGames: (p.user.totalGames || 0) + 1, coins: p.user.coins + (giveRewards ? 20 : 0) });
                // Добавляем XP к Battle Pass за ничью
                db.addBattlePassXp(p.user.username, 30);
            }
        }
        
        io.to(roomId).emit('gameEnd', { winner: 'draw', rewards: { winner: giveRewards ? 20 : 0, loser: giveRewards ? 20 : 0 }, isBotGame: room.isBotGame });
    }
    
    gameRooms.delete(roomId);
}

// API для повышения до админа по секретному коду
app.post('/api/admin/become-admin', async (req, res) => {
    const { sessionId, adminCode } = req.body;
    
    if (!sessionId || !adminCode) {
        return res.json({ success: false, message: 'Введите код администратора' });
    }
    
    // Проверяем секретный код
    if (adminCode !== ADMIN_SECRET_CODE) {
        return res.json({ success: false, message: 'Неверный код администратора' });
    }
    
    const session = await db.findSession(sessionId);
    if (!session) {
        return res.json({ success: false, message: 'Сессия недействительна' });
    }
    
    const user = await db.findUser({ _id: session.userId });
    if (!user) {
        return res.json({ success: false, message: 'Пользователь не найден' });
    }
    
    await db.updateUser(user.username, { role: 'admin' });
    
    res.json({ success: true, message: 'Поздравляем! Вы получили права администратора!' });
});

// ==================== ЗАПУСК ====================
// Функции для работы с кэшем
async function getCachedSession(sessionId) {
    const cached = sessionCache.get(sessionId);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
        return cached.data;
    }
    const session = await db.findSession(sessionId);
    if (session) {
        sessionCache.set(sessionId, { data: session, timestamp: Date.now() });
    }
    return session;
}

async function getCachedUser(userId) {
    const cached = userCache.get(userId);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
        return cached.data;
    }
    const user = await db.findUser({ _id: userId });
    if (user) {
        userCache.set(userId, { data: user, timestamp: Date.now() });
    }
    return user;
}

// Инвалидация кэша пользователя
function invalidateUserCache(userId) {
    if (userId) {
        userCache.delete(userId);
    }
}

// Очистка кэша по истечении TTL
setInterval(() => {
    const now = Date.now();
    for (const [key, value] of sessionCache.entries()) {
        if (now - value.timestamp >= CACHE_TTL) {
            sessionCache.delete(key);
        }
    }
    for (const [key, value] of userCache.entries()) {
        if (now - value.timestamp >= CACHE_TTL) {
            userCache.delete(key);
        }
    }
    
    // Очистка устаревших игровых комнат
    for (const [roomId, room] of gameRooms) {
        // Удаляем комнаты, которые существуют более 10 минут
        if (room.timestamp && (now - room.timestamp > 10 * 60 * 1000)) {
            if (room.timer) clearInterval(room.timer);
            if (room.botTimer) clearTimeout(room.botTimer);
            gameRooms.delete(roomId);
        }
    }
    }, 60000); // Очищать каждую минуту

// ==================== РАСШИРЕННЫЕ АДМИН-ФУНКЦИИ ====================

// Система логирования действий администратора
const adminLogs = [];

function logAdminAction(adminUsername, action, targetUsername, details = {}) {
    const logEntry = {
        id: Date.now() + '_' + Math.random().toString(36).substr(2, 9),
        timestamp: new Date().toISOString(),
        admin: adminUsername,
        action,
        target: targetUsername,
        details,
        ip: details.ip || 'unknown'
    };
    adminLogs.push(logEntry);
    
    // Ограничиваем логи до 1000 записей
    if (adminLogs.length > 1000) {
        adminLogs.shift();
    }
    
    console.log(`[ADMIN LOG] ${adminUsername} выполнил действие: ${action} на ${targetUsername}`);
    return logEntry;
}

// API для получения логов администратора
app.post('/api/admin/logs', async (req, res) => {
    const { sessionId, limit = 100, offset = 0 } = req.body;
    const session = await db.findSession(sessionId);
    if (!session) return res.json({ success: false, message: 'Сессия недействительна', error: 'invalid_session' });
    
    const admin = await db.findUser({ _id: session.userId });
    if (!admin || admin.role !== 'admin') return res.json({ success: false, message: 'Доступ запрещен' });
    
    const limitNum = parseInt(limit);
    const offsetNum = parseInt(offset);
    
    const logs = adminLogs.slice(offsetNum, offsetNum + limitNum);
    res.json({ 
        success: true, 
        logs,
        total: adminLogs.length,
        hasMore: offsetNum + limitNum < adminLogs.length
    });
});

// API для очистки логов
app.post('/api/admin/clear-logs', async (req, res) => {
    const { sessionId } = req.body;
    const session = await db.findSession(sessionId);
    if (!session) return res.json({ success: false, message: 'Сессия недействительна', error: 'invalid_session' });
    
    const admin = await db.findUser({ _id: session.userId });
    if (!admin || admin.role !== 'admin') return res.json({ success: false, message: 'Доступ запрещен' });
    
    adminLogs.length = 0;
    res.json({ success: true, message: 'Логи администратора очищены!' });
});

// Статистика по активности игроков
app.post('/api/admin/player-activity', async (req, res) => {
    const { sessionId, days = 7 } = req.body;
    const session = await db.findSession(sessionId);
    if (!session) return res.json({ success: false, message: 'Сессия недействительна', error: 'invalid_session' });
    
    const admin = await db.findUser({ _id: session.userId });
    if (!admin || admin.role !== 'admin') return res.json({ success: false, message: 'Доступ запрещен' });
    
    const users = await db.getAllUsers();
    const daysNum = parseInt(days);
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysNum);
    
    const activityStats = users.map(user => {
        const lastLogin = user.lastLogin ? new Date(user.lastLogin) : null;
        const isActive = lastLogin && lastLogin >= cutoffDate;
        
        return {
            username: user.username,
            level: user.level || 1,
            totalGames: user.totalGames || 0,
            wins: user.wins || 0,
            losses: user.losses || 0,
            lastLogin: user.lastLogin || null,
            isActive: isActive,
            daysInactive: lastLogin ? Math.floor((cutoffDate - lastLogin) / (1000 * 60 * 60 * 24)) : null
        };
    }).sort((a, b) => {
        // Сначала активные, потом по последнему логину
        if (a.isActive && !b.isActive) return -1;
        if (!a.isActive && b.isActive) return 1;
        return new Date(b.lastLogin || 0) - new Date(a.lastLogin || 0);
    });
    
    const activeCount = activityStats.filter(u => u.isActive).length;
    const inactiveCount = activityStats.filter(u => !u.isActive).length;
    
    res.json({ 
        success: true, 
        stats: {
            totalUsers: users.length,
            activeUsers: activeCount,
            inactiveUsers: inactiveCount,
            activityRate: users.length > 0 ? ((activeCount / users.length) * 100).toFixed(1) + '%' : '0%',
            periodDays: daysNum
        },
        players: activityStats
    });
});

// Управление инвентарем игрока
app.post('/api/admin/get-inventory', async (req, res) => {
    const { sessionId, username } = req.body;
    const session = await db.findSession(sessionId);
    if (!session) return res.json({ success: false, message: 'Сессия недействительна', error: 'invalid_session' });
    
    const admin = await db.findUser({ _id: session.userId });
    if (!admin || admin.role !== 'admin') return res.json({ success: false, message: 'Доступ запрещен' });
    
    const target = await db.findUserByUsername(username);
    if (!target) return res.json({ success: false, message: 'Игрок не найден' });
    
    const inventory = target.inventory || {};
    const plantChests = target.plantChests || { common: 0, rare: 0, epic: 0, mythic: 0, legendary: 0 };
    
    res.json({ 
        success: true, 
        inventory: inventory,
        plantChests: plantChests,
        totalUnits: Object.keys(inventory).length
    });
});

app.post('/api/admin/set-inventory-item', async (req, res) => {
    const { sessionId, username, unitId, unitType, level = 1, remove = false } = req.body;
    const session = await db.findSession(sessionId);
    if (!session) return res.json({ success: false, message: 'Сессия недействительна', error: 'invalid_session' });
    
    const admin = await db.findUser({ _id: session.userId });
    if (!admin || admin.role !== 'admin') return res.json({ success: false, message: 'Доступ запрещен' });
    
    const target = await db.findUserByUsername(username);
    if (!target) return res.json({ success: false, message: 'Игрок не найден' });
    
    const inventory = target.inventory || {};
    
    if (remove) {
        delete inventory[unitId];
        logAdminAction(admin.username, 'remove_inventory_item', username, { unitId, unitType });
    } else {
        inventory[unitId] = { 
            level: parseInt(level), 
            type: unitType, 
            purchased: new Date().toISOString() 
        };
        logAdminAction(admin.username, 'set_inventory_item', username, { unitId, unitType, level });
    }
    
    await db.updateUser(username, { inventory });
    res.json({ success: true, message: remove ? `Юнит ${unitId} удалён из инвентаря` : `Юнит ${unitId} добавлен в инвентарь`, inventory });
});

// Массовая рассылка уведомлений
app.post('/api/admin/broadcast-notification', async (req, res) => {
    const { sessionId, title, message, rarityColor = '#fbbf24', target = 'all' } = req.body;
    const session = await db.findSession(sessionId);
    if (!session) return res.json({ success: false, message: 'Сессия недействительна', error: 'invalid_session' });
    
    const admin = await db.findUser({ _id: session.userId });
    if (!admin || admin.role !== 'admin') return res.json({ success: false, message: 'Доступ запрещен' });
    
    const notification = {
        id: 'broadcast_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9),
        type: 'broadcast',
        title,
        message,
        rarityColor,
        createdAt: new Date().toISOString(),
        fromAdmin: admin.username
    };
    
    let usersCount = 0;
    if (target === 'all') {
        const users = await db.getAllUsers();
        usersCount = users.length;
        for (const user of users) {
            if (user.role !== 'admin') { // Не отправляем админам
                const notifications = user.notifications || [];
                notifications.push(notification);
                await db.updateUser(user.username, { notifications });
            }
        }
    } else if (target === 'online') {
        // Можно добавить логику определения онлайн пользователей через socket.io
        return res.json({ success: false, message: 'Функция онлайн-рассылки в разработке' });
    }
    
    logAdminAction(admin.username, 'broadcast_notification', 'all_users', { title, message, target });
    res.json({ success: true, message: `Уведомление отправлено ${usersCount} пользователям!` });
});

// Экспорт данных в CSV
app.post('/api/admin/export-csv', async (req, res) => {
    const { sessionId, type = 'users' } = req.body;
    const session = await db.findSession(sessionId);
    if (!session) return res.json({ success: false, message: 'Сессия недействительна', error: 'invalid_session' });
    
    const admin = await db.findUser({ _id: session.userId });
    if (!admin || admin.role !== 'admin') return res.json({ success: false, message: 'Доступ запрещен' });
    
    let csv = '';
    const typeStr = type.toLowerCase();
    
    if (typeStr === 'users') {
        const users = await db.getAllUsers();
        csv = 'Username,Role,Level,ELO,Wins,Losses,Coins,Crystals,XP,TotalGames,CreatedAt\n';
        users.forEach(user => {
            csv += `${user.username},${user.role},${user.level || 1},${user.elo || 1000},${user.wins || 0},${user.losses || 0},${user.coins || 0},${user.crystals || 0},${user.xp || 0},${user.totalGames || 0},${user.createdAt || ''}\n`;
        });
    } else if (typeStr === 'matches') {
        const matches = await db.getMatches(1000);
        csv = 'Winner,Loser,WinnerSide,Timestamp\n';
        matches.forEach(match => {
            csv += `${match.winner},${match.loser},${match.winnerSide || 'unknown'},${match.timestamp || ''}\n`;
        });
    } else if (typeStr === 'promos') {
        // Нужно добавить метод getAllPromos в database.js
        res.json({ success: false, message: 'Экспорт промокодов требует доработки базы данных' });
        return;
    }
    
    logAdminAction(admin.username, 'export_csv', typeStr, { rows: csv.split('\n').length - 1 });
    res.json({ 
        success: true, 
        csv: csv,
        filename: `${typeStr}_export_${new Date().toISOString().split('T')[0]}.csv`
    });
});

// Управление ценами магазина
app.post('/api/admin/update-shop-prices', async (req, res) => {
    const { sessionId, plantPrices, zombiePrices } = req.body;
    const session = await db.findSession(sessionId);
    if (!session) return res.json({ success: false, message: 'Сессия недействительна', error: 'invalid_session' });
    
    const admin = await db.findUser({ _id: session.userId });
    if (!admin || admin.role !== 'admin') return res.json({ success: false, message: 'Доступ запрещен' });
    
    // Валидация цен
    const validatePrices = (prices, type) => {
        for (const [item, price] of Object.entries(prices)) {
            if (typeof price !== 'number' || price < 0 || price > 10000) {
                throw new Error(`Недопустимая цена для ${type}.${item}: ${price}`);
            }
        }
    };
    
    try {
        if (plantPrices) validatePrices(plantPrices, 'plants');
        if (zombiePrices) validatePrices(zombiePrices, 'zombies');
    } catch (error) {
        return res.json({ success: false, message: error.message });
    }
    
    // Сохраняем настройки в serverSettings
    if (plantPrices) {
        serverSettings.plantPrices = { ...serverSettings.plantPrices, ...plantPrices };
    }
    if (zombiePrices) {
        serverSettings.zombiePrices = { ...serverSettings.zombiePrices, ...zombiePrices };
    }
    
    logAdminAction(admin.username, 'update_shop_prices', 'global', { plantPrices, zombiePrices });
    res.json({ success: true, message: 'Цены магазина обновлены!', settings: serverSettings });
});

// Получение расширенной статистики
app.post('/api/admin/detailed-stats', async (req, res) => {
    const { sessionId } = req.body;
    const session = await db.findSession(sessionId);
    if (!session) return res.json({ success: false, message: 'Сессия недействительна', error: 'invalid_session' });
    
    const admin = await db.findUser({ _id: session.userId });
    if (!admin || admin.role !== 'admin') return res.json({ success: false, message: 'Доступ запрещен' });
    
    const users = await db.getAllUsers();
    const matches = await db.getMatches(1000);
    
    // Расчет статистики
    const totalUsers = users.length;
    const activeUsers = users.filter(u => {
        const lastLogin = u.lastLogin ? new Date(u.lastLogin) : null;
        return lastLogin && (Date.now() - lastLogin.getTime()) < 7 * 24 * 60 * 60 * 1000;
    }).length;
    
    const totalGamesPlayed = users.reduce((sum, u) => sum + (u.totalGames || 0), 0);
    const totalWins = users.reduce((sum, u) => sum + (u.wins || 0), 0);
    const totalLosses = users.reduce((sum, u) => sum + (u.losses || 0), 0);
    
    const avgLevel = totalUsers > 0 ? (users.reduce((sum, u) => sum + (u.level || 1), 0) / totalUsers).toFixed(1) : 0;
    const avgWinRate = totalGamesPlayed > 0 ? ((totalWins / totalGamesPlayed) * 100).toFixed(1) + '%' : '0%';
    
    // Распределение по уровням
    const levelDistribution = {};
    users.forEach(u => {
        const level = u.level || 1;
        levelDistribution[level] = (levelDistribution[level] || 0) + 1;
    });
    
    // Топ по монетам
    const topCoins = users
        .sort((a, b) => (b.coins || 0) - (a.coins || 0))
        .slice(0, 10)
        .map(u => ({ username: u.username, coins: u.coins || 0, level: u.level || 1 }));
    
    // Топ по ELO
    const topElo = users
        .filter(u => u.role !== 'banned')
        .sort((a, b) => (b.elo || 1000) - (a.elo || 1000))
        .slice(0, 10)
        .map(u => ({ username: u.username, elo: u.elo || 1000, wins: u.wins || 0 }));
    
    res.json({ 
        success: true, 
        stats: {
            totalUsers,
            activeUsers,
            inactiveUsers: totalUsers - activeUsers,
            totalGamesPlayed,
            totalWins,
            totalLosses,
            avgLevel,
            avgWinRate,
            levelDistribution,
            topCoins,
            topElo,
            recentMatches: matches.slice(0, 20)
        }
    });
});

// Поиск пользователей по расширенным критериям
app.post('/api/admin/advanced-search', async (req, res) => {
    const { sessionId, query, filters = {} } = req.body;
    const session = await db.findSession(sessionId);
    if (!session) return res.json({ success: false, message: 'Сессия недействительна', error: 'invalid_session' });
    
    const admin = await db.findUser({ _id: session.userId });
    if (!admin || admin.role !== 'admin') return res.json({ success: false, message: 'Доступ запрещен' });
    
    let users = await db.getAllUsers();
    
    // Поиск по имени
    if (query) {
        const queryLower = query.toLowerCase();
        users = users.filter(u => 
            u.username.toLowerCase().includes(queryLower) ||
            (u.usernameLower && u.usernameLower.includes(queryLower))
        );
    }
    
    // Фильтры
    if (filters.role) {
        users = users.filter(u => u.role === filters.role);
    }
    if (filters.minLevel) {
        users = users.filter(u => (u.level || 1) >= parseInt(filters.minLevel));
    }
    if (filters.maxLevel) {
        users = users.filter(u => (u.level || 1) <= parseInt(filters.maxLevel));
    }
    if (filters.minWins) {
        users = users.filter(u => (u.wins || 0) >= parseInt(filters.minWins));
    }
    if (filters.hasBattlePassPremium !== undefined) {
        users = users.filter(u => u.battlePass?.isPremium === filters.hasBattlePassPremium);
    }
    if (filters.inactiveDays) {
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - parseInt(filters.inactiveDays));
        users = users.filter(u => {
            const lastLogin = u.lastLogin ? new Date(u.lastLogin) : null;
            return !lastLogin || lastLogin < cutoffDate;
        });
    }
    
    res.json({ 
        success: true, 
        users: users.map(u => ({
            username: u.username,
            role: u.role,
            level: u.level || 1,
            elo: u.elo || 1000,
            wins: u.wins || 0,
            losses: u.losses || 0,
            coins: u.coins || 0,
            crystals: u.crystals || 0,
            totalGames: u.totalGames || 0,
            lastLogin: u.lastLogin || null,
            battlePassPremium: !!u.battlePass?.isPremium,
            createdAt: u.createdAt || null
        })),
        total: users.length
    });
});

// Управление бот-сложностью (глобально)
app.post('/api/admin/set-global-bot-difficulty', async (req, res) => {
    const { sessionId, difficulty } = req.body;
    const session = await db.findSession(sessionId);
    if (!session) return res.json({ success: false, message: 'Сессия недействительна', error: 'invalid_session' });
    
    const admin = await db.findUser({ _id: session.userId });
    if (!admin || admin.role !== 'admin') return res.json({ success: false, message: 'Доступ запрещен' });
    
    if (!['easy', 'medium', 'hard'].includes(difficulty)) {
        return res.json({ success: false, message: 'Недопустимая сложность. Используйте: easy, medium, hard' });
    }
    
    serverSettings.defaultBotDifficulty = difficulty;
    logAdminAction(admin.username, 'set_global_bot_difficulty', 'global', { difficulty });
    res.json({ success: true, message: `Глобальная сложность ботов изменена на: ${difficulty}` });
});

// Получение онлайн-статистики
app.post('/api/admin/online-stats', async (req, res) => {
    const { sessionId } = req.body;
    const session = await db.findSession(sessionId);
    if (!session) return res.json({ success: false, message: 'Сессия недействительна', error: 'invalid_session' });
    
    const admin = await db.findUser({ _id: session.userId });
    if (!admin || admin.role !== 'admin') return res.json({ success: false, message: 'Доступ запрещен' });
    
    const sessions = await db.getAllSessions();
    const now = Date.now();
    const SESSION_TIMEOUT = 30 * 60 * 1000; // 30 минут
    
    const activeSessions = sessions.filter(s => {
        const createdAt = new Date(s.createdAt).getTime();
        return (now - createdAt) < SESSION_TIMEOUT;
    });
    
    // Группируем по пользователям
    const onlineUsers = new Set(activeSessions.map(s => s.userId.toString()));
    
    res.json({ 
        success: true, 
        stats: {
            totalSessions: sessions.length,
            activeSessions: activeSessions.length,
            onlineUsers: onlineUsers.size,
            sessionTimeoutMinutes: SESSION_TIMEOUT / (60 * 1000)
        }
    });
});

const PORT = process.env.PORT || 3000;

// Глобальный обработчик ошибок (должен быть после всех маршрутов)
app.use((err, req, res, next) => {
    console.error('[ERROR]', req.method, req.url, err.stack);
    if (!res.headersSent) {
        res.status(500).json({ success: false, message: 'Internal Server Error', error: err.message });
    }
});

// Глобальные обработчики для непойманных промисов и исключений
process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

process.on('uncaughtException', (err) => {
    console.error('Uncaught Exception:', err);
});

async function startServer() {
    // Инициализируем базу данных MongoDB
    await initDatabase();
    
    server.listen(PORT, () => {
        console.log(`\n🌻 СЕРВЕР ЗАПУЩЕН на порту ${PORT}!`);
        console.log('🌐 Откройте: http://localhost:3000');
        console.log('🔑 Админ: логин - admin, пароль - admin123');
        console.log('💾 База данных: MongoDB');
        console.log('🤖 Бот-система: включена\n');
    });
}

startServer();
