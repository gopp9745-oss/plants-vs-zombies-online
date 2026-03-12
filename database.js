// MongoDB база данных
const { MongoClient, ObjectId } = require('mongodb');

const MONGO_URI = process.env.MONGO_URI || process.env.MONGO_URL || 'mongodb+srv://grimteam:kolop908@cluster0.iifadf8.mongodb.net/?retryWrites=true&w=majority';
const DB_NAME = process.env.DB_NAME || 'pvz_online';

let client = null;
let db = null;

// Подключение к MongoDB
async function connect() {
    try {
        client = new MongoClient(MONGO_URI);
        await client.connect();
        db = client.db(DB_NAME);
        
        // Создаём индексы
        await db.collection('users').createIndex({ username: 1 }, { unique: true });
        await db.collection('users').createIndex({ usernameLower: 1 }, { unique: true });
        await db.collection('sessions').createIndex({ sessionId: 1 });
        await db.collection('matches').createIndex({ timestamp: -1 });
        await db.collection('promos').createIndex({ code: 1 }, { unique: true });
        
        console.log('✓ Подключено к MongoDB');
        
        // Создаём админа если нет
        await createAdminIfNotExists();
        
        return db;
    } catch (error) {
        console.error('Ошибка подключения к MongoDB:', error.message);
        throw error;
    }
}

async function createAdminIfNotExists() {
    const admin = await db.collection('users').findOne({ username: 'admin' });
    if (!admin) {
        const bcrypt = require('bcryptjs');
        await db.collection('users').insertOne({
            username: 'admin',
            usernameLower: 'admin',
            password: bcrypt.hashSync('admin123', 10),
            role: 'admin',
            coins: 0,
            crystals: 0,
            wins: 0,
            losses: 0,
            xp: 0,
            level: 1,
            elo: 1000,
            seasonElo: 1000,
            totalCoins: 0,
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
            plantChests: {
                common: 0,
                rare: 0,
                epic: 0,
                mythic: 0,
                legendary: 0
            },
            notifications: [],
            battlePass: {
                season: 1,
                level: 0,
                xp: 0,
                totalXp: 0,
                claimedRewards: [],
                quests: [],
                questsDate: null,
                // Добавляем новые поля для Battle Pass
                currentTier: 1,
                tierXp: 0,
                maxTierXp: 1000,
                freeRewardsClaimed: [],
                premiumRewardsClaimed: [],
                isPremium: false,
                premiumRequestedAt: null
            },
            inventory: {},
            // Поля профиля
            displayName: null,
            description: ''
        });
        console.log('✓ Создан админ (admin / admin123)');
    }
}

function getDb() {
    if (!db) {
        console.warn('Предупреждение: База данных не подключена');
        return null;
    }
    return db;
}

// Класс базы данных MongoDB
class MongoDB {
    constructor() {
        this.connected = false;
    }
    
    async init() {
        await connect();
        this.connected = true;
    }
    
    // Возвращает объект базы данных
    getDb() {
        return db;
    }
    
    // Users
    async findUser(query) {
        const collection = getDb().collection('users');
        if (query.username) {
            return await collection.findOne({ usernameLower: query.username.toLowerCase() });
        }
        if (query._id) {
            return await collection.findOne({ _id: new ObjectId(query._id) });
        }
        return null;
    }
    
    async findUserByUsername(username) {
        if (!username) return null;
        return await getDb().collection('users').findOne({ usernameLower: username.toLowerCase() });
    }
    
    async createUser(userData) {
        const user = {
            ...userData,
            coins: 0,
            crystals: 0,
            plantChests: {
                common: 0,
                rare: 0,
                epic: 0,
                mythic: 0,
                legendary: 0
            },
            notifications: [],
            battlePass: {
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
            },
            // Поля профиля
            displayName: null,
            description: '',
            createdAt: new Date(),
            lastLogin: new Date()
        };
        const result = await getDb().collection('users').insertOne(user);
        return { ...user, _id: result.insertedId };
    }
    
    async updateUser(username, data) {
        if (!username) {
            console.error('updateUser: username is undefined or null');
            return null;
        }
        const result = await getDb().collection('users').findOneAndUpdate(
            { usernameLower: username.toLowerCase() },
            { $set: data },
            { returnDocument: 'after' }
        );
        return result;
    }
    
    async deleteUser(username) {
        if (!username) return false;
        const result = await getDb().collection('users').deleteOne({ usernameLower: username.toLowerCase() });
        return result.deletedCount > 0;
    }
    
    async getAllUsers() {
        return await getDb().collection('users').find({}).toArray();
    }
    
    async getUsersCount() {
        return await getDb().collection('users').countDocuments();
    }
    
    async getUserById(id) {
        return await getDb().collection('users').findOne({ _id: new ObjectId(id) });
    }
    
