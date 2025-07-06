const WebSocket = require('ws');
const http = require('http');
const fs = require('fs');
const path = require('path');

const server = http.createServer();
const wss = new WebSocket.Server({ server });

// Путь к файлу с пользователями
const USERS_FILE = path.join(__dirname, 'users.json');

// Хранилище активных игр и пользователей
const games = new Map();
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
  
  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message);
      
      switch (data.type) {
        case 'join_game':
          handleJoinGame(ws, data.username, data.userId, data.currentBoard, data.currentPuzzle);
          break;
          
        case 'cell_update':
          handleCellUpdate(currentGame, currentUser, data.row, data.col, data.value);
          break;
          
        case 'game_completed':
          handleGameCompleted(currentUser, data.gameTime);
          break;
          
        case 'leave_game':
          handlePlayerDisconnect(currentGame, currentUser);
          break;
          
        case 'new_game':
          handleNewGame(currentGame, data.board, data.puzzle);
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
    
    // Отправляем обновление всем игрокам
    broadcastToGame(gameId, {
      type: 'cell_updated',
      playerId: user.userId,
      username: user.username,
      row: row,
      col: col,
      value: value,
      isCorrect: isCorrect,
      completedCells: player.completedCells
    });
    
    // Проверяем, завершил ли игрок игру
    if (player.completedCells >= 81) {
      handleGameCompleted(user, Date.now() - game.startTime);
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
  
  function handleGameCompleted(user, gameTime) {
    if (user && user.username) {
      updateUserStats(user.username, gameTime);
      
      broadcastToGame(currentGame, {
        type: 'player_completed',
        playerId: user.userId,
        username: user.username,
        gameTime: gameTime
      });
    }
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
      Math.random() < 0.6 ? "" : cell // 60% ячеек оставляем пустыми
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

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`Сервер запущен на порту ${PORT}`);
  console.log(`HTTP API: http://localhost:${PORT}`);
  console.log(`WebSocket: ws://localhost:${PORT}`);
}); 