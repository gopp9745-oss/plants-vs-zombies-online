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
const ACHIEVEMENTS = [
    { id: 'first_win', name: 'Первая победа', desc: 'Выиграйте первый матч', icon: '🎉', reward: 50 },
    { id: 'wins_10', name: 'Новичок бой', desc: '10 побед', icon: '⭐', reward: 100 },
    { id: 'wins_50', name: 'Опытный боец', desc: '50 побед', icon: '🌟', reward: 250 },
    { id: 'wins_100', name: 'Мастер арены', desc: '100 побед', icon: '🏆', reward: 500 },
    { id: 'coins_1000', name: 'Тысячник', desc: 'Соберите 1000 монет', icon: '💰', reward: 100 },
    { id: 'level_5', name: 'Растущий', desc: 'Достигните 5 уровня', icon: '📈', reward: 150 },
    { id: 'level_10', name: 'Продвинутый', desc: 'Достигните 10 уровня', icon: '🚀', reward: 300 },
    { id: 'streak_3', name: 'Серия побед', desc: '3 победы подряд', icon: '🔥', reward: 75 },
    { id: 'streak_5', name: 'Непобедимый', desc: '5 побед подряд', icon: '⚡', reward: 150 },
    { id: 'games_50', name: 'Ветеран', desc: 'Сыграйте 50 матчей', icon: '🎮', reward: 200 }
];

async function checkAchievements(user) {
    const newAchievements = [];
    const userAchievements = user.achievements || [];
    
    for (const ach of ACHIEVEMENTS) {
        if (userAchievements.includes(ach.id)) continue;
        
        let unlocked = false;
        switch (ach.id) {
            case 'first_win': unlocked = user.wins >= 1; break;
            case 'wins_10': unlocked = user.wins >= 10; break;
            case 'wins_50': unlocked = user.wins >= 50; break;
            case 'wins_100': unlocked = user.wins >= 100; break;
            case 'coins_1000': unlocked = user.coins >= 1000; break;
            case 'level_5': unlocked = user.level >= 5; break;
            case 'level_10': unlocked = user.level >= 10; break;
            case 'streak_3': unlocked = user.currentWinStreak >= 3; break;
            case 'streak_5': unlocked = user.currentWinStreak >= 5; break;
            case 'games_50': unlocked = (user.wins + user.losses) >= 50; break;
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
        sessionId,
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
        const { sessionId, difficulty = 'medium' } = data;
        const session = await sessionsCollection.findOne({ sessionId });
        
        if (!session) {
            socket.emit('error', { message: 'Сессия недействительна' });
            return;
        }
        
        currentUser = await usersCollection.findOne({ _id: new ObjectId(session.userId) });
        if (!currentUser) return;
        
        // Создаем игру с ботом напрямую
        const roomId = uuidv4();
        const side = Math.random() > 0.5 ? 'plant' : 'zombie';
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
                    io.to(roomId).emit('botPlaceUnit', { lane: lane, unitId: unitId, side: botPlayer.side });
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
                    io.to(roomId).emit('botPlaceUnit', { lane: lane, unitId: unitId, side: botSide });
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
            // Даем награды ТОЛЬКО в PvP и авто-боте (не в режиме "Играть с ботом")
            const giveRewards = room.isBotGame && !room.players.find(p => p.user.isBot && p.side === winner.side);
            
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
