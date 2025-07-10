const WebSocket = require('ws');
const http = require('http');
const fs = require('fs');
const path = require('path');

const server = http.createServer();
const wss = new WebSocket.Server({ server });

// Путь к файлу с пользователями
const USERS_FILE = path.join(__dirname, 'users.json');
const GAME_RESULTS_FILE = path.join(__dirname, 'gameResults.json');

// Хранилище активных игр и пользователей
const games = new Map();
const battleGames = new Map(); // Новое хранилище для боевых игр
const players = new Map();
const activeUsers = new Map(); // userId -> userData
const userConnections = new Map(); // username -> userId (для предотвращения дублирования)

// Загружаем пользователей из файла
function loadUsers() {
  try {
    if (fs.existsSync(USERS_FILE)) {
      const data = fs.readFileSync(USERS_FILE, 'utf8');
      return JSON.parse(data);
    }
  } catch (error) {
    console.error('Ошибка загрузки пользователей:', error);
  }
  return {};
}

// Сохраняем пользователей в файл
function saveUsers(users) {
  try {
    fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));
  } catch (error) {
    console.error('Ошибка сохранения пользователей:', error);
  }
}

// Загружаем результаты игр из файла
function loadGameResults() {
  try {
    if (fs.existsSync(GAME_RESULTS_FILE)) {
      const data = fs.readFileSync(GAME_RESULTS_FILE, 'utf8');
      return JSON.parse(data);
    }
  } catch (error) {
    console.error('Ошибка загрузки результатов игр:', error);
  }
  return { results: [], statistics: { totalGames: 0, averageGameTime: 0, fastestGame: null, mostActivePlayer: null, gamesByMode: { classic: 0, battle: 0 } } };
}

// Сохраняем результаты игр в файл
function saveGameResults(results) {
  try {
    fs.writeFileSync(GAME_RESULTS_FILE, JSON.stringify(results, null, 2));
  } catch (error) {
    console.error('Ошибка сохранения результатов игр:', error);
  }
}



// Сохраняем результат игры
function saveGameResult(result) {
  const gameResults = loadGameResults();
  
  // Добавляем результат
  gameResults.results.push(result);
  
  // Обновляем статистику
  gameResults.statistics.totalGames += 1;
  gameResults.statistics.gamesByMode[result.gameMode] += 1;
  
  // Обновляем среднее время
  const totalTime = gameResults.results.reduce((sum, r) => sum + r.gameTime, 0);
  gameResults.statistics.averageGameTime = Math.round(totalTime / gameResults.results.length);
  
  // Обновляем самое быстрое время
  if (!gameResults.statistics.fastestGame || result.gameTime < gameResults.statistics.fastestGame.gameTime) {
    gameResults.statistics.fastestGame = {
      username: result.username,
      gameTime: result.gameTime,
      date: result.date
    };
  }
  
  // Обновляем самого активного игрока
  const playerStats = {};
  gameResults.results.forEach(r => {
    playerStats[r.username] = (playerStats[r.username] || 0) + 1;
  });
  
  const mostActive = Object.entries(playerStats).reduce((max, [player, games]) => 
    games > max.games ? { player, games } : max, { player: null, games: 0 }
  );
  
  if (mostActive.player) {
    gameResults.statistics.mostActivePlayer = {
      username: mostActive.player,
      gamesPlayed: mostActive.games
    };
  }
  
  saveGameResults(gameResults);
}

// Получаем топ игроков
function getTopPlayers(results, limit = 10) {
  const playerStats = {};
  
  results.forEach(result => {
    if (!playerStats[result.username]) {
      playerStats[result.username] = {
        username: result.username,
        gamesPlayed: 0,
        totalTime: 0,
        bestTime: Infinity,
        averageTime: 0
      };
    }
    
    playerStats[result.username].gamesPlayed += 1;
    playerStats[result.username].totalTime += result.gameTime;
    if (result.gameTime < playerStats[result.username].bestTime) {
      playerStats[result.username].bestTime = result.gameTime;
    }
  });
  
  // Вычисляем среднее время
  Object.values(playerStats).forEach(player => {
    player.averageTime = Math.round(player.totalTime / player.gamesPlayed);
  });
  
  // Сортируем по количеству игр и возвращаем топ
  return Object.values(playerStats)
    .sort((a, b) => b.gamesPlayed - a.gamesPlayed)
    .slice(0, limit);
}

// Регистрация пользователя
function registerUser(username, password) {
  const users = loadUsers();
  
  if (users[username]) {
    return { success: false, message: 'Пользователь уже существует' };
  }
  
  users[username] = {
    password: password, // В реальном проекте нужно хешировать
    createdAt: new Date().toISOString(),
    gamesPlayed: 0,
    bestTime: null
  };
  
  saveUsers(users);
  return { success: true, message: 'Регистрация успешна' };
}

