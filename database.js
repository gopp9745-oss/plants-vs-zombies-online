// Простая файловая база данных на JSON
const fs = require('fs');
const path = require('path');

const DB_PATH = path.join(__dirname, 'data');
const USERS_FILE = path.join(DB_PATH, 'users.json');
const MATCHES_FILE = path.join(DB_PATH, 'matches.json');
const PROMOS_FILE = path.join(DB_PATH, 'promos.json');
const SALES_FILE = path.join(DB_PATH, 'sales.json');
const SESSIONS_FILE = path.join(DB_PATH, 'sessions.json');

// Создаём папку для данных если нет
if (!fs.existsSync(DB_PATH)) {
    fs.mkdirSync(DB_PATH, { recursive: true });
}

// Функции для работы с файлами
function readJSON(file, defaultValue = []) {
    try {
        if (fs.existsSync(file)) {
            return JSON.parse(fs.readFileSync(file, 'utf8'));
        }
    } catch (e) {
        console.error('Ошибка чтения:', file, e.message);
    }
    return defaultValue;
}

function writeJSON(file, data) {
    try {
        fs.writeFileSync(file, JSON.stringify(data, null, 2));
    } catch (e) {
        console.error('Ошибка записи:', file, e.message);
    }
}

// Простая база данных
class FileDB {
    constructor() {
        this.users = readJSON(USERS_FILE, []);
        this.matches = readJSON(MATCHES_FILE, []);
        this.promos = readJSON(PROMOS_FILE, []);
        this.sales = readJSON(SALES_FILE, []);
        this.sessions = readJSON(SESSIONS_FILE, []);
        
        // Добавляем админа если нет
        const bcrypt = require('bcryptjs');
        if (!this.users.find(u => u.username === 'admin')) {
            this.users.push({
                username: 'admin',
                usernameLower: 'admin',
                password: bcrypt.hashSync('admin123', 10),
                role: 'admin',
                coins: 0,
                wins: 0,
                losses: 0,
                xp: 0,
                level: 1,
                elo: 1000,
                seasonElo: 1000,
                totalCoins: 0,
                createdAt: new Date().toISOString(),
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
            this.save();
            console.log('✓ Создан админ');
        }
    }
    
    save() {
        writeJSON(USERS_FILE, this.users);
        writeJSON(MATCHES_FILE, this.matches);
        writeJSON(PROMOS_FILE, this.promos);
        writeJSON(SALES_FILE, this.sales);
        writeJSON(SESSIONS_FILE, this.sessions);
    }
    
    // Users
    findUser(query) {
        if (query.username) {
            return this.users.find(u => u.usernameLower === query.username.toLowerCase());
        }
        if (query._id) {
            return this.users.find(u => u._id === query._id);
        }
        return null;
    }
    
    findUserByUsername(username) {
        return this.users.find(u => u.usernameLower === username.toLowerCase());
    }
    
    createUser(userData) {
        const user = {
            _id: 'user_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9),
            ...userData,
            createdAt: new Date().toISOString()
        };
        this.users.push(user);
        this.save();
        return user;
    }
    
    updateUser(username, data) {
        const idx = this.users.findIndex(u => u.usernameLower === username.toLowerCase());
        if (idx >= 0) {
            this.users[idx] = { ...this.users[idx], ...data };
            this.save();
            return this.users[idx];
        }
        return null;
    }
    
    deleteUser(username) {
        const idx = this.users.findIndex(u => u.usernameLower === username.toLowerCase());
        if (idx >= 0) {
            this.users.splice(idx, 1);
            this.save();
            return true;
        }
        return false;
    }
    
    getAllUsers() {
        return this.users;
    }
    
    getUsersCount() {
        return this.users.length;
    }
    
    // Sessions
    createSession(sessionData) {
        const session = {
            _id: 'session_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9),
            ...sessionData,
            createdAt: new Date().toISOString()
        };
        this.sessions.push(session);
        this.save();
        return session;
    }
    
    findSession(sessionId) {
        return this.sessions.find(s => s.sessionId === sessionId);
    }
    
    deleteSession(sessionId) {
        const idx = this.sessions.findIndex(s => s.sessionId === sessionId);
        if (idx >= 0) {
            this.sessions.splice(idx, 1);
            this.save();
            return true;
        }
        return false;
    }
    
    // Matches
    createMatch(matchData) {
        const match = {
            _id: 'match_' + Date.now(),
            ...matchData,
            timestamp: new Date().toISOString()
        };
        this.matches.push(match);
        this.save();
        return match;
    }
    
    getMatches(limit = 20) {
        return this.matches.slice(-limit).reverse();
    }
    
    getMatchesCount() {
        return this.matches.length;
    }
    
    clearMatches() {
        this.matches = [];
        this.save();
    }
    
    // Promos
    createPromo(promoData) {
        const promo = {
            _id: 'promo_' + Date.now(),
            ...promoData,
            uses: 0,
            createdAt: new Date().toISOString()
        };
        this.promos.push(promo);
        this.save();
        return promo;
    }
    
    findPromo(code) {
        return this.promos.find(p => p.code === code.toUpperCase());
    }
    
    updatePromo(code, data) {
        const idx = this.promos.findIndex(p => p.code === code.toUpperCase());
        if (idx >= 0) {
            this.promos[idx] = { ...this.promos[idx], ...data };
            this.save();
            return this.promos[idx];
        }
        return null;
    }
    
    getPromosCount() {
        return this.promos.length;
    }
    
    clearPromos() {
        this.promos = [];
        this.save();
    }
    
    // Sales
    createSale(saleData) {
        const sale = {
            _id: 'sale_' + Date.now(),
            ...saleData,
            createdAt: new Date().toISOString()
        };
        this.sales.push(sale);
        this.save();
        return sale;
    }
    
    getActiveSales() {
        const now = new Date();
        return this.sales.filter(s => new Date(s.expiresAt) > now);
    }
    
    getSalesCount() {
        return this.sales.length;
    }
    
    // Stats
    getTotalWins() {
        return this.users.reduce((sum, u) => sum + (u.wins || 0), 0);
    }
    
    getTotalGames() {
        return this.users.reduce((sum, u) => sum + (u.wins || 0) + (u.losses || 0), 0);
    }
    
    getTotalCoins() {
        return this.users.reduce((sum, u) => sum + (u.coins || 0), 0);
    }
}

module.exports = new FileDB();
