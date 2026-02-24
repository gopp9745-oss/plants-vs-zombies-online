const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const path = require('path');
const { MongoClient, ObjectId } = require('mongodb');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.json());

// Cache control middleware - disable caching
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

// ==================== MONGODB ПОДКЛЮЧЕНИЕ ====================
const MONGO_URI = process.env.MONGO_URI || 'mongodb+srv://grimteam:kolop908@cluster0.iifadf8.mongodb.net/?retryWrites=true&w=majority';
const DB_NAME = 'pvz_online';

let db = null;
let usersCollection = null;
let matchesCollection = null;
let promosCollection = null;
let salesCollection = null;
let sessionsCollection = null;
let seasonsCollection = null;

// ==================== ELO РЕЙТИНГ ====================
const ELO_CONFIG = {
    initial: 1000,
    kFactor: 32, // Коэффициент K для расчёта ELO
    minRating: 100,
    maxRating: 3000
};

// Функция расчёта ELO
function calculateEloChange(winnerElo, loserElo, isDraw = false) {
    const expectedWinner = 1 / (1 + Math.pow(10, (loserElo - winnerElo) / 400));
    const expectedLoser = 1 / (1 + Math.pow(10, (winnerElo - loserElo) / 400));
    
    let winnerChange, loserChange;
    
    if (isDraw) {
        winnerChange = Math.round(ELO_CONFIG.kFactor * (0.5 - expectedWinner));
        loserChange = Math.round(ELO_CONFIG.kFactor * (0.5 - expectedLoser));
    } else {
        winnerChange = Math.round(ELO_CONFIG.kFactor * (1 - expectedWinner));
        loserChange = Math.round(ELO_CONFIG.kFactor * (0 - expectedLoser));
    }
    
    return { winnerChange, loserChange };
}

// ==================== СЕЗОНЫ ====================
const SEASONS = [
    { id: 1, name: 'Сезон 1: Весна', startDate: '2024-03-01', endDate: '2024-05-31', reward: 1000, rewards: { top1: 500, top3: 300, top10: 150, top50: 50 } },
    { id: 2, name: 'Сезон 2: Лето', startDate: '2024-06-01', endDate: '2024-08-31', reward: 1500, rewards: { top1: 750, top3: 450, top10: 225, top50: 75 } },
    { id: 3, name: 'Сезон 3: Осень', startDate: '2024-09-01', endDate: '2024-11-30', reward: 2000, rewards: { top1: 1000, top3: 600, top10: 300, top50: 100 } },
    { id: 4, name: 'Сезон 4: Зима', startDate: '2024-12-01', endDate: '2025-02-28', reward: 2500, rewards: { top1: 1250, top3: 750, top10: 375, top50: 125 } },
    { id: 5, name: 'Сезон 5: Новая Эра', startDate: '2025-03-01', endDate: '2025-05-31', reward: 3000, rewards: { top1: 1500, top3: 900, top10: 450, top50: 150 } }
];

function getCurrentSeason() {
    const now = new Date();
    // Ищем активный сезон
    const activeSeason = SEASONS.find(s => {
        const start = new Date(s.startDate);
        const end = new Date(s.endDate);
        return now >= start && now <= end;
    });
    // Если нет активного, возвращаем последний сезон с дефолтными наградами
    if (!activeSeason) {
        return {
            ...SEASONS[SEASONS.length - 1],
            rewards: { top1: 500, top3: 300, top10: 150, top50: 50 }
        };
    }
    return activeSeason;
}

// ==================== УЛУЧШЕННЫЕ ДОСТИЖЕНИЯ ====================
const ACHIEVEMENTS = [
    // Победы
    { id: 'first_win', name: 'Первая победа', desc: 'Выиграйте первый матч', icon: '🎉', reward: 50, category: 'wins', requirement: 1 },
    { id: 'wins_10', name: 'Новичок бой', desc: '10 побед', icon: '⭐', reward: 100, category: 'wins', requirement: 10 },
    { id: 'wins_50', name: 'Опытный боец', desc: '50 побед', icon: '🌟', reward: 250, category: 'wins', requirement: 50 },
    { id: 'wins_100', name: 'Мастер арены', desc: '100 побед', icon: '🏆', reward: 500, category: 'wins', requirement: 100 },
    { id: 'wins_500', name: 'Легенда PvZ', desc: '500 побед', icon: '👑', reward: 2000, category: 'wins', requirement: 500 },
    
    // Монеты
    { id: 'coins_1000', name: 'Тысячник', desc: 'Соберите 1000 монет за всё время', icon: '💰', reward: 100, category: 'coins', requirement: 1000 },
    { id: 'coins_10000', name: 'Богач', desc: 'Соберите 10000 монет', icon: '💎', reward: 500, category: 'coins', requirement: 10000 },
    { id: 'coins_50000', name: 'Миллионер', desc: 'Соберите 50000 монет', icon: '🤑', reward: 2000, category: 'coins', requirement: 50000 },
    
    // Уровень
    { id: 'level_5', name: 'Растущий', desc: 'Достигните 5 уровня', icon: '📈', reward: 150, category: 'level', requirement: 5 },
    { id: 'level_10', name: 'Продвинутый', desc: 'Достигните 10 уровня', icon: '🚀', reward: 300, category: 'level', requirement: 10 },
    { id: 'level_20', name: 'Мастер', desc: 'Достигните 20 уровня', icon: '🎖️', reward: 750, category: 'level', requirement: 20 },
    { id: 'level_30', name: 'Король PvZ', desc: 'Достигните 30 уровня', icon: '🏅', reward: 1500, category: 'level', requirement: 30 },
    
    // Серия побед
    { id: 'streak_3', name: 'Серия побед', desc: '3 победы подряд', icon: '🔥', reward: 75, category: 'streak', requirement: 3 },
    { id: 'streak_5', name: 'Непобедимый', desc: '5 побед подряд', icon: '⚡', reward: 150, category: 'streak', requirement: 5 },
    { id: 'streak_10', name: 'Бог арены', desc: '10 побед подряд', icon: '💥', reward: 500, category: 'streak', requirement: 10 },
    
    // Игры
    { id: 'games_50', name: 'Ветеран', desc: 'Сыграйте 50 матчей', icon: '🎮', reward: 200, category: 'games', requirement: 50 },
    { id: 'games_100', name: 'Завсегдатай', desc: 'Сыграйте 100 матчей', icon: '🕹️', reward: 400, category: 'games', requirement: 100 },
    { id: 'games_500', name: 'Геймер', desc: 'Сыграйте 500 матчей', icon: '🎯', reward: 1000, category: 'games', requirement: 500 },
    
    // ELO
    { id: 'elo_1200', name: 'Серебро', desc: 'Достигните 1200 ELO', icon: '🥈', reward: 200, category: 'elo', requirement: 1200 },
    { id: 'elo_1500', name: 'Золото', desc: 'Достигните 1500 ELO', icon: '🥇', reward: 500, category: 'elo', requirement: 1500 },
    { id: 'elo_2000', name: 'Платина', desc: 'Достигните 2000 ELO', icon: '💠', reward: 1000, category: 'elo', requirement: 2000 },
    { id: 'elo_2500', name: 'Алмаз', desc: 'Достигните 2500 ELO', icon: '💎', reward: 2500, category: 'elo', requirement: 2500 },
    
    // Сезонные
    { id: 'season_winner', name: 'Чемпион сезона', desc: 'Займите 1 место в сезоне', icon: '🏆', reward: 5000, category: 'season', requirement: 1 },
    { id: 'season_top10', name: 'Топ-10 сезона', desc: 'Войдите в топ-10 сезона', icon: '🌟', reward: 1000, category: 'season', requirement: 10 }
];

const ACHIEVEMENT_CATEGORIES = {
    wins: { name: 'Победы', icon: '🏆', color: '#fbbf24' },
    coins: { name: 'Монеты', icon: '💰', color: '#fbbf24' },
    level: { name: 'Уровень', icon: '📊', color: '#6366f1' },
    streak: { name: 'Серии', icon: '🔥', color: '#ef4444' },
    games: { name: 'Игры', icon: '🎮', color: '#4ade80' },
    elo: { name: 'Рейтинг', icon: '⭐', color: '#8b5cf6' },
    season: { name: 'Сезон', icon: '🏅', color: '#f472b6' }
};

async function connectDB() {
    try {
        const client = new MongoClient(MONGO_URI);
        await client.connect();
        db = client.db(DB_NAME);
        
        usersCollection = db.collection('users');
        matchesCollection = db.collection('matches');
        promosCollection = db.collection('promos');
        salesCollection = db.collection('sales');
        sessionsCollection = db.collection('sessions');
        
        await usersCollection.createIndex({ username: 1 }, { unique: true });
        await sessionsCollection.createIndex({ sessionId: 1 });
        
        // Friends collection
        const friendsCollection = db.collection('friends');
        await friendsCollection.createIndex({ userId: 1 });
        
        console.log('✓ Подключено к MongoDB');
        
        const adminExists = await usersCollection.findOne({ username: 'admin' });
        if (!adminExists) {
            await usersCollection.insertOne({
                username: 'admin',
                password: bcrypt.hashSync('admin123', 10),
                role: 'admin',
                coins: 0,
                wins: 0,
                losses: 0,
                xp: 0,
                level: 1,
                createdAt: new Date(),
                lastDaily: null,
                totalGames: 0,
                longestWinStreak: 0,
                currentWinStreak: 0,
                achievements: [],
                dailyQuests: [],
                dailyQuestsDate: null,
                dailyQuestsGames: 0,
                dailyQuestsWins: 0,
                dailyQuestsCoins: 0,
                dailyQuestsUnits: 0,
                dailyQuestsChat: 0
            });
            console.log('✓ Создан админ');
        }
    } catch (e) {
        console.error('Ошибка подключения к MongoDB:', e.message);
        process.exit(1);
    }
}

