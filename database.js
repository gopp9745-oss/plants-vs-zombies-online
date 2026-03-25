// In-memory база данных для локальной разработки
const { v4: uuidv4 } = require('uuid');

const users = new Map();
const sessions = new Map();
const matches = [];
const promos = new Map();
const sales = [];

let dbConnected = false;

const BATTLE_PASS_CONFIG = {
    xpPerLevel: 1000,
    maxLevel: 100
};

async function connect() {
    try {
        dbConnected = true;
        console.log('✓ In-memory база данных инициализирована');
        await createAdminIfNotExists();
        return { users, sessions, matches, promos, sales };
    } catch (error) {
        console.error('Ошибка инициализации базы данных:', error.message);
        throw error;
    }
}

async function createAdminIfNotExists() {
    const admin = users.get('admin');
    if (!admin) {
        const bcrypt = require('bcryptjs');
        const adminUser = {
            _id: 'admin_' + Date.now(),
            username: 'admin',
            usernameLower: 'admin',
            password: bcrypt.hashSync('admin123', 10),
            role: 'admin',
            coins: 999999,
            crystals: 9999,
            wins: 0,
            losses: 0,
            xp: 0,
            level: 100,
            elo: 3000,
            seasonElo: 3000,
            totalCoins: 999999,
            createdAt: new Date(),
            lastLogin: new Date(),
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
            dailyQuestsChat: 0,
            plantChests: { common: 99, rare: 99, epic: 99, mythic: 99, legendary: 99 },
            notifications: [],
            battlePass: {
                season: 1, level: 100, xp: 0, totalXp: 100000,
                claimedRewards: [], quests: [], questsDate: null,
                currentTier: 100, tierXp: 0, maxTierXp: 1000,
                freeRewardsClaimed: [], premiumRewardsClaimed: [],
                isPremium: true, premiumRequestedAt: new Date()
            },
            inventory: {
                sunflower: { level: 10, type: 'plant', purchased: new Date().toISOString() },
                peashooter: { level: 10, type: 'plant', purchased: new Date().toISOString() },
                wallnut: { level: 10, type: 'plant', purchased: new Date().toISOString() },
                cherrybomb: { level: 10, type: 'plant', purchased: new Date().toISOString() },
                iceshroom: { level: 10, type: 'plant', purchased: new Date().toISOString() },
                snowpea: { level: 10, type: 'plant', purchased: new Date().toISOString() },
                chomper: { level: 10, type: 'plant', purchased: new Date().toISOString() },
                repeater: { level: 10, type: 'plant', purchased: new Date().toISOString() },
                squash: { level: 10, type: 'plant', purchased: new Date().toISOString() },
                twinsunflower: { level: 10, type: 'plant', purchased: new Date().toISOString() },
                melonpult: { level: 10, type: 'plant', purchased: new Date().toISOString() },
                cattail: { level: 10, type: 'plant', purchased: new Date().toISOString() },
                zombie: { level: 10, type: 'zombie', purchased: new Date().toISOString() },
                conehead: { level: 10, type: 'zombie', purchased: new Date().toISOString() },
                buckethead: { level: 10, type: 'zombie', purchased: new Date().toISOString() },
                football: { level: 10, type: 'zombie', purchased: new Date().toISOString() },
                dancing: { level: 10, type: 'zombie', purchased: new Date().toISOString() },
                dolphin: { level: 10, type: 'zombie', purchased: new Date().toISOString() },
                digger: { level: 10, type: 'zombie', purchased: new Date().toISOString() },
                bungee: { level: 10, type: 'zombie', purchased: new Date().toISOString() },
                gargantuar: { level: 10, type: 'zombie', purchased: new Date().toISOString() },
                yeti: { level: 10, type: 'zombie', purchased: new Date().toISOString() },
                king: { level: 10, type: 'zombie', purchased: new Date().toISOString() },
                dr: { level: 10, type: 'zombie', purchased: new Date().toISOString() }
            },
            displayName: 'Admin',
            description: 'Администратор сервера',
            favoritePlant: 'cherrybomb',
            friends: []
        };
        users.set('admin', adminUser);
        console.log('✓ Создан админ (admin / admin123)');
    }
}

