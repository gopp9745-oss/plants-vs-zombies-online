        // Создание фоновых частиц
        function createParticles() {
            const container = document.getElementById('bgParticles');
            const emojis = ['🌻', '🧟', '🌱', '🍄', '💀', '🌿', '🥜', '🟢'];
            for (let i = 0; i < 15; i++) {
                const particle = document.createElement('div');
                particle.className = 'particle';
                particle.textContent = emojis[Math.floor(Math.random() * emojis.length)];
                particle.style.left = Math.random() * 100 + '%';
                particle.style.animationDelay = Math.random() * 15 + 's';
                particle.style.animationDuration = (10 + Math.random() * 10) + 's';
                container.appendChild(particle);
            }
        }
        createParticles();
        
        let currentUser = null, sessionId = localStorage.getItem('sessionId'), socket = null, gameState = null, selectedUnit = null;
         
        // Функция для экранирования HTML (защита от XSS)
        function escapeHtml(text) {
            if (!text) return '';
            const div = document.createElement('div');
            div.textContent = text;
            return div.innerHTML;
        }
        
        // === СИСТЕМА ПЕРЕКЛЮЧЕНИЯ ИНТЕРФЕЙСА ===
        let currentInterfaceMode = localStorage.getItem('interfaceMode') || 'auto'; // 'auto', 'pc', 'mobile'
        
        function initInterfaceMode() {
            updateInterfaceMode();
            // Слушаем изменение размера окна
            window.addEventListener('resize', updateInterfaceMode);
        }
        
        function updateInterfaceMode() {
            const isMobile = window.innerWidth <= 900;
            const body = document.body;
            
            // Удаляем старые классы
            body.classList.remove('force-pc-mode', 'force-mobile-mode');
            
            if (currentInterfaceMode === 'pc') {
                body.classList.add('force-pc-mode');
                updateToggleButton('pc');
            } else if (currentInterfaceMode === 'mobile') {
                body.classList.add('force-mobile-mode');
                updateToggleButton('mobile');
            } else {
                // Авто режим - используем CSS media queries
                updateToggleButton('auto');
            }
        }
        
        function toggleInterfaceMode() {
            // Циклически переключаем: auto -> pc -> mobile -> auto
            if (currentInterfaceMode === 'auto') {
                currentInterfaceMode = 'pc';
            } else if (currentInterfaceMode === 'pc') {
                currentInterfaceMode = 'mobile';
            } else {
                currentInterfaceMode = 'auto';
            }
            
            localStorage.setItem('interfaceMode', currentInterfaceMode);
            updateInterfaceMode();
            
            // Показываем уведомление
            const modeNames = { 'auto': 'Авто', 'pc': 'ПК', 'mobile': 'Телефон' };
            alert('Интерфейс: ' + modeNames[currentInterfaceMode]);
        }
        
        function updateToggleButton(mode) {
            const btn = document.getElementById('interfaceToggleBtn');
            if (!btn) return;
            
            const icons = { 'auto': '🔄', 'pc': '🖥️', 'mobile': '📱' };
            const texts = { 'auto': 'Авто', 'pc': 'ПК', 'mobile': 'Телефон' };
            
            btn.innerHTML = `<span class="interface-toggle-icon">${icons[mode]}</span><span class="interface-toggle-text">${texts[mode]}</span>`;
        }
        
        // Инициализируем при загрузке
        document.addEventListener('DOMContentLoaded', initInterfaceMode);
        
        // Функция для получения прав админа по коду
        async function becomeAdmin() {
            const code = prompt('Введите код администратора:');
            if (!code) return;
            
            const sessionId = localStorage.getItem('sessionId');
            if (!sessionId) { alert('Сначала войдите в аккаунт!'); return; }
            
            try {
                const res = await fetch('/api/admin/become-admin', {
                    method: 'POST',
                    headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify({sessionId, adminCode: code})
                });
                const data = await res.json();
                alert(data.message);
                if (data.success) location.reload();
            } catch(e) {
                alert('Ошибка: ' + e.message);
            }
        }
        
        const units = {
            plant: [
                // === АТАКУЮЩИЕ РАСТЕНИЯ ===
                {id:'peashooter',icon:'🟢',name:'Горохострел',desc:'Стреляет горошинами в зомби. Базовая атака.',health:100,damage:20,attackSpeed:1.5,cost:50,level:1,type:'attacker',skins:['🟢','🥒','🌿']},
                {id:'repeater',icon:'🔫',name:'Двуствол',desc:'Стреляет двумя горошинами за раз. Сильная атака.',health:100,damage:40,attackSpeed:1.5,cost:100,level:3,type:'attacker',skins:['🔫','🏹','⚔️']},
                {id:'snowpea',icon:'❄️',name:'Морозник',desc:'Стреляет ледяными горошинами, замедляет зомби.',health:100,damage:25,attackSpeed:1.5,cost:75,level:3,type:'attacker',slow:0.5,skins:['❄️','🌨️','⛄']},
                {id:'melonpult',icon:'🍉',name:'Арбузомет',desc:'Стреляет тяжелыми арбузами. Большой урон.',health:150,damage:80,attackSpeed:2,cost:200,level:10,type:'attacker',skins:['🍉','🍈','🍍']},
                {id:'chomper',icon:'👄',name:'Хапунец',desc:'Поедает зомби целиком. Очень большой урон, но долго переваривает.',health:150,damage:200,attackSpeed:5,cost:75,level:3,type:'attacker',skins:['👄','🦷','🐊']},
                {id:'cattail',icon:'🐱',name:'Котоушка',desc:'Атакует зомби на любой линии. Универсальный стрелок.',health:100,damage:30,attackSpeed:1.5,cost:150,level:10,type:'attacker',skins:['🐱','🐯','🦁']},
                
                // === СОЛНЦЕДОБЫВАТЕЛИ ===
                {id:'sunflower',icon:'🌻',name:'Солнечник',desc:'Производит солнце каждые 10 сек. Основа экономики.',health:80,sunProduction:10,sunSpeed:10,cost:50,level:1,type:'producer',skins:['🌻','🌼','🌺']},
                {id:'twinsunflower',icon:'🌞',name:'Двойняшка',desc:'Производит солнце в 2 раза быстрее. Экономический MVP.',health:120,sunProduction:20,sunSpeed:10,cost:150,level:10,type:'producer',skins:['🌞','⭐','☀️']},
                {id:'moonglow',icon:'🌙',name:'Лунарик',desc:'Производит лунный свет (даёт больше солнца но днём медленнее).',health:60,sunProduction:25,sunSpeed:15,cost:200,level:15,type:'producer',skins:['🌙','🌛','✨']},
                
                // === ЗАЩИТНИКИ ===
                {id:'wallnut',icon:'🥜',name:'Орешек',desc:'Прочная стена. Защищает другие растения. Большое HP.',health:400,cost:50,level:1,type:'defender',skins:['🥜','🥔','🌰']},
                {id:'tallnut',icon:'🌴',name:'Великан',desc:'Невероятно прочный страж. Зомби не могут его съесть.',health:800,cost:125,level:5,type:'defender',skins:['🌴','🌲','🌳']},
                {id:'puffshroom',icon:'🍄',name:'Дымовичок',desc:'Маленький защитник с быстрой атакой на короткие дистанции.',health:60,damage:10,attackSpeed:0.8,cost:30,level:1,type:'hybrid',skins:['🍄','🦟','🐛']},
                
                // === ВЗРЫВЧАТКА ===
                {id:'cherrybomb',icon:'🍒',name:'Вишнёвая бомба',desc:'Взрывается нанося огромный урон всем зомби на поле!',health:100,damage:1800,attackSpeed:0,cost:150,level:5,type:'explosive',skins:['🍒','🍓','🍅']},
                {id:'potatomine',icon:'🥔',name:'Картошка-мина',desc:'Взрывается когда зомби подходит близко. Большой урон.',health:50,damage:300,attackSpeed:0,cost:50,level:1,type:'explosive',skins:['🥔','🍠','🥖']},
                {id:'squash',icon:'🎃',name:'Тыквогон',desc:'Выпрыгивает и раздавливает зомби. Один выстрел - один зомби.',health:150,damage:400,attackSpeed:0,cost:100,level:5,type:'explosive',skins:['🎃','🥒','🍆']},
                {id:'iceshroom',icon:'🧊',name:'Ледяник',desc:'Взрывается и замораживает всех зомби.',health:80,damage:100,attackSpeed:0,cost:75,level:5,type:'explosive',freeze:3,skins:['🧊','💎','🔷']},
                
                // === СПЕЦИАЛЬНЫЕ ===
                {id:'scaredyshroom',icon:'😱',name:'Трусишка',desc:'Стреляет только когда зомби близко. Экономит ресурсы.',health:80,damage:15,attackSpeed:2,cost:40,level:1,type:'attacker',skins:['😱','😨','😰']},
                {id:'hypnoshroom',icon:'🌀',name:'Гипноз',desc:'Превращает зомби в союзника на 15 сек!',health:60,attackSpeed:0,cost:150,level:10,type:'special',skins:['🌀','🔮','💫']},
                {id:'magnetshroom',icon:'🧲',name:'Магнетик',desc:'Притягивает металлические предметы зомби (ведра, шлемы).',health:100,attackSpeed:0,cost:100,level:5,type:'special',skins:['🧲','🧭','🔩']}
            ],
            zombie: [
                // === ОСНОВНЫЕ ЗОМБИ ===
                {id:'zombie',icon:'🧟',name:'Ходок',desc:'Обычный зомби. Ест растения и идёт к дому.',health:100,damage:20,moveSpeed:1,cost:50,level:1,type:'basic',skins:['🧟','💀','👻']},
                {id:'conehead',icon:'🧢',name:'Шлемник',desc:'Носит конус, повышающий защиту. Среднее HP.',health:200,damage:20,moveSpeed:1,cost:75,level:1,type:'basic',skins:['🧢','🎩','👑']},
                {id:'buckethead',icon:'🪣',name:'Ведроголов',desc:'Носит ведро, очень прочный. Высокое HP.',health:350,damage:20,moveSpeed:0.9,cost:100,level:1,type:'basic',skins:['🪣','🛒','📦']},
                
                // === БЫСТРЫЕ ЗОМБИ ===
                {id:'football',icon:'🏈',name:'Спортсмен',desc:'Быстрый зомби. Атакует с высокой скоростью.',health:250,damage:25,moveSpeed:1.5,cost:125,level:3,type:'fast',skins:['🏈','⚽','🏀']},
                {id:'dolphin',icon:'🐬',name:'Дельфин',desc:'Плывёт по воде (быстрее всех!). Атакует быстро.',health:120,damage:30,moveSpeed:1.8,cost:100,level:3,type:'fast',skins:['🐬','🦈','🐳']},
                {id:'_imp',icon:'👿',name:'Бес',desc:'Маленький но быстрый. Атакует стремительно.',health:60,damage:40,moveSpeed:2,cost:50,level:3,type:'fast',skins:['👿','😈','👺']},
                
                // === СИЛЬНЫЕ ЗОМБИ ===
                {id:'gargantuar',icon:'👹',name:'Гигант',desc:'Огромный зомби с большим уроном. Ест всё на своём пути.',health:600,damage:100,moveSpeed:0.5,cost:300,level:5,type:'tank',skins:['👹','👾','🎃']},
                {id:'yeti',icon:'🦬',name:'Йети',desc:'Редкий ледяной зомби. Очень вынослив.',health:400,damage:40,moveSpeed:0.8,cost:200,level:10,type:'tank',skins:['🦬','🐻','🦍']},
                {id:'king',icon:'🤴',name:'Король',desc:'Командный зомби. Усиливает других зомби.',health:500,damage:50,moveSpeed:0.7,cost:250,level:10,type:'leader',skins:['🤴','👸','🦸']},
                
                // === СПЕЦИАЛЬНЫЕ ЗОМБИ ===
                {id:'digger',icon:'⛏️',name:'Копатель',desc:'Копает под землёй и появляется за растениями!',health:150,damage:35,moveSpeed:1.2,cost:125,level:5,type:'special',ability:'dig',skins:['⛏️','🔧','⚒️']},
                {id:'bungee',icon:'🪝',name:'Крючник',desc:'Хватает растение и утаскивает его!',health:80,damage:50,moveSpeed:1,cost:150,level:5,type:'special',ability:'grab',skins:['🪝','🎣','🪤']},
                {id:'dancing',icon:'💃',name:'Танцор',desc:'Призывает зомби-теней каждые 5 сек.',health:100,damage:20,moveSpeed:1,cost:100,level:3,type:'special',ability:'summon',skins:['💃','🕺','🎭']},
                {id:'pogo',icon:'🦘',name:'Кенгуру',desc:'Прыгает через растения. Атакует с воздуха.',health:120,damage:30,moveSpeed:1.4,cost:125,level:5,type:'special',ability:'jump',skins:['🦘','🐰','🦢']},
                {id:'newspaper',icon:'📰',name:'Газетчик',desc:'Читая газету, становится яростным!',health:150,damage:50,moveSpeed:1.3,cost:75,level:3,type:'special',ability:'rage',skins:['📰','📓','📚']},
                {id:'dr',icon:'🧙',name:'Доктор',desc:'Оживляет других зомби. Лечит союзников.',health:200,damage:60,moveSpeed:0.8,cost:300,level:10,type:'support',heal:20,skins:['🧙','🧛','🧟‍♂️']},
                {id:'catapult',icon:'🏹',name:'Катапульта',desc:'Бросает зомби через весь двор!',health:200,damage:40,moveSpeed:0.7,cost:175,level:5,type:'special',ability:'throw',skins:['🏹','🎯','🪃']}
            ]
        };
        
        let unlockedPlants = [];
        let unlockedZombies = [];
        let selectedSkin = { plant: 'default', zombie: 'default' };
        
        function updateUnlockedUnits() {
            const inventory = userInventory || {};
            // Фильтруем только те юниты, которые есть в инвентаре пользователя
            unlockedPlants = units.plant.filter(u => inventory[u.id]);
            unlockedZombies = units.zombie.filter(u => inventory[u.id]);
        }
        
        document.addEventListener('DOMContentLoaded', () => { checkSession(); initGameLanes(); });
        
        async function checkSession() {
            if (!sessionId) return;
            try {
                const res = await fetch('/api/check-session', {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({sessionId})});
                const data = await res.json();
                if (data.success) { currentUser = data.user; showProfile(); }
            } catch(e) {}
        }
        
        function hideAllScreens() {
            ['mainMenu','authScreen','profileScreen','leaderboardScreen','shopScreen','adminScreen','waitingScreen','gameScreen','gameEndScreen','matchHistoryScreen','hallOfFameScreen','tutorialScreen','achievementsScreen','questsScreen','friendsScreen','profileViewScreen','inventoryScreen','eloScreen','seasonScreen','battlePassScreen'].forEach(id => document.getElementById(id).style.display = 'none');
        }
        
        async function viewPlayerProfile(username) {
            try {
                const res = await fetch('/api/profile/' + username);
                const data = await res.json();
                if (data.success && data.profile) {
                    const profile = data.profile;
                    const avatarEl = document.getElementById('profileViewAvatar');
                    // Аватар с эмодзи или первой буквой
                    if (profile.avatar) {
                        avatarEl.textContent = profile.avatar;
                    } else {
                        avatarEl.textContent = (profile.displayName || profile.username)[0].toUpperCase();
                    }
                    // Цвет аватара
                    if (profile.avatarColor) {
                        avatarEl.style.background = profile.avatarColor;
                        avatarEl.style.color = '#000';
                    } else {
                        avatarEl.style.background = 'rgba(255, 255, 255, 0.2)';
                        avatarEl.style.color = 'white';
                    }
                    document.getElementById('profileViewUsername').textContent = profile.displayName || profile.username;
                    document.getElementById('profileViewLevel').textContent = 'Уровень ' + (profile.level || 1);
                    document.getElementById('profileViewRole').textContent = profile.role === 'admin' ? 'Админ' : 'Игрок';
                    document.getElementById('profileViewWins').textContent = profile.wins || 0;
                    document.getElementById('profileViewXP').textContent = profile.xp || 0;
                    document.getElementById('profileViewGames').textContent = profile.totalGames || 0;
                    document.getElementById('profileViewStreak').textContent = profile.longestWinStreak || 0;
                    document.getElementById('profileViewCrystals').textContent = profile.crystals || 0;
                    
                    // Отображаем любимое растение
                    const favoritePlantSection = document.getElementById('profileViewFavoritePlant');
                    const favoritePlantIcon = document.getElementById('profileViewFavoritePlantIcon');
                    const favoritePlantName = document.getElementById('profileViewFavoritePlantName');
                    
                    if (profile.favoritePlant) {
                        const plantEmojis = {
                            'sunflower': '🌻',
                            'peashooter': '🌱',
                            'wallnut': '🥜',
                            'cherrybomb': '🍒',
                            'iceshroom': '🧊',
                            'snowpea': '❄️',
                            'chomper': '👄',
                            'repeater': '🔫',
                            'squash': '🎃',
                            'twinsunflower': '☀️',
                            'melonpult': '🍉',
                            'cattail': '🐱',
                            'moonglow': '🌙',
                            'tallnut': '🌴',
                            'puffshroom': '🍄',
                            'scaredyshroom': '😱',
                            'hypnoshroom': '🌀',
                            'magnetshroom': '🧲',
                            'potatomine': '🥔'
                        };
                        
                        const plantNames = {
                            'sunflower': 'Подсолнух',
                            'peashooter': 'Горохострел',
                            'wallnut': 'Орешек',
                            'cherrybomb': 'Вишнёвая бомба',
                            'iceshroom': 'Ледяник',
                            'snowpea': 'Морозник',
                            'chomper': 'Хапунец',
                            'repeater': 'Двуствол',
                            'squash': 'Тыквогон',
                            'twinsunflower': 'Двойняшка',
                            'melonpult': 'Арбузомет',
                            'cattail': 'Котоушка',
                            'moonglow': 'Лунарик',
                            'tallnut': 'Великан',
                            'puffshroom': 'Дымовичок',
                            'scaredyshroom': 'Трусишка',
                            'hypnoshroom': 'Гипноз',
                            'magnetshroom': 'Магнетик',
                            'potatomine': 'Картошка-мина'
                        };
                        
                        const plantId = profile.favoritePlant;
                        favoritePlantIcon.textContent = plantEmojis[plantId] || '🌱';
                        favoritePlantName.textContent = plantNames[plantId] || plantId;
                        favoritePlantSection.style.display = 'flex';
                    } else {
                        favoritePlantSection.style.display = 'none';
                    }
                    
                    document.getElementById('profileViewAddFriendBtn').onclick = function() { addFriendByName(username); };
                    showScreen('profileViewScreen');
                } else {
                    alert('Игрок не найден');
                }
            } catch(e) {
                alert('Ошибка загрузки профиля');
            }
        }
        
        async function addFriendByName(username) {
            try {
                const res = await fetch('/api/friends/add', {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({sessionId, friendUsername: username})});
                const data = await res.json();
                alert(data.message);
            } catch(e) {
                alert('Ошибка');
            }
        }
        
        function showScreen(id) {
            hideAllScreens();
            const screen = document.getElementById(id);
            screen.style.display = 'flex';
            screen.classList.remove('animate-in');
            void screen.offsetWidth; // Trigger reflow
            screen.classList.add('animate-in');
            // Сбрасываем прокрутку страницы при открытии любого экрана
            window.scrollTo({ top: 0, behavior: 'instant' });
        }
        
        function showMainMenu() { showScreen('mainMenu'); }
        
        function showAuth(tab) { showScreen('authScreen'); showAuthTab(tab); }
        
        function showAuthTab(tab) {
            document.querySelectorAll('.auth-tab').forEach(t => t.classList.remove('active'));
            document.querySelectorAll('.auth-tab')[tab==='login'?0:1].classList.add('active');
            document.getElementById('authTitle').textContent = tab==='login'?'Вход':'Регистрация';
            document.getElementById('authForm')?.setAttribute('data-type', tab);
            document.getElementById('authSubmitBtn').textContent = tab==='login'?'Войти':'Регистрация';
        }
        
        // === BATTLE PASS (КЛИЕНТ) ===
        const BATTLE_PASS_CLIENT_CONFIG = {
            xpPerLevel: 1000,
            // Набор ключевых уровней для отображения наград (чтобы не засорять экран 100 уровнями)
            displayTiers: [1, 2, 3, 4, 5, 10, 15, 20, 25, 30, 40, 50, 60, 75, 90, 100],
            rewards: {
                free: {
                    1: { type: 'coins', amount: 50, name: 'Монеты' },
                    2: { type: 'xp', amount: 100, name: 'Игровой опыт' },
                    3: { type: 'crystals', amount: 10, name: 'Кристаллы' },
                    4: { type: 'xp', amount: 150, name: 'Игровой опыт' },
                    5: { type: 'rare_unit', amount: 1, name: 'Эпический юнит' },
                    10: { type: 'coins', amount: 200, name: 'Монеты' },
                    15: { type: 'crystals', amount: 20, name: 'Кристаллы' },
                    20: { type: 'rare_unit', amount: 2, name: 'Эпический юнит' },
                    25: { type: 'coins', amount: 500, name: 'Монеты' },
                    30: { type: 'legendary_unit', amount: 1, name: 'Легендарный юнит' },
                    40: { type: 'xp', amount: 500, name: 'Игровой опыт' },
                    50: { type: 'crystals', amount: 40, name: 'Кристаллы' },
                    60: { type: 'rare_unit', amount: 3, name: 'Эпический юнит' },
                    75: { type: 'xp', amount: 750, name: 'Игровой опыт' },
                    90: { type: 'coins', amount: 1500, name: 'Монеты' },
                    100: { type: 'legendary_unit', amount: 2, name: 'Легендарный юнит' }
                },
                premium: {
                    1: { type: 'crystals', amount: 20, name: 'Кристаллы' },
                    2: { type: 'xp', amount: 200, name: 'Игровой опыт' },
                    3: { type: 'coins', amount: 150, name: 'Монеты' },
                    4: { type: 'xp', amount: 300, name: 'Игровой опыт' },
                    5: { type: 'plant_chest_rare', amount: 1, name: 'Сундук растений (редкий)' },
                    10: { type: 'plant_chest_epic', amount: 1, name: 'Сундук растений (эпический)' },
                    15: { type: 'crystals', amount: 40, name: 'Кристаллы' },
                    20: { type: 'plant_chest_epic', amount: 1, name: 'Сундук растений (эпический)' },
                    25: { type: 'xp', amount: 600, name: 'Игровой опыт' },
                    30: { type: 'plant_chest_mythic', amount: 1, name: 'Сундук растений (мифический)' },
                    40: { type: 'coins', amount: 800, name: 'Монеты' },
                    50: { type: 'plant_chest_legendary', amount: 1, name: 'Сундук растений (легендарный)' },
                    60: { type: 'xp', amount: 1000, name: 'Игровой опыт' },
                    75: { type: 'legendary_unit', amount: 2, name: 'Легендарный юнит' },
                    90: { type: 'crystals', amount: 80, name: 'Кристаллы' },
                    100: { type: 'legendary_unit', amount: 5, name: 'Легендарный юнит' }
                }
            }
        };

        let battlePassData = null;
        let battlePassQuestTimerInterval = null;

        function showBattlePass() {
            if (!sessionId) {
                alert('Сначала войдите в аккаунт!');
                return;
            }
            showScreen('battlePassScreen');
            loadBattlePass();
        }

        async function loadBattlePassPreview() {
            if (!sessionId) return;
            try {
                const res = await fetch('/api/battle-pass/status', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ sessionId })
                });
                const data = await res.json();
                if (!data.success || !data.battlePass) return;
                battlePassData = data.battlePass;
                updateBattlePassSmallBar();
            } catch (e) {
                console.error(e);
            }
        }

        async function loadBattlePass() {
            try {
                const res = await fetch('/api/battle-pass/status', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ sessionId })
                });
                const data = await res.json();
                if (!data.success || !data.battlePass) {
                    alert(data.message || 'Не удалось загрузить Battle Pass');
                    return;
                }
                battlePassData = data.battlePass;
                renderBattlePassHeader();
                renderBattlePassRewards();
                loadBattlePassQuests();
            } catch (e) {
                console.error(e);
                alert('Ошибка загрузки Battle Pass');
            }
        }

        async function requestBattlePassPremium() {
            if (!sessionId) {
                alert('Сначала войдите в аккаунт!');
                return;
            }
            try {
                const res = await fetch('/api/battle-pass/request-premium', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ sessionId })
                });
                const data = await res.json();
                alert(data.message || 'Запрос отправлен.');
                // Обновляем статус Battle Pass, чтобы отобразить новое состояние
                loadBattlePass();
            } catch (e) {
                console.error(e);
                alert('Ошибка отправки запроса на Premium Battle Pass');
            }
        }

        async function loadBattlePassQuests() {
            try {
                const res = await fetch('/api/battle-pass/quests', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ sessionId })
                });
                const data = await res.json();
                if (!data.success || !data.quests) return;

                if (!battlePassData) battlePassData = {};
                battlePassData.quests = data.quests;
                battlePassData.questsDate = data.date;

                const list = document.getElementById('battlePassQuestsList');
                list.innerHTML = data.quests.map(q => {
                    const target = q.target || 1;
                    const progress = q.progress || 0;
                    const percent = Math.min(100, (progress / target) * 100);
                    const completed = !!q.completed || progress >= target;
                    return `<div class="match-row" style="flex-direction:column;opacity:${completed ? 1 : 0.9}">
                        <div style="display:flex;align-items:center;gap:10px;margin-bottom:5px">
                            <span style="font-size:1.8rem">${q.icon || '📋'}</span>
                            <div style="flex:1">
                                <div style="font-weight:bold">${q.name}</div>
                                <div style="font-size:0.75rem;color:#94a3b8">${q.desc}</div>
                            </div>
                            <div style="text-align:right">
                                <div style="color:#fbbf24;font-size:0.8rem">+${q.reward} XP</div>
                                <div style="font-size:0.75rem;color:${completed ? '#4ade80' : '#94a3b8'}">${completed ? 'Выполнено' : progress + '/' + target}</div>
                            </div>
                        </div>
                        <div style="background:rgba(255,255,255,0.1);border-radius:10px;height:12px;overflow:hidden">
                            <div style="background:linear-gradient(90deg,#22c55e,#16a34a);height:100%;width:${percent}%;transition:width 0.3s"></div>
                        </div>
                    </div>`;
                }).join('');

                startBattlePassQuestTimer();
            } catch (e) {
                console.error(e);
            }
        }

        function renderBattlePassHeader() {
            if (!battlePassData) return;
            const seasonEl = document.getElementById('bpSeason');
            const levelEl = document.getElementById('bpLevel');
            const xpCurrentEl = document.getElementById('bpXpCurrent');
            const xpPerLevelEl = document.getElementById('bpXpPerLevel');
            const levelProgress = document.getElementById('bpLevelProgress');
            const totalXpInfo = document.getElementById('bpTotalXpInfo');
            const tierEl = document.getElementById('bpTier');
            const tierXpCurrentEl = document.getElementById('bpTierXpCurrent');
            const tierXpMaxEl = document.getElementById('bpTierXpMax');
            const tierProgress = document.getElementById('bpTierProgress');
            const premiumStatusEl = document.getElementById('bpPremiumStatus');
            const premiumBtn = document.getElementById('bpGetPremiumBtn');

            const level = battlePassData.level || 0;
            const xp = battlePassData.xp || 0;
            const totalXp = battlePassData.totalXp || 0;
            const tier = battlePassData.currentTier || 1;
            const tierXp = battlePassData.tierXp || 0;
            const tierMax = battlePassData.maxTierXp || 1000;
            const season = battlePassData.season || 1;

            const xpPerLevel = BATTLE_PASS_CLIENT_CONFIG.xpPerLevel;

            seasonEl.textContent = season;
            levelEl.textContent = level;
            xpCurrentEl.textContent = xp;
            xpPerLevelEl.textContent = xpPerLevel;
            levelProgress.style.width = Math.min(100, (xp / xpPerLevel) * 100) + '%';
            totalXpInfo.textContent = `Всего набрано XP: ${totalXp}`;

            tierEl.textContent = tier;
            tierXpCurrentEl.textContent = tierXp;
            tierXpMaxEl.textContent = tierMax;
            tierProgress.style.width = Math.min(100, (tierXp / tierMax) * 100) + '%';

            if (premiumStatusEl) {
                if (battlePassData.isPremium) {
                    premiumStatusEl.textContent = 'Статус: активен 🎉';
                    premiumStatusEl.style.color = '#4ade80';
                    if (premiumBtn) premiumBtn.style.display = 'none';
                } else if (battlePassData.premiumRequestedAt) {
                    premiumStatusEl.textContent = 'Статус: заявка отправлена, ожидает подтверждения в Telegram';
                    premiumStatusEl.style.color = '#fbbf24';
                    if (premiumBtn) premiumBtn.disabled = true;
                } else {
                    premiumStatusEl.textContent = 'Статус: не активирован';
                    premiumStatusEl.style.color = '#a5b4fc';
                    if (premiumBtn) {
                        premiumBtn.disabled = false;
                        premiumBtn.style.display = 'inline-flex';
                    }
                }
            }

            updateBattlePassSmallBar();
        }

        function updateBattlePassSmallBar() {
            if (!battlePassData) return;
            const season = battlePassData.season || 1;
            const level = battlePassData.level || 0;
            const xp = battlePassData.xp || 0;
            const totalXp = battlePassData.totalXp || 0;
            const xpPerLevel = BATTLE_PASS_CLIENT_CONFIG.xpPerLevel;

            const seasonEl = document.getElementById('bpSmallSeason');
            const levelEl = document.getElementById('bpSmallLevel');
            const xpEl = document.getElementById('bpSmallXp');
            const xpMaxEl = document.getElementById('bpSmallXpMax');
            const progressEl = document.getElementById('bpSmallProgress');
            const nextRewardEl = document.getElementById('bpNextRewardInfo');

            if (!seasonEl || !levelEl || !xpEl || !xpMaxEl || !progressEl) return;

            seasonEl.textContent = season;
            levelEl.textContent = level;
            xpEl.textContent = xp;
            xpMaxEl.textContent = xpPerLevel;
            progressEl.style.width = Math.min(100, (xp / xpPerLevel) * 100) + '%';

            if (nextRewardEl) {
                const tiers = BATTLE_PASS_CLIENT_CONFIG.displayTiers;
                const rewardsCfg = BATTLE_PASS_CLIENT_CONFIG.rewards;
                const nextTier = tiers.find(t => t > level);
                if (!nextTier) {
                    nextRewardEl.textContent = 'Вы достигли максимального уровня Battle Pass!';
                } else {
                    const free = rewardsCfg.free[nextTier];
                    const premium = rewardsCfg.premium[nextTier];
                    const neededXp = Math.max(0, nextTier * xpPerLevel - totalXp);
                    const parts = [];
                    if (free) parts.push(`🆓 ${free.name} x${free.amount}`);
                    if (premium) parts.push(`💎 ${premium.name} x${premium.amount}`);
                    nextRewardEl.textContent = `Следующая награда на уровне ${nextTier}: ${parts.join(' + ')} (ещё примерно ${neededXp.toLocaleString('ru-RU')} XP)`;
                }
            }
        }

        function renderBattlePassRewards() {
            if (!battlePassData) return;
            const container = document.getElementById('battlePassRewards');
            const level = battlePassData.level || 0;
            const freeClaimed = battlePassData.freeRewardsClaimed || [];
            const premiumClaimed = battlePassData.premiumRewardsClaimed || [];

            const tiers = BATTLE_PASS_CLIENT_CONFIG.displayTiers;
            const rewards = BATTLE_PASS_CLIENT_CONFIG.rewards;

            container.innerHTML = tiers.map(tier => {
                const free = rewards.free[tier];
                const premium = rewards.premium[tier];
                const freeId = `${tier}_free`;
                const premiumId = `${tier}_premium`;
                const freeAvailable = level >= tier;
                const premiumAvailable = level >= tier;
                const freeIsClaimed = freeClaimed.includes(freeId);
                const premiumIsClaimed = premiumClaimed.includes(premiumId);

                const freeStatus = free
                    ? freeIsClaimed ? 'Получено' : (freeAvailable ? 'Доступно' : 'Закрыто')
                    : '—';
                const premiumStatus = premium
                    ? premiumIsClaimed ? 'Получено' : (premiumAvailable ? 'Доступно' : 'Закрыто')
                    : '—';

                const freeColor = freeIsClaimed ? '#4ade80' : (freeAvailable ? '#fbbf24' : '#64748b');
                const premiumColor = premiumIsClaimed ? '#a855f7' : (premiumAvailable ? '#f97316' : '#64748b');
                const xpPerLevel = BATTLE_PASS_CLIENT_CONFIG.xpPerLevel;
                const requiredTotalXp = tier * xpPerLevel;

                return `<div style="min-width:190px;scroll-snap-align:start;background:radial-gradient(circle at top, rgba(251,191,36,0.3), transparent 55%),rgba(15,23,42,0.95);padding:10px 10px 12px;border-radius:14px;border:2px solid rgba(148,163,184,0.6);box-shadow:0 10px 25px rgba(0,0,0,0.6);position:relative;overflow:hidden">
                    <div style="position:absolute;top:-20px;right:-10px;font-size:3rem;opacity:0.15">⭐</div>
                    <div style="font-weight:bold;margin-bottom:6px;font-size:0.9rem;color:#e5e7eb">Уровень ${tier}</div>
                    <div style="height:80px;border-radius:10px;background:linear-gradient(135deg,rgba(56,189,248,0.18),rgba(168,85,247,0.25));display:flex;align-items:center;justify-content:center;gap:12px;margin-bottom:8px">
                        <div style="text-align:center">
                            <div style="font-size:1.6rem;margin-bottom:2px">🆓</div>
                            <div style="font-size:0.7rem;color:${freeColor}">${free ? free.name : '—'}</div>
                        </div>
                        <div style="width:1px;height:55px;background:rgba(148,163,184,0.5)"></div>
                        <div style="text-align:center">
                            <div style="font-size:1.6rem;margin-bottom:2px">💎</div>
                            <div style="font-size:0.7rem;color:${premiumColor}">${premium ? premium.name : '—'}</div>
                        </div>
                    </div>
                    <div style="font-size:0.7rem;color:#94a3b8;margin-bottom:4px">
                        Нужно XP: ≈ ${requiredTotalXp.toLocaleString('ru-RU')} (уровень ${tier})
                    </div>
                    <div style="font-size:0.75rem;margin-bottom:4px">
                        <div style="color:${freeColor};margin-bottom:2px">
                            <span>Бесплатно: ${free ? `x${free.amount}` : '—'}</span>
                            <span style="font-size:0.7rem;opacity:0.9;display:block">${freeStatus}</span>
                        </div>
                        <div style="color:${premiumColor}">
                            <span>Премиум: ${premium ? `x${premium.amount}` : '—'}</span>
                            <span style="font-size:0.7rem;opacity:0.9;display:block">${premiumStatus}</span>
                        </div>
                    </div>
                    <div style="display:flex;gap:6px;margin-top:4px">
                        ${free && freeAvailable && !freeIsClaimed ? `<button class="btn btn-primary" style="flex:1;padding:4px 6px;font-size:0.7rem" onclick="claimBattlePassReward(${tier}, false)">Забрать</button>` : ''}
                        ${premium && premiumAvailable && !premiumIsClaimed ? `<button class="btn btn-secondary" style="flex:1;padding:4px 6px;font-size:0.7rem" onclick="claimBattlePassReward(${tier}, true)">Премиум</button>` : ''}
                    </div>
                </div>`;
            }).join('');
        }

        async function claimBattlePassReward(tier, isPremium) {
            try {
                const res = await fetch('/api/battle-pass/claim-reward', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ sessionId, tier, isPremium })
                });
                const data = await res.json();
                if (!data.success) {
                    alert(data.message || 'Не удалось получить награду');
                    return;
                }
                alert(data.message || 'Награда получена!');
                // После успешного получения награды обновляем данные Battle Pass и профиль
                loadBattlePass();
                loadProfile(); // чтобы обновились монеты / уровень / инвентарь
            } catch (e) {
                console.error(e);
                alert('Ошибка получения награды');
            }
        }

        function startBattlePassQuestTimer() {
            if (battlePassQuestTimerInterval) clearInterval(battlePassQuestTimerInterval);
            const el = document.getElementById('battlePassQuestTimer');
            if (!el) return;
            battlePassQuestTimerInterval = setInterval(() => {
                const now = new Date();
                const tomorrow = new Date(now);
                tomorrow.setDate(tomorrow.getDate() + 1);
                tomorrow.setHours(0, 0, 0, 0);
                const diff = tomorrow - now;
                const hours = Math.floor(diff / (1000 * 60 * 60));
                const mins = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
                const secs = Math.floor((diff % (1000 * 60)) / 1000);
                el.textContent = 'Новые квесты Battle Pass через: ' + hours + 'ч ' + mins + 'м ' + secs + 'с';
            }, 1000);
        }

        // === СИСТЕМА СУНДУКОВ ===
        let userChests = { common: 0, rare: 0, epic: 0, legendary: 0 };
        
        async function loadChests() {
            try {
                const res = await fetch('/api/chests', {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({sessionId})});
                const data = await res.json();
                if (data.success) {
                    userChests = data.chests || { 
                        common: 0, 
                        rare: 0, 
                        epic: 0, 
                        legendary: 0,
                        plant_chest_rare: 0,
                        plant_chest_epic: 0,
                        plant_chest_mythic: 0,
                        plant_chest_legendary: 0
                    };
                    updateChestBar();
                }
            } catch(e) {}
        }
        
        function updateChestBar() {
            const chestBar = document.getElementById('chestBar');
            const chestIcons = document.getElementById('chestIcons');
            const chestInfo = document.getElementById('chestInfo');
            
            if (!chestBar || !chestIcons || !chestInfo) return;
            
            const totalChests = userChests.common + userChests.rare + userChests.epic + userChests.legendary;
            const totalPlantChests = (userChests.mythic || 0) + (userChests.plant_chest_mythic || 0) + (userChests.plant_chest_legendary || 0) + (userChests.plant_chest_epic || 0) + (userChests.plant_chest_rare || 0);
            
            if (totalChests > 0 || totalPlantChests > 0) {
                chestBar.style.display = 'block';
                
                // Иконки сундуков
                let iconsHtml = '';
                
                // Сначала показываем plant chests (сундуки растений) - они важнее!
                if (userChests.plant_chest_legendary && userChests.plant_chest_legendary > 0) {
                    iconsHtml += `<div style="position:relative" title="Сундук растений (Легендарный)">
                        <span style="font-size:2rem">🌱👑</span>
                        <span style="position:absolute;top:-5px;right:-5px;background:#ef4444;color:white;border-radius:50%;width:20px;height:20px;font-size:0.7rem;display:flex;align-items:center;justify-content:center;font-weight:bold">${userChests.plant_chest_legendary}</span>
                    </div>`;
                }
                if (userChests.plant_chest_mythic && userChests.plant_chest_mythic > 0) {
                    iconsHtml += `<div style="position:relative" title="Сундук растений (Мифический)">
                        <span style="font-size:2rem">🌱🟧</span>
                        <span style="position:absolute;top:-5px;right:-5px;background:#f59e0b;color:white;border-radius:50%;width:20px;height:20px;font-size:0.7rem;display:flex;align-items:center;justify-content:center;font-weight:bold">${userChests.plant_chest_mythic}</span>
                    </div>`;
                }
                if (userChests.plant_chest_epic && userChests.plant_chest_epic > 0) {
                    iconsHtml += `<div style="position:relative" title="Сундук растений (Эпический)">
                        <span style="font-size:2rem">🌱🟣</span>
                        <span style="position:absolute;top:-5px;right:-5px;background:#a855f7;color:white;border-radius:50%;width:20px;height:20px;font-size:0.7rem;display:flex;align-items:center;justify-content:center;font-weight:bold">${userChests.plant_chest_epic}</span>
                    </div>`;
                }
                if (userChests.plant_chest_rare && userChests.plant_chest_rare > 0) {
                    iconsHtml += `<div style="position:relative" title="Сундук растений (Редкий)">
                        <span style="font-size:2rem">🌱🔵</span>
                        <span style="position:absolute;top:-5px;right:-5px;background:#3b82f6;color:white;border-radius:50%;width:20px;height:20px;font-size:0.7rem;display:flex;align-items:center;justify-content:center;font-weight:bold">${userChests.plant_chest_rare}</span>
                    </div>`;
                }
                
                // Обычные сундуки
                if (userChests.legendary > 0) {
                    iconsHtml += `<div style="position:relative" title="Легендарный сундук">
                        <span style="font-size:2rem">👑</span>
                        <span style="position:absolute;top:-5px;right:-5px;background:#fbbf24;color:#1a1a2e;border-radius:50%;width:20px;height:20px;font-size:0.7rem;display:flex;align-items:center;justify-content:center;font-weight:bold">${userChests.legendary}</span>
                    </div>`;
                }
                if (userChests.epic > 0) {
                    iconsHtml += `<div style="position:relative" title="Эпический сундук">
                        <span style="font-size:2rem">🟣</span>
                        <span style="position:absolute;top:-5px;right:-5px;background:#a855f7;color:white;border-radius:50%;width:20px;height:20px;font-size:0.7rem;display:flex;align-items:center;justify-content:center;font-weight:bold">${userChests.epic}</span>
                    </div>`;
                }
                if (userChests.rare > 0) {
                    iconsHtml += `<div style="position:relative" title="Редкий сундук">
                        <span style="font-size:2rem">🔵</span>
                        <span style="position:absolute;top:-5px;right:-5px;background:#3b82f6;color:white;border-radius:50%;width:20px;height:20px;font-size:0.7rem;display:flex;align-items:center;justify-content:center;font-weight:bold">${userChests.rare}</span>
                    </div>`;
                }
                if (userChests.common > 0) {
                    iconsHtml += `<div style="position:relative" title="Обычный сундук">
                        <span style="font-size:2rem">🟤</span>
                        <span style="position:absolute;top:-5px;right:-5px;background:#92400e;color:white;border-radius:50%;width:20px;height:20px;font-size:0.7rem;display:flex;align-items:center;justify-content:center;font-weight:bold">${userChests.common}</span>
                    </div>`;
                }
                chestIcons.innerHTML = iconsHtml;
                
                // Информация о сундуках
                const chestValues = {
                    legendary: { min: 500, max: 2000, name: 'Легендарный' },
                    epic: { min: 200, max: 800, name: 'Эпический' },
                    rare: { min: 100, max: 400, name: 'Редкий' },
                    common: { min: 30, max: 150, name: 'Обычный' },
                    plant_chest_legendary: { min: 1000, max: 3000, name: 'Сундук растений (Легендарный)' },
                    plant_chest_mythic: { min: 800, max: 2000, name: 'Сундук растений (Мифический)' },
                    plant_chest_epic: { min: 500, max: 1200, name: 'Сундук растений (Эпический)' },
                    plant_chest_rare: { min: 200, max: 600, name: 'Сундук растений (Редкий)' }
                };
                
                // Показываем информацию о самом ценном сундуке (приоритет: plant chests)
                let bestChest = 'common';
                let bestValue = chestValues.common.min;
                
                if (userChests.plant_chest_legendary && userChests.plant_chest_legendary > 0) { 
                    bestChest = 'plant_chest_legendary'; 
                    bestValue = chestValues.plant_chest_legendary.min; 
                }
                else if (userChests.plant_chest_mythic && userChests.plant_chest_mythic > 0) { 
                    bestChest = 'plant_chest_mythic'; 
                    bestValue = chestValues.plant_chest_mythic.min; 
                }
                else if (userChests.plant_chest_epic && userChests.plant_chest_epic > 0) { 
                    bestChest = 'plant_chest_epic'; 
                    bestValue = chestValues.plant_chest_epic.min; 
                }
                else if (userChests.plant_chest_rare && userChests.plant_chest_rare > 0) { 
                    bestChest = 'plant_chest_rare'; 
                    bestValue = chestValues.plant_chest_rare.min; 
                }
                else if (userChests.legendary > 0) { bestChest = 'legendary'; bestValue = chestValues.legendary.min; }
                else if (userChests.epic > 0) { bestChest = 'epic'; bestValue = chestValues.epic.min; }
                else if (userChests.rare > 0) { bestChest = 'rare'; bestValue = chestValues.rare.min; }
                
                chestInfo.innerHTML = `${chestValues[bestChest].name}: ${bestValue}-${chestValues[bestChest].max} монет`;
            } else {
                chestBar.style.display = 'none';
            }
        }
        
        async function openChest() {
            // Показываем выбор сундука
            const totalChests = userChests.common + userChests.rare + userChests.epic + userChests.legendary;
            const totalPlantChests = (userChests.plant_chest_rare || 0) + (userChests.plant_chest_epic || 0) + (userChests.plant_chest_mythic || 0) + (userChests.plant_chest_legendary || 0);
            
            if (totalChests === 0 && totalPlantChests === 0) {
                alert('У вас нет сундуков! Играйте, чтобы получить сундуки!');
                return;
            }
            
            // Показываем доступные сундуки для открытия
            let message = 'Выберите сундук для открытия:\n\n';
            
            // Сначала plant chests (сундуки растений) - они ценнее!
            if (userChests.plant_chest_legendary && userChests.plant_chest_legendary > 0) message += `🌱👑 Сундук растений (Легендарный): ${userChests.plant_chest_legendary} шт.\n`;
            if (userChests.plant_chest_mythic && userChests.plant_chest_mythic > 0) message += `🌱🟧 Сундук растений (Мифический): ${userChests.plant_chest_mythic} шт.\n`;
            if (userChests.plant_chest_epic && userChests.plant_chest_epic > 0) message += `🌱🟣 Сундук растений (Эпический): ${userChests.plant_chest_epic} шт.\n`;
            if (userChests.plant_chest_rare && userChests.plant_chest_rare > 0) message += `🌱🔵 Сундук растений (Редкий): ${userChests.plant_chest_rare} шт.\n`;
            
            // Обычные сундуки
            if (userChests.legendary > 0) message += `👑 Легендарный: ${userChests.legendary} шт.\n`;
            if (userChests.epic > 0) message += `🟣 Эпический: ${userChests.epic} шт.\n`;
            if (userChests.rare > 0) message += `🔵 Редкий: ${userChests.rare} шт.\n`;
            if (userChests.common > 0) message += `🟤 Обычный: ${userChests.common} шт.\n`;
            
            message += '\nВведите тип сундука:\n';
            message += 'plant_chest_legendary, plant_chest_mythic, plant_chest_epic, plant_chest_rare,\n';
            message += 'legendary, epic, rare, common';
            
            const choice = prompt(message);
            if (!choice) return;
            
            const chestType = choice.toLowerCase().trim();
            if (!userChests[chestType] || userChests[chestType] <= 0) {
                alert('У вас нет такого сундука!');
                return;
            }
            
            try {
                const res = await fetch('/api/open-chest', {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({sessionId, chestType})});
                const data = await res.json();
                
                if (data.success) {
                    const rewards = data.rewards || 0;
                    let chestName = '';
                    switch(chestType) {
                        case 'plant_chest_legendary': chestName = 'Сундук растений (Легендарный)'; break;
                        case 'plant_chest_mythic': chestName = 'Сундук растений (Мифический)'; break;
                        case 'plant_chest_epic': chestName = 'Сундук растений (Эпический)'; break;
                        case 'plant_chest_rare': chestName = 'Сундук растений (Редкий)'; break;
                        default: chestName = 'Сундук';
                    }
                    alert(`🎁 Поздравляем! Вы открыли ${chestName} и получили ${rewards} монет! 💰`);
                    
                    // Обновляем данные
                    currentUser.coins = data.coins;
                    document.getElementById('statCoins').textContent = currentUser.coins;
                    await loadChests();
                } else {
                    alert(data.message || 'Ошибка открытия сундука');
                }
            } catch(e) {
                alert('Ошибка открытия сундука');
            }
        }
        
        function showProfile() {
            if (!currentUser) {
                alert('Сначала войдите в аккаунт!');
                showMainMenu();
                return;
            }
            showScreen('profileScreen');
            const level = currentUser.level || 1;
            // Отображаем аватар с эмодзи или первой буквой
            const avatarEl = document.getElementById('userAvatar');
            if (currentUser.avatar) {
                avatarEl.textContent = currentUser.avatar;
            } else {
                avatarEl.textContent = (currentUser.displayName || currentUser.username)[0].toUpperCase();
            }
            // Устанавливаем цвет аватара если есть
            if (currentUser.avatarColor) {
                avatarEl.style.background = currentUser.avatarColor;
                avatarEl.style.color = '#000';
            } else {
                avatarEl.style.background = 'rgba(255, 255, 255, 0.2)';
                avatarEl.style.color = 'white';
            }
            // Отображаем отображаемое имя или username
            document.getElementById('profileUsername').textContent = currentUser.displayName || currentUser.username;
            document.getElementById('profileLevel').textContent = 'Уровень ' + level;
            document.getElementById('profileRole').textContent = currentUser.role==='admin'?'Админ':'Игрок';
            document.getElementById('statCoins').textContent = currentUser.coins || 0;
            document.getElementById('statWins').textContent = currentUser.wins || 0;
            document.getElementById('statXP').textContent = currentUser.xp || 0;
            document.getElementById('adminBtn').style.display = currentUser.role==='admin'?'block':'none';
            // Отображаем описание профиля
            const description = currentUser.description || 'Нет описания';
            document.getElementById('profileDescription').textContent = description;
            
            // Отображаем любимое растение
            const favoritePlantSection = document.getElementById('favoritePlantSection');
            const favoritePlantIcon = document.getElementById('favoritePlantIcon');
            const favoritePlantName = document.getElementById('favoritePlantName');
            
            if (currentUser.favoritePlant) {
                // Отображаем любимое растение
                const plantEmojis = {
                    'sunflower': '🌻',
                    'peashooter': '🌱',
                    'wallnut': '🥜',
                    'cherrybomb': '🍒',
                    'iceshroom': '🧊',
                    'snowpea': '❄️',
                    'chomper': '👄',
                    'repeater': '🔫',
                    'squash': '🎃',
                    'twinsunflower': '🌞',
                    'melonpult': '🍉',
                    'cattail': '🐱',
                    'moonglow': '🌙',
                    'tallnut': '🌴',
                    'puffshroom': '🍄',
                    'scaredyshroom': '😱',
                    'hypnoshroom': '🌀',
                    'magnetshroom': '🧲',
                    'potatomine': '🥔'
                };
                
                const plantNames = {
                    'sunflower': 'Подсолнух',
                    'peashooter': 'Горохострел',
                    'wallnut': 'Орешек',
                    'cherrybomb': 'Вишнёвая бомба',
                    'iceshroom': 'Ледяник',
                    'snowpea': 'Морозник',
                    'chomper': 'Хапунец',
                    'repeater': 'Двуствол',
                    'squash': 'Тыквогон',
                    'twinsunflower': 'Двойняшка',
                    'melonpult': 'Арбузомет',
                    'cattail': 'Котоушка',
                    'moonglow': 'Лунарик',
                    'tallnut': 'Великан',
                    'puffshroom': 'Дымовичок',
                    'scaredyshroom': 'Трусишка',
                    'hypnoshroom': 'Гипноз',
                    'magnetshroom': 'Магнетик',
                    'potatomine': 'Картошка-мина'
                };
                
                const plantId = currentUser.favoritePlant;
                favoritePlantIcon.textContent = plantEmojis[plantId] || '🌱';
                favoritePlantName.textContent = plantNames[plantId] || plantId;
                favoritePlantSection.style.display = 'flex';
            } else {
                // Скрываем секцию любимого растения, если его нет
                favoritePlantSection.style.display = 'none';
            }
            
            // Обновляем отображение наград (всегда видно)
            const userLevel = currentUser.level || 1;
            const userXP = currentUser.xp || 0;
            const xpForNextLevel = userLevel * 100;
            const xpProgress = Math.min(100, (userXP / xpForNextLevel) * 100);
            
            document.getElementById('displayLevel').textContent = userLevel;
            document.getElementById('xpDisplay').textContent = userXP + ' XP';
            document.getElementById('xpProgressBar').style.width = xpProgress + '%';
            document.getElementById('xpToNextLevel').textContent = 'До след. уровня: ' + (xpForNextLevel - userXP) + ' XP';
            document.getElementById('displayCoins').textContent = currentUser.coins || 0;
            document.getElementById('displayWins').textContent = currentUser.wins || 0;
            document.getElementById('displayCrystals').textContent = currentUser.crystals || 0;
            
            // Загружаем сундуки
            loadChests();

            // Загружаем превью Battle Pass (шкала в меню)
            loadBattlePassPreview();

            // Стартуем опрос уведомлений (награды/подарки от админа)
            ensureNotificationPolling();
            pollNotifications();
        }
        
        async function handleAuth(e) {
            e.preventDefault();
            const type = document.querySelector('form').getAttribute('data-type') || 'login';
            const username = document.getElementById('username').value.trim();
            const password = document.getElementById('password').value;
            try {
                const res = await fetch(type==='login'?'/api/login':'/api/register', {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username,password})});
                const data = await res.json();
                const msg = document.getElementById('authMessage');
                msg.textContent = data.message;
                msg.className = 'auth-message ' + (data.success?'success':'error');
                msg.style.display = 'block';
                if (data.success) {
                    sessionId = data.sessionId; localStorage.setItem('sessionId', sessionId);
                    currentUser = data.user || {};
                    // Показываем обучение после регистрации (новым игрокам)
                    if (type === 'register') {
                        setTimeout(() => startTutorial(), 1000);
                    } else {
                        setTimeout(() => showProfile(), 1000);
                    }
                }
            } catch(e) { document.getElementById('authMessage').textContent = 'Ошибка'; document.getElementById('authMessage').style.display = 'block'; }
        }
        
        async function logout() {
            try { await fetch('/api/logout', {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({sessionId})}); } catch(e) {}
            sessionId = null; localStorage.removeItem('sessionId'); currentUser = null; showMainMenu();
        }
        
        let currentLeaderSort = 'wins';
        
        async function showLeaderboard() {
            showScreen('leaderboardScreen');
            switchLeaderTab('wins');
        }
        
        async function switchLeaderTab(sort) {
            currentLeaderSort = sort;
            document.getElementById('leaderTabWins').className = sort === 'wins' ? 'btn btn-primary' : 'btn btn-secondary';
            document.getElementById('leaderTabLevel').className = sort === 'level' ? 'btn btn-primary' : 'btn btn-secondary';
            
            // Update header dynamically
            const headerRow = document.querySelector('#leaderboardScreen .leaderboard-row.header');
            headerRow.innerHTML = '<span class="rank">#</span><span class="username">Игрок</span><span>Уровень/' + (sort === 'wins' ? 'Победы' : 'Опыт') + '</span>';
            
            try {
                const res = await fetch('/api/leaderboard' + (sort === 'level' ? '-level' : ''));
                const data = await res.json();
                if (data.success) {
                    const sortKey = sort === 'wins' ? 'wins' : 'xp';
                    const sorted = [...data.leaders].sort((a,b) => (b[sortKey] || 0) - (a[sortKey] || 0));
                    
                    document.getElementById('leaderboardList').innerHTML = sorted.map((p,i) =>
                        `<div class="leaderboard-row ${i<3?'top-3':''}" onclick="viewPlayerProfile('${escapeHtml(p.username)}')" style="cursor:pointer">
                            <span class="rank ${i===0?'gold':i===1?'silver':i===2?'bronze':''}">${i+1}</span>
                            <div style="display: flex; align-items: center; gap: 10px; flex: 1;">
                                <div class="user-avatar" style="width: 30px; height: 30px; font-size: 0.9rem; display: flex; align-items: center; justify-content: center;">${escapeHtml(p.username.charAt(0).toUpperCase())}</div>
                                <span class="username">${escapeHtml(p.username || 'Unknown')}</span>
                            </div>
                            <span>${sort === 'wins' ? (p.level || 1) + '/' + (p.wins || 0) : (p.level || 1) + '/' + (p.xp || 0)}</span>
                        </div>`
                    ).join('');
                }
            } catch(e) {}
        }
        
        async function showMatchHistory() {
            showScreen('matchHistoryScreen');
            try {
                const res = await fetch('/api/match-history');
                const data = await res.json();
                if (data.success) {
                    document.getElementById('matchList').innerHTML = data.matches.length ? data.matches.map(m =>
                        `<div class="match-row">
                            <span class="match-winner">${escapeHtml(m.winner)}</span>
                            <span>vs</span>
                            <span class="match-loser">${escapeHtml(m.loser)}</span>
                        </div>`
                    ).join('') : '<p style="text-align:center;color:#94a3b8">Нет матчей</p>';
                }
            } catch(e) {}
        }
        
        async function showHallOfFame() {
            showScreen('hallOfFameScreen');
            const rewards = {
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
            
            const html = Object.entries(rewards).map(([level, reward]) => {
                const reached = currentUser.level >= parseInt(level);
                return `<div class="match-row" style="opacity:${reached ? 1 : 0.5}">
                    <span style="font-weight:bold;font-size:1.2rem">${level}</span>
                    <span>${reward.title}</span>
                    <span style="color:#fbbf24">${reward.coins}💰</span>
                    <span style="color:${reached ? '#4ade80' : '#ef4444'}">${reached ? '✓ Получено' : 'Заблокировано'}</span>
                </div>`;
            }).join('');
            document.getElementById('hallOfFameList').innerHTML = html;
        }
        
        let shopItemsList = [];
        let currentSales = [];
        let shopTimer = null;
        
        const PLANT_ICONS = {
            sunflower: '🌻', peashooter: '🟢', wallnut: '🥜', cherrybomb: '🍒', iceshroom: '🧊',
            snowpea: '❄️', chomper: '👄', repeater: '🔫', squash: '🎃', twinsunflower: '🌞', melonpult: '🍉', cattail: '🐱'
        };
        const PLANT_NAMES = {
            sunflower: 'Подсолнух', peashooter: 'Горох', wallnut: 'Стена', cherrybomb: 'Вишня', iceshroom: 'Лед',
            snowpea: 'Мороз', chomper: 'Хапун', repeater: 'Дубль', squash: 'Тыква', twinsunflower: 'Двойня', melonpult: 'Арбуз', cattail: 'Котоушка'
        };
        const ZOMBIE_ICONS = {
            zombie: '🧟', conehead: '🧢', buckethead: '🪣', football: '🏈', dancing: '💃', dolphin: '🐬',
            digger: '⛏️', bungee: '🪝', gargantuar: '👹', yeti: '🦬', king: '🤴', dr: '🧙'
        };
        const ZOMBIE_NAMES = {
            zombie: 'Зомби', conehead: 'Конус', buckethead: 'Ведро', football: 'Спорт', dancing: 'Танцор', dolphin: 'Дельфин',
            digger: 'Копатель', bungee: 'Крюк', gargantuar: 'Гигант', yeti: 'Йети', king: 'Король', dr: 'Доктор'
        };
        
        // Цены для магазина
        const PLANT_PRICES = { sunflower:50, peashooter:50, wallnut:75, cherrybomb:150, iceshroom:75, snowpea:75, chomper:75, repeater:100, squash:100, twinsunflower:150, melonpult:200, cattail:150 };
        const ZOMBIE_PRICES = { zombie:50, conehead:75, buckethead:100, football:125, dancing:100, dolphin:100, digger:125, bungee:150, gargantuar:300, yeti:200, king:250, dr:300 };
        
        // Уровни для разблокировки
        let UNIT_LEVELS = {
            sunflower:1, peashooter:1, wallnut:1, potatomine:1, puffshroom:1, scaredyshroom:1,
            cherrybomb:3, snowpea:3, chomper:3, repeater:3, iceshroom:5, squash:5, magnetshroom:5,
            tallnut:5, twinsunflower:10, melonpult:10, cattail:10, moonglow:15, hypnoshroom:15,
            zombie:1, conehead:1, buckethead:1, football:3, dancing:3, dolphin:3, newspaper:3,
            digger:5, bungee:5, pogo:5, catapult:5, gargantuar:5, yeti:10, king:10, dr:10
        };
        
        async function showShop() { 
            showScreen('shopScreen'); 
            document.getElementById('promoMessage').textContent = ''; 
            await loadInventory(); // Загружаем инвентарь
            await loadShop();
            startShopTimer();
        }
        
        async function loadShop() {
            try {
                // Загружаем магазин и скидки
                const [shopRes, salesRes] = await Promise.all([fetch('/api/shop'), fetch('/api/sales')]);
                const shopData = await shopRes.json();
                const salesData = await salesRes.json();
                
                if (shopData.success) shopItemsList = shopData.items || [];
                if (salesData.success) currentSales = salesData.sales || [];
                
                renderShopItems();
            } catch(e) { console.error(e); }
        }
        
        function switchShopTab(tab) {
            document.getElementById('shopTabPlants').className = tab === 'plants' ? 'btn btn-primary' : 'btn btn-secondary';
            document.getElementById('shopTabPromo').className = tab === 'promo' ? 'btn btn-primary' : 'btn btn-secondary';
            document.getElementById('shopPlantsTab').style.display = tab === 'plants' ? 'block' : 'none';
            document.getElementById('shopPromoTab').style.display = tab === 'promo' ? 'block' : 'none';
        }
        
        let userInventory = {};
        
        async function loadInventory() {
            try {
                const res = await fetch('/api/inventory', {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({sessionId})});
                const data = await res.json();
                if (data.success) {
                    userInventory = data.inventory || {};
                }
            } catch(e) {}
        }
        
        function renderShopItems() {
            const shopEl = document.getElementById('shopItemsContainer');
            if (!shopEl || !shopItemsList.length) return;
            
            const plants = shopItemsList.filter(i => i.type === 'plant');
            const zombies = shopItemsList.filter(i => i.type === 'zombie');
            
            let html = '';
            
            if (plants.length) {
                html += '<div style="margin-bottom:20px"><h4 style="color:#4ade80;margin-bottom:15px;text-align:center">🌻 Растения</h4>';
                html += '<div style="display:flex;flex-wrap:wrap;justify-content:center;gap:12px">';
                html += plants.map(item => renderShopItem(item)).join('');
                html += '</div></div>';
            }
            
            if (zombies.length) {
                html += '<div><h4 style="color:#ef4444;margin-bottom:15px;text-align:center">🧟 Зомби</h4>';
                html += '<div style="display:flex;flex-wrap:wrap;justify-content:center;gap:12px">';
                html += zombies.map(item => renderShopItem(item)).join('');
                html += '</div></div>';
            }
            
            shopEl.innerHTML = html;
        }
        
        function renderShopItem(item) {
            const sale = currentSales.find(s => s.plantId === item.id);
            const icon = item.type === 'plant' ? (PLANT_ICONS[item.id] || '🌱') : (ZOMBIE_ICONS[item.id] || '🧟');
            const name = item.type === 'plant' ? (PLANT_NAMES[item.id] || item.id) : (ZOMBIE_NAMES[item.id] || item.id);
            
            // Проверяем, куплен ли юнит
            const owned = userInventory[item.id];
            const isOwned = !!owned;
            const unitLevel = owned ? owned.level : 1;
            
            // Проверяем, заблокирован ли по уровню
            const requiredLevel = UNIT_LEVELS ? (UNIT_LEVELS[item.id] || 1) : 1;
            const userLevel = currentUser?.level || 1;
            const isLocked = userLevel < requiredLevel;
            
            let priceHtml = '';
            let btnHtml = '';
            
            if (isLocked) {
                priceHtml = `<span style="color:#ef4444">🔒 Уровень ${requiredLevel}</span>`;
                btnHtml = `<button class="btn btn-danger" style="padding:5px 10px;font-size:0.7rem;margin-top:5px" disabled>Заблокировано</button>`;
            } else if (isOwned) {
                const maxLevel = 10;
                if (unitLevel < maxLevel) {
                    const prices = item.type === 'plant' ? PLANT_PRICES : ZOMBIE_PRICES;
                    const basePrice = prices[item.id] || 50;
                    const upgradePrice = Math.floor(basePrice * (1 + unitLevel * 0.5));
                    priceHtml = `<span style="color:#4ade80">Уровень ${unitLevel}/${maxLevel}</span>`;
                    btnHtml = `<button class="btn btn-warning" style="padding:5px 10px;font-size:0.7rem;margin-top:5px" onclick="upgradeUnit('${item.id}', '${item.type}')">Прокачать (${upgradePrice}💰)</button>`;
                } else {
                    priceHtml = `<span style="color:#fbbf24">⭐ Макс. уровень!</span>`;
                    btnHtml = `<button class="btn btn-primary" style="padding:5px 10px;font-size:0.7rem;margin-top:5px" disabled>Максимум</button>`;
                }
            } else {
                const finalPrice = sale ? Math.floor(item.price * (1 - sale.discount/100)) : item.price;
                priceHtml = sale ? `<span class="old-price">${item.price}💰</span> <span style="color:#fbbf24">${finalPrice}💰</span>` : `<span style="color:#fbbf24">${item.price}💰</span>`;
                btnHtml = `<button class="btn btn-primary" style="padding:5px 10px;font-size:0.7rem;margin-top:5px" onclick="buyUnit('${item.id}', '${item.type}', ${finalPrice || item.price})">Купить</button>`;
            }
            
            if (sale && !isLocked) {
                return `<div class="shop-item sale" style="position:relative">
                    <span class="sale-badge">-${sale.discount}%</span>
                    <div class="shop-item-icon">${icon}</div>
                    <div>${name}</div>
                    <div>${priceHtml}</div>
                    ${btnHtml}
                </div>`;
            }
            return `<div class="shop-item" style="opacity:${isLocked ? 0.5 : 1}">
                <div class="shop-item-icon">${icon}</div>
                <div>${name}</div>
                <div>${priceHtml}</div>
                ${btnHtml}
            </div>`;
        }
        
        async function buyUnit(unitId, type, price) {
            if (!confirm(`Купить ${unitId} за ${price} монет?`)) return;
            
            try {
                const res = await fetch('/api/buy-unit', {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({sessionId, unitId, unitType: type})});
                const data = await res.json();
                alert(data.message);
                if (data.success) {
                    currentUser.coins = data.coins;
                    userInventory = data.inventory;
                    document.getElementById('statCoins').textContent = currentUser.coins;
                    await loadShop(); // Перезагружаем магазин
                }
            } catch(e) {
                alert('Ошибка покупки');
            }
        }
        
        async function upgradeUnit(unitId, type) {
            const owned = userInventory[unitId];
            if (!owned) {
                alert('У вас нет этого юнита!');
                return;
            }
            
            const currentLevel = owned.level || 1;
            const prices = type === 'plant' ? PLANT_PRICES : ZOMBIE_PRICES;
            const basePrice = prices[unitId] || 50;
            const upgradePrice = Math.floor(basePrice * (1 + currentLevel * 0.5));
            
            if (!confirm(`Прокачать ${unitId} до уровня ${currentLevel + 1} за ${upgradePrice} монет?`)) return;
            
            try {
                const res = await fetch('/api/upgrade-unit', {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({sessionId, unitId})});
                const data = await res.json();
                alert(data.message);
                if (data.success) {
                    currentUser.coins = data.coins;
                    userInventory = data.inventory;
                    document.getElementById('statCoins').textContent = currentUser.coins;
                    await loadShop();
                }
            } catch(e) {
                alert('Ошибка прокачки');
            }
        }
        
        function startShopTimer() {
            if (shopTimer) clearInterval(shopTimer);
            shopTimer = setInterval(async () => {
                const res = await fetch('/api/shop');
                const data = await res.json();
                if (data.success && data.nextUpdate) {
                    const mins = Math.floor(data.nextUpdate / 60000);
                    const secs = Math.floor((data.nextUpdate % 60000) / 1000);
                    document.getElementById('shopTimer').textContent = `Обновление через: ${mins}:${secs.toString().padStart(2, '0')}`;
                }
            }, 1000);
        }
        
        async function activatePromo() {
            const code = document.getElementById('promoCode').value.trim();
            if (!code) return;
            try {
                const res = await fetch('/api/promocode', {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({sessionId,code})});
                const data = await res.json();
                const msg = document.getElementById('promoMessage');
                msg.textContent = data.message;
                msg.style.color = data.success?'#4ade80':'#ef4444';
                if (data.success && data.coins!==undefined) currentUser.coins = data.coins;
            } catch(e) {}
        }
        
        async function getDailyReward() {
            try {
                const res = await fetch('/api/daily-reward', {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({sessionId})});
                const data = await res.json();
                alert(data.message);
                if (data.success) { currentUser.coins = data.coins; }
            } catch(e) {}
        }
        
        async function showAdmin() {
            if (currentUser?.role!=='admin') return;
            showScreen('adminScreen');
            try {
                const res = await fetch('/api/admin/stats', {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({sessionId})});
                const data = await res.json();
                if (data.success) {
                    document.getElementById('adminTotalUsers').textContent = data.stats.totalUsers;
                    document.getElementById('adminTotalWins').textContent = data.stats.totalWins;
                    document.getElementById('adminTotalGames').textContent = data.stats.totalGames;
                    document.getElementById('adminTotalCoins').textContent = data.stats.totalCoins;
                    document.getElementById('adminTotalCrystals').textContent = data.stats.totalCrystals || 0;
                }
                const res2 = await fetch('/api/admin/users', {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({sessionId})});
                const data2 = await res2.json();
                if (data2.success) {
                    document.getElementById('adminUsersList').innerHTML = data2.users.map(u =>
                        `<div class="admin-user-row">
                            <span>${escapeHtml(u.username)}</span>
                            <span>${escapeHtml(u.role)}${u.battlePassPremium ? ' ⭐BP' : ''}</span>
                            <span>${u.coins}💰 / ${u.crystals || 0}💎</span>
                            <span>${u.wins}п</span>
                        </div>`
                    ).join('');
                }
            } catch(e) {}
        }
        
        async function createPromo(e) {
            e.preventDefault();
            try {
                const res = await fetch('/api/admin/create-promo', {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({
                    sessionId, code:document.getElementById('newPromoCode').value.trim(),
                    reward:document.getElementById('newPromoReward').value,
                    maxUses:document.getElementById('newPromoMaxUses').value
                })});
                const data = await res.json();
                alert(data.message);
                if (data.success) e.target.reset();
            } catch(e) {}
        }
        
        async function createSale(e) {
            e.preventDefault();
            try {
                const res = await fetch('/api/admin/create-sale', {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({
                    sessionId,
                    plantId: document.getElementById('salePlantId').value,
                    discount: document.getElementById('saleDiscount').value,
                    duration: document.getElementById('saleDuration').value
                })});
                const data = await res.json();
                alert(data.message);
                if (data.success) e.target.reset();
            } catch(e) {}
        }
        
        // === НОВЫЕ ADMIN ФУНКЦИИ ===        
        function switchAdminTab(tab) {
            document.getElementById('adminTabStats').className = tab === 'stats' ? 'btn btn-primary' : 'btn btn-secondary';
            document.getElementById('adminTabPlayers').className = tab === 'players' ? 'btn btn-primary' : 'btn btn-secondary';
            document.getElementById('adminTabTools').className = tab === 'tools' ? 'btn btn-primary' : 'btn btn-secondary';
            document.getElementById('adminTabSettings').className = tab === 'settings' ? 'btn btn-primary' : 'btn btn-secondary';
            
            document.getElementById('adminStatsTab').style.display = tab === 'stats' ? 'block' : 'none';
            document.getElementById('adminPlayersTab').style.display = tab === 'players' ? 'block' : 'none';
            document.getElementById('adminToolsTab').style.display = tab === 'tools' ? 'block' : 'none';
            document.getElementById('adminSettingsTab').style.display = tab === 'settings' ? 'block' : 'none';
            
            if (tab === 'settings') {
                loadServerSettings();
                loadLevelStats();
                loadTopCoins();
            }
        }
        
        async function loadDbStats() {
            try {
                const res = await fetch('/api/admin/db-stats', {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({sessionId})});
                const data = await res.json();
                if (data.success) {
                    document.getElementById('adminDbStats').innerHTML = `
                        <div style="background:rgba(255,255,255,0.1);padding:10px;border-radius:8px;text-align:center">
                            <div style="font-size:1.5rem;color:#4ade80">${data.stats.users}</div>
                            <div style="font-size:0.8rem">Пользователей</div>
                        </div>
                        <div style="background:rgba(255,255,255,0.1);padding:10px;border-radius:8px;text-align:center">
                            <div style="font-size:1.5rem;color:#fbbf24">${data.stats.matches}</div>
                            <div style="font-size:0.8rem">Матчей</div>
                        </div>
                        <div style="background:rgba(255,255,255,0.1);padding:10px;border-radius:8px;text-align:center">
                            <div style="font-size:1.5rem;color:#6366f1">${data.stats.promos}</div>
                            <div style="font-size:0.8rem">Промокодов</div>
                        </div>
                        <div style="background:rgba(255,255,255,0.1);padding:10px;border-radius:8px;text-align:center">
                            <div style="font-size:1.5rem;color:#ef4444">${data.stats.sessions}</div>
                            <div style="font-size:0.8rem">Сессий</div>
                        </div>
                    `;
                }
            } catch(e) {}
        }
        
        async function adminSearchUser() {
            const query = document.getElementById('adminSearchInput').value.trim();
            if (!query) return;
            
            try {
                const res = await fetch('/api/admin/search-user', {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({sessionId, query})});
                const data = await res.json();
                
                if (data.success && data.users.length > 0) {
                    document.getElementById('adminSearchResults').innerHTML = data.users.map(u =>
                        `<div class="admin-user-row" style="cursor:pointer" onclick="viewPlayerProfile('${escapeHtml(u.username)}')">
                            <span>${escapeHtml(u.username)}</span>
                            <span>${escapeHtml(u.role)}</span>
                            <span>${u.level}ур</span>
                            <span>${u.coins}💰</span>
                        </div>`
                    ).join('');
                } else {
                    document.getElementById('adminSearchResults').innerHTML = '<p style="color:#ef4444">Ничего не найдено</p>';
                }
            } catch(e) {}
        }
        
        async function adminGiveCoins(e) {
            e.preventDefault();
            const username = document.getElementById('gcUsername').value.trim();
            const coins = document.getElementById('gcAmount').value;
            if (!username || !coins) return;
            
            try {
                const res = await fetch('/api/admin/give-coins', {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({sessionId, username, coins: parseInt(coins)})});
                const data = await res.json();
                alert(data.message);
                if (data.success) e.target.reset();
            } catch(e) { alert('Ошибка'); }
        }
        
        async function adminTakeCoins(e) {
            e.preventDefault();
            const username = document.getElementById('tcUsername').value.trim();
            const coins = document.getElementById('tcAmount').value;
            if (!username || !coins) return;
            
            try {
                const res = await fetch('/api/admin/take-coins', {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({sessionId, username, coins: parseInt(coins)})});
                const data = await res.json();
                alert(data.message);
                if (data.success) e.target.reset();
            } catch(e) { alert('Ошибка'); }
        }

        async function adminGiveCrystals(e) {
            e.preventDefault();
            const username = document.getElementById('gcrUsername').value.trim();
            const crystals = document.getElementById('gcrAmount').value;
            if (!username || !crystals) return;
            try {
                const res = await fetch('/api/admin/give-crystals', {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({sessionId, username, crystals: parseInt(crystals)})});
                const data = await res.json();
                alert(data.message);
                if (data.success) e.target.reset();
            } catch(e) { alert('Ошибка'); }
        }

        async function adminGivePlantChest(e) {
            e.preventDefault();
            const username = document.getElementById('pcUsername').value.trim();
            const rarity = document.getElementById('pcRarity').value;
            const amount = document.getElementById('pcAmount').value;
            if (!username || !rarity || !amount) return;
            try {
                const res = await fetch('/api/admin/give-plant-chest', {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({sessionId, username, rarity, amount: parseInt(amount)})});
                const data = await res.json();
                alert(data.message);
                if (data.success) e.target.reset();
            } catch(e) { alert('Ошибка'); }
        }

        async function adminSetBattlePassLevel(e) {
            e.preventDefault();
            const username = document.getElementById('bpUsername').value.trim();
            const level = document.getElementById('bpLevel').value;
            if (!username || !level) return;
            try {
                const res = await fetch('/api/admin/set-battlepass-level', {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({sessionId, username, level: parseInt(level)})});
                const data = await res.json();
                alert(data.message);
                if (data.success) e.target.reset();
            } catch(e) { alert('Ошибка'); }
        }

        async function adminSetBattlePassPremium(e) {
            e.preventDefault();
            const username = document.getElementById('bpPremiumUsername').value.trim();
            const value = document.getElementById('bpPremiumValue').value;
            if (!username) return;
            try {
                const res = await fetch('/api/admin/set-battlepass-premium', {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({sessionId, username, isPremium: value})});
                const data = await res.json();
                alert(data.message);
                if (data.success) e.target.reset();
            } catch(e) { alert('Ошибка'); }
        }
        
        async function adminSetLevel(e) {
            e.preventDefault();
            const username = document.getElementById('slUsername').value.trim();
            const level = document.getElementById('slLevel').value;
            if (!username || !level) return;
            
            try {
                const res = await fetch('/api/admin/set-level', {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({sessionId, username, level: parseInt(level)})});
                const data = await res.json();
                alert(data.message);
                if (data.success) e.target.reset();
            } catch(e) { alert('Ошибка'); }
        }
        
        async function adminSetXP(e) {
            e.preventDefault();
            const username = document.getElementById('sxUsername').value.trim();
            const xp = document.getElementById('sxAmount').value;
            if (!username || !xp) return;
            
            try {
                const res = await fetch('/api/admin/set-xp', {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({sessionId, username, xp: parseInt(xp)})});
                const data = await res.json();
                alert(data.message);
                if (data.success) e.target.reset();
            } catch(e) { alert('Ошибка'); }
        }
        
        async function adminSetWins(e) {
            e.preventDefault();
            const username = document.getElementById('swUsername').value.trim();
            const wins = document.getElementById('swWins').value;
            if (!username || !wins) return;
            
            try {
                const res = await fetch('/api/admin/set-wins', {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({sessionId, username, wins: parseInt(wins)})});
                const data = await res.json();
                alert(data.message);
                if (data.success) e.target.reset();
            } catch(e) { alert('Ошибка'); }
        }
        
        async function adminGiveUnit(e) {
            e.preventDefault();
            const username = document.getElementById('guUsername').value.trim();
            const unitId = document.getElementById('guUnitId').value;
            const unitType = document.getElementById('guUnitType').value;
            if (!username || !unitId) return;
            
            try {
                const res = await fetch('/api/admin/give-unit', {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({sessionId, username, unitId, unitType})});
                const data = await res.json();
                alert(data.message);
                if (data.success) e.target.reset();
            } catch(e) { alert('Ошибка'); }
        }
        
        async function adminBanUser(e) {
            e.preventDefault();
            const username = document.getElementById('banUsername').value.trim();
            if (!username) return;
            
            if (!confirm(`Забанить игрока ${username}?`)) return;
            
            try {
                const res = await fetch('/api/admin/ban', {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({sessionId, username})});
                const data = await res.json();
                alert(data.message);
                if (data.success) e.target.reset();
            } catch(e) { alert('Ошибка'); }
        }
        
        async function adminUnbanUser(e) {
            e.preventDefault();
            const username = document.getElementById('unbanUsername').value.trim();
            if (!username) return;
            
            try {
                const res = await fetch('/api/admin/unban', {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({sessionId, username})});
                const data = await res.json();
                alert(data.message);
                if (data.success) e.target.reset();
            } catch(e) { alert('Ошибка'); }
        }
        
        async function adminSetRole(e) {
            e.preventDefault();
            const username = document.getElementById('roleUsername').value.trim();
            const role = document.getElementById('roleType').value;
            if (!username || !role) return;
            
            if (!confirm(`Изменить роль игрока ${username} на ${role}?`)) return;
            
            try {
                const res = await fetch('/api/admin/set-role', {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({sessionId, username, role})});
                const data = await res.json();
                alert(data.message);
                if (data.success) e.target.reset();
            } catch(e) { alert('Ошибка'); }
        }
        
        async function adminResetProgress() {
            const username = prompt('Введите ник игрока для сброса прогресса:');
            if (!username) return;
            if (!confirm(`Сбросить прогресс игрока ${username}? Все монеты, победы и уровень будут сброшены!`)) return;
            
            try {
                const res = await fetch('/api/admin/reset-progress', {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({sessionId, username})});
                const data = await res.json();
                alert(data.message);
            } catch(e) { alert('Ошибка'); }
        }
        
        async function adminDeleteUser() {
            const username = prompt('Введите ник игрока для удаления:');
            if (!username) return;
            if (!confirm(`УДАЛИТЬ игрока ${username}? Это действие необратимо!`)) return;
            
            try {
                const res = await fetch('/api/admin/delete-user', {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({sessionId, username})});
                const data = await res.json();
                alert(data.message);
            } catch(e) { alert('Ошибка'); }
        }
        
        async function adminClearMatches() {
            if (!confirm('Удалить ВСЕ матчи? Это действие необратимо!')) return;
            
            try {
                const res = await fetch('/api/admin/clear-matches', {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({sessionId})});
                const data = await res.json();
                alert(data.message);
            } catch(e) { alert('Ошибка'); }
        }
        
        async function adminClearPromos() {
            if (!confirm('Удалить ВСЕ промокоды? Это действие необратимо!')) return;
            
            try {
                const res = await fetch('/api/admin/clear-promos', {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({sessionId})});
                const data = await res.json();
                alert(data.message);
            } catch(e) { alert('Ошибка'); }
        }
        
        async function adminResetQuests() {
            if (!confirm('Сбросить ежедневные квесты всем игрокам?')) return;
            
            try {
                const res = await fetch('/api/admin/reset-quests', {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({sessionId})});
                const data = await res.json();
                alert(data.message);
            } catch(e) { alert('Ошибка'); }
        }
        
        async function adminBroadcastCoins(e) {
            e.preventDefault();
            const amount = document.getElementById('bcAmount').value;
            if (!amount) return;
            
            if (!confirm(`Выдать по ${amount} монет ВСЕМ игрокам?`)) return;
            
            try {
                const res = await fetch('/api/admin/broadcast-coins', {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({sessionId, coins: parseInt(amount)})});
                const data = await res.json();
                alert(data.message);
                if (data.success) e.target.reset();
            } catch(e) { alert('Ошибка'); }
        }
        
        async function adminExportUsers() {
            try {
                const res = await fetch('/api/admin/export-users', {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({sessionId})});
                const data = await res.json();
                if (data.success) {
                    const blob = new Blob([JSON.stringify(data.users, null, 2)], {type: 'application/json'});
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = 'pvz_players_' + new Date().toISOString().split('T')[0] + '.json';
                    a.click();
                    URL.revokeObjectURL(url);
                }
            } catch(e) { alert('Ошибка экспорта'); }
        }
        
        async function loadServerSettings() {
            try {
                const res = await fetch('/api/admin/server-settings', {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({sessionId})});
                const data = await res.json();
                if (data.success) {
                    document.getElementById('settingGameDuration').value = data.settings.gameDuration;
                    document.getElementById('settingWinnerReward').value = data.settings.winnerReward;
                    document.getElementById('settingLoserReward').value = data.settings.loserReward;
                    document.getElementById('settingDrawReward').value = data.settings.drawReward;
                    document.getElementById('settingDailyBase').value = data.settings.dailyRewardBase;
                    document.getElementById('settingXpWin').value = data.settings.xpPerWin;
                }
            } catch(e) {}
        }
        
        async function saveServerSettings() {
            const settings = {
                gameDuration: parseInt(document.getElementById('settingGameDuration').value),
                winnerReward: parseInt(document.getElementById('settingWinnerReward').value),
                loserReward: parseInt(document.getElementById('settingLoserReward').value),
                drawReward: parseInt(document.getElementById('settingDrawReward').value),
                dailyRewardBase: parseInt(document.getElementById('settingDailyBase').value),
                xpPerWin: parseInt(document.getElementById('settingXpWin').value)
            };
            
            try {
                const res = await fetch('/api/admin/update-settings', {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({sessionId, settings})});
                const data = await res.json();
                alert(data.message);
            } catch(e) { alert('Ошибка'); }
        }
        
        async function loadLevelStats() {
            try {
                const res = await fetch('/api/admin/level-stats', {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({sessionId})});
                const data = await res.json();
                if (data.success) {
                    document.getElementById('levelStatsList').innerHTML = data.levelStats.map(l =>
                        `<div style="background:rgba(255,255,255,0.1);padding:10px;border-radius:8px;text-align:center">
                            <div style="font-size:1.2rem;color:#fbbf24">${l._id}</div>
                            <div style="font-size:0.8rem">ур.</div>
                            <div style="font-size:1rem;color:#4ade80">${l.count}</div>
                        </div>`
                    ).join('');
                }
            } catch(e) {}
        }
        
        async function loadTopCoins() {
            try {
                const res = await fetch('/api/admin/top-coins', {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({sessionId})});
                const data = await res.json();
                if (data.success) {
                    document.getElementById('topCoinsList').innerHTML = data.top.map((u, i) =>
                        `<div class="admin-user-row">
                            <span style="color:#fbbf24">#${i+1}</span>
                            <span>${u.username}</span>
                            <span style="color:#fbbf24">${u.coins}💰</span>
                        </div>`
                    ).join('');
                }
            } catch(e) {}
        }
        
        function backToProfile() { if (currentUser) checkSession().then(() => currentUser && showProfile()); else showMainMenu(); }
        
        function initGameLanes() {
            const lanes = document.getElementById('gameLanes');
            lanes.innerHTML = '';
            for (let i=0;i<5;i++) { const l=document.createElement('div'); l.className='game-lane'; l.dataset.lane=i; lanes.appendChild(l); }
        }
        
        function findGame() {
            if (!socket) { socket = io(); initSocketListeners(); }
            showScreen('waitingScreen');
            document.getElementById('chatMessages').innerHTML = '';
            const difficulty = document.getElementById('difficultySelect').value;
            socket.emit('findGame', {sessionId, difficulty});
        }
        
        function findBotGame() {
            // Показать модальное окно выбора сложности и стороны
            document.getElementById('botGameModal').style.display = 'flex';
        }
        
        function closeBotGameModal() {
            document.getElementById('botGameModal').style.display = 'none';
        }
        
        function startBotGame() {
            const difficulty = document.getElementById('botDifficultySelect').value;
            const sideRadios = document.getElementsByName('botSide');
            let selectedSide = 'plant';
            for (const radio of sideRadios) {
                if (radio.checked) {
                    selectedSide = radio.value;
                    break;
                }
            }
            
            if (!socket) { socket = io(); initSocketListeners(); }
            closeBotGameModal();
            showScreen('waitingScreen');
            document.getElementById('chatMessages').innerHTML = '';
            socket.emit('findBotGame', {sessionId, difficulty, side: selectedSide});
        }
        
        function initSocketListeners() {
            socket.on('waiting', () => {});
            socket.on('gameStart', (data) => startGame(data));
            socket.on('gameTimer', (data) => updateGameTimer(data.time));
            socket.on('opponentPlanted', (data) => placeOpponentUnit(data));
            socket.on('opponentZombie', (data) => placeOpponentUnit(data));
            socket.on('botPlaceUnit', (data) => placeOpponentUnit(data));
            socket.on('gameEnd', (data) => endGame(data));
            socket.on('chatMessage', (data) => addChatMessage(data));
            socket.on('error', (data) => { alert(data.message); backToProfile(); });
        }
        
        let gameResources = { sun: 50, brain: 50 };
        let gameLoop = null;
        let houseHP = { plant: 100, zombie: 100 }; // HP домов в процентах
        let projectiles = []; // Массив снарядов
        let explosions = []; // Массив взрывов
        let effects = []; // Массив визуальных эффектов
        
        function startGame(data) {
            showScreen('gameScreen');
            const myPlayer = data.players.find(p => p.id === socket.id);
            gameState = { mySide: myPlayer.side, opponent: data.players.find(p => p.id !== socket.id), units: [] };
            gameResources = { sun: 50, brain: 50 };
            houseHP = { plant: 100, zombie: 100 };
            projectiles = [];
            explosions = [];
            effects = [];
            updateResourceDisplay();
            updateHouseHP();
            document.getElementById('mySide').textContent = myPlayer.side==='plant'?'🌻 Растения':'🧟 Зомби';
            document.getElementById('opponentName').textContent = gameState.opponent.username;
            initGameControls();
            startGameLoop();
        }
        
        // === СИСТЕМА СНАРЯДОВ ===
        function createProjectile(laneIndex, fromUnit, targetUnit, damage, type = 'pea') {
            const lane = document.querySelector(`.game-lane[data-lane="${laneIndex}"]`);
            if (!lane) return;
            
            const projectile = document.createElement('div');
            projectile.className = `projectile ${type}`;
            projectile.style.top = '50%';
            projectile.style.transform = 'translateY(-50%)';
            
            // Начальная позиция - от юнита
            const startPos = parseFloat(fromUnit.element.style.left) || 50;
            projectile.style.left = startPos + '%';
            
            lane.appendChild(projectile);
            
            const projData = {
                element: projectile,
                lane: laneIndex,
                fromUnit: fromUnit,
                damage: damage,
                type: type,
                speed: type === 'melon' ? 1.5 : 3, // Арбузы медленнее
                direction: fromUnit.side === 'plant' ? 1 : -1 // Растения стреляют вправо, зомби влево
            };
            projectiles.push(projData);
        }
        
        // === СИСТЕМА ВЗРЫВОВ ===
        function createExplosion(laneIndex, position, damage, radius = 20) {
            const lane = document.querySelector(`.game-lane[data-lane="${laneIndex}"]`);
            if (!lane) return;
            
            const explosion = document.createElement('div');
            explosion.className = 'explosion';
            explosion.innerHTML = '💥';
            explosion.style.left = position;
            explosion.style.top = '50%';
            explosion.style.transform = 'translateY(-50%)';
            lane.appendChild(explosion);
            
            // Анимация взрыва
            setTimeout(() => explosion.remove(), 500);
            
            // Наносим урон всем юнитам на линии в радиусе
            if (gameState && gameState.units) {
                gameState.units.forEach(unit => {
                    if (unit.lane === laneIndex) {
                        const unitPos = parseFloat(unit.element.style.left) || 50;
                        const explPos = parseFloat(position);
                        if (Math.abs(unitPos - explPos) < radius) {
                            unit.health -= damage;
                            unit.element.classList.add('damage');
                            setTimeout(() => unit.element.classList.remove('damage'), 300);
                            
                            // Показываем урон
                            const damageText = document.createElement('div');
                            damageText.textContent = '-' + damage;
                            damageText.style.cssText = 'position:absolute;top:-20px;left:50%;transform:translateX(-50%);color:#ef4444;font-weight:bold;font-size:14px;animation:damageText 1s forwards;z-index:100';
                            unit.element.appendChild(damageText);
                            setTimeout(() => damageText.remove(), 1000);
                            
                            if (unit.health <= 0 && unit.element) {
                                unit.element.classList.add('unit-death');
                                setTimeout(() => {
                                    if (unit.element) unit.element.remove();
                                }, 500);
                                gameState.units = gameState.units.filter(u => u !== unit);
                            }
                        }
                    }
                });
            }
        }
        
        // === СИСТЕМА ЛЕЧЕНИЯ ===
        function createHealEffect(unit, amount) {
            const healText = document.createElement('div');
            healText.textContent = '+' + amount;
            healText.style.cssText = 'position:absolute;top:-25px;left:50%;transform:translateX(-50%);color:#4ade80;font-weight:bold;font-size:14px;animation:damageFloat 1s forwards;z-index:100';
            unit.element.appendChild(healText);
            setTimeout(() => healText.remove(), 1000);
        }
        
        // === СИСТЕМА ЗАМОРОЗКИ ===
        function createFreezeEffect(unit, duration) {
            unit.element.classList.add('frozen-effect');
            unit.frozen = true;
            unit.originalSpeed = unit.moveSpeed || 1;
            unit.moveSpeed = unit.originalSpeed * 0.3; // Замедляем на 70%
            
            setTimeout(() => {
                if (unit.element) {
                    unit.element.classList.remove('frozen-effect');
                    unit.frozen = false;
                    unit.moveSpeed = unit.originalSpeed;
                }
            }, duration * 1000);
        }
        
        // === ОБНОВЛЕНИЕ СНАРЯДОВ ===
        function updateProjectiles() {
            projectiles = projectiles.filter(proj => {
                if (!proj.element || !proj.element.parentElement) return false;
                
                const currentLeft = parseFloat(proj.element.style.left) || 0;
                let newPos = currentLeft + (proj.speed * proj.direction);
                
                // Проверка выхода за границы поля
                if (newPos > 100 || newPos < 0) {
                    proj.element.remove();
                    return false;
                }
                
                // Проверка столкновения с врагами
                const targets = gameState.units.filter(u => 
                    u.side !== proj.fromUnit.side && 
                    u.lane === proj.lane
                );
                
                for (const target of targets) {
                    const targetPos = parseFloat(target.element.style.left) || 50;
                    if (Math.abs(newPos - targetPos) < 5) {
                        // Попадание!
                        let damage = proj.damage;
                        
                        // Критический урон (с шансом 15%)
                        if (Math.random() < 0.15) {
                            damage *= 2;
                            proj.element.classList.add('critical-hit');
                        }
                        
                        target.health -= damage;
                        
                        // Показываем урон
                        const damageText = document.createElement('div');
                        damageText.textContent = '-' + damage + (Math.random() < 0.15 ? ' 💥' : '');
                        damageText.style.cssText = 'position:absolute;top:-20px;left:50%;transform:translateX(-50%);color:#ef4444;font-weight:bold;font-size:14px;animation:damageText 1s forwards;z-index:100';
                        if (Math.random() < 0.15) damageText.style.color = '#fbbf24'; // Критический - золотой
                        target.element.appendChild(damageText);
                        setTimeout(() => damageText.remove(), 1000);
                        
                        // Эффект заморозки от снежного горошка
                        if (proj.type === 'frozen') {
                            createFreezeEffect(target, 3);
                        }
                        
                        target.element.classList.add('damage');
                        setTimeout(() => {
                            target.element.classList.remove('damage');
                            if (proj.element) proj.element.classList.remove('critical-hit');
                        }, 200);
                        
                        if (target.health <= 0 && target.element) {
                            target.element.classList.add('unit-death');
                            setTimeout(() => {
                                if (target.element) target.element.remove();
                            }, 500);
                            gameState.units = gameState.units.filter(u => u !== target);
                        }
                        
                        proj.element.remove();
                        return false;
                    }
                }
                
                proj.element.style.left = newPos + '%';
                return true;
            });
        }
        
        // === СПЕЦИАЛЬНЫЕ СПОСОБНОСТИ ЮНИТОВ ===
        function handleUnitAbilities(unit) {
            if (!unit.ability) return;
            
            switch(unit.ability) {
                case 'explode':
                    // Вишнёвая бомба - взрывается при смерти
                    if (unit.health <= 20 && !unit.exploded) {
                        unit.exploded = true;
                        const pos = unit.element.style.left;
                        createExplosion(unit.lane, pos, 1800, 25);
                        if (unit.element) unit.element.remove();
                        gameState.units = gameState.units.filter(u => u !== unit);
                        
                        // Урон дому если взрыв у края
                        if (unit.side === 'plant' && parseFloat(pos) < 20) {
                            houseHP.plant -= 30;
                            updateHouseHP();
                        } else if (unit.side === 'zombie' && parseFloat(pos) > 80) {
                            houseHP.zombie -= 30;
                            updateHouseHP();
                        }
                    }
                    break;
                    
                case 'eat':
                    // Хапун поедает зомби
                    if (unit.eating && unit.target) {
                        unit.target.health -= unit.damage / 10;
                        if (unit.target.health <= 0 && unit.target.element) {
                            unit.target.element.remove();
                            gameState.units = gameState.units.filter(u => u !== unit.target);
                            unit.eating = false;
                            unit.target = null;
                        }
                    }
                    break;
                    
                case 'dig':
                    // Копатель появляется за растениями
                    if (!unit.appeared) {
                        unit.appeared = true;
                        if (unit.element) {
                            unit.element.style.left = '85%';
                        }
                    }
                    break;
                    
                case 'grab':
                    // Крючник хватает растение
                    if (!unit.grabbing && Math.random() < 0.01) {
                        const target = gameState.units.find(u => u.side !== unit.side && u.lane === unit.lane);
                        if (target) {
                            unit.grabbing = true;
                            unit.grabTarget = target;
                            target.element.style.opacity = '0.5';
                            // Через 2 секунды растение исчезает
                            setTimeout(() => {
                                if (target.element) {
                                    target.element.remove();
                                    gameState.units = gameState.units.filter(u => u !== target);
                                }
                                unit.grabbing = false;
                            }, 2000);
                        }
                    }
                    break;
                    
                case 'summon':
                    // Танцор призывает зомби-тени
                    if (!unit.summonCooldown && Math.random() < 0.05) {
                        unit.summonCooldown = true;
                        // Призываем тень
                        const shadowData = units.zombie.find(u => u.id === 'zombie');
                        if (shadowData) {
                            placeUnit(unit.lane, {...shadowData, health: shadowData.health * 0.5}, unit.side, '95%');
                        }
                        setTimeout(() => { unit.summonCooldown = false; }, 5000);
                    }
                    break;
                    
                case 'rage':
                    // Газетчик яростный при низком HP
                    if (unit.health < unit.maxHealth * 0.3 && !unit.enraged) {
                        unit.enraged = true;
                        unit.damage *= 2;
                        unit.moveSpeed *= 1.5;
                        if (unit.element) {
                            unit.element.style.filter = 'hue-rotate(-30deg) brightness(1.5)';
                        }
                    }
                    break;
                    
                case 'jump':
                    // Кенгуру прыгает через растения
                    if (!unit.jumping && Math.random() < 0.02) {
                        unit.jumping = true;
                        const currentLeft = parseFloat(unit.element.style.left) || 50;
                        unit.element.style.left = (currentLeft + 30) + '%';
                        unit.element.style.transition = 'left 0.5s ease-out';
                        setTimeout(() => {
                            unit.jumping = false;
                            unit.element.style.transition = 'left 0.5s linear';
                        }, 500);
                    }
                    break;
            }
        }
        
        function updateResourceDisplay() {
            const sunDisplay = document.getElementById('sunDisplay');
            const brainDisplay = document.getElementById('brainDisplay');
            if (gameState.mySide === 'plant') {
                sunDisplay.textContent = '🌻 ' + gameResources.sun;
                brainDisplay.style.display = 'none';
            } else {
                brainDisplay.textContent = '🧠 ' + gameResources.brain;
                sunDisplay.style.display = 'none';
            }
        }
        
        function updateHouseHP() {
            // Обновляем отображение HP домов
            const plantHP = document.getElementById('plantHouseHP');
            const zombieHP = document.getElementById('zombieHouseHP');
            if (plantHP) plantHP.textContent = '🏠 ' + Math.ceil(houseHP.plant) + '%';
            if (zombieHP) zombieHP.textContent = '🏠 ' + Math.ceil(houseHP.zombie) + '%';
            
            // Проверка на проигрыш
            if (houseHP.plant <= 0 || houseHP.zombie <= 0) {
                if (gameLoop) clearInterval(gameLoop);
                
                // Правильное определение победителя:
                // - Если plant HP <= 0, зомби победили (winner = 'zombie')
                // - Если zombie HP <= 0, растения победили (winner = 'plant')
                // - Если оба <= 0, это не может произойти вnormal game
                
                let winner;
                if (houseHP.plant <= 0 && houseHP.zombie <= 0) {
                    // Ничья - оба дома уничтожены одновременно
                    socket.emit('gameOver', { winner: 'draw' });
                } else if (houseHP.plant <= 0) {
                    // Дом растений уничтожен - зомби победили
                    socket.emit('gameOver', { winner: 'zombie' });
                } else {
                    // Дом зомби уничтожен - растения победили
                    socket.emit('gameOver', { winner: 'plant' });
                }
                return;
            }
        }
        
        function startGameLoop() {
            if (gameLoop) clearInterval(gameLoop);
            gameLoop = setInterval(() => {
                if (!gameState || !gameState.units) return;
                
                // УСКОРЕННАЯ генерация ресурсов - каждые 500мс вместо 1 сек!
                // Растения производят солнце, зомби производят мозги
                if (gameState.mySide === 'plant') {
                    gameResources.sun += 2; // +2 каждые полсекунды = +4 в секунду
                } else {
                    gameResources.brain += 2;
                }
                updateResourceDisplay();
                
                // Движение зомби (двигаются ВСЕ зомби в игре!)
                gameState.units.forEach((unit, index) => {
                    if (unit.side === 'zombie') {
                        // Зомби двигаются влево (к растениям) - от 90% к 10%
                        const speed = (unit.moveSpeed || 1) * 2;
                        let currentLeft = parseFloat(unit.element.style.left) || 50;
                        currentLeft -= speed;
                        if (currentLeft < 5) currentLeft = 5;
                        unit.element.style.left = currentLeft + '%';
                        
                        // === ДОСТИЖЕНИЕ ДОМА ===
                        // Когда зомби достигает 5% (дома растений), наносится урон дому
                        if (currentLeft <= 5) {
                            // Атака дома растений!
                            houseHP.plant -= 20; // 20% урона
                            unit.element.classList.add('attack');
                            
                            // Удаляем зомби после атаки дома
                            if (unit.element) {
                                unit.element.remove();
                            }
                            gameState.units = gameState.units.filter(u => u !== unit);
                            updateHouseHP();
                            return;
                        }
                        
                        // Проверка столкновения с растениями
                        gameState.units.forEach(target => {
                            if (target.side === 'plant' && target.lane === unit.lane) {
                                const posDiff = Math.abs(parseFloat(unit.element.style.left || 50) - parseFloat(target.element.style.left || 50));
                                if (posDiff < 10) {
                                    // Атака растения!
                                    unit.element.classList.add('attack');
                                    target.health -= (unit.damage || 20) / 30;
                                    target.element.classList.add('damage');
                                    setTimeout(() => {
                                        unit.element.classList.remove('attack');
                                        target.element.classList.remove('damage');
                                    }, 200);
                                    
                                    if (target.health <= 0 && target.element) {
                                        target.element.remove();
                                        gameState.units = gameState.units.filter(u => u !== target);
                                    }
                                }
                            }
                        });
                    }
                });
                
                // Растения атакуют вправо (к дому зомби), зомби атакуют влево (к дому растений)
                gameState.units.forEach(unit => {
                    // Солнцедобыватели - производят ресурсы
                    if (unit.sunProduction && unit.sunSpeed) {
                        unit.sunTimer = (unit.sunTimer || 0) + 0.5;
                        if (unit.sunTimer >= unit.sunSpeed) {
                            unit.sunTimer = 0;
                            if (unit.side === 'plant' && gameState.mySide === 'plant') {
                                gameResources.sun += unit.sunProduction;
                                // Визуальный эффект производства
                                if (unit.element) {
                                    unit.element.style.transform = 'translateY(-50%) scale(1.2)';
                                    setTimeout(() => {
                                        if (unit.element) unit.element.style.transform = 'translateY(-50%) scale(1)';
                                    }, 200);
                                }
                            }
                            updateResourceDisplay();
                        }
                    }
                    
                    // Атакующие растения - стреляют вправо
                    if (unit.side === 'plant' && unit.damage && unit.type !== 'producer') {
                        unit.attackTimer = (unit.attackTimer || 0) + 0.5;
                        const attackInterval = unit.attackSpeed || 1.5;
                        
                        if (unit.attackTimer >= attackInterval) {
                            unit.attackTimer = 0;
                            
                            // Ищем зомби на той же линии, которые находятся СПРАВА от растения
                            const targets = gameState.units.filter(z => z.side === 'zombie' && z.lane === unit.lane);
                            
                            if (targets.length > 0) {
                                const plantPos = parseFloat(unit.element.style.left) || 15;
                                // Находим ближайшего зомби справа от растения
                                const target = targets.find(z => parseFloat(z.element.style.left || 50) > plantPos);
                                
                                if (target) {
                                    unit.element.classList.add('attack');
                                    target.health -= (unit.damage || 20);
                                    target.element.classList.add('damage');
                                    
                                    // Показываем урон
                                    if (target.element) {
                                        const damageText = document.createElement('div');
                                        damageText.textContent = '-' + (unit.damage || 20);
                                        damageText.style.cssText = 'position:absolute;top:-20px;left:50%;transform:translateX(-50%);color:#ef4444;font-weight:bold;font-size:14px;animation:damageText 1s forwards;z-index:100';
                                        target.element.appendChild(damageText);
                                        setTimeout(() => damageText.remove(), 1000);
                                    }
                                    
                                    setTimeout(() => {
                                        unit.element.classList.remove('attack');
                                        target.element.classList.remove('damage');
                                    }, 200);
                                    
                                    if (target.health <= 0 && target.element) {
                                        target.element.remove();
                                        gameState.units = gameState.units.filter(u => u !== target);
                                    }
                                }
                            }
                        }
                    }
                });
                
            }, 500); // Интервал 500мс для быстрой игры
        }
        
        function initGameControls() {
            const userLevel = currentUser?.level || 1;
            const myUnits = units[gameState.mySide].filter(u => u.level <= userLevel);
            document.getElementById('gameControls').innerHTML = myUnits.map(u =>
                `<button class="unit-btn" onclick="selectUnit('${u.id}')" data-unit="${u.id}" title="Уровень ${u.level}"> ${u.icon}<span class="cost">${u.cost}</span></button>`
            ).join('');
        }
        
        function selectUnit(id) { selectedUnit = id; document.querySelectorAll('.unit-btn').forEach(b => b.classList.toggle('selected', b.dataset.unit===id)); }
        
        document.getElementById('gameArena').addEventListener('click', (e) => {
            if (!selectedUnit || !gameState) return;
            const lane = e.target.closest('.game-lane');
            if (!lane) return;
            
            // Получаем позицию клика относительно gameArena
            const arena = document.getElementById('gameArena');
            const rect = arena.getBoundingClientRect();
            const clickX = e.clientX - rect.left;
            const clickPercent = (clickX / rect.width) * 100;
            
            const laneIndex = parseInt(lane.dataset.lane);
            const unitData = units[gameState.mySide].find(u => u.id === selectedUnit);
            if (!unitData) return;
            
            // Проверка позиции: растения - только слева (0-50%), зомби - только справа (50-100%)
            if (gameState.mySide === 'plant' && clickPercent > 50) {
                alert('Растения можно ставить только на левой половине!');
                return;
            }
            if (gameState.mySide === 'zombie' && clickPercent < 50) {
                alert('Зомби можно ставить только на правой половине!');
                return;
            }
            
            // Используем солнце или мозги в зависимости от стороны
            const resource = gameState.mySide === 'plant' ? gameResources.sun : gameResources.brain;
            if (resource < unitData.cost) { alert('Недостаточно ресурсов!'); return; }
            
            // Размещаем юнит на позиции клика
            const pos = clickPercent + '%';
            placeUnit(laneIndex, unitData, gameState.mySide, pos);
            socket.emit(gameState.mySide==='plant'?'plantPlaced':'zombiePlaced', {lane:laneIndex,unitId:selectedUnit,pos});
            
            // Списываем ресурсы
            if (gameState.mySide === 'plant') {
                gameResources.sun -= unitData.cost;
            } else {
                gameResources.brain -= unitData.cost;
            }
            updateResourceDisplay();
        });
        
        function placeUnit(laneIndex, unitData, side, position = '50%') {
            const lane = document.querySelector(`.game-lane[data-lane="${laneIndex}"]`);
            
            // Растения спавнятся у своего дома (слева = 10%), зомби у своего (справа = 90%)
            // Но при размещении игроком, растения ставят слева, зомби справа
            let spawnPos;
            if (position === '50%') {
                // Размещение игроком - plants на 15%, zombies на 85%
                spawnPos = side === 'plant' ? '15%' : '85%';
            } else {
                spawnPos = position;
            }
            
            const unit = document.createElement('div');
            unit.className = `game-unit ${side}`;
            unit.innerHTML = unitData.icon;
            unit.style.top = '50%';
            unit.style.left = spawnPos;
            unit.style.transform = 'translateY(-50%)';
            lane.appendChild(unit);
            gameState.units.push({element:unit,...unitData,lane:laneIndex,side,health:unitData.health});
        }
        
        function placeOpponentUnit(data) {
            const side = data.side || (gameState.mySide === 'plant' ? 'zombie' : 'plant');
            const unitData = units[side].find(u => u.id === data.unitId);
            // Используем позицию от сервера, или позицию по умолчанию
            // Растения всегда слева (15%), зомби всегда справа (95%)
            const pos = data.pos || (side === 'plant' ? '15%' : '95%');
            placeUnit(data.lane, unitData, side, pos);
        }
        
        function updateGameTimer(s) { const m=Math.floor(s/60),sec=s%60; document.getElementById('gameTimer').textContent = `${m}:${sec.toString().padStart(2,'0')}`; }
        
        function sendChat() {
            const input = document.getElementById('chatInput');
            const msg = input.value.trim();
            if (msg && socket) { socket.emit('sendMessage', {message:msg}); input.value = ''; }
        }
        
        function addChatMessage(data) {
            const div = document.createElement('div');
            div.className = 'chat-message';
            div.innerHTML = `<span class="chat-username">${escapeHtml(data.username)}:</span> ${escapeHtml(data.message)}`;
            document.getElementById('chatMessages').appendChild(div);
            document.getElementById('chatMessages').scrollTop = document.getElementById('chatMessages').scrollHeight;
        }
        
        function cancelQueue() { 
            // Очищаем игровое поле
            if (gameState && gameState.units) {
                gameState.units.forEach(unit => {
                    if (unit.element) unit.element.remove();
                });
            }
            gameState = null;
            selectedUnit = null;
            if (gameLoop) clearInterval(gameLoop);
            gameLoop = null;
            
            // Очищаем визуальные элементы на поле
            document.querySelectorAll('.game-unit').forEach(el => el.remove());
            
            if (socket) socket.emit('leaveQueue'); 
            backToProfile(); 
        }
        function leaveGame() { 
            // Очищаем игровое поле
            if (gameState && gameState.units) {
                gameState.units.forEach(unit => {
                    if (unit.element) unit.element.remove();
                });
            }
            gameState = null;
            selectedUnit = null;
            if (gameLoop) clearInterval(gameLoop);
            gameLoop = null;
            
            // Очищаем визуальные элементы на поле
            document.querySelectorAll('.game-unit').forEach(el => el.remove());
            
            if (socket) socket.emit('leaveQueue'); 
            backToProfile(); 
        }
        
        function endGame(data) {
            showScreen('gameEndScreen');
            const title = document.getElementById('gameResultTitle');
            const rewards = document.getElementById('gameRewards');
            const isBotGame = data.isBotGame === true;
            
            if (data.winner==='draw') { 
                title.textContent='Ничья!'; 
                title.className='game-result draw'; 
                rewards.textContent = isBotGame ? 'Без наград (игра с ботом)' : '+20 монет'; 
            }
            else if (data.winnerSide===gameState.mySide) { 
                title.textContent='Победа!'; 
                title.className='game-result win'; 
                rewards.textContent = isBotGame ? 'Без наград (игра с ботом)' : '+50 монет';
                if (!isBotGame) currentUser.wins++; 
            }
            else { 
                title.textContent='Поражение'; 
                title.className='game-result lose'; 
                rewards.textContent = isBotGame ? 'Без наград (игра с ботом)' : '+10 монет';
                if (!isBotGame) currentUser.losses++; 
            }
            currentUser.coins += isBotGame ? 0 : (data.winnerSide===gameState.mySide ? data.rewards.winner : data.rewards.loser);
            checkSession();
        }
        
        // Обучение
        const tutorialSteps = [
            {
                title: '👋 Добро пожаловать!',
                content: 'Это онлайн игра "Растения против Зомби". Вы будете играть против других игроков в режиме реального времени!'
            },
            {
                title: '🌻 Выберите сторону',
                content: 'В начале игры вы можете быть либо 🌻 Растением (защитник) либо 🧟 Зомби (атакующий). Всё зависит от случайного выбора!'
            },
            {
                title: '💰 Зарабатывайте монеты',
                content: 'Выигрывая матчи, вы получаете монеты. Также их можно получить: выполняя ежедневные награды, активируя промокоды и повышая уровень!'
            },
            {
                title: '🏆 Путь Славы',
                content: 'Набирайте опыт и повышайте уровень! За каждый уровень вы получаете награды: монеты и звания (Новичок, Опытный, Мастер, Легенда и другие).'
            },
            {
                title: '🏪 Магазин',
                content: 'В магазине можно купить растения и зомби. Магазин обновляется каждые 5 минут - следите за новинками!'
            },
            {
                title: '🎮 Удачи!',
                content: 'Теперь вы готовы к игре! Нажмите "Играть" и найдите противника. Удачи в бою!'
            }
        ];
        let tutorialStep = 0;
        
        function startTutorial() {
            tutorialStep = 0;
            showTutorial();
        }
        
        function showTutorial() {
            showScreen('tutorialScreen');
            const step = tutorialSteps[tutorialStep];
            document.getElementById('tutorialContent').innerHTML = `
                <h3 style="color:#4ade80;margin-bottom:15px;text-align:center">${step.title}</h3>
                <p style="font-size:1.1rem;line-height:1.6;margin-bottom:20px">${step.content}</p>
                <div style="text-align:center;color:#94a3b8">Шаг ${tutorialStep + 1} из ${tutorialSteps.length}</div>
            `;
            document.getElementById('tutorialNextBtn').textContent = tutorialStep === tutorialSteps.length - 1 ? 'Начать игру! 🎮' : 'Далее →';
        }
        
        function nextTutorialStep() {
            if (tutorialStep < tutorialSteps.length - 1) {
                tutorialStep++;
                showTutorial();
            } else {
                showProfile();
            }
        }
        
        function skipTutorial() {
            showProfile();
        }
        
        // Достижения
        const achievementsList = [
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
        
        async function showAchievements() {
            showScreen('achievementsScreen');
            try {
                const res = await fetch('/api/check-achievements', {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({sessionId})});
                const data = await res.json();
                const userAchievements = data.userAchievements || [];
                
                document.getElementById('achievementsList').innerHTML = achievementsList.map(ach => {
                    const unlocked = userAchievements.includes(ach.id);
                    return `<div class="match-row" style="opacity:${unlocked ? 1 : 0.5}">
                        <span style="font-size:2rem">${ach.icon}</span>
                        <div style="flex:1;padding:0 15px">
                            <div style="font-weight:bold">${ach.name}</div>
                            <div style="font-size:0.8rem;color:#94a3b8">${ach.desc}</div>
                        </div>
                        <span style="color:#fbbf24">+${ach.reward}💰</span>
                        <span style="color:${unlocked ? '#4ade80' : '#ef4444'}">${unlocked ? '✓' : '🔒'}</span>
                    </div>`;
                }).join('');
            } catch(e) {}
        }
        
        // Квесты
        const questList = [
            { id: 'play_1_game', name: 'Первая игра', desc: 'Сыграйте 1 матч', icon: '🎮', reward: 30 },
            { id: 'play_3_games', name: 'Боец', desc: 'Сыграйте 3 матча', icon: '⚔️', reward: 75 },
            { id: 'win_1_game', name: 'Победа', desc: 'Выиграйте 1 матч', icon: '🏆', reward: 50 },
            { id: 'win_2_games', name: 'На победу', desc: 'Выиграйте 2 матча', icon: '⭐', reward: 100 },
            { id: 'earn_100_coins', name: 'Копилка', desc: 'Заработайте 100 монет', icon: '💰', reward: 25 },
            { id: 'earn_300_coins', name: 'Богач', desc: 'Заработайте 300 монет', icon: '💎', reward: 75 },
            { id: 'use_5_units', name: 'Командир', desc: 'Разместите 5 юнитов', icon: '🌻', reward: 40 },
            { id: 'chat_3_times', name: 'Болтун', desc: 'Напишите 3 сообщения', icon: '💬', reward: 20 }
        ];
        
        let questTimer = null;
        
        async function showQuests() {
            showScreen('questsScreen');
            startQuestTimer();
            try {
                const res = await fetch('/api/daily-quests', {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({sessionId})});
                const data = await res.json();
                
                if (data.success && data.quests) {
                    document.getElementById('questsList').innerHTML = data.quests.map(quest => {
                        const target = quest.target || 1;
                        const progress = quest.progress || 0;
                        const percent = Math.min(100, (progress / target) * 100);
                        return `<div class="match-row" style="flex-direction:column;opacity:${quest.completed ? 1 : 0.8}">
                            <div style="display:flex;align-items:center;gap:10px;margin-bottom:5px">
                                <span style="font-size:1.8rem">${quest.icon || '📋'}</span>
                                <div style="flex:1">
                                    <div style="font-weight:bold">${quest.name}</div>
                                    <div style="font-size:0.75rem;color:#94a3b8">${quest.desc}</div>
                                </div>
                                <span style="color:#fbbf24">+${quest.reward}💰</span>
                            </div>
                            <div style="background:rgba(255,255,255,0.1);border-radius:10px;height:12px;overflow:hidden">
                                <div style="background:linear-gradient(90deg,#4ade80,#22c55e);height:100%;width:${percent}%;transition:width 0.3s"></div>
                            </div>
                            <div style="text-align:right;font-size:0.75rem;color:#94a3b8;margin-top:2px">${progress}/${target}</div>
                        </div>`;
                    }).join('');
                }
            } catch(e) {}
        }
        
        function startQuestTimer() {
            if (questTimer) clearInterval(questTimer);
            questTimer = setInterval(() => {
                const now = new Date();
                const tomorrow = new Date(now);
                tomorrow.setDate(tomorrow.getDate() + 1);
                tomorrow.setHours(0, 0, 0, 0);
                const diff = tomorrow - now;
                const hours = Math.floor(diff / (1000 * 60 * 60));
                const mins = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
                const secs = Math.floor((diff % (1000 * 60)) / 1000);
                document.getElementById('questTimer').textContent = 'Новые квесты через: ' + hours + 'ч ' + mins + 'м ' + secs + 'с';
            }, 1000);
        }
        
        // === ДРУЗЬЯ ===
        async function showFriends() {
            showScreen('friendsScreen');
            document.getElementById('addFriendMessage').textContent = '';
            try {
                const res = await fetch('/api/friends', {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({sessionId})});
                const data = await res.json();
                
                if (data.success && data.friends) {
                    if (data.friends.length === 0) {
                        document.getElementById('friendsList').innerHTML = '<p style="text-align:center;color:#94a3b8">У вас пока нет друзей</p>';
                    } else {
                        document.getElementById('friendsList').innerHTML = data.friends.map(friend =>
                            `<div class="match-row">
                                <div style="display: flex; align-items: center; gap: 10px;">
                                    <div class="user-avatar" style="width: 30px; height: 30px; font-size: 0.9rem; display: flex; align-items: center; justify-content: center;">${escapeHtml(friend.username.charAt(0).toUpperCase())}</div>
                                    <span style="font-weight:bold">${escapeHtml(friend.username)}</span>
                                </div>
                                <span>Уровень ${friend.level || 1}</span>
                                <span>${friend.wins || 0} побед</span>
                            </div>`
                        ).join('');
                    }
                }
            } catch(e) {
                document.getElementById('friendsList').innerHTML = '<p style="text-align:center;color:#ef4444">Ошибка загрузки друзей</p>';
            }
        }
        
        async function addFriend() {
            const username = document.getElementById('addFriendInput').value.trim();
            if (!username) {
                document.getElementById('addFriendMessage').textContent = 'Введите ник друга';
                document.getElementById('addFriendMessage').style.color = '#ef4444';
                return;
            }
            
            try {
                const res = await fetch('/api/friends/add', {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({sessionId, friendUsername: username})});
                const data = await res.json();
                
                document.getElementById('addFriendMessage').textContent = data.message;
                document.getElementById('addFriendMessage').style.color = data.success ? '#4ade80' : '#ef4444';
                
                if (data.success) {
                    document.getElementById('addFriendInput').value = '';
                    showFriends();
                }
            } catch(e) {
                document.getElementById('addFriendMessage').textContent = 'Ошибка';
                document.getElementById('addFriendMessage').style.color = '#ef4444';
            }
        }
        
        // === ИНВЕНТАРЬ ===
        let currentInventoryTab = 'plants';
        
        async function showInventory(tab) {
            showScreen('inventoryScreen');
            currentInventoryTab = tab || 'plants'; // По умолчанию показываем растения
            
            await loadInventory(); // Загружаем актуальный инвентарь с сервера
            updateUnlockedUnits();
            renderInventory();
        }
        
        function renderInventory() {
            const grid = document.getElementById('inventoryGrid');
            const stats = document.getElementById('inventoryStats');
            const list = currentInventoryTab === 'plants' ? units.plant : units.zombie;
            const unlocked = currentInventoryTab === 'plants' ? unlockedPlants : unlockedZombies;
            const inventory = userInventory || {};
            
            // Статистика - только купленные юниты
            const purchasedCount = unlocked.length;
            const totalAvailable = list.length;
            
            stats.innerHTML = `
                <div style="display:flex;justify-content:space-around;flex-wrap:wrap;gap:10px">
                    <div><span style="color:#4ade80;font-weight:bold">${purchasedCount}</span>/${totalAvailable} куплено</div>
                    <div>Уровень: <span style="color:#fbbf24;font-weight:bold">${currentUser?.level || 1}</span></div>
                </div>
            `;
            
            // Отображаем ТОЛЬКО купленные юниты
            grid.innerHTML = unlocked.map(unit => {
                const unitType = unit.type || 'attacker';
                const typeNames = {
                    'attacker': '⚔️ Атака',
                    'producer': '☀️ Солнце',
                    'defender': '🛡️ Защита',
                    'explosive': '💥 Взрыв',
                    'special': '✨ Особый',
                    'hybrid': '🔄 Гибрид',
                    'basic': '🧟 Основной',
                    'fast': '⚡ Быстрый',
                    'tank': '💪 Танк',
                    'leader': '👑 Лидер',
                    'support': '💖 Поддержка'
                };
                
                // Получаем уровень владения из инвентаря
                const ownedLevel = inventory[unit.id]?.level || 1;
                
                // Статистика юнита
                const statsText = [];
                if (unit.health) statsText.push(`❤️ HP: ${unit.health}`);
                if (unit.damage) statsText.push(`⚔️ Урон: ${unit.damage}`);
                if (unit.attackSpeed) statsText.push(`⏱️ Скорость: ${unit.attackSpeed}с`);
                if (unit.sunProduction) statsText.push(`☀️ Производство: ${unit.sunProduction}`);
                if (unit.moveSpeed) statsText.push(`🏃 Скорость: ${unit.moveSpeed}`);
                
                return `
                    <div class="shop-item" style="cursor:pointer" onclick="showUnitInfo('${escapeHtml(unit.id)}', '${escapeHtml(currentInventoryTab)}')">
                        <div class="shop-item-icon">${unit.icon}</div>
                        <div style="font-weight:bold">${escapeHtml(unit.name)}</div>
                        <div style="font-size:0.8rem;color:#94a3b8">${typeNames[unitType] || '⚔️ Атака'}</div>
                        <div style="font-size:0.7rem;color:#4ade80">✅ Куплено (ур. ${ownedLevel})</div>
                        <div style="font-size:0.65rem;color:#94a3b8;margin-top:5px">${statsText.slice(0,3).join(' | ')}</div>
                    </div>
                `;
            }).join('');
        }
        
        function showUnitInfo(unitId, tab) {
            const list = tab === 'plants' ? units.plant : units.zombie;
            const unit = list.find(u => u.id === unitId);
            if (!unit) return;
            
            const isUnlocked = (currentUser?.level || 1) >= unit.level;
            
            const typeNames = {
                'attacker': '⚔️ Атакующий',
                'producer': '☀️ Солнцедобыватель',
                'defender': '🛡️ Защитник',
                'explosive': '💥 Взрывчатка',
                'special': '✨ Особый',
                'hybrid': '🔄 Гибрид',
                'basic': '🧟 Основной',
                'fast': '⚡ Быстрый',
                'tank': '💪 Танк',
                'leader': '👑 Лидер',
                'support': '💖 Поддержка'
            };
            
            // Полная статистика
            let fullStats = '';
            if (unit.health) fullStats += `<div>❤️ <strong>Здоровье:</strong> ${unit.health}</div>`;
            if (unit.damage) fullStats += `<div>⚔️ <strong>Урон:</strong> ${unit.damage}</div>`;
            if (unit.attackSpeed !== undefined) fullStats += `<div>⏱️ <strong>Атака:</strong> ${unit.attackSpeed === 0 ? 'Мгновенно' : unit.attackSpeed + ' сек'}</div>`;
            if (unit.sunProduction) fullStats += `<div>☀️ <strong>Производство:</strong> ${unit.sunProduction}/10 сек</div>`;
            if (unit.moveSpeed) fullStats += `<div>🏃 <strong>Скорость:</strong> ${unit.moveSpeed}</div>`;
            if (unit.slow) fullStats += `<div>❄️ <strong>Замедление:</strong> ${Math.round((1-unit.slow)*100)}%</div>`;
            if (unit.freeze) fullStats += `<div>🧊 <strong>Заморозка:</strong> ${unit.freeze} сек</div>`;
            if (unit.heal) fullStats += `<div>💖 <strong>Лечение:</strong> ${unit.heal}</div>`;
            if (unit.ability) fullStats += `<div>🎯 <strong>Способность:</strong> ${unit.ability}</div>`;
            
            // Доступные скины
            let skinsHtml = '';
            if (unit.skins && unit.skins.length > 1) {
                skinsHtml = `<div style="margin-top:15px"><strong>🎨 Скины:</strong><div style="display:flex;gap:8px;margin-top:5px;flex-wrap:wrap">`;
                skinsHtml += unit.skins.map((skin, i) => 
                    `<div style="font-size:1.5rem;padding:5px;background:rgba(255,255,255,0.1);border-radius:5px;cursor:pointer;${i===0?'border:2px solid #4ade80':''}" onclick="selectSkin('${unit.id}', '${skin}', ${i})">${skin}</div>`
                ).join('');
                skinsHtml += `</div></div>`;
            }
            
            alert(`${unit.icon} <strong>${unit.name}</strong>

📝 ${unit.desc}

🏷️ <strong>Тип:</strong> ${typeNames[unit.type] || 'Обычный'}
📊 <strong>Уровень:</strong> ${unit.level}
💰 <strong>Цена:</strong> ${unit.cost}

${fullStats}

${isUnlocked ? '✅ Доступно для игры!' : '🔒 Требуется уровень ' + unit.level}${skinsHtml}`);
        }
        
        function selectSkin(unitId, skin, index) {
            // Здесь можно сохранить выбор скина
            alert(`Скин ${skin} выбран! (Скоро будет доступно)`);
        }
        
        // === СЕЗОНЫ ===
        async function showSeasonInfo() {
            showScreen('seasonScreen');
            try {
                const res = await fetch('/api/seasons');
                const data = await res.json();
                
                if (data.success) {
                    const seasons = data.seasons || [];
                    const userSeasonElo = currentUser?.seasonElo || 1000;
                    const userSeason = currentUser?.currentSeason || 1;
                    
                    // Ранги
                    const ranks = [
                        { name: 'Бронза', min: 0, icon: '🥉', color: '#cd7f32' },
                        { name: 'Серебро', min: 1200, icon: '🥈', color: '#c0c0c0' },
                        { name: 'Золото', min: 1400, icon: '🥇', color: '#ffd700' },
                        { name: 'Платина', min: 1600, icon: '💎', color: '#e5e4e2' },
                        { name: 'Алмаз', min: 1800, icon: '🔮', color: '#b9f2ff' }
                    ];
                    
                    const currentRank = ranks.find(r => userSeasonElo >= r.min) || ranks[0];
                    
                    let html = `
                        <div style="text-align:center;margin-bottom:20px">
                            <div style="font-size:3rem">${currentRank.icon}</div>
                            <div style="font-size:1.5rem;font-weight:bold;color:${currentRank.color}">${currentRank.name}</div>
                            <div style="font-size:2rem;color:#60a5fa">${userSeasonElo} ELO</div>
                            <div style="color:#94a3b8">Сезон ${userSeason}</div>
                        </div>
                        <h3 style="margin-bottom:15px;text-align:center">🏆 Награды сезона</h3>
                    `;
                    
                    seasons.forEach(season => {
                        const rewards = season.rewards || {};
                        html += `
                            <div class="match-row" style="flex-direction:column;margin-bottom:15px">
                                <div style="font-weight:bold;font-size:1.2rem;margin-bottom:10px">${season.name}</div>
                                <div style="display:grid;grid-template-columns:repeat(2,1fr);gap:10px;font-size:0.85rem">
                                    <div>🥇 Top-1: <span style="color:#fbbf24">${rewards.top1 || 0}💰</span></div>
                                    <div>🥈 Top-3: <span style="color:#fbbf24">${rewards.top3 || 0}💰</span></div>
                                    <div>🏅 Top-10: <span style="color:#fbbf24">${rewards.top10 || 0}💰</span></div>
                                    <div>🎯 Top-50: <span style="color:#fbbf24">${rewards.top50 || 0}💰</span></div>
                                </div>
                            </div>
                        `;
                    });
                    
                    document.getElementById('seasonInfo').innerHTML = html;
                }
            } catch(e) {
                document.getElementById('seasonInfo').innerHTML = '<p style="text-align:center;color:#ef4444">Ошибка загрузки сезонов</p>';
            }
        }
        
        // === ELO РЕЙТИНГ ===
        async function showELORating() {
            showScreen('eloScreen');
            try {
                const res = await fetch('/api/elo', {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({sessionId})});
                const data = await res.json();
                
                if (data.success) {
                    const elo = data.elo || 1000;
                    const rank = data.rank || 'Новичок';
                    const rankInfo = data.rankInfo || {};
                    
                    // Ранги
                    const ranks = [
                        { name: 'Новичок', min: 0, max: 999, icon: '🌱', color: '#86efac' },
                        { name: 'Бронза', min: 1000, max: 1199, icon: '🥉', color: '#cd7f32' },
                        { name: 'Серебро', min: 1200, max: 1399, icon: '🥈', color: '#c0c0c0' },
                        { name: 'Золото', min: 1400, max: 1599, icon: '🥇', color: '#ffd700' },
                        { name: 'Платина', min: 1600, max: 1799, icon: '💎', color: '#e5e4e2' },
                        { name: 'Алмаз', min: 1800, max: 9999, icon: '🔮', color: '#b9f2ff' }
                    ];
                    
                    const currentRank = ranks.find(r => elo >= r.min && elo <= r.max) || ranks[0];
                    const nextRank = ranks.find(r => r.min > elo);
                    
                    // Прогресс до следующего ранга
                    let progressPercent = 0;
                    if (nextRank) {
                        progressPercent = ((elo - currentRank.min) / (nextRank.min - currentRank.min)) * 100;
                    } else {
                        progressPercent = 100;
                    }
                    
                    let html = `
                        <div style="text-align:center;margin-bottom:25px">
                            <div style="font-size:4rem">${currentRank.icon}</div>
                            <div style="font-size:1.8rem;font-weight:bold;color:${currentRank.color}">${currentRank.name}</div>
                            <div style="font-size:2.5rem;color:#a78bfa;margin:15px 0">${elo} ELO</div>
                    `;
                    
                    if (nextRank) {
                        html += `
                            <div style="margin-top:15px">
                                <div style="background:rgba(255,255,255,0.1);border-radius:10px;height:20px;overflow:hidden;margin-bottom:10px">
                                    <div style="background:linear-gradient(90deg,${currentRank.color},${nextRank.color});height:100%;width:${progressPercent}%;transition:width 0.3s"></div>
                                </div>
                                <div style="color:#94a3b8;font-size:0.9rem">До ${nextRank.name}: ${nextRank.min - elo} ELO</div>
                            </div>
                        `;
                    } else {
                        html += `<div style="color:#fbbf24;margin-top:15px">🏆 Максимальный ранг!</div>`;
                    }
                    
                    html += `</div>`;
                    
                    // Таблица лидеров ELO
                    html += `<h3 style="margin-bottom:15px;text-align:center">🌟 Топ игроки</h3>`;
                    
                    // Загружаем лидерборд ELO
                    const lbRes = await fetch('/api/leaderboard-elo');
                    const lbData = await lbRes.json();
                    
                    if (lbData.success && lbData.leaders) {
                        const sorted = [...lbData.leaders].sort((a,b) => (b.elo || 1000) - (a.elo || 1000));
                        html += sorted.slice(0, 10).map((p, i) => {
                            const pRank = ranks.find(r => (p.elo || 1000) >= r.min && (p.elo || 1000) <= r.max) || ranks[0];
                            return `
                                <div class="match-row ${i<3?'top-3':''}" style="cursor:pointer" onclick="viewPlayerProfile('${escapeHtml(p.username)}')">
                                    <span class="rank ${i===0?'gold':i===1?'silver':i===2?'bronze':''}">${i+1}</span>
                                    <span class="username">${escapeHtml(p.username)}</span>
                                    <span style="color:${pRank.color}">${pRank.icon} ${p.elo || 1000}</span>
                                </div>
                            `;
                        }).join('');
                    }
                    
                    document.getElementById('eloInfo').innerHTML = html;
                } else {
                    document.getElementById('eloInfo').innerHTML = '<p style="text-align:center;color:#ef4444">Ошибка загрузки ELO</p>';
                }
            } catch(e) {
                document.getElementById('eloInfo').innerHTML = '<p style="text-align:center;color:#ef4444">Ошибка загрузки ELO</p>';
            }
        }
        
        // Мобильная поддержка - добавляем touch event listeners
        document.addEventListener('DOMContentLoaded', function() {
            // Отключаем стандартные события для ускорения отклика
            document.addEventListener('touchstart', function(e) {
                // Не отменяем событие, только предотвращаем задержку
            }, { passive: true });
            
            // Предотвращаем двойной зум на кнопках
            document.querySelectorAll('.btn, button').forEach(function(el) {
                el.addEventListener('touchstart', function(e) {
                    // Предотвращаем увеличение при двойном тапе
                    if (e.touches.length > 1) {
                        e.preventDefault();
                    }
                }, { passive: false });
            });
            
            // Отладочный лог
            console.log('Мобильная поддержка загружена');
        });
        
        // Функция для безопасного вызова функций по клику
        function safeCall(func) {
            if (typeof func === 'function') {
                try {
                    func();
                } catch(e) {
                    console.error('Ошибка вызова функции:', e);
                }
            }
        }
        // === УВЕДОМЛЕНИЯ / НАГРАДЫ (ПОПАП) ===
        let notificationPollInterval = null;
        let notificationQueue = [];
        let rewardModalOpen = false;

        function ensureNotificationPolling() {
            if (notificationPollInterval) return;
            notificationPollInterval = setInterval(() => pollNotifications(), 4000);
        }

        async function pollNotifications() {
            if (!sessionId) return;
            try {
                const res = await fetch('/api/notifications/poll', {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({sessionId})});
                const data = await res.json();
                if (data.success && Array.isArray(data.notifications) && data.notifications.length) {
                    notificationQueue.push(...data.notifications);
                    showNextRewardModal();
                }
            } catch(e) {}
        }

        function showNextRewardModal() {
            if (rewardModalOpen) return;
            const next = notificationQueue.shift();
            if (!next) return;
            showRewardModal(next);
        }

        function showRewardModal(n) {
            const overlay = document.getElementById('rewardModalOverlay');
            const box = document.getElementById('rewardModalBox');
            const title = document.getElementById('rewardModalTitle');
            const subtitle = document.getElementById('rewardModalSubtitle');
            const img = document.getElementById('rewardModalImage');
            if (!overlay || !box || !title || !subtitle || !img) return;

            rewardModalOpen = true;
            box.style.borderColor = n.rarityColor || '#fbbf24';
            title.textContent = n.title || 'Награда!';
            subtitle.textContent = n.subtitle || '';
            img.textContent = n.image || '🎁';
            overlay.style.display = 'flex';
        }

        function closeRewardModal() {
            const overlay = document.getElementById('rewardModalOverlay');
            if (overlay) overlay.style.display = 'none';
            rewardModalOpen = false;
            // Обновляем профиль визуально (монеты/кристаллы/и т.п. могли измениться)
            checkSession();
            setTimeout(() => showNextRewardModal(), 150);
        }

        // === РЕДАКТИРОВАНИЕ ПРОФИЛЯ ===
        let currentEditAvatar = null;
        let currentEditAvatarColor = null;
        let currentFavoritePlant = null;

        async function openEditProfileModal() {
            if (!sessionId) {
                alert('Сначала войдите в аккаунт!');
                return;
            }
            if (!currentUser) {
                alert('Сессия недействительна. Войдите заново.');
                return;
            }
            // Загружаем актуальный инвентарь
            await loadInventory();
            
            // Заполняем форму текущими данными
            document.getElementById('editDisplayName').value = currentUser.displayName || currentUser.username;
            document.getElementById('editAvatar').value = currentUser.avatar || '';
            document.getElementById('editAvatarColor').value = currentUser.avatarColor || '';
            document.getElementById('editDescription').value = currentUser.description || '';
            
            // Заполняем настройки
            const settings = currentUser.settings || {};
            document.getElementById('editNotifications').checked = settings.notifications !== false; // по умолчанию true
            document.getElementById('editSound').checked = settings.sound !== false; // по умолчанию true
            document.getElementById('editMusic').checked = settings.music !== false; // по умолчанию true
            
            currentEditAvatar = currentUser.avatar || null;
            currentEditAvatarColor = currentUser.avatarColor || null;
            currentFavoritePlant = currentUser.favoritePlant || null;
            
            // Сбрасываем выделение аватаров
            document.querySelectorAll('.avatar-option').forEach(btn => btn.style.border = '2px solid transparent');
            if (currentEditAvatar) {
                const avatarBtn = document.querySelector(`.avatar-option[data-avatar="${currentEditAvatar}"]`);
                if (avatarBtn) avatarBtn.style.border = '2px solid #4ade80';
            }
            
            // Сбрасываем выделение цветов
            document.querySelectorAll('.color-option').forEach(btn => btn.style.border = '2px solid transparent');
            if (currentEditAvatarColor) {
                const colorBtn = document.querySelector(`.color-option[data-color="${currentEditAvatarColor}"]`);
                if (colorBtn) colorBtn.style.border = '2px solid #4ade80';
            }
            
            // Загружаем и отображаем растения для выбора любимого
            loadFavoritePlantOptions();
            
            document.getElementById('editProfileModal').style.display = 'flex';
        }

        function closeEditProfileModal() {
            document.getElementById('editProfileModal').style.display = 'none';
        }

        function selectAvatar(avatar) {
            currentEditAvatar = avatar;
            document.getElementById('editAvatar').value = avatar;
            // Обновляем выделение
            document.querySelectorAll('.avatar-option').forEach(btn => {
                btn.style.border = btn.dataset.avatar === avatar ? '2px solid #4ade80' : '2px solid transparent';
            });
        }

        function selectAvatarColor(color) {
            currentEditAvatarColor = color;
            document.getElementById('editAvatarColor').value = color;
            // Обновляем выделение
            document.querySelectorAll('.color-option').forEach(btn => {
                btn.style.border = btn.dataset.color === color ? '2px solid #4ade80' : '2px solid transparent';
            });
        }
        
        function loadFavoritePlantOptions() {
            // Очищаем предыдущие варианты
            const selector = document.getElementById('favoritePlantSelector');
            selector.innerHTML = '';
            
            // Получаем инвентарь пользователя
            const inventory = userInventory || {};
            
            // Если нет инвентаря, показываем сообщение
            if (Object.keys(inventory).length === 0) {
                selector.innerHTML = '<div style="color: #94a3b8; font-style: italic; padding: 10px; text-align: center;">У вас пока нет растений в инвентаре</div>';
                document.getElementById('selectedFavoritePlantDisplay').textContent = '';
                document.getElementById('selectedFavoritePlantName').textContent = 'Нет растений';
                return;
            }
            
            // Создаем Set ID всех растений для быстрой проверки
            const plantIds = new Set(units.plant.map(p => p.id));
            
            // Создаем кнопки для каждого растения в инвентаре
            for (const plantId in inventory) {
                const plantInfo = inventory[plantId];
                
                // Пропускаем, если это не растение (а зомби) - проверяем по списку ID растений
                if (!plantIds.has(plantId)) continue;
                
                // Получаем отображаемое имя растения
                const plantNames = {
                    'sunflower': '🌻 Подсолнух',
                    'peashooter': '🌱 Стрелок',
                    'wallnut': '堅 停车桩', // Орех
                    'cherrybomb': '🍒 Вишня',
                    'iceshroom': '🍄 Ледяной гриб',
                    'snowpea': '❄️ Ледяной стрелок',
                    'chomper': '🐊 Чомпер',
                    'repeater': '🔄 Дубль-стрелок',
                    'squash': '🎃 Тыква',
                    'twinsunflower': '☀️ Двойной подсолнух',
                    'melonpult': '🍉 Арбузомёт',
                    'cattail': '🌾 Кошачий хвост',
                    'moonglow': '🌙 Лунарик',
                    'tallnut': '🌴 Великан',
                    'puffshroom': '🍄 Дымовичок',
                    'scaredyshroom': '😱 Трусишка',
                    'hypnoshroom': '🌀 Гипноз',
                    'magnetshroom': '🧲 Магнетик',
                    'potatomine': '🥔 Картофельная мина'
                };
                
                const displayName = plantNames[plantId] || plantId;
                
                const button = document.createElement('button');
                button.type = 'button';
                button.className = 'avatar-option';
                button.dataset.plant = plantId;
                button.onclick = () => selectFavoritePlant(plantId);
                button.style.width = '40px';
                button.style.height = '40px';
                button.style.fontSize = '1.5rem';
                button.style.background = 'rgba(255, 255, 255, 0.1)';
                button.style.border = '2px solid transparent';
                button.style.borderRadius = '8px';
                button.style.cursor = 'pointer';
                
                // Устанавливаем эмодзи в зависимости от ID растения
                const plantEmojis = {
                    'sunflower': '🌻',
                    'peashooter': '🌱',
                    'wallnut': '🥜',
                    'cherrybomb': '🍒',
                    'iceshroom': '🧊',
                    'snowpea': '❄️',
                    'chomper': '👄',
                    'repeater': '🔫',
                    'squash': '🎃',
                    'twinsunflower': '🌞',
                    'melonpult': '🍉',
                    'cattail': '🐱',
                    'moonglow': '🌙',
                    'tallnut': '🌴',
                    'puffshroom': '🍄',
                    'scaredyshroom': '😱',
                    'hypnoshroom': '🌀',
                    'magnetshroom': '🧲',
                    'potatomine': '🥔'
                };
                
                button.textContent = plantEmojis[plantId] || '🌱';
                button.title = displayName;
                
                selector.appendChild(button);
            }
            
            // Выделяем текущее любимое растение
            if (currentFavoritePlant) {
                selectFavoritePlant(currentFavoritePlant);
            } else {
                document.getElementById('selectedFavoritePlantDisplay').textContent = '';
                document.getElementById('selectedFavoritePlantName').textContent = 'Не выбрано';
            }
        }
        
        function selectFavoritePlant(plantId) {
            currentFavoritePlant = plantId;
            
            // Обновляем выделение кнопок
            document.querySelectorAll('#favoritePlantSelector .avatar-option').forEach(btn => {
                btn.style.border = btn.dataset.plant === plantId ? '2px solid #4ade80' : '2px solid transparent';
            });
            
            // Обновляем отображение выбранного растения
            const plantNames = {
                'sunflower': '🌻 Подсолнух',
                'peashooter': '🌱 Стрелок',
                'wallnut': '堅 停车桩',
                'cherrybomb': '🍒 Вишня',
                'iceshroom': '🍄 Ледяной гриб',
                'snowpea': '❄️ Ледяной стрелок',
                'chomper': '🐊 Чомпер',
                'repeater': '🔄 Дубль-стрелок',
                'squash': '🎃 Тыква',
                'twinsunflower': '☀️ Двойной подсолнух',
                'melonpult': '🍉 Арбузомёт',
                'cattail': '🌾 Кошачий хвост',
                'moonglow': '🌙 Лунарик',
                'tallnut': '🌴 Великан',
                'puffshroom': '🍄 Дымовичок',
                'scaredyshroom': '😱 Трусишка',
                'hypnoshroom': '🌀 Гипноз',
                'magnetshroom': '🧲 Магнетик',
                'potatomine': '🥔 Картошка-мина'
            };
            
            const plantEmojis = {
                'sunflower': '🌻',
                'peashooter': '🌱',
                'wallnut': '🥜',
                'cherrybomb': '🍒',
                'iceshroom': '🧊',
                'snowpea': '❄️',
                'chomper': '👄',
                'repeater': '🔫',
                'squash': '🎃',
                'twinsunflower': '☀️',
                'melonpult': '🍉',
                'cattail': '🐱',
                'moonglow': '🌙',
                'tallnut': '🌴',
                'puffshroom': '🍄',
                'scaredyshroom': '😱',
                'hypnoshroom': '🌀',
                'magnetshroom': '🧲',
                'potatomine': '🥔'
            };
            
            document.getElementById('selectedFavoritePlantDisplay').textContent = plantEmojis[plantId] || '🌱';
            document.getElementById('selectedFavoritePlantName').textContent = plantNames[plantId] || plantId;
        }
        
        function clearFavoritePlant() {
            currentFavoritePlant = null;
            document.getElementById('selectedFavoritePlantDisplay').textContent = '';
            document.getElementById('selectedFavoritePlantName').textContent = 'Не выбрано';
            // Снимаем выделение со всех кнопок
            document.querySelectorAll('#favoritePlantSelector .avatar-option').forEach(btn => {
                btn.style.border = '2px solid transparent';
            });
        }
        
        async function saveProfile() {
            const displayName = document.getElementById('editDisplayName').value.trim();
            const avatar = currentEditAvatar;
            const avatarColor = currentEditAvatarColor;
            const description = document.getElementById('editDescription').value.trim();
            const favoritePlant = currentFavoritePlant;
            const notifications = document.getElementById('editNotifications').checked;
            const sound = document.getElementById('editSound').checked;
            const music = document.getElementById('editMusic').checked;
            
            try {
                const res = await fetch('/api/profile/update', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        sessionId,
                        displayName,
                        avatar,
                        avatarColor,
                        description,
                        favoritePlant,
                        settings: {
                            notifications,
                            sound,
                            music
                        }
                    })
                });
                const data = await res.json();
                
                if (data.success) {
                    // Обновляем currentUser (возвращается полный объект пользователя)
                    currentUser = data.user;
                    // Сохраняем в localStorage
                    localStorage.setItem('pvz_user', JSON.stringify(currentUser));
                    // Обновляем интерфейс
                    showProfile();
                    closeEditProfileModal();
                    alert('Профиль успешно обновлен!');
                } else {
                    alert('Ошибка: ' + data.message);
                }
            } catch (e) {
                console.error(e);
                alert('Ошибка сохранения профиля');
            }
        }

