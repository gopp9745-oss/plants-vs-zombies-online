const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const path = require('path');
const fs = require('fs');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ==================== БАЗА ДАННЫХ ====================
const DATA_DIR = path.join(__dirname, 'data');

if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
}

const USERS_FILE = path.join(DATA_DIR, 'users.json');
const PROMOS_FILE = path.join(DATA_DIR, 'promos.json');
const MATCHES_FILE = path.join(DATA_DIR, 'matches.json');
const SALES_FILE = path.join(DATA_DIR, 'sales.json');

function loadData(filePath, defaultValue) {
    try {
        if (fs.existsSync(filePath)) {
            const data = fs.readFileSync(filePath, 'utf8');
            return JSON.parse(data);
        }
    } catch (e) {
        console.error('Ошибка загрузки данных:', e);
    }
    return defaultValue;
}

function saveData(filePath, data) {
    try {
        fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
    } catch (e) {
        console.error('Ошибка сохранения данных:', e);
    }
}

const users = new Map(loadData(USERS_FILE, []).map(u => [u.username.toLowerCase(), u]));
const sessions = new Map();
const promoCodes = new Map(loadData(PROMOS_FILE, []).map(p => [p.code, p]));
const matches = loadData(MATCHES_FILE, []);
const bannedIPs = new Map(); // username -> reason
const gameRooms = new Map();
const sales = loadData(SALES_FILE, []);

if (!users.has('admin')) {
    const adminId = uuidv4();
    users.set('admin', {
        id: adminId,
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
        currentWinStreak: 0
    });
    saveUsers();
}

function saveUsers() {
    saveData(USERS_FILE, Array.from(users.values()));
}

function savePromos() {
    saveData(PROMOS_FILE, Array.from(promoCodes.values()));
}

function saveMatches() {
    saveData(MATCHES_FILE, matches.slice(-100)); // Храним последние 100 матчей
}

function addMatch(winner, loser, winnerSide) {
    matches.push({
        id: uuidv4(),
        winner,
        loser,
        winnerSide,
        timestamp: new Date()
    });
    saveMatches();
}

function getXPForLevel(level) {
    return level * 100 + level * level * 10;
}

function addXP(user, amount) {
    user.xp += amount;
    while (user.xp >= getXPForLevel(user.level)) {
        user.xp -= getXPForLevel(user.level);
        user.level++;
        user.coins += 50;
    }
}

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
    
    if (users.has(username.toLowerCase())) {
        return res.json({ success: false, message: 'Пользователь уже существует' });
    }
    
    const id = uuidv4();
    users.set(username.toLowerCase(), {
        id,
        username,
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
        currentWinStreak: 0
    });
    
    saveUsers();
    res.json({ success: true, message: 'Регистрация успешна!' });
});

