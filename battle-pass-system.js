// Система Battle Pass для Plants vs Zombies Online
const db = require('./database');

// Конфигурация Battle Pass
const BATTLE_PASS_CONFIG = {
    seasonDuration: 60, // 60 дней
    xpPerLevel: 1000,   // 1000 XP за уровень
    maxLevel: 100,      // Максимальный уровень Battle Pass
    freeTiers: [1, 2, 3, 4, 5, 10, 15, 20, 25, 30, 40, 50, 60, 75, 90, 100], // Уровни с бесплатными наградами
    premiumTiers: [1, 3, 5, 10, 15, 20, 25, 30, 40, 50, 60, 75, 90, 100] // Уровни с премиум наградами
};

// Квесты для Battle Pass
const BATTLE_PASS_QUESTS = [
    { id: 'bp_win_1_game', name: 'Победитель', desc: 'Выиграйте 1 матч', reward: 100, type: 'wins', target: 1, category: 'battlepass' },
    { id: 'bp_win_3_games', name: 'Готов к битве', desc: 'Выиграйте 3 матча', reward: 250, type: 'wins', target: 3, category: 'battlepass' },
    { id: 'bp_play_5_games', name: 'Игроман', desc: 'Сыграйте 5 матчей', reward: 150, type: 'games', target: 5, category: 'battlepass' },
    { id: 'bp_earn_200_coins', name: 'Копилка', desc: 'Заработайте 200 монет', reward: 100, type: 'coins', target: 200, category: 'battlepass' },
    { id: 'bp_place_10_units', name: 'Командир', desc: 'Разместите 10 юнитов', reward: 120, type: 'units', target: 10, category: 'battlepass' },
    { id: 'bp_destroy_5_units', name: 'Разрушитель', desc: 'Уничтожьте 5 вражеских юнитов', reward: 180, type: 'destroy', target: 5, category: 'battlepass' },
    { id: 'bp_survive_10_minutes', name: 'Выживальщик', desc: 'Проведите в игре 10 минут', reward: 150, type: 'time', target: 10, category: 'battlepass' },
    { id: 'bp_use_different_plants', name: 'Коллекционер', desc: 'Используйте 5 разных растений', reward: 200, type: 'variety', target: 5, category: 'battlepass' }
];

// Награды за уровни Battle Pass
const BATTLE_PASS_REWARDS = {
    free: {
        1: { type: 'coins', amount: 50 },
        2: { type: 'xp', amount: 100 },
        3: { type: 'crystals', amount: 10 },
        4: { type: 'xp', amount: 150 },
        5: { type: 'rare_unit', name: 'Эпический юнит', amount: 1 },
        10: { type: 'coins', amount: 200 },
        15: { type: 'crystals', amount: 20 },
        20: { type: 'rare_unit', name: 'Эпический юнит', amount: 2 },
        25: { type: 'coins', amount: 500 },
        30: { type: 'legendary_unit', name: 'Легендарный юнит', amount: 1 },
        40: { type: 'xp', amount: 500 },
        50: { type: 'crystals', amount: 40 },
        60: { type: 'rare_unit', name: 'Эпический юнит', amount: 3 },
        75: { type: 'xp', amount: 750 },
        90: { type: 'coins', amount: 1500 },
        100: { type: 'legendary_unit', name: 'Легендарный юнит', amount: 2 }
    },
    premium: {
        1: { type: 'crystals', amount: 20 },
        2: { type: 'xp', amount: 200 },
        3: { type: 'coins', amount: 150 },
        4: { type: 'xp', amount: 300 },
        5: { type: 'plant_chest_rare', amount: 1 },
        10: { type: 'plant_chest_epic', amount: 1 },
        15: { type: 'crystals', amount: 40 },
        20: { type: 'plant_chest_epic', amount: 1 },
        25: { type: 'xp', amount: 600 },
        30: { type: 'plant_chest_mythic', amount: 1 },
        40: { type: 'coins', amount: 800 },
        50: { type: 'plant_chest_legendary', amount: 1 },
        60: { type: 'xp', amount: 1000 },
        75: { type: 'legendary_unit', name: 'Легендарный юнит', amount: 2 },
        90: { type: 'crystals', amount: 80 },
        100: { type: 'legendary_unit', name: 'Легендарный юнит', amount: 5 }
    }
};