// Авторизация пользователя
function loginUser(username, password) {
  const users = loadUsers();
  
  if (!users[username]) {
    return { success: false, message: 'Пользователь не найден' };
  }
  
  if (users[username].password !== password) {
    return { success: false, message: 'Неверный пароль' };
  }
  
  return { 
    success: true, 
    message: 'Вход выполнен успешно',
    userData: {
      username,
      gamesPlayed: users[username].gamesPlayed,
      bestTime: users[username].bestTime
    }
  };
}

// Обновляем статистику пользователя
function updateUserStats(username, gameTime) {
  const users = loadUsers();
  
  if (users[username]) {
    users[username].gamesPlayed += 1;
    
    if (!users[username].bestTime || gameTime < users[username].bestTime) {
      users[username].bestTime = gameTime;
    }
    
    saveUsers(users);
  }
}

// Создаем HTTP сервер для авторизации
server.on('request', (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }
  
  if (req.method === 'POST') {
    let body = '';
    req.on('data', chunk => {
      body += chunk.toString();
    });
    
    req.on('end', () => {
      try {
        const data = JSON.parse(body);
        
        if (req.url === '/api/register') {
          const result = registerUser(data.username, data.password);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify(result));
        } else if (req.url === '/api/login') {
          const result = loginUser(data.username, data.password);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify(result));
        } else if (req.url === '/api/admin/stats') {
          // API для получения статистики (для админ панели)
          const gameResults = loadGameResults();
          const users = loadUsers();
          
          const adminStats = {
            gameStatistics: gameResults.statistics,
            userStatistics: {
              totalUsers: Object.keys(users).length,
              activeUsers: activeUsers.size,
              onlineUsers: userConnections.size
            },
            recentGames: gameResults.results.slice(-10).reverse(), // Последние 10 игр
            topPlayers: getTopPlayers(gameResults.results, 10)
          };
          
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify(adminStats));
        } else if (req.url === '/api/admin/games') {
          // API для получения всех игр с фильтрацией
          const gameResults = loadGameResults();
          const { page = 1, limit = 20, username, gameMode, dateFrom, dateTo } = data;
          
          let filteredResults = gameResults.results;
          
          if (username) {
            filteredResults = filteredResults.filter(r => r.username.toLowerCase().includes(username.toLowerCase()));
          }
          
          if (gameMode) {
            filteredResults = filteredResults.filter(r => r.gameMode === gameMode);
          }
          
          if (dateFrom) {
            filteredResults = filteredResults.filter(r => new Date(r.date) >= new Date(dateFrom));
          }
          
          if (dateTo) {
            filteredResults = filteredResults.filter(r => new Date(r.date) <= new Date(dateTo));
          }
          
          const startIndex = (page - 1) * limit;
          const endIndex = startIndex + parseInt(limit);
          const paginatedResults = filteredResults.slice(startIndex, endIndex);
          
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            results: paginatedResults,
            total: filteredResults.length,
            page: parseInt(page),
            limit: parseInt(limit),
            totalPages: Math.ceil(filteredResults.length / limit)
          }));
        } else if (req.url === '/api/admin/users') {
          // API для получения информации о пользователях
          const users = loadUsers();
          const gameResults = loadGameResults();
          
          const usersWithStats = Object.entries(users).map(([username, userData]) => {
            const userGames = gameResults.results.filter(r => r.username === username);
            const totalGames = userGames.length;
            const averageTime = totalGames > 0 ? Math.round(userGames.reduce((sum, g) => sum + g.gameTime, 0) / totalGames) : 0;
            const bestTime = userGames.length > 0 ? Math.min(...userGames.map(g => g.gameTime)) : null;
            
            return {
              username,
              createdAt: userData.createdAt,
              gamesPlayed: userData.gamesPlayed,
              bestTime: userData.bestTime,
              totalGames,
              averageTime,
              bestTimeFromResults: bestTime,
              lastGame: userGames.length > 0 ? userGames[userGames.length - 1].date : null
            };
          });
          
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify(usersWithStats));
        } else {
          res.writeHead(404);
          res.end('Not Found');
        }
      } catch (error) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, message: 'Неверный формат данных' }));
      }
    });
  } else {
    res.writeHead(404);
    res.end('Not Found');
  }
});