app.post('/api/login', async (req, res) => {
    const { username, password } = req.body;
    
    const user = users.get(username.toLowerCase());
    if (!user || !bcrypt.compareSync(password, user.password)) {
        return res.json({ success: false, message: 'Неверное имя пользователя или пароль' });
    }
    
    // Проверка на бан
    if (user.role === 'banned') {
        return res.json({ success: false, message: 'Ваш аккаунт заблокирован' });
    }
    
    const sessionId = uuidv4();
    sessions.set(sessionId, user.id);
    
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

app.post('/api/check-session', (req, res) => {
    const { sessionId } = req.body;
    const userId = sessions.get(sessionId);
    
    if (!userId) {
        return res.json({ success: false });
    }
    
    for (let user of users.values()) {
        if (user.id === userId) {
            if (user.role === 'banned') {
                sessions.delete(sessionId);
                return res.json({ success: false, message: 'Ваш аккаунт заблокирован' });
            }
            return res.json({ 
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
        }
    }
    
    res.json({ success: false });
});

app.post('/api/logout', (req, res) => {
    const { sessionId } = req.body;
    sessions.delete(sessionId);
    res.json({ success: true });
});

app.get('/api/leaderboard', (req, res) => {
    const leaders = Array.from(users.values())
        .filter(u => u.role !== 'banned')
        .sort((a, b) => b.wins - a.wins)
        .slice(0, 10)
        .map(u => ({
            username: u.username,
            wins: u.wins,
            coins: u.coins,
            level: u.level
        }));
    
    res.json({ success: true, leaders });
});

// Ежедневная награда
app.post('/api/daily-reward', (req, res) => {
    const { sessionId } = req.body;
    const userId = sessions.get(sessionId);
    
    if (!userId) {
        return res.json({ success: false, message: 'Сессия недействительна' });
    }
    
    let user = null;
    for (let u of users.values()) {
        if (u.id === userId) {
            user = u;
            break;
        }
    }
    
    if (!user) {
        return res.json({ success: false, message: 'Пользователь не найден' });
    }
    
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
    
    // Даем награду
    const reward = 50 + user.level * 10;
    user.coins += reward;
    user.lastDaily = now.toISOString();
    
    saveUsers();
    res.json({ success: true, message: `Получено ${reward} монет!`, coins: user.coins });
});

// История матчей
app.get('/api/match-history', (req, res) => {
    res.json({ success: true, matches: matches.slice(-20).reverse() });
});

// Профиль игрока
app.get('/api/profile/:username', (req, res) => {
    const user = users.get(req.params.username.toLowerCase());
    if (!user) {
        return res.json({ success: false, message: 'Игрок не найден' });
    }
    
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

app.post('/api/promocode', (req, res) => {
    const { sessionId, code } = req.body;
    const userId = sessions.get(sessionId);
    
    if (!userId) {
        return res.json({ success: false, message: 'Сессия недействительна' });
    }
    
    const promo = promoCodes.get(code.toUpperCase());
    if (!promo) {
        return res.json({ success: false, message: 'Неверный промокод' });
    }
    
    if (promo.uses >= promo.maxUses) {
        return res.json({ success: false, message: 'Промокод больше недействителен' });
    }
    
    let user = null;
    for (let u of users.values()) {
        if (u.id === userId) {
            user = u;
            break;
        }
    }
    
    if (!user) {
        return res.json({ success: false, message: 'Пользователь не найден' });
    }
    
    user.coins += promo.reward;
    promo.uses++;
    
    saveUsers();
    savePromos();
    
    res.json({ success: true, message: `Получено ${promo.reward} монет!`, coins: user.coins });
});

// ==================== ADMIN API ====================

app.post('/api/admin/create-promo', (req, res) => {
    const { sessionId, code, reward, maxUses } = req.body;
    const userId = sessions.get(sessionId);
    
    if (!userId) {
        return res.json({ success: false, message: 'Сессия недействительна' });
    }
    
    let isAdmin = false;
    for (let user of users.values()) {
        if (user.id === userId && user.role === 'admin') {
            isAdmin = true;
            break;
        }
    }
    
    if (!isAdmin) {
        return res.json({ success: false, message: 'Доступ запрещен' });
    }
    
    promoCodes.set(code.toUpperCase(), {
        reward: parseInt(reward),
        uses: 0,
        maxUses: parseInt(maxUses),
        createdBy: 'admin'
    });
    
    savePromos();
    res.json({ success: true, message: 'Промокод создан!' });
});

app.post('/api/admin/users', (req, res) => {
    const { sessionId } = req.body;
    const userId = sessions.get(sessionId);
    
    if (!userId) {
        return res.json({ success: false, message: 'Сессия недействительна' });
    }
    
    let isAdmin = false;
    for (let user of users.values()) {
        if (user.id === userId && user.role === 'admin') {
            isAdmin = true;
            break;
        }
    }
    
    if (!isAdmin) {
        return res.json({ success: false, message: 'Доступ запрещен' });
    }
    
    const allUsers = Array.from(users.values()).map(u => ({
        username: u.username,
        role: u.role,
        coins: u.coins,
        wins: u.wins,
        losses: u.losses,
        level: u.level,
        totalGames: u.totalGames,
        createdAt: u.createdAt
    }));
    
    res.json({ success: true, users: allUsers });
});

app.post('/api/admin/stats', (req, res) => {
    const { sessionId } = req.body;
    const userId = sessions.get(sessionId);
    
    if (!userId) {
        return res.json({ success: false, message: 'Сессия недействительна' });
    }
    
    let isAdmin = false;
    for (let user of users.values()) {
        if (user.id === userId && user.role === 'admin') {
            isAdmin = true;
            break;
        }
    }
    
    if (!isAdmin) {
        return res.json({ success: false, message: 'Доступ запрещен' });
    }
    
    const allUsers = Array.from(users.values());
    const stats = {
        totalUsers: allUsers.length,
        totalWins: allUsers.reduce((sum, u) => sum + u.wins, 0),
        totalGames: allUsers.reduce((sum, u) => sum + u.wins + u.losses, 0),
        totalCoins: allUsers.reduce((sum, u) => sum + u.coins, 0),
        promoCodes: promoCodes.size,
        totalMatches: matches.length
    };
    
    res.json({ success: true, stats });
});

// API для скидок
app.get('/api/sales', (req, res) => {
    res.json({ success: true, sales: sales });
});

app.post('/api/admin/create-sale', (req, res) => {
    const { sessionId, plantId, discount, duration } = req.body;
    const userId = sessions.get(sessionId);
    
    if (!userId) {
        return res.json({ success: false, message: 'Сессия недействительна' });
    }
    
    let isAdmin = false;
    for (let user of users.values()) {
        if (user.id === userId && user.role === 'admin') {
            isAdmin = true;
            break;
        }
    }
    
    if (!isAdmin) {
        return res.json({ success: false, message: 'Доступ запрещен' });
    }
    
    const sale = {
        id: uuidv4(),
        plantId,
        discount: parseInt(discount),
        duration: parseInt(duration),
        createdAt: new Date(),
        expiresAt: new Date(Date.now() + parseInt(duration))
    };
    
    sales.push(sale);
    saveData(SALES_FILE, sales);
    
    res.json({ success: true, message: 'Акция создана!' });
});

app.post('/api/admin/edit-coins', (req, res) => {
    const { sessionId, username, coins } = req.body;
    const userId = sessions.get(sessionId);
    
    if (!userId) {
        return res.json({ success: false, message: 'Сессия недействительна' });
    }
    
    let isAdmin = false;
    for (let user of users.values()) {
        if (user.id === userId && user.role === 'admin') {
            isAdmin = true;
            break;
        }
    }
    
    if (!isAdmin) {
        return res.json({ success: false, message: 'Доступ запрещен' });
    }
    
    const targetUser = users.get(username.toLowerCase());
    if (!targetUser) {
        return res.json({ success: false, message: 'Пользователь не найден' });
    }
    
    targetUser.coins = parseInt(coins);
    saveUsers();
    
    res.json({ success: true, message: 'Монеты обновлены!' });
});

// Бан игрока
app.post('/api/admin/ban', (req, res) => {
    const { sessionId, username, reason } = req.body;
    const userId = sessions.get(sessionId);
    
    if (!userId) {
        return res.json({ success: false, message: 'Сессия недействительна' });
    }
    
    let isAdmin = false;
    for (let user of users.values()) {
        if (user.id === userId && user.role === 'admin') {
            isAdmin = true;
            break;
        }
    }
    
    if (!isAdmin) {
        return res.json({ success: false, message: 'Доступ запрещен' });
    }
    
    const targetUser = users.get(username.toLowerCase());
    if (!targetUser) {
        return res.json({ success: false, message: 'Пользователь не найден' });
    }
    
    if (targetUser.role === 'admin') {
        return res.json({ success: false, message: 'Нельзя забанить админа' });
    }
    
    targetUser.role = 'banned';
    bannedIPs.set(username.toLowerCase(), reason || 'Нарушение правил');
    saveUsers();
    
    res.json({ success: true, message: `Игрок ${username} заблокирован!` });
});

// Разбан игрока
app.post('/api/admin/unban', (req, res) => {
    const { sessionId, username } = req.body;
    const userId = sessions.get(sessionId);
    
    if (!userId) {
        return res.json({ success: false, message: 'Сессия недействительна' });
    }
    
    let isAdmin = false;
    for (let user of users.values()) {
        if (user.id === userId && user.role === 'admin') {
            isAdmin = true;
            break;
        }
    }
    
    if (!isAdmin) {
        return res.json({ success: false, message: 'Доступ запрещен' });
    }
    
    const targetUser = users.get(username.toLowerCase());
    if (!targetUser) {
        return res.json({ success: false, message: 'Пользователь не найден' });
    }
    
    targetUser.role = 'player';
    bannedIPs.delete(username.toLowerCase());
    saveUsers();
    
    res.json({ success: true, message: `Игрок ${username} разблокирован!` });
});

// ==================== ИГРОВОЙ СЕРВЕР ====================

io.on('connection', (socket) => {
    console.log('Игрок подключился:', socket.id);
    
    let currentRoom = null;
    let currentUser = null;
    
    // Чат в игре
    socket.on('sendMessage', (data) => {
        if (currentRoom && currentUser) {
            io.to(currentRoom).emit('chatMessage', {
                username: currentUser.username,
                message: data.message.substring(0, 100),
                time: new Date().toLocaleTimeString()
            });
        }
    });
    
    socket.on('findGame', (data) => {
        const { sessionId } = data;
        const userId = sessions.get(sessionId);
        
        if (!userId) {
            socket.emit('error', { message: 'Сессия недействительна' });
            return;
        }
        
        for (let user of users.values()) {
            if (user.id === userId) {
                currentUser = user;
                break;
            }
        }
        
        if (!currentUser) return;
        
        for (let [roomId, room] of gameRooms) {
            if (room.players.length === 1 && room.state === 'waiting') {
                const side = room.players[0].side === 'plant' ? 'zombie' : 'plant';
                room.players.push({ id: socket.id, side, user: currentUser });
                currentRoom = roomId;
                socket.join(roomId);
                
                room.state = 'playing';
                
                io.to(roomId).emit('gameStart', {
                    roomId,
                    players: room.players.map(p => ({ id: p.id, side: p.side, username: p.user.username })),
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
        
        const roomId = uuidv4();
        const side = Math.random() > 0.5 ? 'plant' : 'zombie';
        
        gameRooms.set(roomId, {
            players: [{ id: socket.id, side, user: currentUser }],
            state: 'waiting',
            timer: null
        });
        
        currentRoom = roomId;
        socket.join(roomId);
        socket.emit('waiting', { message: 'Ожидание противника...' });
    });
    
    socket.on('leaveQueue', () => {
        if (currentRoom) {
            const room = gameRooms.get(currentRoom);
            if (room) {
                if (room.state === 'waiting') {
                    room.players = room.players.filter(p => p.id !== socket.id);
                    if (room.players.length === 0) {
                        gameRooms.delete(currentRoom);
                    }
                } else if (room.state === 'playing') {
                    const loser = room.players.find(p => p.id === socket.id);
                    const winner = room.players.find(p => p.id !== socket.id);
                    
                    if (loser && winner) {
                        winner.user.wins++;
                        loser.user.losses++;
                        winner.user.totalGames++;
                        loser.user.totalGames++;
                        
                        // Серия побед
                        winner.user.currentWinStreak++;
                        if (winner.user.currentWinStreak > winner.user.longestWinStreak) {
                            winner.user.longestWinStreak = winner.user.currentWinStreak;
                        }
                        loser.user.currentWinStreak = 0;
                        
                        addXP(winner.user, 50);
                        addXP(loser.user, 20);
                        
                        addMatch(winner.user.username, loser.user.username, winner.side);
                        saveUsers();
                        
                        io.to(currentRoom).emit('gameEnd', { 
                            winner: winner.user.username, 
                            winnerSide: winner.side 
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
        if (currentRoom) {
            socket.to(currentRoom).emit('opponentPlanted', data);
        }
    });
    
    socket.on('zombiePlaced', (data) => {
        if (currentRoom) {
            socket.to(currentRoom).emit('opponentZombie', data);
        }
    });
    
    socket.on('attack', (data) => {
        if (currentRoom) {
            socket.to(currentRoom).emit('opponentAttack', data);
        }
    });
    
    socket.on('unitDied', (data) => {
        if (currentRoom) {
            socket.to(currentRoom).emit('opponentUnitDied', data);
        }
    });
    
    socket.on('gameOver', (data) => {
        if (currentRoom) {
            const room = gameRooms.get(currentRoom);
            if (room && room.state === 'playing') {
                endRound(currentRoom, data.winner);
            }
        }
    });
    
    socket.on('disconnect', () => {
        console.log('Игрок отключился:', socket.id);
        if (currentRoom) {
            const room = gameRooms.get(currentRoom);
            if (room) {
                if (room.state === 'waiting') {
                    room.players = room.players.filter(p => p.id !== socket.id);
                    if (room.players.length === 0) {
                        gameRooms.delete(currentRoom);
                    }
                } else if (room.state === 'playing') {
                    const loser = room.players.find(p => p.id === socket.id);
                    const winner = room.players.find(p => p.id !== socket.id);
                    
                    if (loser && winner) {
                        winner.user.wins++;
                        loser.user.losses++;
                        winner.user.totalGames++;
                        loser.user.totalGames++;
                        winner.user.currentWinStreak++;
                        if (winner.user.currentWinStreak > winner.user.longestWinStreak) {
                            winner.user.longestWinStreak = winner.user.currentWinStreak;
                        }
                        loser.user.currentWinStreak = 0;
                        
                        addXP(winner.user, 50);
                        addXP(loser.user, 20);
                        
                        addMatch(winner.user.username, loser.user.username, winner.side);
                        saveUsers();
                        
                        io.to(currentRoom).emit('gameEnd', { 
                            winner: winner.user.username, 
                            winnerSide: winner.side 
                        });
                    }
                    
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
            winner.user.wins++;
            loser.user.losses++;
            winner.user.totalGames++;
            loser.user.totalGames++;
            
            winner.user.currentWinStreak++;
            if (winner.user.currentWinStreak > winner.user.longestWinStreak) {
                winner.user.longestWinStreak = winner.user.currentWinStreak;
            }
            loser.user.currentWinStreak = 0;
            
            winner.user.coins += 50;
            loser.user.coins += 10;
            
            addXP(winner.user, 50);
            addXP(loser.user, 20);
            
            addMatch(winner.user.username, loser.user.username, winner.side);
            saveUsers();
            
            io.to(roomId).emit('gameEnd', { 
                winner: winner.user.username, 
                winnerSide: winner.side,
                rewards: { winner: 50, loser: 10 }
            });
        }
    } else {
        room.players.forEach(p => {
            p.user.coins += 20;
            p.user.totalGames++;
            addXP(p.user, 20);
        });
        
        saveUsers();
        
        io.to(roomId).emit('gameEnd', { 
            winner: 'draw',
            rewards: { winner: 20, loser: 20 }
        });
    }
    
    gameRooms.delete(roomId);
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Сервер запущен на порту ${PORT}`);
    console.log('Админ: логин - admin, пароль - admin123');
    console.log('Новые функции: чат, уровни, ежедневные награды, история матчей, бан игроков');
});