    async searchUsers(query) {
        const regex = new RegExp(query, 'i');
        return await getDb().collection('users').find({
            $or: [
                { username: regex },
                { usernameLower: regex }
            ]
        }).limit(10).toArray();
    }
    
    async getTopByCoins(limit = 10) {
        return await getDb().collection('users')
            .find({})
            .sort({ coins: -1 })
            .limit(limit)
            .toArray();
    }
    
    async getTopByWins(limit = 10) {
        return await getDb().collection('users')
            .find({})
            .sort({ wins: -1 })
            .limit(limit)
            .toArray();
    }
    
    async getTopByXP(limit = 10) {
        return await getDb().collection('users')
            .find({})
            .sort({ xp: -1 })
            .limit(limit)
            .toArray();
    }
    
    async getTopByLevel(limit = 10) {
        return await getDb().collection('users')
            .find({})
            .sort({ level: -1, xp: -1 })
            .limit(limit)
            .toArray();
    }
    
    async getLevelStats() {
        return await getDb().collection('users')
            .aggregate([
                { $group: { _id: '$level', count: { $sum: 1 } } },
                { $sort: { _id: 1 } }
            ])
            .toArray();
    }
    
    // Sessions
    async createSession(sessionData) {
        const session = {
            ...sessionData,
            createdAt: new Date()
        };
        const result = await getDb().collection('sessions').insertOne(session);
        return { ...session, _id: result.insertedId };
    }
    
    async findSession(sessionId) {
        return await getDb().collection('sessions').findOne({ sessionId });
    }
    
    async deleteSession(sessionId) {
        const result = await getDb().collection('sessions').deleteOne({ sessionId });
        return result.deletedCount > 0;
    }
    
    async getSessionsCount() {
        return await getDb().collection('sessions').countDocuments();
    }
    
    async getAllSessions() {
        return await getDb().collection('sessions').find({}).toArray();
    }
    
    // Matches
    async createMatch(matchData) {
        const match = {
            ...matchData,
            timestamp: new Date()
        };
        const result = await getDb().collection('matches').insertOne(match);
        return { ...match, _id: result.insertedId };
    }
    
    async getMatches(limit = 20) {
        return await getDb().collection('matches')
            .find({})
            .sort({ timestamp: -1 })
            .limit(limit)
            .toArray();
    }
    
    async getMatchesCount() {
        return await getDb().collection('matches').countDocuments();
    }
    
    async clearMatches() {
        return await getDb().collection('matches').deleteMany({});
    }
    
    // Promos
    async createPromo(promoData) {
        const promo = {
            ...promoData,
            uses: 0,
            createdAt: new Date()
        };
        const result = await getDb().collection('promos').insertOne(promo);
        return { ...promo, _id: result.insertedId };
    }
    
    async findPromo(code) {
        if (!code) return null;
        return await getDb().collection('promos').findOne({ code: code.toUpperCase() });
    }
    
    async updatePromo(code, data) {
        if (!code) return null;
        const result = await getDb().collection('promos').findOneAndUpdate(
            { code: code.toUpperCase() },
            { $set: data },
            { returnDocument: 'after' }
        );
        return result;
    }
    
    async getPromosCount() {
        return await getDb().collection('promos').countDocuments();
    }
    
    async clearPromos() {
        return await getDb().collection('promos').deleteMany({});
    }
    
    // Sales
    async createSale(saleData) {
        const sale = {
            ...saleData,
            createdAt: new Date()
        };
        const result = await getDb().collection('sales').insertOne(sale);
        return { ...sale, _id: result.insertedId };
    }
    
    async getActiveSales() {
        return await getDb().collection('sales')
            .find({ expiresAt: { $gt: new Date() } })
            .toArray();
    }
    
    async getSalesCount() {
        return await getDb().collection('sales').countDocuments();
    }
    
    async clearExpiredSales() {
        return await getDb().collection('sales').deleteMany({ expiresAt: { $lt: new Date() } });
    }
    
    // Stats
    async getTotalWins() {
        const result = await getDb().collection('users').aggregate([
            { $group: { _id: null, total: { $sum: '$wins' } } }
        ]).toArray();
        return result[0]?.total || 0;
    }
    
    async getTotalGames() {
        const result = await getDb().collection('users').aggregate([
            { $group: { _id: null, total: { $sum: { $add: ['$wins', '$losses'] } } } }
        ]).toArray();
        return result[0]?.total || 0;
    }
    
    async getTotalCoins() {
        const result = await getDb().collection('users').aggregate([
            { $group: { _id: null, total: { $sum: '$coins' } } }
        ]).toArray();
        return result[0]?.total || 0;
    }
    
    async getTotalCrystals() {
        const result = await getDb().collection('users').aggregate([
            { $group: { _id: null, total: { $sum: '$crystals' } } }
        ]).toArray();
        return result[0]?.total || 0;
    }
    