// ==================== БОТЫ ====================
const BOT_NAMES = ['ЗомбиКиллер', 'Садовник2000', 'МозгОхотник', 'Растениевод', 'ЗеленаяАрмия', 'Огородник', 'БотМастер', 'ИИСадовод', 'ЭкоБоец', 'ЗеленыйВоиН'];
const BOT_DIFFICULTIES = {
    easy: { name: 'Легкий', spawnRate: 0.3, aggression: 0.3 },
    medium: { name: 'Средний', spawnRate: 0.5, aggression: 0.5 },
    hard: { name: 'Сложный', spawnRate: 0.8, aggression: 0.8 }
};

function createBot(difficulty = 'medium', side) {
    return {
        id: 'bot_' + uuidv4().substring(0, 8),
        username: BOT_NAMES[Math.floor(Math.random() * BOT_NAMES.length)] + Math.floor(Math.random() * 100),
        side: side,
        isBot: true,
        difficulty: difficulty,
        level: Math.floor(Math.random() * 10) + 1,
        coins: 100,
        _id: 'bot_' + Date.now()
    };
}

// ==================== МАГАЗИН ====================
let shopItems = [];
const ALL_PLANTS = ['sunflower','peashooter','wallnut','cherrybomb','iceshroom','snowpea','chomper','repeater','squash','twinsunflower','melonpult','cattail'];
const ALL_ZOMBIES = ['zombie','conehead','buckethead','football','dancing','dolphin','digger','bungee','gargantuar','yeti','king','dr'];
const PLANT_PRICES = { sunflower:50, peashooter:50, wallnut:75, cherrybomb:150, iceshroom:75, snowpea:75, chomper:75, repeater:100, squash:100, twinsunflower:150, melonpult:200, cattail:150 };
const ZOMBIE_PRICES = { zombie:50, conehead:75, buckethead:100, football:125, dancing:100, dolphin:100, digger:125, bungee:150, gargantuar:300, yeti:200, king:250, dr:300 };

// Уровни юнитов для разблокировки
const UNIT_LEVELS = {
    // Растения
    sunflower: 1, peashooter: 1, wallnut: 1, potatomine: 1, puffshroom: 1, scaredyshroom: 1,
    cherrybomb: 3, snowpea: 3, chomper: 3, repeater: 3, iceshroom: 5, squash: 5, magnetshroom: 5,
    tallnut: 5, twinsunflower: 10, melonpult: 10, cattail: 10, moonglow: 15, hypnoshroom: 15,
    // Зомби
    zombie: 1, conehead: 1, buckethead: 1,
    football: 3, dancing: 3, dolphin: 3, newspaper: 3,
    digger: 5, bungee: 5, pogo: 5, catapult: 5,
    gargantuar: 5, yeti: 10, king: 10, dr: 10
};

// Стоимость улучшения юнита (за каждый уровень)
function getUpgradePrice(basePrice, level) {
    return Math.floor(basePrice * (1 + level * 0.5));
}

function generateShopItems(userLevel = 1) {
    // Фильтруем юниты по уровню игрока
    const availablePlants = ALL_PLANTS.filter(id => (UNIT_LEVELS[id] || 1) <= userLevel);
    const availableZombies = ALL_ZOMBIES.filter(id => (UNIT_LEVELS[id] || 1) <= userLevel);
    
    const shuffledPlants = [...availablePlants].sort(() => Math.random() - 0.5);
    const plants = shuffledPlants.slice(0, Math.min(4, availablePlants.length)).map(id => ({
        id, type: 'plant', price: PLANT_PRICES[id] || 50
    }));
    const shuffledZombies = [...availableZombies].sort(() => Math.random() - 0.5);
    const zombies = shuffledZombies.slice(0, Math.min(3, availableZombies.length)).map(id => ({
        id, type: 'zombie', price: ZOMBIE_PRICES[id] || 50
    }));
    shopItems = [...plants, ...zombies];
    console.log('Магазин обновлён для уровня ' + userLevel + ':', shopItems.map(p => `${p.type}:${p.id}`).join(', '));
}

const SHOP_UPDATE_INTERVAL = 5 * 60 * 1000;
let lastShopUpdate = Date.now();

generateShopItems();
setInterval(generateShopItems, SHOP_UPDATE_INTERVAL);

app.get('/api/shop', (req, res) => {
    const nextUpdate = Math.max(0, SHOP_UPDATE_INTERVAL - (Date.now() - lastShopUpdate));
    res.json({ success: true, items: shopItems, nextUpdate: nextUpdate, unitLevels: UNIT_LEVELS });
});

// ==================== ИНВЕНТАРЬ ПОЛЬЗОВАТЕЛЯ ====================

// Получить инвентарь пользователя
app.post('/api/inventory', async (req, res) => {
    const { sessionId } = req.body;
    const session = await sessionsCollection.findOne({ sessionId });
    if (!session) return res.json({ success: false, message: 'Сессия недействительна' });
    
    const user = await usersCollection.findOne({ _id: new ObjectId(session.userId) });
    if (!user) return res.json({ success: false, message: 'Пользователь не найден' });
    
    // Инвентарь: купленные юниты с уровнями прокачки
    const inventory = user.inventory || {};
    
    res.json({ 
        success: true, 
        inventory: inventory,
        userLevel: user.level
    });
});

// Купить юнита
app.post('/api/buy-unit', async (req, res) => {
    const { sessionId, unitId, unitType } = req.body;
    const session = await sessionsCollection.findOne({ sessionId });
    if (!session) return res.json({ success: false, message: 'Сессия недействительна' });
    
    const user = await usersCollection.findOne({ _id: new ObjectId(session.userId) });
    if (!user) return res.json({ success: false, message: 'Пользователь не найден' });
    
    // Проверяем уровень для разблокировки
    const requiredLevel = UNIT_LEVELS[unitId] || 1;
    if (user.level < requiredLevel) {
        return res.json({ success: false, message: `Нужен уровень ${requiredLevel} для этого юнита!` });
    }
    
    // Получаем цену
    const prices = unitType === 'plant' ? PLANT_PRICES : ZOMBIE_PRICES;
    const price = prices[unitId] || 50;
    
    if (user.coins < price) {
        return res.json({ success: false, message: 'Недостаточно монет!' });
    }
    
    // Инициализируем инвентарь если нет
    const inventory = user.inventory || {};
    
    // Проверяем, не куплен ли уже
    if (inventory[unitId]) {
        return res.json({ success: false, message: 'Этот юнит уже куплен!' });
    }
    
    // Покупаем юнита
    inventory[unitId] = {
        level: 1,
        type: unitType,
        purchased: new Date()
    };
    
    await usersCollection.updateOne(
        { _id: user._id },
        { 
            $inc: { coins: -price },
            $set: { inventory: inventory }
        }
    );
    
    res.json({ 
        success: true, 
        message: `${unitId} куплен за ${price} монет!`,
        inventory: inventory,
        coins: user.coins - price
    });
});

// Улучшить юнита
app.post('/api/upgrade-unit', async (req, res) => {
    const { sessionId, unitId } = req.body;
    const session = await sessionsCollection.findOne({ sessionId });
    if (!session) return res.json({ success: false, message: 'Сессия недействительна' });
    
    const user = await usersCollection.findOne({ _id: new ObjectId(session.userId) });
    if (!user) return res.json({ success: false, message: 'Пользователь не найден' });
    
    const inventory = user.inventory || {};
    
    if (!inventory[unitId]) {
        return res.json({ success: false, message: 'У вас нет этого юнита!' });
    }
    
    const currentLevel = inventory[unitId].level || 1;
    const maxLevel = 10;
    
    if (currentLevel >= maxLevel) {
        return res.json({ success: false, message: 'Максимальный уровень достигнут!' });
    }
    
    // Базовая цена
    const prices = inventory[unitId].type === 'plant' ? PLANT_PRICES : ZOMBIE_PRICES;
    const basePrice = prices[unitId] || 50;
    const upgradePrice = getUpgradePrice(basePrice, currentLevel);
    
    if (user.coins < upgradePrice) {
        return res.json({ success: false, message: `Недостаточно монет! Нужно ${upgradePrice}` });
    }
    
    // Улучшаем юнита
    inventory[unitId].level = currentLevel + 1;
    
    await usersCollection.updateOne(
        { _id: user._id },
        { 
            $inc: { coins: -upgradePrice },
            $set: { inventory: inventory }
        }
    );
    
    res.json({ 
        success: true, 
        message: `${unitId} улучшен до уровня ${currentLevel + 1}!`,
        inventory: inventory,
        coins: user.coins - upgradePrice,
        newLevel: currentLevel + 1
    });
});

// ==================== КВЕСТЫ ====================
const DAILY_QUESTS = [
    { id: 'play_1_game', name: 'Первая игра', desc: 'Сыграйте 1 матч', reward: 30, type: 'games' },
    { id: 'play_3_games', name: 'Боец', desc: 'Сыграйте 3 матча', reward: 75, type: 'games', target: 3 },
    { id: 'win_1_game', name: 'Победа', desc: 'Выиграйте 1 матч', reward: 50, type: 'wins', target: 1 },
    { id: 'win_2_games', name: 'На победу', desc: 'Выиграйте 2 матча', reward: 100, type: 'wins', target: 2 },
    { id: 'earn_100_coins', name: 'Копилка', desc: 'Заработайте 100 монет', reward: 25, type: 'coins', target: 100 },
    { id: 'earn_300_coins', name: 'Богач', desc: 'Заработайте 300 монет', reward: 75, type: 'coins', target: 300 },
    { id: 'use_5_units', name: 'Командир', desc: 'Разместите 5 юнитов', reward: 40, type: 'units', target: 5 },
    { id: 'chat_3_times', name: 'Болтун', desc: 'Напишите 3 сообщения', reward: 20, type: 'chat', target: 3 }
];

