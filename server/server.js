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
          handleGameCompleted(currentUser, data.gameTime);
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
    
    battleGame.players.set(userId, {
      id: userId,
      username: username,
      ws: ws,
      joinTime: Date.now(),
      completedCells: 0,
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
        
        // Отправляем новое судоку каждому игроку
        if (player.ws.readyState === WebSocket.OPEN) {
          player.ws.send(JSON.stringify({
            type: 'new_battle_game',
            board: newSharedSudoku,
            puzzle: newSharedSudoku,
            solution: newSharedSolution
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
        }
        
        if (player2.ws.readyState === WebSocket.OPEN) {
          player2.ws.send(JSON.stringify({
            type: 'battle_board_sync',
            board: battleGame.boards.get(player1.id)
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
          
          // Отправляем сопернику доску нового игрока
          opponent.ws.send(JSON.stringify({
            type: 'battle_board_sync',
            board: battleGame.boards.get(userId)
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
    const battleGame = battleGames.get(battleGameId);
    if (!battleGame) return;
    
    const player = battleGame.players.get(user.userId);
    if (!player) return;
    
    // Обновляем доску игрока
    const playerBoard = battleGame.boards.get(user.userId);
    if (!playerBoard[row]) playerBoard[row] = [];
    playerBoard[row][col] = value;
    
    // Проверяем правильность ответа
    const playerSolution = battleGame.solutions.get(user.userId);
    const isCorrect = value === playerSolution[row][col].toString();
    
    if (isCorrect && value !== "") {
      player.completedCells += 1;
    }
    
    // Если завершена строка или квадрат, даем бомбочку
    if (rowCompleted || squareCompleted) {
      player.bombs += 1;
    }
    
    // Отправляем обновление сопернику
    const opponent = Array.from(battleGame.players.values()).find(p => p.id !== user.userId);
    if (opponent && opponent.ws.readyState === WebSocket.OPEN) {
      opponent.ws.send(JSON.stringify({
        type: 'opponent_cell_update',
        row: row,
        col: col,
        value: value
      }));
    }
    
    // Проверяем, завершил ли игрок игру
    if (player.completedCells >= 81) {
      // Игрок победил
      if (opponent && opponent.ws.readyState === WebSocket.OPEN) {
        opponent.ws.send(JSON.stringify({
          type: 'game_over',
          winner: user.username
        }));
      }
      ws.send(JSON.stringify({
        type: 'game_over',
        winner: user.username
      }));
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
    player.bombs -= 1;
    
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

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`Сервер запущен на порту ${PORT}`);
  console.log(`HTTP API: http://localhost:${PORT}`);
  console.log(`WebSocket: ws://localhost:${PORT}`);
  console.log(`Поддерживаемые режимы: Классическая судоку и Судоку + Морской бой`);
}); 