// Система квестов для Battle Pass
function generateBattlePassQuests() {
    const availableQuests = BATTLE_PASS_QUESTS;
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
    return dailyQuests;
}

// Инициализация Battle Pass для пользователя
async function initializeBattlePass(username) {
    const user = await db.findUserByUsername(username);
    if (!user) return null;
    
    if (!user.battlePass) {
        user.battlePass = {
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
        await db.updateUser(username, { battlePass: user.battlePass });
    }
    
    return user.battlePass;
}

// Получение статуса Battle Pass
async function getBattlePassStatus(sessionId) {
    const session = await db.findSession(sessionId);
    if (!session) return null;
    
    const user = await db.findUser({ _id: session.userId });
    if (!user) return null;
    
    // Инициализируем Battle Pass если нет
    await initializeBattlePass(user.username);
    
    // Проверяем, нужно ли обновить квесты
    const today = new Date().toDateString();
    if (!user.battlePass.quests || user.battlePass.questsDate !== today) {
        user.battlePass.quests = generateBattlePassQuests();
        user.battlePass.questsDate = today;
        await db.updateUser(user.username, { battlePass: user.battlePass });
    }
    
    return user.battlePass;
}

// Добавление XP к Battle Pass
async function addBattlePassXp(username, xpAmount) {
    const user = await db.findUserByUsername(username);
    if (!user || !user.battlePass) return null;
    
    const battlePass = user.battlePass;
    battlePass.xp += xpAmount;
    battlePass.totalXp += xpAmount;
    battlePass.tierXp += xpAmount;
    
    // Проверяем повышение уровня
    let levelsGained = 0;
    while (battlePass.xp >= BATTLE_PASS_CONFIG.xpPerLevel) {
        battlePass.xp -= BATTLE_PASS_CONFIG.xpPerLevel;
        battlePass.level += 1;
        levelsGained += 1;
    }
    
    // Проверяем повышение Tier
    let tiersGained = 0;
    while (battlePass.tierXp >= battlePass.maxTierXp) {
        battlePass.tierXp -= battlePass.maxTierXp;
        battlePass.currentTier += 1;
        tiersGained += 1;
        // Увеличиваем требования к XP за каждый Tier
        battlePass.maxTierXp = 1000 + (battlePass.currentTier - 1) * 100;
    }
    
    await db.updateUser(username, { battlePass });
    return { battlePass, levelsGained, tiersGained };
}

// Получение награды за уровень Battle Pass
async function claimBattlePassReward(sessionId, tier, isPremium = false) {
    const session = await db.findSession(sessionId);
    if (!session) return { success: false, message: 'Сессия недействительна' };
    
    const user = await db.findUser({ _id: session.userId });
    if (!user) return { success: false, message: 'Пользователь не найден' };
    
    if (!user.battlePass) {
        return { success: false, message: 'Battle Pass не инициализирован' };
    }
    
    const battlePass = user.battlePass;
    const rewardId = `${tier}_${isPremium ? 'premium' : 'free'}`;
    const claimedList = isPremium ? battlePass.premiumRewardsClaimed : battlePass.freeRewardsClaimed;
    
    if (claimedList.includes(rewardId)) {
        return { success: false, message: 'Награда уже получена' };
    }
    
    // Проверяем, достиг ли игрок нужного уровня
    if (battlePass.level < tier) {
        return { success: false, message: 'Недостаточный уровень для получения этой награды' };
    }
    
    // Добавляем в список полученных наград
    claimedList.push(rewardId);
    
    // Выдаём награду
    const rewardType = isPremium ? 'premium' : 'free';
    const reward = BATTLE_PASS_REWARDS[rewardType][tier] || { type: 'coins', amount: 50 };
    
    let updateData = { battlePass };
    if (reward.type === 'coins') {
        updateData.coins = (user.coins || 0) + reward.amount;
    } else if (reward.type === 'xp') {
        const { level: newLevel, xp: newXP } = calculateLevel((user.xp || 0) + reward.amount);
        updateData.xp = newXP;
        if (newLevel > (user.level || 1)) updateData.level = newLevel;
    } else if (reward.type === 'crystals') {
        updateData.crystals = (user.crystals || 0) + reward.amount;
    } else if (reward.type === 'rare_unit' || reward.type === 'legendary_unit') {
        // Добавляем редкий юнит в инвентарь
        const inventory = user.inventory || {};
        inventory[reward.name] = { level: reward.amount, type: reward.type.replace('_unit', ''), purchased: new Date().toISOString() };
        updateData.inventory = inventory;
    } else if (reward.type && reward.type.startsWith('plant_chest_')) {
        const rarityKey = reward.type.replace('plant_chest_', '');
        const chests = user.plantChests || { common: 0, rare: 0, epic: 0, mythic: 0, legendary: 0 };
        if (chests[rarityKey] === undefined) chests[rarityKey] = 0;
        chests[rarityKey] += reward.amount || 1;
        updateData.plantChests = chests;
    }
    
    await db.updateUser(user.username, updateData);
    return { success: true, reward, userData: updateData, message: `Получена награда за ${tier} уровень Battle Pass!` };
}

// Выполнение квеста Battle Pass
async function completeBattlePassQuest(sessionId, questId) {
    const session = await db.findSession(sessionId);
    if (!session) return { success: false, message: 'Сессия недействительна' };
    
    const user = await db.findUser({ _id: session.userId });
    if (!user) return { success: false, message: 'Пользователь не найден' };
    
    if (!user.battlePass || !user.battlePass.quests) {
        return { success: false, message: 'Нет активных квестов' };
    }
    
    const quest = user.battlePass.quests.find(q => q.id === questId);
    if (!quest || quest.completed) {
        return { success: false, message: 'Квест не найден или уже выполнен' };
    }
    
    // Отмечаем квест как выполненный
    quest.completed = true;
    quest.progress = quest.target;
    
    // Добавляем XP к Battle Pass
    user.battlePass.xp += quest.reward;
    user.battlePass.totalXp += quest.reward;
    user.battlePass.tierXp += quest.reward;
    
    // Проверяем повышение уровня
    let levelsGained = 0;
    while (user.battlePass.xp >= BATTLE_PASS_CONFIG.xpPerLevel) {
        user.battlePass.xp -= BATTLE_PASS_CONFIG.xpPerLevel;
        user.battlePass.level += 1;
        levelsGained += 1;
    }
    
    // Проверяем повышение Tier
    let tiersGained = 0;
    while (user.battlePass.tierXp >= user.battlePass.maxTierXp) {
        user.battlePass.tierXp -= user.battlePass.maxTierXp;
        user.battlePass.currentTier += 1;
        tiersGained += 1;
        // Увеличиваем требования к XP за каждый Tier
        user.battlePass.maxTierXp = 1000 + (user.battlePass.currentTier - 1) * 100;
    }
    
    await db.updateUser(user.username, { battlePass: user.battlePass });
    return { success: true, battlePass: user.battlePass, quest, levelsGained, tiersGained, message: `Квест "${quest.name}" выполнен! Получено ${quest.reward} XP к Battle Pass!` };
}

// Обновление прогресса квеста Battle Pass
async function updateBattlePassQuestProgress(username, questId, progressIncrement) {
    const user = await db.findUserByUsername(username);
    if (!user || !user.battlePass || !user.battlePass.quests) return null;
    
    const quest = user.battlePass.quests.find(q => q.id === questId);
    if (!quest || quest.completed) return null;
    
    quest.progress = Math.min(quest.progress + progressIncrement, quest.target);
    if (quest.progress >= quest.target) {
        quest.completed = true;
        // Добавляем XP к Battle Pass за выполнение квеста
        user.battlePass.xp += quest.reward;
        user.battlePass.totalXp += quest.reward;
        user.battlePass.tierXp += quest.reward;
    }
    
    await db.updateUser(username, { battlePass: user.battlePass });
    return { battlePass: user.battlePass, quest };
}

// Функция для расчета уровня (исправленная)
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

// Экспорт API функций
module.exports = {
    BATTLE_PASS_CONFIG,
    BATTLE_PASS_QUESTS,
    BATTLE_PASS_REWARDS,
    getBattlePassStatus,
    addBattlePassXp,
    claimBattlePassReward,
    completeBattlePassQuest,
    updateBattlePassQuestProgress,
    generateBattlePassQuests,
    initializeBattlePass,
    calculateLevel
};