function generateDailyQuests() {
    const shuffled = [...DAILY_QUESTS].sort(() => Math.random() - 0.5);
    return shuffled.slice(0, 3).map(q => ({...q, progress: 0, completed: false}));
}

app.post('/api/daily-quests', async (req, res) => {
    const { sessionId } = req.body;
    const session = await sessionsCollection.findOne({ sessionId });
    if (!session) return res.json({ success: false });
    
    const user = await usersCollection.findOne({ _id: new ObjectId(session.userId) });
    if (!user) return res.json({ success: false });
    
    const today = new Date().toDateString();
    if (!user.dailyQuests || user.dailyQuestsDate !== today) {
        await usersCollection.updateOne(
            { _id: user._id },
            { $set: { 
                dailyQuests: generateDailyQuests(), 
                dailyQuestsDate: today,
                dailyQuestsGames: 0,
                dailyQuestsWins: 0,
                dailyQuestsCoins: 0,
                dailyQuestsUnits: 0,
                dailyQuestsChat: 0
            }}
        );
        user.dailyQuests = generateDailyQuests();
        user.dailyQuestsDate = today;
    }
    
    res.json({ success: true, quests: user.dailyQuests, date: user.dailyQuestsDate });
});

app.post('/api/update-quest', async (req, res) => {
    const { sessionId, type, amount } = req.body;
    const session = await sessionsCollection.findOne({ sessionId });
    if (!session) return res.json({ success: false });
    
    const user = await usersCollection.findOne({ _id: new ObjectId(session.userId) });
    if (!user || !user.dailyQuests) return res.json({ success: false });
    
    const today = new Date().toDateString();
    if (user.dailyQuestsDate !== today) return res.json({ success: false });
    
    const updateField = `dailyQuests${type.charAt(0).toUpperCase() + type.slice(1)}`;
    await usersCollection.updateOne(
        { _id: user._id },
        { $inc: { [updateField]: amount || 1 } }
    );
    
    const updatedUser = await usersCollection.findOne({ _id: user._id });
    let newRewards = [];
    
    for (const quest of updatedUser.dailyQuests) {
        if (quest.completed) continue;
        
        let progress = 0;
        switch(quest.type) {
            case 'games': progress = updatedUser.dailyQuestsGames || 0; break;
            case 'wins': progress = updatedUser.dailyQuestsWins || 0; break;
            case 'coins': progress = updatedUser.dailyQuestsCoins || 0; break;
            case 'units': progress = updatedUser.dailyQuestsUnits || 0; break;
            case 'chat': progress = updatedUser.dailyQuestsChat || 0; break;
        }
        
        const target = quest.target || 1;
        if (progress >= target) {
            quest.completed = true;
            quest.progress = target;
            updatedUser.coins += quest.reward;
            newRewards.push(quest);
        } else {
            quest.progress = progress;
        }
    }
    
    await usersCollection.updateOne(
        { _id: user._id },
        { $set: { dailyQuests: updatedUser.dailyQuests, coins: updatedUser.coins }}
    );
    
    res.json({ success: true, quests: updatedUser.dailyQuests, newRewards });
});

// ==================== ДОСТИЖЕНИЯ ====================
// Используем улучшенные ACHIEVEMENTS с категориями (объявлены выше)

async function checkAchievements(user) {
    const newAchievements = [];
    const userAchievements = user.achievements || [];
    const userElo = user.elo || ELO_CONFIG.initial;
    const userTotalCoins = user.totalCoins || user.coins;
    
    for (const ach of ACHIEVEMENTS) {
        if (userAchievements.includes(ach.id)) continue;
        
        let unlocked = false;
        let currentValue = 0;
        
        switch (ach.category) {
            case 'wins': currentValue = user.wins || 0; unlocked = currentValue >= ach.requirement; break;
            case 'coins': currentValue = userTotalCoins; unlocked = currentValue >= ach.requirement; break;
            case 'level': currentValue = user.level || 1; unlocked = currentValue >= ach.requirement; break;
            case 'streak': currentValue = user.currentWinStreak || 0; unlocked = currentValue >= ach.requirement; break;
            case 'games': currentValue = (user.wins || 0) + (user.losses || 0); unlocked = currentValue >= ach.requirement; break;
            case 'elo': currentValue = userElo; unlocked = currentValue >= ach.requirement; break;
        }
        
        if (unlocked) {
            userAchievements.push(ach.id);
            user.coins += ach.reward;
            newAchievements.push(ach);
        }
    }
    
    await usersCollection.updateOne(
        { _id: user._id },
        { $set: { achievements: userAchievements, coins: user.coins }}
    );
    
    return newAchievements;
}

app.get('/api/achievements', (req, res) => {
    res.json({ success: true, achievements: ACHIEVEMENTS });
});

app.post('/api/check-achievements', async (req, res) => {
    const { sessionId } = req.body;
    const session = await sessionsCollection.findOne({ sessionId });
    if (!session) return res.json({ success: false });
    
    const user = await usersCollection.findOne({ _id: new ObjectId(session.userId) });
    if (!user) return res.json({ success: false });
    
    const newAchievements = await checkAchievements(user);
    
    res.json({ success: true, newAchievements, userAchievements: user.achievements || [] });
});

// ==================== УРОВНИ ====================
function getXPForLevel(level) {
    return level * 100 + level * level * 10;
}

const LEVEL_REWARDS = {
    2: { coins: 100, title: 'Новичок' },
    3: { coins: 150, title: 'Опытный' },
    5: { coins: 250, title: 'Боец' },
    7: { coins: 400, title: 'Ветеран' },
    10: { coins: 600, title: 'Мастер' },
    15: { coins: 1000, title: 'Грандмастер' },
    20: { coins: 1500, title: 'Легенда' },
    25: { coins: 2000, title: 'Чемпион' },
    30: { coins: 3000, title: 'Король PvZ' }
};

async function addXP(user, amount) {
    const oldLevel = user.level;
    user.xp += amount;
    while (user.xp >= getXPForLevel(user.level)) {
        user.xp -= getXPForLevel(user.level);
        user.level++;
        user.coins += 50;
        
        if (LEVEL_REWARDS[user.level]) {
            user.coins += LEVEL_REWARDS[user.level].coins;
        }
    }
    
    await usersCollection.updateOne(
        { _id: user._id },
        { $set: { xp: user.xp, level: user.level, coins: user.coins }}
    );
    
    return user.level > oldLevel;
}

app.get('/api/level-rewards', (req, res) => {
    res.json({ success: true, rewards: LEVEL_REWARDS });
});

// ==================== API ROUTES ====================

app.post('/api/register', async (req, res) => {
    const { username, password } = req.body;
    
    if (!username || !password) {
        return res.json({ success: false, message: 'Заполните все поля' });
    }
    
    if (username.length < 3 || username.length > 20) {
        return res.json({ success: false, message: 'Имя пользователя 3-20 символов' });
    }
    
    if (password.length < 4) {
        return res.json({ success: false, message: 'Пароль минимум 4 символа' });
    }
    
    const existing = await usersCollection.findOne({ username: username.toLowerCase() });
    if (existing) {
        return res.json({ success: false, message: 'Пользователь уже существует' });
    }
    
    await usersCollection.insertOne({
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
        createdAt: new Date(),
        lastDaily: null,
        totalGames: 0,
        longestWinStreak: 0,
        currentWinStreak: 0,
        achievements: [],
        dailyQuests: [],
        dailyQuestsDate: null
    });
    
    res.json({ success: true, message: 'Регистрация успешна!' });
});

app.post('/api/login', async (req, res) => {
    const { username, password } = req.body;
    
    const user = await usersCollection.findOne({ username: username.toLowerCase() });
    if (!user || !bcrypt.compareSync(password, user.password)) {
        return res.json({ success: false, message: 'Неверное имя пользователя или пароль' });
    }
    
    if (user.role === 'banned') {
        return res.json({ success: false, message: 'Ваш аккаунт заблокирован' });
    }
    
    const sessionId = uuidv4();
    await sessionsCollection.insertOne({
        sessionId,
        userId: user._id.toString(),
        createdAt: new Date()
    });
    
    res.json({ 
        success: true, 
        user: { 
            username: user.username, 
            role: user.role, 
            coins: user.coins, 
            wins: user.wins, 
            losses: user.losses,
            xp: user.xp,
            level: user.level,
            totalGames: user.totalGames,
            elo: user.elo || ELO_CONFIG.initial,
            seasonElo: user.seasonElo || ELO_CONFIG.initial,
            currentSeason: user.currentSeason || 1
        }
    });
});

// ==================== ELO API ====================

// Получить свой ELO
app.post('/api/elo', async (req, res) => {
    const { sessionId } = req.body;
    const session = await sessionsCollection.findOne({ sessionId });
    if (!session) return res.json({ success: false, message: 'Сессия недействительна' });
    
    const user = await usersCollection.findOne({ _id: new ObjectId(session.userId) });
    if (!user) return res.json({ success: false, message: 'Пользователь не найден' });
    
    const elo = user.elo || ELO_CONFIG.initial;
    const rankObj = getEloRank(elo);
    
    res.json({ 
        success: true, 
        elo: elo,
        seasonElo: user.seasonElo || ELO_CONFIG.initial,
        rank: rankObj.name,  // Возвращаем строку
        rankInfo: rankObj   // И объект с полной информацией
    });
});

function getEloRank(elo) {
    if (elo >= 2500) return { name: 'Алмаз', icon: '💎', color: '#00d4ff' };
    if (elo >= 2000) return { name: 'Платина', icon: '💠', color: '#8b5cf6' };
    if (elo >= 1500) return { name: 'Золото', icon: '🥇', color: '#fbbf24' };
    if (elo >= 1200) return { name: 'Серебро', icon: '🥈', color: '#94a3b8' };
    if (elo >= 1000) return { name: 'Бронза', icon: '🥉', color: '#cd7f32' };
    return { name: 'Новичок', icon: '🌱', color: '#22c55e' };
}