class InMemoryDB {
    constructor() { this.connected = false; }
    async init() { await connect(); this.connected = true; }
    getDb() { return { users, sessions, matches, promos, sales }; }
    async findUser(query) {
        if (query.username) return users.get(query.username.toLowerCase()) || null;
        if (query._id) { for (const user of users.values()) { if (user._id === query._id) return user; } }
        return null;
    }
    async findUserByUsername(username) { if (!username) return null; return users.get(username.toLowerCase()) || null; }
    async createUser(userData) {
        const user = { ...userData, _id: 'user_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9),
            coins: userData.coins || 100, crystals: userData.crystals || 0,
            plantChests: userData.plantChests || { common: 0, rare: 0, epic: 0, mythic: 0, legendary: 0 },
            notifications: userData.notifications || [],
            battlePass: userData.battlePass || { season: 1, level: 0, xp: 0, totalXp: 0, claimedRewards: [], quests: [], questsDate: null, currentTier: 1, tierXp: 0, maxTierXp: 1000, freeRewardsClaimed: [], premiumRewardsClaimed: [], isPremium: false, premiumRequestedAt: null },
            inventory: userData.inventory || {}, displayName: userData.displayName || userData.username,
            description: userData.description || '', favoritePlant: userData.favoritePlant || null,
            createdAt: new Date(), lastLogin: new Date(), friends: userData.friends || [] };
        users.set(userData.usernameLower || userData.username.toLowerCase(), user);
        return user;
    }
    async updateUser(username, data) { if (!username) return null; const user = users.get(username.toLowerCase()); if (!user) return null; Object.assign(user, data); users.set(username.toLowerCase(), user); return user; }
    async updateFavoritePlant(username, favoritePlant) { if (!username) return null; const user = users.get(username.toLowerCase()); if (!user) return null; user.favoritePlant = favoritePlant || null; users.set(username.toLowerCase(), user); return user; }
    async deleteUser(username) { if (!username) return false; return users.delete(username.toLowerCase()); }
    async getAllUsers() { return Array.from(users.values()); }
    async getUsersCount() { return users.size; }
    async getUserById(id) { for (const user of users.values()) { if (user._id === id) return user; } return null; }
    async searchUsers(query) { const regex = new RegExp(query, 'i'); return Array.from(users.values()).filter(u => regex.test(u.username) || regex.test(u.usernameLower)).slice(0, 10); }
    async getTopByCoins(limit = 10) { return Array.from(users.values()).sort((a, b) => (b.coins || 0) - (a.coins || 0)).slice(0, limit); }
    async getTopByWins(limit = 10) { return Array.from(users.values()).sort((a, b) => (b.wins || 0) - (a.wins || 0)).slice(0, limit); }
    async getTopByXP(limit = 10) { return Array.from(users.values()).sort((a, b) => (b.xp || 0) - (a.xp || 0)).slice(0, limit); }
    async getTopByLevel(limit = 10) { return Array.from(users.values()).sort((a, b) => (b.level || 1) - (a.level || 1) || (b.xp || 0) - (a.xp || 0)).slice(0, limit); }
    async getLevelStats() { const stats = {}; for (const user of users.values()) { const level = user.level || 1; stats[level] = (stats[level] || 0) + 1; } return Object.entries(stats).map(([level, count]) => ({ _id: parseInt(level), count })); }
    async createSession(sessionData) { const session = { ...sessionData, _id: 'session_' + Date.now(), createdAt: new Date() }; sessions.set(sessionData.sessionId, session); return session; }
    async findSession(sessionId) { return sessions.get(sessionId) || null; }
    async deleteSession(sessionId) { return sessions.delete(sessionId); }
    async getSessionsCount() { return sessions.size; }
    async getAllSessions() { return Array.from(sessions.values()); }
    async createMatch(matchData) { const match = { ...matchData, _id: 'match_' + Date.now(), timestamp: new Date() }; matches.push(match); return match; }
    async getMatches(limit = 20) { return matches.slice(-limit).reverse(); }
    async getMatchesCount() { return matches.length; }
    async clearMatches() { matches.length = 0; return true; }
    async createPromo(promoData) { const promo = { ...promoData, _id: 'promo_' + Date.now(), uses: 0, createdAt: new Date() }; promos.set(promoData.code.toUpperCase(), promo); return promo; }
    async findPromo(code) { if (!code) return null; return promos.get(code.toUpperCase()) || null; }
    async updatePromo(code, data) { if (!code) return null; const promo = promos.get(code.toUpperCase()); if (!promo) return null; Object.assign(promo, data); promos.set(code.toUpperCase(), promo); return promo; }
    async getPromosCount() { return promos.size; }
    async clearPromos() { promos.clear(); return true; }
    async createSale(saleData) { const sale = { ...saleData, _id: 'sale_' + Date.now(), createdAt: new Date() }; sales.push(sale); return sale; }
    async getActiveSales() { return sales.filter(s => s.expiresAt > new Date()); }
    async getSalesCount() { return sales.length; }
    async clearExpiredSales() { const now = new Date(); const before = sales.length; for (let i = sales.length - 1; i >= 0; i--) { if (sales[i].expiresAt < now) { sales.splice(i, 1); } } return before - sales.length; }
    async getTotalWins() { let total = 0; for (const user of users.values()) { total += user.wins || 0; } return total; }
    async getTotalGames() { let total = 0; for (const user of users.values()) { total += (user.wins || 0) + (user.losses || 0); } return total; }
    async getTotalCoins() { let total = 0; for (const user of users.values()) { total += user.coins || 0; } return total; }
    async getTotalCrystals() { let total = 0; for (const user of users.values()) { total += user.crystals || 0; } return total; }
    async giveCoinsToAll(amount) { for (const user of users.values()) { user.coins = (user.coins || 0) + amount; } return { modifiedCount: users.size }; }
    async resetAllQuests() { for (const user of users.values()) { user.dailyQuests = []; user.dailyQuestsDate = null; user.dailyQuestsGames = 0; user.dailyQuestsWins = 0; user.dailyQuestsCoins = 0; user.dailyQuestsUnits = 0; user.dailyQuestsChat = 0; } return { modifiedCount: users.size }; }
    async updateBattlePass(username, battlePassData) { return await this.updateUser(username, { battlePass: battlePassData }); }
    async resetBattlePassQuests() { for (const user of users.values()) { if (user.battlePass) { user.battlePass.quests = []; user.battlePass.questsDate = null; } } return { modifiedCount: users.size }; }
    async addBattlePassXp(username, xpAmount) { const user = await this.findUserByUsername(username); if (!user) return null; const battlePass = user.battlePass || { season: 1, level: 0, xp: 0, totalXp: 0, claimedRewards: [], quests: [], questsDate: null, currentTier: 1, tierXp: 0, maxTierXp: 1000, freeRewardsClaimed: [], premiumRewardsClaimed: [], isPremium: false, premiumRequestedAt: null }; battlePass.xp += xpAmount; battlePass.totalXp += xpAmount; battlePass.tierXp += xpAmount; let levelsGained = 0; while (battlePass.tierXp >= battlePass.maxTierXp) { battlePass.tierXp -= battlePass.maxTierXp; battlePass.currentTier += 1; battlePass.level += 1; levelsGained += 1; battlePass.maxTierXp = 1000 + (battlePass.currentTier - 1) * 50; } await this.updateUser(username, { battlePass }); return { battlePass, levelsGained }; }
    async claimBattlePassReward(username, tier, isPremium = false) { const user = await this.findUserByUsername(username); if (!user) return null; const battlePass = user.battlePass; if (!battlePass) return { success: false, message: 'Battle Pass не инициализирован' }; if (isPremium && !battlePass.isPremium) { return { success: false, message: 'Для этой награды нужен Premium Battle Pass' }; } const rewardId = `${tier}_${isPremium ? 'premium' : 'free'}`; const claimedList = isPremium ? battlePass.premiumRewardsClaimed : battlePass.freeRewardsClaimed; if (claimedList.includes(rewardId)) { return { success: false, message: 'Награда уже получена' }; } if (isPremium) { battlePass.premiumRewardsClaimed.push(rewardId); } else { battlePass.freeRewardsClaimed.push(rewardId); } await this.updateUser(username, { battlePass }); return { success: true, battlePass }; }
    async updateBattlePassQuestProgress(username, questId, progressIncrement) { const user = await this.findUserByUsername(username); if (!user) return null; const battlePass = user.battlePass; if (!battlePass || !battlePass.quests) return null; const quest = battlePass.quests.find(q => q.id === questId); if (!quest || quest.completed) return null; quest.progress = Math.min(quest.progress + progressIncrement, quest.target); if (quest.progress >= quest.target) { quest.completed = true; await this.addBattlePassXp(username, quest.reward); } await this.updateUser(username, { battlePass }); return { battlePass, quest }; }
    async resetBattlePassSeason() { for (const user of users.values()) { if (user.battlePass) { user.battlePass.season = (user.battlePass.season || 1) + 1; user.battlePass.level = 0; user.battlePass.xp = 0; user.battlePass.totalXp = 0; user.battlePass.currentTier = 1; user.battlePass.tierXp = 0; user.battlePass.maxTierXp = 1000; user.battlePass.claimedRewards = []; user.battlePass.quests = []; user.battlePass.questsDate = null; user.battlePass.freeRewardsClaimed = []; user.battlePass.premiumRewardsClaimed = []; } } return { modifiedCount: users.size }; }
    async close() { console.log('✓ In-memory база данных закрыта'); }
}

module.exports = new InMemoryDB();