    // Give coins to all users
    async giveCoinsToAll(amount) {
        return await getDb().collection('users').updateMany(
            {},
            { $inc: { coins: amount } }
        );
    }
    
    // Reset quests for all users
    async resetAllQuests() {
        return await getDb().collection('users').updateMany(
            {},
            { 
                $set: { 
                    dailyQuests: [],
                    dailyQuestsDate: null,
                    dailyQuestsGames: 0,
                    dailyQuestsWins: 0,
                    dailyQuestsCoins: 0,
                    dailyQuestsUnits: 0,
                    dailyQuestsChat: 0
                }
            }
        );
    }

    // Battle Pass functions
    async updateBattlePass(username, battlePassData) {
        return await this.updateUser(username, { battlePass: battlePassData });
    }

    async resetBattlePassQuests() {
        return await getDb().collection('users').updateMany(
            {},
            { 
                $set: { 
                    'battlePass.quests': [],
                    'battlePass.questsDate': null
                }
            }
        );
    }

        // Новые методы для Battle Pass
        async addBattlePassXp(username, xpAmount) {
            const user = await this.findUserByUsername(username);
            if (!user) return null;
            
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
                maxTierXp: 1000, // Исправлено значение по умолчанию
                freeRewardsClaimed: [],
                premiumRewardsClaimed: [],
                isPremium: false,
                premiumRequestedAt: null
            };
            
            // Добавляем XP
            battlePass.xp += xpAmount;
            battlePass.totalXp += xpAmount;
            battlePass.tierXp += xpAmount;
            
            // Проверяем, набрал ли Tier XP нужное количество
            let levelsGained = 0;
            while (battlePass.tierXp >= battlePass.maxTierXp) {
                battlePass.tierXp -= battlePass.maxTierXp;
                battlePass.currentTier += 1;
                battlePass.level += 1;
                levelsGained += 1;
                // Увеличиваем требования к XP за каждый уровень
                battlePass.maxTierXp = 1000 + (battlePass.currentTier - 1) * 50;
            }
            
            await this.updateUser(username, { battlePass });
            return { battlePass, levelsGained };
        }

        async claimBattlePassReward(username, tier, isPremium = false) {
            const user = await this.findUserByUsername(username);
            if (!user) return null;
            
            const battlePass = user.battlePass;
            if (!battlePass) return { success: false, message: 'Battle Pass не инициализирован' };

            if (isPremium && !battlePass.isPremium) {
                return { success: false, message: 'Для этой награды нужен Premium Battle Pass' };
            }
            const rewardId = `${tier}_${isPremium ? 'premium' : 'free'}`;
            
            // Проверяем, не получал ли пользователь эту награду
            const claimedList = isPremium ? battlePass.premiumRewardsClaimed : battlePass.freeRewardsClaimed;
            if (claimedList.includes(rewardId)) {
                return { success: false, message: 'Награда уже получена' };
            }
            
            // Добавляем в список полученных наград
            if (isPremium) {
                battlePass.premiumRewardsClaimed.push(rewardId);
            } else {
                battlePass.freeRewardsClaimed.push(rewardId);
            }
            
            await this.updateUser(username, { battlePass });
            return { success: true, battlePass };
        }

        async updateBattlePassQuestProgress(username, questId, progressIncrement) {
            const user = await this.findUserByUsername(username);
            if (!user) return null;
            
            const battlePass = user.battlePass;
            if (!battlePass || !battlePass.quests) return null; // Добавлена проверка на существование battlePass и quests
            
            const quest = battlePass.quests.find(q => q.id === questId);
            if (!quest || quest.completed) return null;
            
            quest.progress = Math.min(quest.progress + progressIncrement, quest.target);
            if (quest.progress >= quest.target) {
                quest.completed = true;
                // Добавляем XP за выполнение квеста
                await this.addBattlePassXp(username, quest.reward);
            }
            
            await this.updateUser(username, { battlePass });
            return { battlePass, quest };
        }

        async resetBattlePassSeason() {
            return await getDb().collection('users').updateMany(
                {},
                { 
                    $set: { 
                        'battlePass.season': { $add: ['$battlePass.season', 1] },
                        'battlePass.level': 0,
                        'battlePass.xp': 0,
                        'battlePass.totalXp': 0,
                        'battlePass.currentTier': 1,
                        'battlePass.tierXp': 0,
                        'battlePass.claimedRewards': [],
                        'battlePass.quests': [],
                        'battlePass.questsDate': null,
                        'battlePass.freeRewardsClaimed': [],
                        'battlePass.premiumRewardsClaimed': []
                    }
                }
            );
        }
    
    // Закрытие соединения
    async close() {
        if (client) {
            await client.close();
            console.log('✓ Отключено от MongoDB');
        }
    }
}

module.exports = new MongoDB();