// Лидерборд по ELO
app.get('/api/leaderboard-elo', async (req, res) => {
    const leaders = await usersCollection
        .find({ role: { $ne: 'banned' }})
        .sort({ elo: -1 })
        .limit(10)
        .project({ username: 1, elo: 1, seasonElo: 1, wins: 1, level: 1 })
        .toArray();
    
    res.json({ success: true, leaders });
});

// Лидерборд по сезонному ELO
app.get('/api/leaderboard-season', async (req, res) => {
    const currentSeason = getCurrentSeason();
    const leaders = await usersCollection
        .find({ role: { $ne: 'banned' }})
        .sort({ seasonElo: -1 })
        .limit(10)
        .project({ username: 1, seasonElo: 1, elo: 1, wins: 1, level: 1 })
        .toArray();
    
    res.json({ success: true, leaders, season: currentSeason });
});

// ==================== СЕЗОНЫ API ====================

// Получить информацию о сезоне
app.get('/api/seasons', (req, res) => {
    const currentSeason = getCurrentSeason();
    res.json({ success: true, seasons: SEASONS, currentSeason });
});

// Получить награды сезона
app.post('/api/season-rewards', async (req, res) => {
    const { sessionId } = req.body;
    const session = await sessionsCollection.findOne({ sessionId });
    if (!session) return res.json({ success: false, message: 'Сессия недействительна' });
    
    const user = await usersCollection.findOne({ _id: new ObjectId(session.userId) });
    if (!user) return res.json({ success: false, message: 'Пользователь не найден' });
    
    const currentSeason = getCurrentSeason();
    const seasonRank = await usersCollection.countDocuments({ 
        role: { $ne: 'banned' }, 
        seasonElo: { $gt: user.seasonElo || ELO_CONFIG.initial }
    }) + 1;
    
    let reward = 0;
    let rankTitle = '';
    
    if (seasonRank === 1) {
        reward = currentSeason.reward * 2;
        rankTitle = 'Чемпион!';
    } else if (seasonRank <= 3) {
        reward = Math.floor(currentSeason.reward * 1.5);
        rankTitle = 'Топ-3';
    } else if (seasonRank <= 10) {
        reward = currentSeason.reward;
        rankTitle = 'Топ-10';
    } else if (seasonRank <= 50) {
        reward = Math.floor(currentSeason.reward * 0.5);
        rankTitle = 'Топ-50';
    }
    
    res.json({ 
        success: true, 
        rank: seasonRank,
        title: rankTitle,
        reward: reward,
        season: currentSeason
    });
});

app.post('/api/check-session', async (req, res) => {
    const { sessionId } = req.body;
    const session = await sessionsCollection.findOne({ sessionId });
    
    if (!session) {
        return res.json({ success: false });
    }
    
    const user = await usersCollection.findOne({ _id: new ObjectId(session.userId) });
    if (!user) {
        return res.json({ success: false });
    }
    
    if (user.role === 'banned') {
        await sessionsCollection.deleteOne({ sessionId });
        return res.json({ success: false, message: 'Ваш аккаунт заблокирован' });
    }
    
    res.json({ 
        success: true, 
        user: { 
            username: user.username, 
            role: user.role, 
            coins: user.coins, 
            wins: user.wins, 
            losses: user.losses,
            xp: user.xp,
            level: user.level,
            totalGames: user.totalGames
        }
    });
});

app.post('/api/logout', async (req, res) => {
    const { sessionId } = req.body;
    await sessionsCollection.deleteOne({ sessionId });
    res.json({ success: true });
});

app.get('/api/leaderboard', async (req, res) => {
    const leaders = await usersCollection
        .find({ role: { $ne: 'banned' }})
        .sort({ wins: -1 })
        .limit(10)
        .project({ username: 1, wins: 1, coins: 1, level: 1, xp: 1 })
        .toArray();
    
    res.json({ success: true, leaders });
});

app.get('/api/leaderboard-level', async (req, res) => {
    const leaders = await usersCollection
        .find({ role: { $ne: 'banned' }})
        .sort({ xp: -1 })
        .limit(10)
        .project({ username: 1, wins: 1, coins: 1, level: 1, xp: 1 })
        .toArray();
    
    res.json({ success: true, leaders });
});

// Ежедневная награда
app.post('/api/daily-reward', async (req, res) => {
    const { sessionId } = req.body;
    const session = await sessionsCollection.findOne({ sessionId });
    if (!session) return res.json({ success: false, message: 'Сессия недействительна' });
    
    const user = await usersCollection.findOne({ _id: new ObjectId(session.userId) });
    if (!user) return res.json({ success: false, message: 'Пользователь не найден' });
    
    const now = new Date();
    const lastDaily = user.lastDaily ? new Date(user.lastDaily) : null;
    
    if (lastDaily) {
        const diff = now - lastDaily;
        const hours = diff / (1000 * 60 * 60);
        if (hours < 24) {
            const remaining = 24 - hours;
            return res.json({ success: false, message: `До следующей награды: ${Math.floor(remaining)}ч` });
        }
    }
    
    const reward = 50 + user.level * 10;
    await usersCollection.updateOne(
        { _id: user._id },
        { $set: { lastDaily: now.toISOString() }, $inc: { coins: reward }}
    );
    
    res.json({ success: true, message: `Получено ${reward} монет!`, coins: user.coins + reward });
});

// История матчей
app.get('/api/match-history', async (req, res) => {
    const matches = await matchesCollection.find().sort({ timestamp: -1 }).limit(20).toArray();
    res.json({ success: true, matches });
});

// Профиль игрока
app.get('/api/profile/:username', async (req, res) => {
    const user = await usersCollection.findOne({ username: req.params.username.toLowerCase() });
    if (!user) return res.json({ success: false, message: 'Игрок не найден' });
    
    res.json({
        success: true,
        profile: {
            username: user.username,
            wins: user.wins,
            losses: user.losses,
            level: user.level,
            xp: user.xp,
            totalGames: user.totalGames,
            longestWinStreak: user.longestWinStreak,
            createdAt: user.createdAt
        }
    });
});

app.post('/api/promocode', async (req, res) => {
    const { sessionId, code } = req.body;
    const session = await sessionsCollection.findOne({ sessionId });
    if (!session) return res.json({ success: false, message: 'Сессия недействительна' });
    
    const promo = await promosCollection.findOne({ code: code.toUpperCase() });
    if (!promo) return res.json({ success: false, message: 'Неверный промокод' });
    
    if (promo.uses >= promo.maxUses) return res.json({ success: false, message: 'Промокод больше недействителен' });
    
    const user = await usersCollection.findOne({ _id: new ObjectId(session.userId) });
    if (!user) return res.json({ success: false, message: 'Пользователь не найден' });
    
    await usersCollection.updateOne({ _id: user._id }, { $inc: { coins: promo.reward }});
    await promosCollection.updateOne({ code: code.toUpperCase() }, { $inc: { uses: 1 }});
    
    res.json({ success: true, message: `Получено ${promo.reward} монет!`, coins: user.coins + promo.reward });
});

// ==================== ADMIN API ====================

app.post('/api/admin/create-promo', async (req, res) => {
    const { sessionId, code, reward, maxUses } = req.body;
    const session = await sessionsCollection.findOne({ sessionId });
    if (!session) return res.json({ success: false, message: 'Сессия недействительна' });
    
    const user = await usersCollection.findOne({ _id: new ObjectId(session.userId) });
    if (!user || user.role !== 'admin') return res.json({ success: false, message: 'Доступ запрещен' });
    
    await promosCollection.insertOne({
        code: code.toUpperCase(),
        reward: parseInt(reward),
        uses: 0,
        maxUses: parseInt(maxUses),
        createdBy: 'admin'
    });
    
    res.json({ success: true, message: 'Промокод создан!' });
});

app.post('/api/admin/users', async (req, res) => {
    const { sessionId } = req.body;
    const session = await sessionsCollection.findOne({ sessionId });
    if (!session) return res.json({ success: false, message: 'Сессия недействительна' });
    
    const user = await usersCollection.findOne({ _id: new ObjectId(session.userId) });
    if (!user || user.role !== 'admin') return res.json({ success: false, message: 'Доступ запрещен' });
    
    const allUsers = await usersCollection.find().project({
        username: 1, role: 1, coins: 1, wins: 1, losses: 1, level: 1, totalGames: 1, createdAt: 1
    }).toArray();
    
    res.json({ success: true, users: allUsers });
});

app.post('/api/admin/stats', async (req, res) => {
    const { sessionId } = req.body;
    const session = await sessionsCollection.findOne({ sessionId });
    if (!session) return res.json({ success: false, message: 'Сессия недействительна' });
    
    const user = await usersCollection.findOne({ _id: new ObjectId(session.userId) });
    if (!user || user.role !== 'admin') return res.json({ success: false, message: 'Доступ запрещен' });
    
    const allUsers = await usersCollection.find().toArray();
    const stats = {
        totalUsers: allUsers.length,
        totalWins: allUsers.reduce((sum, u) => sum + (u.wins || 0), 0),
        totalGames: allUsers.reduce((sum, u) => sum + (u.wins || 0) + (u.losses || 0), 0),
        totalCoins: allUsers.reduce((sum, u) => sum + (u.coins || 0), 0),
        promoCodes: await promosCollection.countDocuments(),
        totalMatches: await matchesCollection.countDocuments()
    };
    
    res.json({ success: true, stats });
});

app.get('/api/sales', async (req, res) => {
    const sales = await salesCollection.find({ expiresAt: { $gt: new Date() }}).toArray();
    res.json({ success: true, sales });
});