wss.on('connection', (ws) => {
  console.log('Новое подключение');
  
  let currentUser = null;
  let currentGame = null;
  let currentBattleGame = null; // Новое поле для боевых игр
  
  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message);
      
      switch (data.type) {
        case 'join_game':
          handleJoinGame(ws, data.username, data.userId, data.currentBoard, data.currentPuzzle);
          break;
          
        case 'join_battle':
          handleJoinBattle(ws, data.username, data.userId, data.currentBoard);
          break;
          
        case 'cell_update':
          handleCellUpdate(currentGame, currentUser, data.row, data.col, data.value);
          break;
          
        case 'battle_cell_update':
          handleBattleCellUpdate(currentBattleGame, currentUser, data.row, data.col, data.value, data.rowCompleted, data.squareCompleted);
          break;
          
        case 'use_bomb':
          handleUseBomb(currentBattleGame, currentUser, data.bombType, data.targetRow, data.cellsToRemove);
          break;
          
        case 'battle_board_sync':
          handleBattleBoardSync(currentBattleGame, currentUser, data.board);
          break;
          
        case 'game_completed':
          handleGameCompleted(currentUser, data.gameTime, data.gameMode || 'classic', {
            difficulty: data.difficulty,
            hintsUsed: data.hintsUsed,
            mistakes: data.mistakes,
            multiplayer: data.multiplayer,
            playersInGame: data.playersInGame,
            gameId: currentGame
          });
          break;
          
        case 'leave_game':
          handlePlayerDisconnect(currentGame, currentUser);
          break;
          
        case 'leave_battle':
          handleBattlePlayerDisconnect(currentBattleGame, currentUser);
          break;
          
        case 'new_game':
          handleNewGame(currentGame, data.board, data.puzzle);
          break;
        case 'battle_victory':
          handleBattleVictory(currentBattleGame, currentUser, data.gameTime, data);
          break;
      }
    } catch (error) {
      console.error('Ошибка обработки сообщения:', error);
    }
  });
  
  ws.on('close', () => {
    console.log('Игрок отключился:', currentUser);
    if (currentGame && currentUser) {
      handlePlayerDisconnect(currentGame, currentUser);
    }
    if (currentBattleGame && currentUser) {
      handleBattlePlayerDisconnect(currentBattleGame, currentUser);
    }
  });
  
  function handleJoinGame(ws, username, userId, currentBoard, currentPuzzle) {
    // Проверяем, не подключен ли уже этот пользователь
    if (userConnections.has(username)) {
      const existingUserId = userConnections.get(username);
      const existingGame = players.get(existingUserId);
      
      if (existingGame) {
        // Отключаем предыдущее подключение
        const game = games.get(existingGame);
        if (game && game.players.has(existingUserId)) {
          const player = game.players.get(existingUserId);
          if (player.ws && player.ws.readyState === WebSocket.OPEN) {
            player.ws.close();
          }
        }
      }
    }
    
    currentUser = { username, userId };
    userConnections.set(username, userId);
    
    // Ищем активную игру или создаем новую
    let gameId = null;
    for (const [id, game] of games) {
      if (game.players.size < 4) { // Максимум 4 игрока
        gameId = id;
        break;
      }
    }
    
    if (!gameId) {
      gameId = generateGameId();
      games.set(gameId, {
        id: gameId,
        players: new Map(),
        startTime: Date.now(),
        board: currentBoard || generateSudokuBoard(),
        puzzle: currentPuzzle || generateSudokuBoard(),
        solution: generateSudokuSolution()
      });
    }
    
    currentGame = gameId;
    const game = games.get(gameId);
    
    // Если игрок передал свое судоку, используем его
    if (currentBoard && currentPuzzle) {
      game.board = currentBoard;
      game.puzzle = currentPuzzle;
    }
    
    game.players.set(userId, {
      id: userId,
      username: username,
      ws: ws,
      joinTime: Date.now(),
      completedCells: 0
    });
    
    players.set(userId, gameId);
    activeUsers.set(userId, currentUser);
    
    // Отправляем игроку информацию об игре
    ws.send(JSON.stringify({
      type: 'game_join',
      gameId: gameId,
      playerId: userId,
      board: game.board,
      puzzle: game.puzzle,
      solution: game.solution, // Отправляем решение для правильной подсветки
      players: Array.from(game.players.values()).map(p => ({
        id: p.id,
        username: p.username,
        joinTime: p.joinTime,
        completedCells: p.completedCells
      }))
    }));
    
    // Уведомляем всех игроков о новом участнике
    broadcastToGame(gameId, {
      type: 'player_joined',
      player: {
        id: userId,
        username: username,
        joinTime: Date.now(),
        completedCells: 0
      }
    });
  }

  // Новая функция для боевого режима
  function handleJoinBattle(ws, username, userId, currentBoard) {
    // Проверяем, не подключен ли уже этот пользователь
    if (userConnections.has(username)) {
      const existingUserId = userConnections.get(username);
      const existingBattleGame = players.get(existingUserId);
      
      if (existingBattleGame && battleGames.has(existingBattleGame)) {
        // Отключаем предыдущее подключение
        const battleGame = battleGames.get(existingBattleGame);
        if (battleGame && battleGame.players.has(existingUserId)) {
          const player = battleGame.players.get(existingUserId);
          if (player.ws && player.ws.readyState === WebSocket.OPEN) {
            player.ws.close();
          }
        }
      }
    }
    
    currentUser = { username, userId };
    userConnections.set(username, userId);
    
    // Ищем активную боевую игру или создаем новую
    let battleGameId = null;
    for (const [id, battleGame] of battleGames) {
      if (battleGame.players.size < 2) { // Максимум 2 игрока в боевом режиме
        battleGameId = id;
        break;
      }
    }
    
    if (!battleGameId) {
      battleGameId = generateGameId();
      // Генерируем одно судоку для всей игры
      const sharedSudoku = generateSudokuBoard();
      const sharedSolution = generateSudokuSolution();
      
      battleGames.set(battleGameId, {
        id: battleGameId,
        players: new Map(),
        startTime: Date.now(),
        sharedBoard: sharedSudoku, // Общая доска для всех игроков
        sharedPuzzle: sharedSudoku,
        sharedSolution: sharedSolution,
        boards: new Map(), // Индивидуальные доски игроков
        puzzles: new Map(),
        solutions: new Map()
      });
    }
    
    currentBattleGame = battleGameId;
    const battleGame = battleGames.get(battleGameId);
    
    // Используем общее судоку для всех игроков
    battleGame.boards.set(userId, battleGame.sharedBoard);
    battleGame.puzzles.set(userId, battleGame.sharedPuzzle);
    battleGame.solutions.set(userId, battleGame.sharedSolution);
    
    // Подсчитываем количество изначально заполненных ячеек
    const initialFilledCells = battleGame.sharedPuzzle.reduce((count, row) => {
      return count + row.filter(cell => cell !== "").length;
    }, 0);
    
    battleGame.players.set(userId, {
      id: userId,
      username: username,
      ws: ws,
      joinTime: Date.now(),
      completedCells: initialFilledCells, // Учитываем изначально заполненные ячейки
      bombs: 0,
      completedRows: new Set(),
      completedSquares: new Set()
    });
    
    players.set(userId, battleGameId);
    activeUsers.set(userId, currentUser);
    
    // Отправляем игроку информацию об игре
    ws.send(JSON.stringify({
      type: 'battle_join',
      gameId: battleGameId,
      playerId: userId,
      board: battleGame.boards.get(userId),
      puzzle: battleGame.puzzles.get(userId),
      opponent: battleGame.players.size > 1 ? 
        Array.from(battleGame.players.values()).find(p => p.id !== userId) : null
    }));
    
    // Если это второй игрок, генерируем новую игру для обоих
    if (battleGame.players.size === 2) {
      // Генерируем новое общее судоку для всей игры
      const newSharedSudoku = generateSudokuBoard();
      const newSharedSolution = generateSudokuSolution();
      
      // Обновляем общее судоку
      battleGame.sharedBoard = newSharedSudoku;
      battleGame.sharedPuzzle = newSharedSudoku;
      battleGame.sharedSolution = newSharedSolution;
      
      // Обновляем судоку для всех игроков в этой игре
      battleGame.players.forEach(player => {
        battleGame.boards.set(player.id, newSharedSudoku);
        battleGame.puzzles.set(player.id, newSharedSudoku);
        battleGame.solutions.set(player.id, newSharedSolution);
        
        // Подсчитываем количество изначально заполненных ячеек в новой игре
        const initialFilledCells = newSharedSudoku.reduce((count, row) => {
          return count + row.filter(cell => cell !== "").length;
        }, 0);
        
        // Сбрасываем прогресс игрока
        player.completedCells = initialFilledCells; // Учитываем изначально заполненные ячейки
        player.bombs = 0;
        // НЕ сбрасываем completedRows и completedSquares, чтобы можно было получать бомбочки за повторное завершение
        
        // Отправляем новое судоку каждому игроку
        if (player.ws.readyState === WebSocket.OPEN) {
          player.ws.send(JSON.stringify({
            type: 'new_battle_game',
            board: newSharedSudoku,
            puzzle: newSharedSudoku,
            solution: newSharedSolution
          }));
          
          // Отправляем обновление бомбочек
          player.ws.send(JSON.stringify({
            type: 'my_bombs_update',
            bombs: 0
          }));
        }
      });
      
      // Отправляем доски соперников друг другу после создания новой игры
      const playersArray = Array.from(battleGame.players.values());
      if (playersArray.length === 2) {
        const player1 = playersArray[0];
        const player2 = playersArray[1];
        
        if (player1.ws.readyState === WebSocket.OPEN) {
          player1.ws.send(JSON.stringify({
            type: 'battle_board_sync',
            board: battleGame.boards.get(player2.id)
          }));
          
          // Отправляем информацию о бомбочках соперника
          player1.ws.send(JSON.stringify({
            type: 'opponent_bombs_update',
            bombs: player2.bombs
          }));
        }
        
        if (player2.ws.readyState === WebSocket.OPEN) {
          player2.ws.send(JSON.stringify({
            type: 'battle_board_sync',
            board: battleGame.boards.get(player1.id)
          }));
          
          // Отправляем информацию о бомбочках соперника
          player2.ws.send(JSON.stringify({
            type: 'opponent_bombs_update',
            bombs: player1.bombs
          }));
        }
      };
      
      // Уведомляем первого игрока о подключении второго
      const opponent = Array.from(battleGame.players.values()).find(p => p.id !== userId);
      if (opponent && opponent.ws.readyState === WebSocket.OPEN) {
        opponent.ws.send(JSON.stringify({
          type: 'opponent_joined',
          opponent: {
            id: userId,
            username: username,
            joinTime: Date.now()
          }
        }));
        
        // Отправляем доски соперников друг другу
        const newPlayer = battleGame.players.get(userId);
        if (newPlayer && newPlayer.ws.readyState === WebSocket.OPEN) {
          // Отправляем новому игроку доску соперника
          newPlayer.ws.send(JSON.stringify({
            type: 'battle_board_sync',
            board: battleGame.boards.get(opponent.id)
          }));
          
          // Отправляем информацию о бомбочках соперника новому игроку
          newPlayer.ws.send(JSON.stringify({
            type: 'opponent_bombs_update',
            bombs: opponent.bombs
          }));
          
          // Отправляем сопернику доску нового игрока
          opponent.ws.send(JSON.stringify({
            type: 'battle_board_sync',
            board: battleGame.boards.get(userId)
          }));
          
          // Отправляем информацию о бомбочках нового игрока сопернику
          opponent.ws.send(JSON.stringify({
            type: 'opponent_bombs_update',
            bombs: newPlayer.bombs
          }));
        }
      }
    }
  }
  
  function handleCellUpdate(gameId, user, row, col, value) {
    const game = games.get(gameId);
    if (!game) return;
    
    const player = game.players.get(user.userId);
    if (!player) return;
    
    // Проверяем правильность ответа
    const isCorrect = value === game.solution[row][col].toString();
    
    if (isCorrect && value !== "") {
      player.completedCells += 1;
    }
    
    // Обновляем ячейку в игре
    if (!game.board[row]) game.board[row] = [];
    game.board[row][col] = value;
    
    // Отправляем обновление всем игрокам с информацией о правильности
    broadcastToGame(gameId, {
      type: 'cell_updated',
      playerId: user.userId,
      username: user.username,
      row: row,
      col: col,
      value: value,
      isCorrect: isCorrect,
      completedCells: player.completedCells,
      solution: game.solution[row][col] // Отправляем правильный ответ для подсветки
    });
    
    // Проверяем, завершил ли игрок игру
    if (player.completedCells >= 81) {
      handleGameCompleted(user, Date.now() - game.startTime);
    }
  }

  // Новая функция для обновления ячеек в боевом режиме
  function handleBattleCellUpdate(battleGameId, user, row, col, value, rowCompleted, squareCompleted) {
    console.log(`Обрабатываем обновление ячейки: игрок ${user.username}, строка ${row}, колонка ${col}, значение ${value}, завершение строки: ${rowCompleted}, завершение квадрата: ${squareCompleted}`);
    
    const battleGame = battleGames.get(battleGameId);
    if (!battleGame) {
      console.log('Игра не найдена');
      return;
    }
    
    const player = battleGame.players.get(user.userId);
    if (!player) {
      console.log('Игрок не найден');
      return;
    }
    
    // Обновляем доску игрока
    const playerBoard = battleGame.boards.get(user.userId);
    if (!playerBoard[row]) playerBoard[row] = [];
    playerBoard[row][col] = value;
    console.log(`Обновили доску игрока ${user.username}: [${row}][${col}] = ${value}`);
    
    // Проверяем правильность ответа
    const playerSolution = battleGame.solutions.get(user.userId);
    const playerPuzzle = battleGame.puzzles.get(user.userId);
    const isCorrect = value === playerSolution[row][col].toString();
    
    // Если это изначально заполненная ячейка, не считаем её
    const isInitialCell = playerPuzzle[row][col] !== "";
    
    if (isCorrect && value !== "" && !isInitialCell) {
      player.completedCells += 1;
      console.log(`[BATTLE] Игрок ${user.username} правильно заполнил ячейку. Всего правильных: ${player.completedCells}/81`);
    }
    
    // Если завершена строка или квадрат И значение правильное, даем бомбочку
    if ((rowCompleted || squareCompleted) && isCorrect && value !== "") {
      console.log(`Игрок ${user.username} получил бомбочку за правильное завершение ${rowCompleted ? 'строки' : 'квадрата'}. Было: ${player.bombs}, стало: ${player.bombs + 1}`);
      player.bombs += 1;
      
      // Отправляем обновленное количество бомбочек игроку
      if (ws.readyState === WebSocket.OPEN) {
        const bombUpdateMessage = {
          type: 'my_bombs_update',
          bombs: player.bombs
        };
        console.log('Отправляем игроку обновление бомбочек:', bombUpdateMessage);
        ws.send(JSON.stringify(bombUpdateMessage));
      }
    }
    
    // Отправляем обновление сопернику
    const opponent = Array.from(battleGame.players.values()).find(p => p.id !== user.userId);
    if (opponent && opponent.ws.readyState === WebSocket.OPEN) {
      opponent.ws.send(JSON.stringify({
        type: 'opponent_cell_update',
        row: row,
        col: col,
        value: value,
      }));
      
      
      // Отправляем обновленное количество бомбочек сопернику
      opponent.ws.send(JSON.stringify({
        type: 'opponent_bombs_update',
        bombs: player.bombs
      }));
    }
    
    // Проверяем, завершил ли игрок игру
    if (player.completedCells >= 81) {
      // Игрок победил - используем handleBattleVictory для правильной обработки
      const gameTime = Date.now() - battleGame.startTime;
      handleBattleVictory(battleGameId, user, gameTime, {
        difficulty: 'medium',
        hintsUsed: 0,
        mistakes: 0,
        multiplayer: true,
        playersInGame: battleGame.players.size,
        gameId: battleGameId,
        winner: user.username,
        opponent: opponent ? opponent.username : null,
        bombsUsed: player.bombs
      });
    }
  }

  // Новая функция для использования бомбочек
  function handleUseBomb(battleGameId, user, bombType, targetRow, cellsToRemove) {
    console.log('Обрабатываем бомбу на сервере:', { battleGameId, user, bombType, targetRow, cellsToRemove });
    
    const battleGame = battleGames.get(battleGameId);
    if (!battleGame) {
      console.log('Игра не найдена');
      return;
    }
    
    const player = battleGame.players.get(user.userId);
    if (!player || player.bombs <= 0) {
      console.log('Игрок не найден или нет бомб');
      return;
    }
    
    const opponent = Array.from(battleGame.players.values()).find(p => p.id !== user.userId);
    if (!opponent) {
      console.log('Соперник не найден');
      return;
    }
    
    // Уменьшаем количество бомбочек
    console.log(`Игрок ${user.username} использовал бомбочку. Было: ${player.bombs}, стало: ${player.bombs - 1}`);
    player.bombs -= 1;
    
    // Отправляем обновленное количество бомбочек игроку
    if (ws.readyState === WebSocket.OPEN) {
      const bombUpdateMessage = {
        type: 'my_bombs_update',
        bombs: player.bombs
      };
      console.log('Отправляем игроку обновление бомбочек после использования:', bombUpdateMessage);
      ws.send(JSON.stringify(bombUpdateMessage));
    }
    
    // Отправляем обновленное количество бомбочек сопернику
    if (opponent.ws.readyState === WebSocket.OPEN) {
      opponent.ws.send(JSON.stringify({
        type: 'opponent_bombs_update',
        bombs: player.bombs
      }));
    }
    
    // Если есть информация о ячейках для удаления, применяем бомбу к доске соперника
    if (cellsToRemove && cellsToRemove.length > 0) {
      console.log('Применяем бомбу к доске соперника, ячейки:', cellsToRemove);
      const opponentBoard = battleGame.boards.get(opponent.id);
      if (opponentBoard) {
        console.log('Доска соперника до бомбы:', opponentBoard);
        cellsToRemove.forEach(({ row, col }) => {
          if (opponentBoard[row] && opponentBoard[row][col] !== undefined) {
            opponentBoard[row][col] = "";
            console.log(`Удалили ячейку [${row}][${col}]`);
          }
        });
        console.log('Доска соперника после бомбы:', opponentBoard);
        
        // Отправляем обновленную доску соперника обратно атакующему игроку
        if (player.ws.readyState === WebSocket.OPEN) {
          const syncMessage = {
            type: 'battle_board_sync',
            board: opponentBoard
          };
          console.log('Отправляем обновленную доску атакующему игроку:', syncMessage);
          player.ws.send(JSON.stringify(syncMessage));
        }
    
      } else {
        console.log('Доска соперника не найдена');
      }
    } else {
      console.log('Нет ячеек для удаления');
    }
    
    // Отправляем информацию о бомбе сопернику
    if (opponent.ws.readyState === WebSocket.OPEN) {
      const bombMessage = {
        type: 'bomb_used',
        bombType: bombType,
        targetRow: targetRow,
        targetPlayerId: opponent.id,
        cellsToRemove: cellsToRemove
      };
      console.log('Отправляем бомбу сопернику:', bombMessage);
      opponent.ws.send(JSON.stringify(bombMessage));
    } else {
      console.log('WebSocket соперника не готов');
    }
  }
  
  function handleNewGame(gameId, newBoard, newPuzzle) {
    const game = games.get(gameId);
    if (!game) return;
    
    // Обновляем судоку в игре
    game.board = newBoard;
    game.puzzle = newPuzzle;
    game.solution = generateSudokuSolution();
    game.startTime = Date.now();
    
    // Сбрасываем прогресс всех игроков
    game.players.forEach(player => {
      player.completedCells = 0;
    });
    
    // Отправляем новое судоку всем игрокам
    broadcastToGame(gameId, {
      type: 'new_game',
      board: newBoard,
      puzzle: newPuzzle,
      startTime: game.startTime
    });
  }
  
  
  function handlePlayerDisconnect(gameId, user) {
    if (!gameId || !user) return;
    
    const game = games.get(gameId);
    if (!game) return;
    
    game.players.delete(user.userId);
    players.delete(user.userId);
    activeUsers.delete(user.userId);
    userConnections.delete(user.username);
    
    // Уведомляем остальных игроков
    broadcastToGame(gameId, {
      type: 'player_left',
      playerId: user.userId,
      username: user.username
    });
    
    // Если игра пустая, удаляем её
    if (game.players.size === 0) {
      games.delete(gameId);
    }
  }

  // Новая функция для отключения игрока из боевой игры
  function handleBattlePlayerDisconnect(battleGameId, user) {
    if (!battleGameId || !user) return;
    
    const battleGame = battleGames.get(battleGameId);
    if (!battleGame) return;
    
    battleGame.players.delete(user.userId);
    players.delete(user.userId);
    activeUsers.delete(user.userId);
    userConnections.delete(user.username);
    
    // Уведомляем соперника
    const opponent = Array.from(battleGame.players.values()).find(p => p.id !== user.userId);
    if (opponent && opponent.ws.readyState === WebSocket.OPEN) {
      opponent.ws.send(JSON.stringify({
        type: 'opponent_left',
        playerId: user.userId,
        username: user.username
      }));
    }
    
    // Если игра пустая, удаляем её
    if (battleGame.players.size === 0) {
      battleGames.delete(battleGameId);
    }
  }

  function handleBattleBoardSync(battleGameId, user, board) {
    const battleGame = battleGames.get(battleGameId);
    if (!battleGame) return;
    
    const player = battleGame.players.get(user.userId);
    if (!player) return;
    
    // Обновляем доску игрока
    battleGame.boards.set(user.userId, board);
    
    // Отправляем доску игрока его сопернику
    const opponent = Array.from(battleGame.players.values()).find(p => p.id !== user.userId);
    if (opponent && opponent.ws.readyState === WebSocket.OPEN) {
      opponent.ws.send(JSON.stringify({
        type: 'battle_board_sync',
        board: board
      }));
    }
  }
});

