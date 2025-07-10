import React, { useState, useEffect, useRef } from "react";
import "./SudokuBattle.css";

// Функция для генерации случайного судоку
const generateSudoku = () => {
  const baseSolution = [
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

  const shuffleSolution = (solution) => {
    const shuffled = solution.map(row => [...row]);
    
    for (let i = 0; i < 10; i++) {
      const row1 = Math.floor(Math.random() * 9);
      const row2 = Math.floor(Math.random() * 9);
      if (Math.floor(row1 / 3) === Math.floor(row2 / 3)) {
        [shuffled[row1], shuffled[row2]] = [shuffled[row2], shuffled[row1]];
      }
    }
    
    return shuffled;
  };

  const solution = shuffleSolution(baseSolution);
  
  // Создаем головоломку, убирая случайные числа
  const puzzle = solution.map(row => 
    row.map(cell => 
      Math.random() < 0.7 ? "" : cell // 70% ячеек оставляем пустыми
    )
  );

  return { puzzle, solution };
};

const initialGame = generateSudoku();

// Генерация уникального ID
const generateUserId = () => {
  return Math.random().toString(36).substr(2, 9) + Date.now().toString(36);
};

function isBoardFullySolved(board, solution) {
  for (let i = 0; i < 9; i++) {
    for (let j = 0; j < 9; j++) {
      if (String(board[i][j]) !== String(solution[i][j])) {
        console.log(`Не совпало: board[${i}][${j}] = ${board[i][j]}, solution = ${solution[i][j]}`);
        return false;
      }
    }
  }
  console.log('Доска полностью совпадает с решением!');
  return true;
}

function SudokuBattle({ user, onBackToMenu }) {
  const [game, setGame] = useState(initialGame);
  const [board, setBoard] = useState(game.puzzle);
  const [opponentBoard, setOpponentBoard] = useState(game.puzzle);
  const [isConnected, setIsConnected] = useState(false);
  const [opponent, setOpponent] = useState(null);
  const [myBombs, setMyBombs] = useState(0);
  const [opponentBombs, setOpponentBombs] = useState(0);
  const [gameStartTime, setGameStartTime] = useState(null);
  const [gameTime, setGameTime] = useState(0);
  const [completedRows, setCompletedRows] = useState(new Set());
  const [completedSquares, setCompletedSquares] = useState(new Set());
  const [showBombSelection, setShowBombSelection] = useState(false);
  const [bombType, setBombType] = useState(null);
  const [gameCompleted, setGameCompleted] = useState(false);
  const [winner, setWinner] = useState(null);
  const [showBombPreview, setShowBombPreview] = useState(false);
  const [bombPreviewType, setBombPreviewType] = useState(null);
  const [explosions, setExplosions] = useState([]);
  const [numberExplosions, setNumberExplosions] = useState([]);
  const [explodingCells, setExplodingCells] = useState(new Set());
  const [isTargetMode, setIsTargetMode] = useState(false);
  const [hoveredRow, setHoveredRow] = useState(null);
  const [hoveredCol, setHoveredCol] = useState(null);
  const [targetType, setTargetType] = useState(null); // 'row' или 'col'
  const [hoveredNumber, setHoveredNumber] = useState(null);
  
  const wsRef = useRef(null);
  const playerIdRef = useRef(null);
  const gameIdRef = useRef(null);
  const timerRef = useRef(null);
  const userIdRef = useRef(generateUserId());

  // Таймер для отслеживания времени игры
  useEffect(() => {
    if (gameStartTime && !gameCompleted) {
      timerRef.current = setInterval(() => {
        setGameTime(Date.now() - gameStartTime);
      }, 1000);
    }

    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
    };
  }, [gameStartTime, gameCompleted]);

  // Автоматический возврат в меню после завершения игры
  useEffect(() => {
    if (gameCompleted) {
      const timer = setTimeout(() => {
        onBackToMenu();
      }, 5000);
      
      return () => clearTimeout(timer);
    }
  }, [gameCompleted, onBackToMenu]);

  // Подключение к WebSocket серверу
  const connectToServer = () => {
    if (!user) return;
    
    const ws = new WebSocket('ws://localhost:3001');
    
    ws.onopen = () => {
      console.log('Подключено к серверу боевого режима');
      setIsConnected(true);
      
      ws.send(JSON.stringify({
        type: 'join_battle',
        username: user.username,
        userId: userIdRef.current,
        currentBoard: board
      }));
    };
    
    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      
      switch (data.type) {
        case 'battle_join':
          playerIdRef.current = data.playerId;
          gameIdRef.current = data.gameId;
          setOpponent(data.opponent);
          // Время начнется только когда подключится второй игрок
          if (data.opponent) {
            setGameStartTime(Date.now());
          }
          break;
          
        case 'opponent_joined':
          setOpponent(data.opponent);
          // Если у нас еще не запущено время, запускаем его
          if (!gameStartTime) {
            setGameStartTime(Date.now());
          }
          break;
          
        case 'opponent_left':
          setOpponent(null);
          break;
          
        case 'opponent_cell_update':
          setOpponentBoard(prev => {
            const newBoard = prev.map(row => [...row]);
            newBoard[data.row][data.col] = data.value;
            return newBoard;
          });
          break;
          
        case 'bomb_used':
          console.log('Получили бомбу от соперника:', data);
          if (data.targetPlayerId === playerIdRef.current) {
            // Получили бомбу от соперника
            handleBombAttack(data.bombType, data.targetRow, data.cellsToRemove);
          }
          break;
          
        case 'battle_board_sync':
          console.log('Получили синхронизированную доску от сервера:', data.board);
          // Получаем синхронизированную доску от соперника
          setOpponentBoard(data.board);
          break;
          
        case 'opponent_bombs_update':
          console.log('Получили обновление бомбочек соперника с сервера:', data.bombs);
          setOpponentBombs(data.bombs);
          break;
          
        case 'my_bombs_update':
          console.log('Получили обновление своих бомбочек с сервера:', data.bombs);
          setMyBombs(data.bombs);
          break;
          
        case 'new_battle_game':
          console.log('Получили новую игру от сервера, сбрасываем бомбочки');
          // Получаем новое судоку от сервера
          setBoard(data.board);
          setOpponentBoard(data.board);
          setGame(prev => ({ 
            ...prev, 
            puzzle: data.puzzle,
            solution: data.solution
          }));
          // НЕ сбрасываем completedRows и completedSquares, чтобы можно было получать бомбочки за повторное завершение
          setMyBombs(0);
          setOpponentBombs(0);
          setGameCompleted(false);
          setWinner(null);
          setGameStartTime(Date.now()); // Начинаем отсчет времени заново
          setGameTime(0);
          break;
          
        case 'game_over':
          console.log('GAME OVER! winner:', data.winner, 'my username:', user.username);
          setGameCompleted(true);
          setWinner(data.winner);
          setGameTime(data.gameTime || 0);
          // Если мы не победитель, значит мы проиграли
          if (data.winner !== user.username) {
            console.log('Мы проиграли!');
          } else {
            console.log('Мы победили!');
          }
          break;
          
        default:
          console.log('Неизвестный тип сообщения:', data.type);
          break;
      }
    };
    
    ws.onclose = () => {
      console.log('Отключено от сервера');
      setIsConnected(false);
      setOpponent(null);
      setGameStartTime(null);
    };
    
    wsRef.current = ws;
  };

  const disconnectFromServer = () => {
    if (wsRef.current) {
      wsRef.current.send(JSON.stringify({
        type: 'leave_battle'
      }));
      wsRef.current.close();
      wsRef.current = null;
    }
    setIsConnected(false);
    setOpponent(null);
  };

  // Проверка завершения строки с переданной доской
  const checkRowCompletionWithBoard = (row, boardToCheck) => {
    // Проверяем, что строка заполнена и все значения правильные
    const isComplete = boardToCheck[row].every((cell, col) => {
      // Если это изначально заполненная ячейка, считаем её правильной
      if (game.puzzle[row][col] !== "") {
        return true;
      }
      // Если ячейка пустая, строка не завершена
      if (cell === "") {
        return false;
      }
      // Проверяем правильность значения
      return cell === game.solution[row][col].toString();
    });
    
    if (isComplete) {
      setCompletedRows(prev => new Set([...prev, row]));
      return true;
    }
    return false;
  };

  // Проверка завершения квадрата 3x3 с переданной доской
  const checkSquareCompletionWithBoard = (squareRow, squareCol, boardToCheck) => {
    // Проверяем, что квадрат заполнен и все значения правильные
    for (let i = 0; i < 3; i++) {
      for (let j = 0; j < 3; j++) {
        const row = squareRow * 3 + i;
        const col = squareCol * 3 + j;
        
        // Если это изначально заполненная ячейка, считаем её правильной
        if (game.puzzle[row][col] !== "") {
          continue;
        }
        
        // Если ячейка пустая, квадрат не завершен
        if (boardToCheck[row][col] === "") {
          return false;
        }
        
        // Проверяем правильность значения
        if (boardToCheck[row][col] !== game.solution[row][col].toString()) {
          return false;
        }
      }
    }
    
    // Если все ячейки правильные, квадрат завершен
    const squareKey = `${squareRow}-${squareCol}`;
    setCompletedSquares(prev => new Set([...prev, squareKey]));
    return true;
  };

  const handleChange = (row, col, value) => {
    // Проверяем, что поле не заблокировано (не является изначально заполненным)
    if (game.puzzle[row][col] !== "") {
      return;
    }
    
    // Проверяем, что введенное значение корректно
    if (value === "" || (/^[1-9]$/.test(value) && value.length === 1)) {
      const newBoard = board.map((r, i) =>
        r.map((cell, j) => (i === row && j === col ? value : cell))
      );
      setBoard(newBoard);
      
      // Проверяем правильность введенного значения
      const isCorrect = value === "" || value === game.solution[row][col].toString();
      
      // Проверяем завершение строки и квадрата с новой доской только если значение правильное
      let rowCompleted = false;
      let squareCompleted = false;
      
      if (isCorrect && value !== "") {
        rowCompleted = checkRowCompletionWithBoard(row, newBoard);
        const squareRow = Math.floor(row / 3);
        const squareCol = Math.floor(col / 3);
        squareCompleted = checkSquareCompletionWithBoard(squareRow, squareCol, newBoard);
      }
      
      // Отправляем обновление на сервер
      if (isConnected && wsRef.current) {
        wsRef.current.send(JSON.stringify({
          type: 'battle_cell_update',
          row: row,
          col: col,
          value: value,
          rowCompleted: rowCompleted,
          squareCompleted: squareCompleted
        }));
      }

      // Проверка полной победы
      if (isBoardFullySolved(newBoard, game.solution) && !gameCompleted) {
        console.log('Доска полностью совпадает с решением! Победа!');
        
        // Подсчитываем количество правильных ячеек
        let correctCells = 0;
        for (let i = 0; i < 9; i++) {
          for (let j = 0; j < 9; j++) {
            if (newBoard[i][j] !== "" && newBoard[i][j] === game.solution[i][j].toString()) {
              correctCells++;
            }
          }
        }
        console.log(`Правильно заполнено ячеек: ${correctCells}/81`);
        
        setGameCompleted(true);
        setWinner(user.username);
        if (isConnected && wsRef.current) {
          wsRef.current.send(JSON.stringify({
            type: 'battle_victory',
            gameTime: Date.now() - gameStartTime,
            gameMode: 'battle',
            difficulty: 'medium',
            hintsUsed: 0,
            mistakes: 0,
            multiplayer: true,
            playersInGame: 2
          }));
        }
      }
    }
  };

  const showBombEffect = (type, targetRow = null) => {
    if (type === 'linear') {
      setIsTargetMode(true);
      setBombPreviewType(type);
    } else {
      setBombPreviewType(type);
      setShowBombPreview(true);
    }
  };

  const createExplosion = (x, y) => {
    const explosion = {
      id: Date.now() + Math.random(),
      x: x,
      y: y,
      emoji: '💥'
    };
    setExplosions(prev => [...prev, explosion]);
    
    // Создаем эффект экрана для больших взрывов
    createScreenFlash();
    
    setTimeout(() => {
      setExplosions(prev => prev.filter(e => e.id !== explosion.id));
    }, 1200);
  };

  const createNumberExplosion = (x, y, number) => {
    const explosion = {
      id: Date.now() + Math.random(),
      x: x,
      y: y,
      number: number
    };
    setNumberExplosions(prev => [...prev, explosion]);
    setTimeout(() => {
      setNumberExplosions(prev => prev.filter(e => e.id !== explosion.id));
    }, 1000);
  };

  // Новая функция для создания эффекта взрыва клетки
  const createCellExplosion = (row, col, boardType = 'opponent') => {
    const cellKey = `${boardType}-${row}-${col}`;
    
    // Добавляем клетку в состояние взрывающихся
    setExplodingCells(prev => new Set([...prev, cellKey]));
    
    const cellElement = document.querySelector(
      boardType === 'opponent' 
        ? `.sudoku-board .sudoku-row:nth-child(${row + 1}) .opponent-cell:nth-child(${col + 1})`
        : `.sudoku-board .sudoku-row:nth-child(${row + 1}) .battle-cell:nth-child(${col + 1})`
    );
    
    if (cellElement) {
      // Добавляем класс анимации взрыва
      cellElement.classList.add('cell-explosion');
      
      // Создаем волну взрыва
      const wave = document.createElement('div');
      wave.className = 'explosion-wave';
      wave.style.left = '50%';
      wave.style.top = '50%';
      wave.style.transform = 'translate(-50%, -50%)';
      cellElement.appendChild(wave);
      
      // Создаем частицы взрыва
      const particlesContainer = document.createElement('div');
      particlesContainer.className = 'explosion-particles-container';
      cellElement.appendChild(particlesContainer);
      
      // Создаем 12 частиц в разных направлениях с разными размерами
      for (let i = 0; i < 20; i++) {
        const particle = document.createElement('div');
        particle.className = 'explosion-particle';
        const angle = (i * 30) * (Math.PI / 180);
        const distance = 40 + Math.random() * 40; // Случайное расстояние от 40 до 80px
        const size = 2 + Math.random() * 4; // Случайный размер от 2 до 6px
        
        particle.style.setProperty('--particle-x', `${Math.cos(angle) * distance}px`);
        particle.style.setProperty('--particle-y', `${Math.sin(angle) * distance}px`);
        particle.style.left = '50%';
        particle.style.top = '50%';
        particle.style.transform = 'translate(-50%, -50%)';
        particle.style.width = `${size}px`;
        particle.style.height = `${size}px`;
        particle.style.animationDelay = `${Math.random() * 0.2}s`;
        particlesContainer.appendChild(particle);
      }
      
      // Удаляем эффекты через время анимации
      setTimeout(() => {
        cellElement.classList.remove('cell-explosion');
        if (wave.parentNode) wave.parentNode.removeChild(wave);
        if (particlesContainer.parentNode) particlesContainer.parentNode.removeChild(particlesContainer);
        // Удаляем клетку из состояния взрывающихся
        setExplodingCells(prev => {
          const newSet = new Set(prev);
          newSet.delete(cellKey);
          return newSet;
        });
      }, 1500);
    }
  };

  // Функция для создания эффекта экрана
  const createScreenFlash = () => {
    const flash = document.createElement('div');
    flash.className = 'screen-flash';
    document.body.appendChild(flash);
    
    setTimeout(() => {
      if (flash.parentNode) {
        flash.parentNode.removeChild(flash);
      }
    }, 300);
  };

  // Функция для создания множественного взрыва
  const createMultipleExplosions = (cells, boardType = 'opponent') => {
    // Создаем эффект экрана при множественном взрыве
    if (cells.length > 2) {
      createScreenFlash();
    }
    
    cells.forEach((cell, index) => {
      setTimeout(() => {
        createCellExplosion(cell.row, cell.col, boardType);
        createNumberExplosion(20 + cell.col * 40, 20 + cell.row * 40, 
          boardType === 'opponent' ? opponentBoard[cell.row][cell.col] : board[cell.row][cell.col]);
      }, index * 100);
    });
  };

  const handleRowHover = (row) => {
    if (isTargetMode) {
      setHoveredRow(row);
      setTargetType('row');
      setHoveredCol(null);
    }
  };

  const handleColHover = (col) => {
    if (isTargetMode) {
      setHoveredCol(col);
      setTargetType('col');
      setHoveredRow(null);
    }
  };

  const handleRowClick = (row) => {
    if (isTargetMode && targetType === 'row') {
      executeBomb('linear', row);
      setIsTargetMode(false);
      setHoveredRow(null);
      setTargetType(null);
    }
  };

  const handleColClick = (col) => {
    if (isTargetMode && targetType === 'col') {
      executeBomb('linear', col);
      setIsTargetMode(false);
      setHoveredCol(null);
      setTargetType(null);
    }
  };

  const cancelTargetMode = () => {
    setIsTargetMode(false);
    setHoveredRow(null);
    setHoveredCol(null);
    setTargetType(null);
    setBombPreviewType(null);
    setShowBombPreview(false);
  };

  const executeBomb = (type, targetRow = null) => {
    if (myBombs <= 0) return;
    
    if (type === 'linear' && targetRow === null) {
      setShowBombSelection(true);
      setBombType('linear');
      return;
    }
    
    // Создаем эффект взрыва
    createExplosion(50, 50); // Центр экрана
    
    if (type === 'random') {
      // Случайная бомба - удаляем до 5 случайных ячеек соперника
      const cellsToRemove = [];
      for (let i = 0; i < 5; i++) {
        const row = Math.floor(Math.random() * 9);
        const col = Math.floor(Math.random() * 9);
        if (opponentBoard[row][col] !== "" && game.puzzle[row][col] === "") {
          cellsToRemove.push({ row, col });
        }
      }
      
      console.log('Случайная бомба - ячейки для удаления:', cellsToRemove);
      
      // Создаем множественный взрыв с задержкой
      createMultipleExplosions(cellsToRemove, 'opponent');
      
      // Отправляем информацию о бомбе на сервер с указанием удаляемых ячеек
      if (isConnected && wsRef.current) {
        const bombData = {
          type: 'use_bomb',
          bombType: type,
          targetRow: targetRow,
          cellsToRemove: cellsToRemove
        };
        console.log('Отправляем бомбу на сервер:', bombData);
        wsRef.current.send(JSON.stringify(bombData));
      }
    } else if (type === 'linear' && targetRow !== null) {
      // Линейная бомба - удаляем всю строку
      const cellsToRemove = [];
      for (let col = 0; col < 9; col++) {
        if (game.puzzle[targetRow][col] === "" && opponentBoard[targetRow][col] !== "") {
          cellsToRemove.push({ row: targetRow, col });
        }
      }
      
      console.log('Линейная бомба - ячейки для удаления:', cellsToRemove);
      
      // Создаем множественный взрыв для всей строки
      createMultipleExplosions(cellsToRemove, 'opponent');
      
      // Отправляем информацию о бомбе на сервер с указанием удаляемых ячеек
      if (isConnected && wsRef.current) {
        const bombData = {
          type: 'use_bomb',
          bombType: type,
          targetRow: targetRow,
          cellsToRemove: cellsToRemove
        };
        console.log('Отправляем линейную бомбу на сервер:', bombData);
        wsRef.current.send(JSON.stringify(bombData));
      }
    }
    
    setShowBombSelection(false);
    setBombType(null);
    setShowBombPreview(false);
    setBombPreviewType(null);
    setIsTargetMode(false);
    setHoveredRow(null);
    setHoveredCol(null);
    setTargetType(null);
  };

  const handleBombAttack = (type, targetRow, cellsToRemove) => {
    console.log('Обрабатываем атаку бомбой:', { type, targetRow, cellsToRemove });
    
    // Создаем эффект взрыва при получении бомбы
    createExplosion(50, 50);
    
    if (cellsToRemove && cellsToRemove.length > 0) {
      console.log('Удаляем ячейки из своей доски:', cellsToRemove);
      // Создаем множественный взрыв для указанных ячеек
      createMultipleExplosions(cellsToRemove, 'my');
      
      setBoard(prev => {
        const newBoard = prev.map(row => [...row]);
        cellsToRemove.forEach(({ row, col }) => {
          newBoard[row][col] = "";
        });
        console.log('Обновленная доска после бомбы:', newBoard);
        return newBoard;
      });
      
      // Сбрасываем состояние завершенных строк и квадратов для возможности повторного получения бомбочек
      const affectedRows = new Set(cellsToRemove.map(cell => cell.row));
      const affectedSquares = new Set();
      cellsToRemove.forEach(cell => {
        const squareRow = Math.floor(cell.row / 3);
        const squareCol = Math.floor(cell.col / 3);
        affectedSquares.add(`${squareRow}-${squareCol}`);
      });
      
      console.log('Сбрасываем состояние завершенных строк:', Array.from(affectedRows));
      console.log('Сбрасываем состояние завершенных квадратов:', Array.from(affectedSquares));
      
      setCompletedRows(prev => {
        const newSet = new Set(prev);
        affectedRows.forEach(row => newSet.delete(row));
        return newSet;
      });
      
      setCompletedSquares(prev => {
        const newSet = new Set(prev);
        affectedSquares.forEach(square => newSet.delete(square));
        return newSet;
      });
    } else {
      // Fallback для обратной совместимости
      if (type === 'linear') {
        const cellsToRemove = [];
        for (let col = 0; col < 9; col++) {
          if (game.puzzle[targetRow][col] === "" && board[targetRow][col] !== "") {
            cellsToRemove.push({ row: targetRow, col });
          }
        }
        
        // Создаем множественный взрыв для всей строки
        createMultipleExplosions(cellsToRemove, 'my');
        
        setBoard(prev => {
          const newBoard = prev.map(row => [...row]);
          cellsToRemove.forEach(({ row, col }) => {
            newBoard[row][col] = "";
          });
          return newBoard;
        });
        
        // Сбрасываем состояние завершенной строки
        setCompletedRows(prev => {
          const newSet = new Set(prev);
          newSet.delete(targetRow);
          return newSet;
        });
      } else if (type === 'random') {
        // Случайная атака
        const cellsToRemove = [];
        for (let i = 0; i < 5; i++) {
          const row = Math.floor(Math.random() * 9);
          const col = Math.floor(Math.random() * 9);
          if (board[row][col] !== "" && game.puzzle[row][col] === "") {
            cellsToRemove.push({ row, col });
          }
        }
        
        // Создаем множественный взрыв с задержкой
        createMultipleExplosions(cellsToRemove, 'my');
        
        setBoard(prev => {
          const newBoard = prev.map(row => [...row]);
          cellsToRemove.forEach(({ row, col }) => {
            newBoard[row][col] = "";
          });
          return newBoard;
        });
        
        // Сбрасываем состояние завершенных строк и квадратов для случайной атаки
        const affectedRows = new Set(cellsToRemove.map(cell => cell.row));
        const affectedSquares = new Set();
        cellsToRemove.forEach(cell => {
          const squareRow = Math.floor(cell.row / 3);
          const squareCol = Math.floor(cell.col / 3);
          affectedSquares.add(`${squareRow}-${squareCol}`);
        });
        
        setCompletedRows(prev => {
          const newSet = new Set(prev);
          affectedRows.forEach(row => newSet.delete(row));
          return newSet;
        });
        
        setCompletedSquares(prev => {
          const newSet = new Set(prev);
          affectedSquares.forEach(square => newSet.delete(square));
          return newSet;
        });
      }
    }
  };

  const generateNewGame = () => {
    const newGame = generateSudoku();
    setGame(newGame);
    setBoard(newGame.puzzle);
    setOpponentBoard(newGame.puzzle);
    // НЕ сбрасываем completedRows и completedSquares, чтобы можно было получать бомбочки за повторное завершение
    setMyBombs(0);
    setOpponentBombs(0);
    setGameCompleted(false);
    setWinner(null);
    setGameTime(0);
  };

  const formatTime = (time) => {
    const minutes = Math.floor(time / 60000);
    const seconds = Math.floor((time % 60000) / 1000);
    return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  };

  const isCellCorrect = (row, col) => {
    const cellValue = board[row][col];
    if (cellValue === "" || game.puzzle[row][col] !== "") {
      return false;
    }
    return cellValue === game.solution[row][col].toString();
  };

  const getCellClassName = (row, col) => {
    let className = "battle-cell";
    
    // Проверяем, является ли поле изначально заполненным
    if (game.puzzle[row][col] !== "") {
      className += " locked";
      if (hoveredNumber && String(game.puzzle[row][col]) === String(hoveredNumber)) {
        className += " cell-highlight";
      }
    }
    
    if (isCellCorrect(row, col)) {
      className += " correct";
    }
    if (completedRows.has(row)) {
      className += " row-completed";
    }
    const squareRow = Math.floor(row / 3);
    const squareCol = Math.floor(col / 3);
    const squareKey = `${squareRow}-${squareCol}`;
    if (completedSquares.has(squareKey)) {
      className += " square-completed";
    }
    // Добавляем подсветку для режима выбора цели
    if (isTargetMode && hoveredRow === row) {
      className += " row-target-preview";
    }
    // Добавляем класс для взрывающихся клеток
    if (explodingCells.has(`my-${row}-${col}`)) {
      className += " cell-explosion";
    }
    return className;
  };

  useEffect(() => {
    if (
      isConnected &&
      !gameCompleted &&
      isBoardFullySolved(board, game.solution)
    ) {
      console.log('Победа! Отправляем battle_victory');
      setGameCompleted(true);
      setWinner(user.username); // Устанавливаем себя как победителя
      if (wsRef.current) {
        wsRef.current.send(JSON.stringify({
          type: 'battle_victory',
          gameTime: Date.now() - gameStartTime,
          gameMode: 'battle',
          difficulty: 'medium',
          hintsUsed: 0,
          mistakes: 0,
          multiplayer: true,
          playersInGame: 2
        }));
      }
    }
    // eslint-disable-next-line
  }, [board]);

  return (
    <div className="sudoku-battle-container">
      <div className="battle-header">
        <h1>⚔️ Судоку + Морской Бой</h1>
        <button className="back-btn" onClick={onBackToMenu}>
          ← Назад в меню
        </button>
      </div>

      <div className="battle-info">
        <div className="player-info">
          <span>Вы: {user.username}</span>
          <span>Бомбочки: {myBombs} 💣</span>
        </div>
        {opponent && (
          <div className="opponent-info">
            <span>Соперник: {opponent.username}</span>
            <span>Бомбочки: {opponentBombs} 💣</span>
          </div>
        )}
        {gameStartTime && (
          <div className="game-time">
            Время: {formatTime(gameTime)}
          </div>
        )}
      </div>

      {gameCompleted && (
        <div className="game-completed">
          <h2>{winner === user.username ? "🎉 Победа!" : "😔 Поражение!"}</h2>
          <p>Время: {formatTime(gameTime)}</p>
          <p>Победитель: {winner}</p>
          {winner !== user.username && (
            <p style={{ color: 'red', fontWeight: 'bold' }}>
              Проигрыш! Исправь ошибки на доске!
            </p>
          )}
          <p>Возврат в меню через 5 секунд...</p>
        </div>
      )}

      <div className="battle-controls">
        {!isConnected ? (
          <button className="connect-btn" onClick={connectToServer}>
            Найти соперника
          </button>
        ) : (
          <button className="disconnect-btn" onClick={disconnectFromServer}>
            Отключиться
          </button>
        )}
        
        <button className="new-game-btn" onClick={generateNewGame}>
          Новая игра
        </button>
      </div>

      <div className="battle-content">
        <div className="boards-container">
          {myBombs > 0 && (
            <div className="bomb-controls">
              <h3>Использовать бомбочку:</h3>
              <button 
                className={`bomb-btn linear ${myBombs > 0 ? 'ready' : ''}`}
                onClick={() => showBombEffect('linear')}
                disabled={showBombSelection}
              >
                💥 Линейная (удалить строку)
                {myBombs > 0 && <span className="bomb-effect-indicator">{myBombs}</span>}
              </button>
              <button 
                className={`bomb-btn random ${myBombs > 0 ? 'ready' : ''}`}
                onClick={() => showBombEffect('random')}
                disabled={showBombSelection}
              >
                🎲 Случайная (до 5 ячеек)
                {myBombs > 0 && <span className="bomb-effect-indicator">{myBombs}</span>}
              </button>
            </div>
          )}

          <div className="board-section">
            <h3>Ваша доска</h3>
            <div className="sudoku-board">
              {board.map((row, i) => (
                <div className="sudoku-row" key={i}>
                  {row.map((cell, j) => (
                    <input
                      className={getCellClassName(i, j)}
                      key={j}
                      value={cell}
                      onChange={(e) => handleChange(i, j, e.target.value)}
                      maxLength={1}
                      readOnly={game.puzzle[i][j] !== "" || isCellCorrect(i, j)}
                      disabled={gameCompleted}
                      onMouseEnter={() => {
                        if (game.puzzle[i][j] !== "") {
                          setHoveredNumber(game.puzzle[i][j]);
                        }
                      }}
                      onMouseLeave={() => setHoveredNumber(null)}
                    />
                  ))}
                </div>
              ))}
            </div>
          </div>

          <div className="board-section">
            <h3>Доска соперника</h3>
            <div className={`sudoku-board opponent-board ${isTargetMode ? 'board-target-mode' : ''}`}
              style={{ position: 'relative' }}>
              {/* Верхняя панель для выбора столбца */}
              {isTargetMode && (
                <div style={{ display: 'flex', position: 'absolute', top: -30, left: 0, right: 0, zIndex: 10 }}>
                  {Array(9).fill(0).map((_, colIdx) => (
                    <div
                      key={colIdx}
                      style={{ flex: 1, height: 20 }}
                      onMouseEnter={() => handleColHover(colIdx)}
                      onMouseLeave={() => setHoveredCol(null)}
                      onClick={() => handleColClick(colIdx)}
                    >
                      {hoveredCol === colIdx && targetType === 'col' && (
                        <div className="target-indicator" style={{ left: '50%', top: 0, transform: 'translateX(-50%)' }}>Столбец</div>
                      )}
                    </div>
                  ))}
                </div>
              )}
              {/* Основная доска */}
              {opponentBoard.map((row, i) => (
                <div
                  className="sudoku-row"
                  key={i}
                  onMouseEnter={() => handleRowHover(i)}
                  onMouseLeave={() => setHoveredRow(null)}
                  onClick={() => handleRowClick(i)}
                  style={{ cursor: isTargetMode ? 'pointer' : 'default', position: 'relative' }}
                >
                  {/* Левая панель для выбора строки */}
                  {isTargetMode && (
                    <div
                      style={{ position: 'absolute', left: -30, top: 0, width: 20, height: '100%' }}
                      onMouseEnter={() => handleRowHover(i)}
                      onMouseLeave={() => setHoveredRow(null)}
                      onClick={() => handleRowClick(i)}
                    >
                      {hoveredRow === i && targetType === 'row' && (
                        <div className="target-indicator" style={{ top: '50%', left: 0, transform: 'translateY(-50%)' }}>Строка</div>
                      )}
                    </div>
                  )}
                  {row.map((cell, j) => {
                    // Определяем, что показывать в ячейке противника
                    let cellContent = "";
                    let additionalClass = "";
                    
                    // Если это изначально заполненная ячейка, показываем цифру
                    if (game.puzzle[i][j] !== "") {
                      cellContent = cell;
                    }
                    // Если ячейка заполнена игроком (не пустая), показываем зеленую клетку
                    else if (cell !== "") {
                      cellContent = "";
                      additionalClass = "opponent-filled";
                    }
                    
                    return (
                      <div
                        className={`opponent-cell ${game.puzzle[i][j] !== "" ? "initial" : ""} ${additionalClass} ${isTargetMode && ((targetType === 'row' && hoveredRow === i) || (targetType === 'col' && hoveredCol === j)) ? (targetType === 'row' ? "row-target-preview" : "col-target-preview") : ""} ${explodingCells.has(`opponent-${i}-${j}`) ? "cell-explosion" : ""}`}
                        key={j}
                      >
                        {cellContent}
                      </div>
                    );
                  })}
                  {/* Правая панель для выбора строки */}
                  {isTargetMode && (
                    <div
                      style={{ position: 'absolute', right: -30, top: 0, width: 20, height: '100%' }}
                      onMouseEnter={() => handleRowHover(i)}
                      onMouseLeave={() => setHoveredRow(null)}
                      onClick={() => handleRowClick(i)}
                    >
                      {hoveredRow === i && targetType === 'row' && (
                        <div className="target-indicator" style={{ top: '50%', right: 0, transform: 'translateY(-50%)' }}>Строка</div>
                      )}
                    </div>
                  )}
                </div>
              ))}
              {/* Нижняя панель для выбора столбца */}
              {isTargetMode && (
                <div style={{ display: 'flex', position: 'absolute', bottom: -30, left: 0, right: 0, zIndex: 10 }}>
                  {Array(9).fill(0).map((_, colIdx) => (
                    <div
                      key={colIdx}
                      style={{ flex: 1, height: 20 }}
                      onMouseEnter={() => handleColHover(colIdx)}
                      onMouseLeave={() => setHoveredCol(null)}
                      onClick={() => handleColClick(colIdx)}
                    >
                      {hoveredCol === colIdx && targetType === 'col' && (
                        <div className="target-indicator" style={{ left: '50%', bottom: 0, transform: 'translateX(-50%)' }}>Столбец</div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
            {isTargetMode && (
              <div style={{ textAlign: 'center', marginTop: '10px' }}>
                <button className="cancel-btn" onClick={cancelTargetMode}>
                  Отменить выбор
                </button>
              </div>
            )}
          </div>
        </div>

        {showBombSelection && bombType === 'linear' && (
          <div className="bomb-selection">
            <h3>Выберите строку для атаки:</h3>
            <div className="row-selection">
              {[0, 1, 2, 3, 4, 5, 6, 7, 8].map(row => (
                <button
                  key={row}
                  className="row-select-btn"
                  onClick={() => executeBomb('linear', row)}
                >
                  Строка {row + 1}
                </button>
              ))}
            </div>
            <button 
              className="cancel-btn"
              onClick={() => setShowBombSelection(false)}
            >
              Отмена
            </button>
          </div>
        )}
      </div>

      {/* Модальное окно предварительного просмотра бомбочки */}
      {showBombPreview && (
        <div className="bomb-preview-overlay" onClick={() => setShowBombPreview(false)}>
          <div className="bomb-preview-content" onClick={(e) => e.stopPropagation()}>
            <div className="bomb-preview-title">
              {bombPreviewType === 'linear' ? '💥 Линейная Бомба' : '🎲 Случайная Бомба'}
            </div>
            <div className="bomb-preview-description">
              {bombPreviewType === 'linear' 
                ? 'Выберите строку для удаления всех цифр соперника в этой строке'
                : 'Удаляет до 5 случайных цифр соперника'
              }
            </div>
            
            {bombPreviewType === 'linear' && (
              <div>
                <p>Нажмите на строку на доске соперника для атаки</p>
                <button 
                  className="bomb-btn linear"
                  onClick={() => {
                    setShowBombPreview(false);
                    setIsTargetMode(true);
                  }}
                  style={{ margin: '10px' }}
                >
                  💥 Выбрать строку на доске
                </button>
              </div>
            )}
            
            {bombPreviewType === 'random' && (
              <div>
                <button 
                  className="bomb-btn random"
                  onClick={() => {
                    setShowBombPreview(false);
                    // Добавляем небольшую задержку перед запуском анимации
                    setTimeout(() => {
                      executeBomb('random');
                    }, 100);
                  }}
                  style={{ margin: '10px' }}
                >
                  🎲 Использовать случайную бомбу
                </button>
              </div>
            )}
            
            <button 
              className="cancel-btn"
              onClick={() => {
                setShowBombPreview(false);
                setBombPreviewType(null);
              }}
            >
              Отмена
            </button>
          </div>
        </div>
      )}

      {/* Эффекты взрывов */}
      {explosions.map(explosion => (
        <div
          key={explosion.id}
          className="bomb-explosion"
          style={{
            left: `${explosion.x}%`,
            top: `${explosion.y}%`,
            transform: 'translate(-50%, -50%)'
          }}
        >
          {explosion.emoji}
        </div>
      ))}

      {/* Эффекты разлетающихся цифр */}
      {numberExplosions.map(explosion => (
        <div
          key={explosion.id}
          className="number-explosion"
          style={{
            left: `${explosion.x}px`,
            top: `${explosion.y}px`,
            transform: 'translate(-50%, -50%)'
          }}
        >
          {explosion.number}
        </div>
      ))}
    </div>
  );
}

export default SudokuBattle; 