app.post('/api/admin/create-sale', async (req, res) => {
    const { sessionId, plantId, discount, duration } = req.body;
    const session = await sessionsCollection.findOne({ sessionId });
    if (!session) return res.json({ success: false, message: 'Сессия недействительна' });
    
    const user = await usersCollection.findOne({ _id: new ObjectId(session.userId) });
    if (!user || user.role !== 'admin') return res.json({ success: false, message: 'Доступ запрещен' });
    
    await salesCollection.insertOne({
        plantId,
        discount: parseInt(discount),
        duration: parseInt(duration),
        createdAt: new Date(),
        expiresAt: new Date(Date.now() + parseInt(duration))
    });
    
    res.json({ success: true, message: 'Акция создана!' });
});

app.post('/api/admin/edit-coins', async (req, res) => {
    const { sessionId, username, coins } = req.body;
    const session = await sessionsCollection.findOne({ sessionId });
    if (!session) return res.json({ success: false, message: 'Сессия недействительна' });
    
    const admin = await usersCollection.findOne({ _id: new ObjectId(session.userId) });
    if (!admin || admin.role !== 'admin') return res.json({ success: false, message: 'Доступ запрещен' });
    
    await usersCollection.updateOne(
        { username: username.toLowerCase() },
        { $set: { coins: parseInt(coins) }}
    );
    
    res.json({ success: true, message: 'Монеты обновлены!' });
});

app.post('/api/admin/ban', async (req, res) => {
    const { sessionId, username } = req.body;
    const session = await sessionsCollection.findOne({ sessionId });
    if (!session) return res.json({ success: false, message: 'Сессия недействительна' });
    
    const admin = await usersCollection.findOne({ _id: new ObjectId(session.userId) });
    if (!admin || admin.role !== 'admin') return res.json({ success: false, message: 'Доступ запрещен' });
    
    const target = await usersCollection.findOne({ username: username.toLowerCase() });
    if (!target) return res.json({ success: false, message: 'Пользователь не найден' });
    if (target.role === 'admin') return res.json({ success: false, message: 'Нельзя забанить админа' });
    
    await usersCollection.updateOne(
        { username: username.toLowerCase() },
        { $set: { role: 'banned' }}
    );
    
    res.json({ success: true, message: `Игрок ${username} заблокирован!` });
});

app.post('/api/admin/unban', async (req, res) => {
    const { sessionId, username } = req.body;
    const session = await sessionsCollection.findOne({ sessionId });
    if (!session) return res.json({ success: false, message: 'Сессия недействительна' });
    
    const admin = await usersCollection.findOne({ _id: new ObjectId(session.userId) });
    if (!admin || admin.role !== 'admin') return res.json({ success: false, message: 'Доступ запрещен' });
    
    await usersCollection.updateOne(
        { username: username.toLowerCase() },
        { $set: { role: 'player' }}
    );
    
    res.json({ success: true, message: `Игрок ${username} разблокирован!` });
});

// ==================== НОВЫЕ ADMIN ФУНКЦИИ ====================

// Изменить роль игрока
app.post('/api/admin/set-role', async (req, res) => {
    const { sessionId, username, role } = req.body;
    const session = await sessionsCollection.findOne({ sessionId });
    if (!session) return res.json({ success: false, message: 'Сессия недействительна' });
    
    const admin = await usersCollection.findOne({ _id: new ObjectId(session.userId) });
    if (!admin || admin.role !== 'admin') return res.json({ success: false, message: 'Доступ запрещен' });
    
    if (!['player', 'admin', 'moderator'].includes(role)) {
        return res.json({ success: false, message: 'Неверная роль' });
    }
    
    await usersCollection.updateOne(
        { username: username.toLowerCase() },
        { $set: { role: role }}
    );
    
    res.json({ success: true, message: `Роль игрока ${username} изменена на ${role}!` });
});

// Изменить уровень игрока
app.post('/api/admin/set-level', async (req, res) => {
    const { sessionId, username, level } = req.body;
    const session = await sessionsCollection.findOne({ sessionId });
    if (!session) return res.json({ success: false, message: 'Сессия недействительна' });
    
    const admin = await usersCollection.findOne({ _id: new ObjectId(session.userId) });
    if (!admin || admin.role !== 'admin') return res.json({ success: false, message: 'Доступ запрещен' });
    
    await usersCollection.updateOne(
        { username: username.toLowerCase() },
        { $set: { level: parseInt(level), xp: 0 }}
    );
    
    res.json({ success: true, message: `Уровень игрока ${username} изменён на ${level}!` });
});

// Изменить XP игрока
app.post('/api/admin/set-xp', async (req, res) => {
    const { sessionId, username, xp } = req.body;
    const session = await sessionsCollection.findOne({ sessionId });
    if (!session) return res.json({ success: false, message: 'Сессия недействительна' });
    
    const admin = await usersCollection.findOne({ _id: new ObjectId(session.userId) });
    if (!admin || admin.role !== 'admin') return res.json({ success: false, message: 'Доступ запрещен' });
    
    await usersCollection.updateOne(
        { username: username.toLowerCase() },
        { $set: { xp: parseInt(xp) }}
    );
    
    res.json({ success: true, message: `XP игрока ${username} изменён на ${xp}!` });
});

// Изменить победы
app.post('/api/admin/set-wins', async (req, res) => {
    const { sessionId, username, wins } = req.body;
    const session = await sessionsCollection.findOne({ sessionId });
    if (!session) return res.json({ success: false, message: 'Сессия недействительна' });
    
    const admin = await usersCollection.findOne({ _id: new ObjectId(session.userId) });
    if (!admin || admin.role !== 'admin') return res.json({ success: false, message: 'Доступ запрещен' });
    
    await usersCollection.updateOne(
        { username: username.toLowerCase() },
        { $set: { wins: parseInt(wins) }}
    );
    
    res.json({ success: true, message: `Победы игрока ${username} изменены на ${wins}!` });
});

// Дать монеты игроку
app.post('/api/admin/give-coins', async (req, res) => {
    const { sessionId, username, coins } = req.body;
    const session = await sessionsCollection.findOne({ sessionId });
    if (!session) return res.json({ success: false, message: 'Сессия недействительна' });
    
    const admin = await usersCollection.findOne({ _id: new ObjectId(session.userId) });
    if (!admin || admin.role !== 'admin') return res.json({ success: false, message: 'Доступ запрещен' });
    
    await usersCollection.updateOne(
        { username: username.toLowerCase() },
        { $inc: { coins: parseInt(coins) }}
    );
    
    res.json({ success: true, message: `Игроку ${username} выдано ${coins} монет!` });
});

// Забрать монеты у игрока
app.post('/api/admin/take-coins', async (req, res) => {
    const { sessionId, username, coins } = req.body;
    const session = await sessionsCollection.findOne({ sessionId });
    if (!session) return res.json({ success: false, message: 'Сессия недействительна' });
    
    const admin = await usersCollection.findOne({ _id: new ObjectId(session.userId) });
    if (!admin || admin.role !== 'admin') return res.json({ success: false, message: 'Доступ запрещен' });
    
    const target = await usersCollection.findOne({ username: username.toLowerCase() });
    if (!target) return res.json({ success: false, message: 'Игрок не найден' });
    
    const newCoins = Math.max(0, target.coins - parseInt(coins));
    await usersCollection.updateOne(
        { username: username.toLowerCase() },
        { $set: { coins: newCoins }}
    );
    
    res.json({ success: true, message: `У игрока ${username} забрано ${coins} монет!` });
});

// Удалить игрока
app.post('/api/admin/delete-user', async (req, res) => {
    const { sessionId, username } = req.body;
    const session = await sessionsCollection.findOne({ sessionId });
    if (!session) return res.json({ success: false, message: 'Сессия недействительна' });
    
    const admin = await usersCollection.findOne({ _id: new ObjectId(session.userId) });
    if (!admin || admin.role !== 'admin') return res.json({ success: false, message: 'Доступ запрещен' });
    
    if (username.toLowerCase() === 'admin') {
        return res.json({ success: false, message: 'Нельзя удалить админа' });
    }
    
    await usersCollection.deleteOne({ username: username.toLowerCase() });
    
    res.json({ success: true, message: `Игрок ${username} удалён!` });
});

// Сбросить прогресс игрока
app.post('/api/admin/reset-progress', async (req, res) => {
    const { sessionId, username } = req.body;
    const session = await sessionsCollection.findOne({ sessionId });
    if (!session) return res.json({ success: false, message: 'Сессия недействительна' });
    
    const admin = await usersCollection.findOne({ _id: new ObjectId(session.userId) });
    if (!admin || admin.role !== 'admin') return res.json({ success: false, message: 'Доступ запрещен' });
    
    await usersCollection.updateOne(
        { username: username.toLowerCase() },
        { $set: { 
            coins: 100,
            wins: 0,
            losses: 0,
            xp: 0,
            level: 1,
            totalGames: 0,
            longestWinStreak: 0,
            currentWinStreak: 0,
            achievements: [],
            inventory: {}
        }}
    );
    
    res.json({ success: true, message: `Прогресс игрока ${username} сброшен!` });
});

// Сбросить ежедневные квесты всем игрокам
app.post('/api/admin/reset-quests', async (req, res) => {
    const { sessionId } = req.body;
    const session = await sessionsCollection.findOne({ sessionId });
    if (!session) return res.json({ success: false, message: 'Сессия недействительна' });
    
    const admin = await usersCollection.findOne({ _id: new ObjectId(session.userId) });
    if (!admin || admin.role !== 'admin') return res.json({ success: false, message: 'Доступ запрещен' });
    
    await usersCollection.updateMany(
        {},
        { $set: { dailyQuests: [], dailyQuestsDate: null }}
    );
    
    res.json({ success: true, message: 'Ежедневные квесты сброшены всем игрокам!' });
});