function broadcastToGame(gameId, message) {
  const game = games.get(gameId);
  if (!game) return;
  
  game.players.forEach(player => {
    if (player.ws.readyState === WebSocket.OPEN) {
      player.ws.send(JSON.stringify(message));
    }
  });
}

function generateGameId() {
  return Math.random().toString(36).substr(2, 9);
}

function generateSudokuBoard() {
  // Создаем решенное судоку и убираем часть чисел
  const solution = generateSudokuSolution();
  const board = solution.map(row => 
    row.map(cell => 
      Math.random() < 0.7 ? "" : cell // 70% ячеек оставляем пустыми для боевого режима
    )
  );
  return board;
}

function generateSudokuSolution() {
  // Простое решенное судоку
  return [
    [5, 3, 4, 6, 7, 8, 9, 1, 2],
    [6, 7, 2, 1, 9, 5, 3, 4, 8],
    [1, 9, 8, 3, 4, 2, 5, 6, 7],
    [8, 5, 9, 7, 6, 1, 4, 2, 3],
    [4, 2, 6, 8, 5, 3, 7, 9, 1],
    [7, 1, 3, 9, 2, 4, 8, 5, 6],
    [9, 6, 1, 5, 3, 7, 2, 8, 4],
    [2, 8, 7, 4, 1, 9, 6, 3, 5],
    [3, 4, 5, 2, 8, 6, 1, 7, 9],
  ];
}