// Получить все матчи (с пагинацией)
app.post('/api/admin/all-matches', async (req, res) => {
    const { sessionId, page = 1, limit = 50 } = req.body;
    const session = await sessionsCollection.findOne({ sessionId });
    if (!session) return res.json({ success: false, message: 'Сессия недействительна' });
    
    const admin = await usersCollection.findOne({ _id: new ObjectId(session.userId) });
    if (!admin || admin.role !== 'admin') return res.json({ success: false, message: 'Доступ запрещен' });
    
    const skip = (page - 1) * limit;
    const matches = await matchesCollection.find()
        .sort({ timestamp: -1 })
        .skip(skip)
        .limit(parseInt(limit))
        .toArray();
    
    const total = await matchesCollection.countDocuments();
    
    res.json({ success: true, matches, total, page, totalPages: Math.ceil(total / limit) });
});

// Удалить матч
app.post('/api/admin/delete-match', async (req, res) => {
    const { sessionId, matchId } = req.body;
    const session = await sessionsCollection.findOne({ sessionId });
    if (!session) return res.json({ success: false, message: 'Сессия недействительна' });
    
    const admin = await usersCollection.findOne({ _id: new ObjectId(session.userId) });
    if (!admin || admin.role !== 'admin') return res.json({ success: false, message: 'Доступ запрещен' });
    
    await matchesCollection.deleteOne({ _id: new ObjectId(matchId) });
    
    res.json({ success: true, message: 'Матч удалён!' });
});

// Очистить все матчи
app.post('/api/admin/clear-matches', async (req, res) => {
    const { sessionId } = req.body;
    const session = await sessionsCollection.findOne({ sessionId });
    if (!session) return res.json({ success: false, message: 'Сессия недействительна' });
    
    const admin = await usersCollection.findOne({ _id: new ObjectId(session.userId) });
    if (!admin || admin.role !== 'admin') return res.json({ success: false, message: 'Доступ запрещен' });
    
    await matchesCollection.deleteMany({});
    
    res.json({ success: true, message: 'Все матчи удалены!' });
});

// Удалить все промокоды
app.post('/api/admin/clear-promos', async (req, res) => {
    const { sessionId } = req.body;
    const session = await sessionsCollection.findOne({ sessionId });
    if (!session) return res.json({ success: false, message: 'Сессия недействительна' });
    
    const admin = await usersCollection.findOne({ _id: new ObjectId(session.userId) });
    if (!admin || admin.role !== 'admin') return res.json({ success: false, message: 'Доступ запрещен' });
    
    await promosCollection.deleteMany({});
    
    res.json({ success: true, message: 'Все промокоды удалены!' });
});

// Дать юнита игроку
app.post('/api/admin/give-unit', async (req, res) => {
    const { sessionId, username, unitId, unitType } = req.body;
    const session = await sessionsCollection.findOne({ sessionId });
    if (!session) return res.json({ success: false, message: 'Сессия недействительна' });
    
    const admin = await usersCollection.findOne({ _id: new ObjectId(session.userId) });
    if (!admin || admin.role !== 'admin') return res.json({ success: false, message: 'Доступ запрещен' });
    
    const target = await usersCollection.findOne({ username: username.toLowerCase() });
    if (!target) return res.json({ success: false, message: 'Игрок не найден' });
    
    const inventory = target.inventory || {};
    inventory[unitId] = {
        level: 1,
        type: unitType,
        purchased: new Date()
    };
    
    await usersCollection.updateOne(
        { username: username.toLowerCase() },
        { $set: { inventory: inventory }}
    );
    
    res.json({ success: true, message: `Игроку ${username} выдан юнит ${unitId}!` });
});

// Забрать юнита у игрока
app.post('/api/admin/take-unit', async (req, res) => {
    const { sessionId, username, unitId } = req.body;
    const session = await sessionsCollection.findOne({ sessionId });
    if (!session) return res.json({ success: false, message: 'Сессия недействительна' });
    
    const admin = await usersCollection.findOne({ _id: new ObjectId(session.userId) });
    if (!admin || admin.role !== 'admin') return res.json({ success: false, message: 'Доступ запрещен' });
    
    const target = await usersCollection.findOne({ username: username.toLowerCase() });
    if (!target) return res.json({ success: false, message: 'Игрок не найден' });
    
    const inventory = target.inventory || {};
    delete inventory[unitId];
    
    await usersCollection.updateOne(
        { username: username.toLowerCase() },
        { $set: { inventory: inventory }}
    );
    
    res.json({ success: true, message: `У игрока ${username} забран юнит ${unitId}!` });
});

// Статистика по уровням
app.post('/api/admin/level-stats', async (req, res) => {
    const { sessionId } = req.body;
    const session = await sessionsCollection.findOne({ sessionId });
    if (!session) return res.json({ success: false, message: 'Сессия недействительна' });
    
    const admin = await usersCollection.findOne({ _id: new ObjectId(session.userId) });
    if (!admin || admin.role !== 'admin') return res.json({ success: false, message: 'Доступ запрещен' });
    
    const levelStats = await usersCollection.aggregate([
        { $group: { _id: '$level', count: { $sum: 1 } } },
        { $sort: { _id: 1 } }
    ]).toArray();
    
    res.json({ success: true, levelStats });
});

// Топ по монетам
app.post('/api/admin/top-coins', async (req, res) => {
    const { sessionId, limit = 10 } = req.body;
    const session = await sessionsCollection.findOne({ sessionId });
    if (!session) return res.json({ success: false, message: 'Сессия недействительна' });
    
    const admin = await usersCollection.findOne({ _id: new ObjectId(session.userId) });
    if (!admin || admin.role !== 'admin') return res.json({ success: false, message: 'Доступ запрещен' });
    
    const top = await usersCollection.find()
        .sort({ coins: -1 })
        .limit(parseInt(limit))
        .project({ username: 1, coins: 1, level: 1 })
        .toArray();
    
    res.json({ success: true, top });
});

// Поиск игрока
app.post('/api/admin/search-user', async (req, res) => {
    const { sessionId, query } = req.body;
    const session = await sessionsCollection.findOne({ sessionId });
    if (!session) return res.json({ success: false, message: 'Сессия недействительна' });
    
    const admin = await usersCollection.findOne({ _id: new ObjectId(session.userId) });
    if (!admin || admin.role !== 'admin') return res.json({ success: false, message: 'Доступ запрещен' });
    
    const users = await usersCollection.find({
        username: { $regex: query, $options: 'i' }
    })
    .project({ username: 1, role: 1, coins: 1, wins: 1, level: 1, createdAt: 1 })
    .limit(20)
    .toArray();
    
    res.json({ success: true, users });
});

// Экспорт данных (все пользователи)
app.post('/api/admin/export-users', async (req, res) => {
    const { sessionId } = req.body;
    const session = await sessionsCollection.findOne({ sessionId });
    if (!session) return res.json({ success: false, message: 'Сессия недействительна' });
    
    const admin = await usersCollection.findOne({ _id: new ObjectId(session.userId) });
    if (!admin || admin.role !== 'admin') return res.json({ success: false, message: 'Доступ запрещен' });
    
    const users = await usersCollection.find({ role: { $ne: 'admin' }})
        .project({ username: 1, coins: 1, wins: 1, losses: 1, xp: 1, level: 1, totalGames: 1, createdAt: 1 })
        .toArray();
    
    res.json({ success: true, users });
});

// Массовая выдача монет
app.post('/api/admin/broadcast-coins', async (req, res) => {
    const { sessionId, coins } = req.body;
    const session = await sessionsCollection.findOne({ sessionId });
    if (!session) return res.json({ success: false, message: 'Сессия недействительна' });
    
    const admin = await usersCollection.findOne({ _id: new ObjectId(session.userId) });
    if (!admin || admin.role !== 'admin') return res.json({ success: false, message: 'Доступ запрещен' });
    
    const result = await usersCollection.updateMany(
        { role: { $ne: 'admin' } },
        { $inc: { coins: parseInt(coins) }}
    );
    
    res.json({ success: true, message: `Монеты выданы ${result.modifiedCount} игрокам!` });
});

// Просмотр инвентаря игрока
app.post('/api/admin/view-inventory', async (req, res) => {
    const { sessionId, username } = req.body;
    const session = await sessionsCollection.findOne({ sessionId });
    if (!session) return res.json({ success: false, message: 'Сессия недействительна' });
    
    const admin = await usersCollection.findOne({ _id: new ObjectId(session.userId) });
    if (!admin || admin.role !== 'admin') return res.json({ success: false, message: 'Доступ запрещен' });
    
    const target = await usersCollection.findOne({ username: username.toLowerCase() });
    if (!target) return res.json({ success: false, message: 'Игрок не найден' });
    
    res.json({ success: true, inventory: target.inventory || {}, username: target.username });
});

// Настройки сервера (в памяти)
let serverSettings = {
    gameDuration: 180, // 3 минуты
    winnerReward: 50,
    loserReward: 10,
    drawReward: 20,
    dailyRewardBase: 50,
    dailyRewardPerLevel: 10,
    botTimeout: 60000,
    xpPerWin: 50,
    xpPerLose: 20
};

// Получить настройки сервера
app.post('/api/admin/server-settings', async (req, res) => {
    const { sessionId } = req.body;
    const session = await sessionsCollection.findOne({ sessionId });
    if (!session) return res.json({ success: false, message: 'Сессия недействительна' });
    
    const admin = await usersCollection.findOne({ _id: new ObjectId(session.userId) });
    if (!admin || admin.role !== 'admin') return res.json({ success: false, message: 'Доступ запрещен' });
    
    res.json({ success: true, settings: serverSettings });
});

// Изменить настройки сервера
app.post('/api/admin/update-settings', async (req, res) => {
    const { sessionId, settings } = req.body;
    const session = await sessionsCollection.findOne({ sessionId });
    if (!session) return res.json({ success: false, message: 'Сессия недействительна' });
    
    const admin = await usersCollection.findOne({ _id: new ObjectId(session.userId) });
    if (!admin || admin.role !== 'admin') return res.json({ success: false, message: 'Доступ запрещен' });
    
    serverSettings = { ...serverSettings, ...settings };
    
    res.json({ success: true, message: 'Настройки обновлены!', settings: serverSettings });
});

// Информация о базе данных
app.post('/api/admin/db-stats', async (req, res) => {
    const { sessionId } = req.body;
    const session = await sessionsCollection.findOne({ sessionId });
    if (!session) return res.json({ success: false, message: 'Сессия недействительна' });
    
    const admin = await usersCollection.findOne({ _id: new ObjectId(session.userId) });
    if (!admin || admin.role !== 'admin') return res.json({ success: false, message: 'Доступ запрещен' });
    
    const stats = {
        users: await usersCollection.countDocuments(),
        matches: await matchesCollection.countDocuments(),
        promos: await promosCollection.countDocuments(),
        sales: await salesCollection.countDocuments(),
        sessions: await sessionsCollection.countDocuments()
    };
    
    res.json({ success: true, stats });
});

// ==================== ДРУЗЬЯ API ====================

// Получить список друзей
app.post('/api/friends', async (req, res) => {
    const { sessionId } = req.body;
    const session = await sessionsCollection.findOne({ sessionId });
    if (!session) return res.json({ success: false, message: 'Сессия недействительна' });
    
    const user = await usersCollection.findOne({ _id: new ObjectId(session.userId) });
    if (!user) return res.json({ success: false, message: 'Пользователь не найден' });
    
    const friendsCollection = db.collection('friends');
    const friendships = await friendsCollection.find({
        $or: [
            { userId: user._id.toString() },
            { friendId: user._id.toString() }
        ]
    }).toArray();
    
    const friendIds = friendships.map(f => f.userId === user._id.toString() ? f.friendId : f.userId);
    const friends = await usersCollection.find({
        _id: { $in: friendIds.map(id => new ObjectId(id)) }
    }).project({ username: 1, level: 1, wins: 1 }).toArray();
    
    res.json({ success: true, friends });
});

// Добавить в друзья
app.post('/api/friends/add', async (req, res) => {
    const { sessionId, friendUsername } = req.body;
    const session = await sessionsCollection.findOne({ sessionId });
    if (!session) return res.json({ success: false, message: 'Сессия недействительна' });
    
    const user = await usersCollection.findOne({ _id: new ObjectId(session.userId) });
    if (!user) return res.json({ success: false, message: 'Пользователь не найден' });
    
    const friend = await usersCollection.findOne({ username: friendUsername.toLowerCase() });
    if (!friend) return res.json({ success: false, message: 'Игрок не найден' });
    if (friend._id.toString() === user._id.toString()) return res.json({ success: false, message: 'Нельзя добавить себя' });
    
    const friendsCollection = db.collection('friends');
    const existing = await friendsCollection.findOne({
        userId: user._id.toString(),
        friendId: friend._id.toString()
    });
    if (existing) return res.json({ success: false, message: 'Уже в друзьях' });
    
    await friendsCollection.insertOne({
        userId: user._id.toString(),
        friendId: friend._id.toString(),
        createdAt: new Date()
    });
    
    res.json({ success: true, message: `${friend.username} добавлен в друзья!` });
});

// Удалить из друзей
app.post('/api/friends/remove', async (req, res) => {
    const { sessionId, friendId } = req.body;
    const session = await sessionsCollection.findOne({ sessionId });
    if (!session) return res.json({ success: false, message: 'Сессия недействительна' });
    
    const user = await usersCollection.findOne({ _id: new ObjectId(session.userId) });
    if (!user) return res.json({ success: false, message: 'Пользователь не найден' });
    
    const friendsCollection = db.collection('friends');
    await friendsCollection.deleteOne({
        $or: [
            { userId: user._id.toString(), friendId: friendId },
            { userId: friendId, friendId: user._id.toString() }
        ]
    });
    
    res.json({ success: true, message: 'Друг удалён' });
});

// Пригласить друга на игру
app.post('/api/friends/invite', async (req, res) => {
    const { sessionId, friendId } = req.body;
    const session = await sessionsCollection.findOne({ sessionId });
    if (!session) return res.json({ success: false, message: 'Сессия недействительна' });
    
    const user = await usersCollection.findOne({ _id: new ObjectId(session.userId) });
    if (!user) return res.json({ success: false, message: 'Пользователь не найден' });
    
    // Создаем приглашение
    const inviteCode = uuidv4().substring(0, 8).toUpperCase();
    const inviteCollection = db.collection('friendInvites');
    await inviteCollection.insertOne({
        from: user._id.toString(),
        to: friendId,
        code: inviteCode,
        createdAt: new Date(),
        expiresAt: new Date(Date.now() + 5 * 60 * 1000) // 5 минут
    });
    
    res.json({ success: true, code: inviteCode });
});

// Принять приглашение и начать игру с другом
app.post('/api/friends/join', async (req, res) => {
    const { sessionId, friendId } = req.body;
    const session = await sessionsCollection.findOne({ sessionId });
    if (!session) return res.json({ success: false, message: 'Сессия недействительна' });
    
    const user = await usersCollection.findOne({ _id: new ObjectId(session.userId) });
    if (!user) return res.json({ success: false, message: 'Пользователь не найден' });
    
    const friend = await usersCollection.findOne({ _id: new ObjectId(friendId) });
    if (!friend) return res.json({ success: false, message: 'Друг не найден' });
    
    // Проверяем, что они друзья
    const friendsCollection = db.collection('friends');
    const areFriends = await friendsCollection.findOne({
        $or: [
            { userId: user._id.toString(), friendId: friend._id.toString() },
            { userId: friend._id.toString(), friendId: user._id.toString() }
        ]
    });
    
    if (!areFriends) return res.json({ success: false, message: 'Вы не друзья' });
    
    // Создаем комнату для дружеского боя
    const roomId = uuidv4();
    const side = Math.random() > 0.5 ? 'plant' : 'zombie';
    
    gameRooms.set(roomId, {
        players: [
            { id: socket.id, side: side, user: user },
            { id: 'friend_' + friend._id.toString(), side: side === 'plant' ? 'zombie' : 'plant', user: friend }
        ],
        state: 'playing',
        timer: null,
        botTimer: null,
        isFriendGame: true,
        isBotGame: false
    });
    
    res.json({ success: true, roomId });
});

// ==================== ИГРОВОЙ СЕРВЕР ====================

const gameRooms = new Map();
const WAIT_TIMEOUT = 60 * 1000; // 60 секунд