function handleGameCompleted(user, gameTime, gameMode = 'classic', additionalData = {}) {
  if (!user) return;
  
  const result = {
    id: Date.now().toString(36) + Math.random().toString(36).substr(2, 9),
    username: user.username,
    gameTime: gameTime,
    gameMode: gameMode,
    date: new Date().toISOString(),
    completedCells: 81,
    ...additionalData
  };
  
  console.log('Сохраняем результат игры:', result);
  saveGameResult(result);
  updateUserStats(user.username, gameTime);
}

function handleBattleVictory(battleGameId, winnerUser, gameTime, data) {
  const battleGame = battleGames.get(battleGameId);
  if (!battleGame) {
    console.log('[BATTLE] Игра не найдена для battleGameId:', battleGameId);
    return;
  }

  // Если уже есть победитель, не засчитываем вторую победу
  if (battleGame._winnerUsername) {
    // Этот игрок проиграл
    const loser = winnerUser;
    const winner = Array.from(battleGame.players.values()).find(p => p.username === battleGame._winnerUsername);
    console.log('[BATTLE] Уже есть победитель:', winner.username, '| Проигравший:', loser.username);
    handleGameCompleted(loser, gameTime, 'battle', {
      ...data,
      winner: winner.username,
      opponent: winner.username,
      result: 'lose'
    });
    if (loser.ws && loser.ws.readyState === WebSocket.OPEN) {
      loser.ws.send(JSON.stringify({
        type: 'game_over',
        winner: winner.username,
        gameTime: gameTime
      }));
      console.log('[BATTLE] Отправлено game_over проигравшему:', loser.username);
    } else {
      console.log('[BATTLE] Не удалось отправить game_over проигравшему:', loser.username, '| ws:', !!loser.ws);
    }
    return;
  }

  // Первый победитель
  battleGame._winnerUsername = winnerUser.username;
  const winner = winnerUser;
  const loser = Array.from(battleGame.players.values()).find(p => p.id !== winnerUser.userId);
  console.log('[BATTLE] Победитель:', winner.username, '| Проигравший:', loser ? loser.username : 'нет');

  // Сохраняем результат для победителя
  handleGameCompleted(winner, gameTime, 'battle', {
    ...data,
    winner: winner.username,
    opponent: loser ? loser.username : null,
    result: 'win'
  });

  // Сохраняем результат для проигравшего
  if (loser) {
    handleGameCompleted(loser, gameTime, 'battle', {
      ...data,
      winner: winner.username,
      opponent: winner.username,
      result: 'lose'
    });
  }

  // Оповещаем обоих игроков
  if (winner.ws && winner.ws.readyState === WebSocket.OPEN) {
    winner.ws.send(JSON.stringify({
      type: 'game_over',
      winner: winner.username,
      gameTime: gameTime
    }));
    console.log('[BATTLE] Отправлено game_over победителю:', winner.username);
  } else {
    console.log('[BATTLE] Не удалось отправить game_over победителю:', winner.username, '| ws:', !!winner.ws);
  }
  if (loser && loser.ws && loser.ws.readyState === WebSocket.OPEN) {
    loser.ws.send(JSON.stringify({
      type: 'game_over',
      winner: winner.username,
      gameTime: gameTime
    }));
    console.log('[BATTLE] Отправлено game_over проигравшему:', loser.username);
  } else if (loser) {
    console.log('[BATTLE] Не удалось отправить game_over проигравшему:', loser.username, '| ws:', !!loser.ws);
  }
  
  // Отправляем сообщение о завершении игры всем игрокам в игре
  battleGame.players.forEach(player => {
    if (player.ws && player.ws.readyState === WebSocket.OPEN) {
      player.ws.send(JSON.stringify({
        type: 'game_over',
        winner: winner.username,
        gameTime: gameTime
      }));
    }
  });
}

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`Сервер запущен на порту ${PORT}`);
  console.log(`HTTP API: http://localhost:${PORT}`);
  console.log(`WebSocket: ws://localhost:${PORT}`);
  console.log(`Поддерживаемые режимы: Классическая судоку и Судоку + Морской бой`);
}); 