io.on('connection', (socket) => {
    console.log('Игрок подключился:', socket.id);
    
    let currentRoom = null;
    let currentUser = null;
    
    socket.on('sendMessage', (data) => {
        if (currentRoom && currentUser && !currentUser.isBot) {
            io.to(currentRoom).emit('chatMessage', {
                username: currentUser.username,
                message: data.message.substring(0, 100),
                time: new Date().toLocaleTimeString()
            });
        }
    });
    
    socket.on('findBotGame', async (data) => {
        const { sessionId, difficulty = 'medium', side: requestedSide } = data;
        const session = await sessionsCollection.findOne({ sessionId });
        
        if (!session) {
            socket.emit('error', { message: 'Сессия недействительна' });
            return;
        }
        
        currentUser = await usersCollection.findOne({ _id: new ObjectId(session.userId) });
        if (!currentUser) return;
        
        // Создаем игру с ботом напрямую
        const roomId = uuidv4();
        // Используем выбранную сторону или случайную
        const side = requestedSide || (Math.random() > 0.5 ? 'plant' : 'zombie');
        const bot = createBot(difficulty, side === 'plant' ? 'zombie' : 'plant');
        
        gameRooms.set(roomId, {
            players: [
                { id: socket.id, side, user: currentUser },
                { id: bot.id, side: bot.side, user: bot }
            ],
            state: 'playing',
            timer: null,
            botTimer: null,
            isBotGame: true,
            difficulty: difficulty
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
        
        // Запускаем игровой таймер
        let roundTime = 180;
        const room = gameRooms.get(roomId);
        room.timer = setInterval(() => {
            roundTime--;
            io.to(roomId).emit('gameTimer', { time: roundTime });
            
            // Логика бота - каждые 5 секунд
            if (roundTime % 5 === 0) {
                const botPlayer = room.players.find(p => p.user.isBot);
                if (botPlayer && Math.random() < BOT_DIFFICULTIES[botPlayer.user.difficulty].spawnRate) {
                    const lane = Math.floor(Math.random() * 5);
                    const unitId = botPlayer.side === 'plant' ? 'peashooter' : 'zombie';
                    // Растения всегда слева (15%), зомби всегда справа (95%)
                    const pos = botPlayer.side === 'plant' ? '15%' : '95%';
                    io.to(roomId).emit('botPlaceUnit', { lane: lane, unitId: unitId, side: botPlayer.side, pos: pos });
                }
            }
            
            if (roundTime <= 0) {
                endRound(roomId, 'draw');
            }
        }, 1000);
        
        console.log(`Игра с ботом ${difficulty} началась: ${currentUser.username} vs ${bot.username}`);
    });
    
    socket.on('findGame', async (data) => {
        const { sessionId, difficulty = 'medium' } = data;
        const session = await sessionsCollection.findOne({ sessionId });
        
        if (!session) {
            socket.emit('error', { message: 'Сессия недействительна' });
            return;
        }
        
        currentUser = await usersCollection.findOne({ _id: new ObjectId(session.userId) });
        if (!currentUser) return;
        
        // Ищем игру с реальным игроком
        for (let [roomId, room] of gameRooms) {
            if (room.players.length === 1 && room.state === 'waiting' && !room.isBotGame) {
                const side = room.players[0].side === 'plant' ? 'zombie' : 'plant';
                room.players.push({ id: socket.id, side, user: currentUser });
                currentRoom = roomId;
                socket.join(roomId);
                
                room.state = 'playing';
                
                // Очищаем таймер ожидания бота
                if (room.botTimer) {
                    clearTimeout(room.botTimer);
                    room.botTimer = null;
                }
                
                io.to(roomId).emit('gameStart', {
                    roomId,
                    players: room.players.map(p => ({ id: p.id, side: p.side, username: p.user.username, isBot: p.user.isBot || false })),
                    state: room.state
                });
                
                let roundTime = 180;
                room.timer = setInterval(() => {
                    roundTime--;
                    io.to(roomId).emit('gameTimer', { time: roundTime });
                    
                    if (roundTime <= 0) {
                        endRound(roomId, 'draw');
                    }
                }, 1000);
                
                return;
            }
        }
        
        // Создаем комнату и ждем реального игрока (без авто-бота!)
        const roomId = uuidv4();
        const side = Math.random() > 0.5 ? 'plant' : 'zombie';
        
        gameRooms.set(roomId, {
            players: [{ id: socket.id, side, user: currentUser }],
            state: 'waiting',
            timer: null,
            botTimer: null,
            isBotGame: false,
            difficulty: difficulty
        });
        
        currentRoom = roomId;
        socket.join(roomId);
        
        // Отправляем сообщение о поиске
        socket.emit('waiting', { message: 'Ожидание противника...', timeLeft: WAIT_TIMEOUT / 1000 });
        
        // Запускаем таймер на 60 секунд для авто-бота
        const room = gameRooms.get(roomId);
        room.botTimer = setTimeout(() => {
            startBotGame(roomId, difficulty);
        }, WAIT_TIMEOUT);
    });
    
    function startBotGame(roomId, difficulty) {
        const room = gameRooms.get(roomId);
        if (!room || room.state !== 'waiting') return;
        
        room.isBotGame = true;
        
        // Определяем сторону бота (противоположная игроку)
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
        
        // Запускаем игровой таймер
        let roundTime = 180;
        room.timer = setInterval(() => {
            roundTime--;
            io.to(roomId).emit('gameTimer', { time: roundTime });
            
            // Логика бота
            if (roundTime % 5 === 0) {
                const botPlayer = room.players.find(p => p.user.isBot);
                if (botPlayer && Math.random() < BOT_DIFFICULTIES[botPlayer.user.difficulty].spawnRate) {
                    const lane = Math.floor(Math.random() * 5);
                    const unitId = botSide === 'plant' ? 'peashooter' : 'zombie';
                    // Растения всегда слева (15%), зомби всегда справа (95%)
                    const pos = botSide === 'plant' ? '15%' : '95%';
                    io.to(roomId).emit('botPlaceUnit', { lane: lane, unitId: unitId, side: botSide, pos: pos });
                }
            }
            
            if (roundTime <= 0) {
                endRound(roomId, 'draw');
            }
        }, 1000);
        
        console.log(`Бот ${difficulty} присоединился к комнате ${roomId}`);
    }
    
    socket.on('leaveQueue', async () => {
        if (currentRoom) {
            const room = gameRooms.get(currentRoom);
            if (room) {
                if (room.state === 'waiting') {
                    // Очищаем таймер бота
                    if (room.botTimer) {
                        clearTimeout(room.botTimer);
                        room.botTimer = null;
                    }
                    room.players = room.players.filter(p => p.id !== socket.id);
                    if (room.players.length === 0) {
                        gameRooms.delete(currentRoom);
                    }
                } else if (room.state === 'playing') {
                    const loser = room.players.find(p => p.id === socket.id);
                    const winner = room.players.find(p => p.id !== socket.id);
                    
                    if (loser && winner) {
                        // Даем награды только реальному игроку
                        if (!loser.user.isBot) {
                            await usersCollection.updateOne(
                                { _id: loser.user._id },
                                { $inc: { losses: 1, totalGames: 1, coins: 10 }}
                            );
                        }
                        if (!winner.user.isBot) {
                            await usersCollection.updateOne(
                                { _id: winner.user._id },
                                { $inc: { wins: 1, totalGames: 1, coins: 50 }, $set: { currentWinStreak: winner.user.currentWinStreak + 1 }}
                            );
                            await addXP(winner.user, 50);
                        }
                        
                        if (!loser.user.isBot && !winner.user.isBot) {
                            await matchesCollection.insertOne({
                                winner: winner.user.username,
                                loser: loser.user.username,
                                winnerSide: winner.side,
                                timestamp: new Date()
                            });
                        }
                        
                        io.to(currentRoom).emit('gameEnd', { 
                            winner: winner.user.username, 
                            winnerSide: winner.side,
                            isBotGame: room.isBotGame
                        });
                    }
                    
                    if (room.timer) clearInterval(room.timer);
                    gameRooms.delete(currentRoom);
                }
            }
        }
        currentRoom = null;
    });
    
    socket.on('plantPlaced', (data) => {
        if (currentRoom) socket.to(currentRoom).emit('opponentPlanted', data);
    });
    
    socket.on('zombiePlaced', (data) => {
        if (currentRoom) socket.to(currentRoom).emit('opponentZombie', data);
    });
    
    socket.on('gameOver', (data) => {
        if (currentRoom) {
            const room = gameRooms.get(currentRoom);
            if (room && room.state === 'playing') {
                endRound(currentRoom, data.winner);
            }
        }
    });
    
    socket.on('disconnect', async () => {
        console.log('Игрок отключился:', socket.id);
        if (currentRoom) {
            const room = gameRooms.get(currentRoom);
            if (room) {
                if (room.state === 'waiting') {
                    if (room.botTimer) {
                        clearTimeout(room.botTimer);
                        room.botTimer = null;
                    }
                    room.players = room.players.filter(p => p.id !== socket.id);
                    if (room.players.length === 0) {
                        gameRooms.delete(currentRoom);
                    }
                } else if (room.state === 'playing') {
                    const loser = room.players.find(p => p.id === socket.id);
                    const winner = room.players.find(p => p.id !== socket.id);
                    
                    if (loser && winner) {
                        // Даем награды только реальному игроку
                        if (!loser.user.isBot) {
                            if (!winner.user.isBot) {
                                await usersCollection.updateOne(
                                    { _id: winner.user._id },
                                    { $inc: { wins: 1, totalGames: 1 }}
                                );
                                await matchesCollection.insertOne({
                                    winner: winner.user.username,
                                    loser: loser.user.username,
                                    winnerSide: winner.side,
                                    timestamp: new Date()
                                });
                            }
                        }
                        
                        io.to(currentRoom).emit('gameEnd', { 
                            winner: winner.user.username, 
                            winnerSide: winner.side,
                            isBotGame: room.isBotGame
                        });
                    }
                    
                    if (room.timer) clearInterval(room.timer);
                    gameRooms.delete(currentRoom);
                }
            }
        }
    });
});

async function endRound(roomId, result) {
    const room = gameRooms.get(roomId);
    if (!room) return;
    
    if (room.timer) clearInterval(room.timer);
    
    if (result !== 'draw') {
        const winner = room.players.find(p => p.side === result);
        const loser = room.players.find(p => p.side !== result);
        
        if (winner && loser) {
            // Даем награды ТОЛЬКО в PvP (не в режиме игры с ботом!)
            const giveRewards = !room.isBotGame;
            
            if (!winner.user.isBot) {
                await usersCollection.updateOne(
                    { _id: winner.user._id },
                    { $inc: { wins: 1, totalGames: 1, coins: giveRewards ? 50 : 0 }}
                );
                if (giveRewards) await addXP(winner.user, 50);
            }
            if (!loser.user.isBot) {
                await usersCollection.updateOne(
                    { _id: loser.user._id },
                    { $inc: { losses: 1, totalGames: 1, coins: giveRewards ? 10 : 0 }}
                );
            }
            
            // Записываем матч только если игра не с ботом
            if (!room.isBotGame || (winner.user.isBot === false && loser.user.isBot === false)) {
                await matchesCollection.insertOne({
                    winner: winner.user.username,
                    loser: loser.user.username,
                    winnerSide: winner.side,
                    timestamp: new Date()
                });
            }
            
            io.to(roomId).emit('gameEnd', { 
                winner: winner.user.username, 
                winnerSide: winner.side,
                rewards: { winner: 50, loser: 10 },
                isBotGame: room.isBotGame
            });
        }
    } else {
        // Даем награды только в PvP и авто-боте (не в режиме "Играть с ботом")
        const giveRewards = room.isBotGame && !room.players.find(p => p.user.isBot);
        
        for (const p of room.players) {
            if (!p.user.isBot) {
                await usersCollection.updateOne(
                    { _id: p.user._id },
                    { $inc: { coins: giveRewards ? 20 : 0, totalGames: 1 }}
                );
                if (giveRewards) addXP(p.user, 20);
            }
        }
        
        io.to(roomId).emit('gameEnd', { 
            winner: 'draw',
            rewards: { winner: giveRewards ? 20 : 0, loser: giveRewards ? 20 : 0 },
            isBotGame: room.isBotGame
        });
    }
    
    gameRooms.delete(roomId);
}

// Запуск сервера
const PORT = process.env.PORT || 3000;

connectDB().then(() => {
    server.listen(PORT, () => {
        console.log(`Сервер запущен на порту ${PORT}`);
        console.log('Админ: логин - admin, пароль - admin123');
        console.log('База данных: MongoDB Atlas');
        console.log('Бот-система: включена (60 сек таймаут)');
    });
}).catch(err => {
    console.error('Не удалось запустить сервер:', err);
    process.exit(1);
});
