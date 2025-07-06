import React, { useState, useEffect, useRef } from "react";
import "./Sudoku.css";

// Функция для генерации случайного судоку
const generateSudoku = () => {
  // Создаем базовое решенное судоку
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

  // Перемешиваем числа в решении
  const shuffleSolution = (solution) => {
    const shuffled = solution.map(row => [...row]);
    
    // Случайные перестановки строк и столбцов
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
      Math.random() < 0.6 ? "" : cell // 60% ячеек оставляем пустыми
    )
  );

  return { puzzle, solution };
};

const initialGame = generateSudoku();

// Генерация уникального ID
const generateUserId = () => {
  return Math.random().toString(36).substr(2, 9) + Date.now().toString(36);
};

function uniquePlayers(players) {
  const seen = new Set();
  return players.filter(player => {
    if (seen.has(player.id)) return false;
    seen.add(player.id);
    return true;
  });
}

function Sudoku({ user }) {
  const [game, setGame] = useState(initialGame);
  const [board, setBoard] = useState(game.puzzle);
  const [isMultiplayer, setIsMultiplayer] = useState(false);
  const [players, setPlayers] = useState([]);
  const [gameStartTime, setGameStartTime] = useState(null);
  const [completedCells, setCompletedCells] = useState(0);
  const [gameCompleted, setGameCompleted] = useState(false);
  const [gameTime, setGameTime] = useState(0);
  
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

  // Подключение к WebSocket серверу
  const connectToServer = () => {
    if (!user) return;
    
    const ws = new WebSocket('ws://localhost:3001');
    
    ws.onopen = () => {
      console.log('Подключено к серверу');
      setIsMultiplayer(true);
      
      // Отправляем информацию о пользователе с текущим судоку
      ws.send(JSON.stringify({
        type: 'join_game',
        username: user.username,
        userId: userIdRef.current,
        currentBoard: board, // Отправляем текущее состояние доски
        currentPuzzle: game.puzzle // Отправляем начальное состояние головоломки
      }));
    };
    
    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      
      switch (data.type) {
        case 'game_join':
          playerIdRef.current = data.playerId;
          gameIdRef.current = data.gameId;
          
          // Используем серверное судоку только если у нас нет своего
          if (data.board && (!game.puzzle || game.puzzle.every(row => row.every(cell => cell === "")))) {
            setBoard(data.board);
            setGame(prev => ({ ...prev, puzzle: data.puzzle }));
          }
          
          setPlayers(data.players);
          setGameStartTime(Date.now());
          setCompletedCells(0);
          setGameCompleted(false);
          break;
          
        case 'player_joined':
          setPlayers(prev => [...prev, data.player]);
          break;
          
        case 'player_left':
          setPlayers(prev => prev.filter(p => p.id !== data.playerId));
          break;
          
        case 'cell_updated':
          if (data.playerId !== playerIdRef.current) {
            setBoard(prev => {
              const newBoard = prev.map(row => [...row]);
              newBoard[data.row][data.col] = data.value;
              return newBoard;
            });
          }
          
          // Обновляем статистику игроков
          setPlayers(prev => 
            prev.map(p => 
              p.id === data.playerId 
                ? { ...p, completedCells: data.completedCells }
                : p
            )
          );
          break;
          
        case 'player_completed':
          if (data.playerId === playerIdRef.current) {
            setGameCompleted(true);
            setGameTime(data.gameTime);
          }
          break;
          
        case 'new_game':
          // Обновляем судоку при получении нового от сервера
          setBoard(data.board);
          setGame(prev => ({ ...prev, puzzle: data.puzzle }));
          setCompletedCells(0);
          setGameCompleted(false);
          setGameStartTime(data.startTime || Date.now());
          setGameTime(0);
          break;
      }
    };
    
    ws.onclose = () => {
      console.log('Отключено от сервера');
      setIsMultiplayer(false);
      setPlayers([]);
      setGameStartTime(null);
      setCompletedCells(0);
      setGameCompleted(false);
    };
    
    wsRef.current = ws;
  };

  const disconnectFromServer = () => {
    if (wsRef.current) {
      wsRef.current.send(JSON.stringify({
        type: 'leave_game'
      }));
      wsRef.current.close();
      wsRef.current = null;
    }
    setIsMultiplayer(false);
    setPlayers([]);
    setGameStartTime(null);
    setCompletedCells(0);
    setGameCompleted(false);
  };

  const handleChange = (row, col, value) => {
    if (value === "" || (/^[1-9]$/.test(value) && value.length === 1)) {
      const newBoard = board.map((r, i) =>
        r.map((cell, j) => (i === row && j === col ? value : cell))
      );
      setBoard(newBoard);
      
      // Проверяем правильность
      const isCorrect = value === game.solution[row][col].toString();
      if (isCorrect && value !== "") {
        const newCompletedCells = completedCells + 1;
        setCompletedCells(newCompletedCells);
        
        // Проверяем завершение игры
        if (newCompletedCells >= 81) {
          setGameCompleted(true);
          if (wsRef.current) {
            wsRef.current.send(JSON.stringify({
              type: 'game_completed',
              gameTime: Date.now() - gameStartTime
            }));
          }
        }
      }
      
      // Отправляем обновление на сервер
      if (isMultiplayer && wsRef.current) {
        wsRef.current.send(JSON.stringify({
          type: 'cell_update',
          row: row,
          col: col,
          value: value
        }));
      }
    }
  };

  const generateNewGame = () => {
    if (isMultiplayer) {
      // В мультиплеере отправляем новое судоку всем игрокам
      const newGame = generateSudoku();
      setGame(newGame);
      setBoard(newGame.puzzle);
      setCompletedCells(0);
      setGameCompleted(false);
      setGameTime(0);
      
      if (wsRef.current) {
        wsRef.current.send(JSON.stringify({
          type: 'new_game',
          board: newGame.puzzle,
          puzzle: newGame.puzzle
        }));
      }
      return;
    }
    
    const newGame = generateSudoku();
    setGame(newGame);
    setBoard(newGame.puzzle);
    setCompletedCells(0);
    setGameCompleted(false);
    setGameTime(0);
  };

  // Форматирование времени
  const formatTime = (time) => {
    const minutes = Math.floor(time / 60000);
    const seconds = Math.floor((time % 60000) / 1000);
    return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  };

  // Проверяем, правильно ли заполнена ячейка
  const isCellCorrect = (row, col) => {
    const cellValue = board[row][col];
    if (cellValue === "" || game.puzzle[row][col] !== "") {
      return false; // Пустые ячейки и начальные числа не проверяем
    }
    return cellValue === game.solution[row][col].toString();
  };

  // Получаем класс для ячейки
  const getCellClassName = (row, col) => {
    let className = "sudoku-cell";
    if (isCellCorrect(row, col)) {
      className += " correct";
    }
    return className;
  };

  return (
    <div className="sudoku-container">
      <div className="game-header">
        <h1>Судоку {isMultiplayer && "(Мультиплеер)"}</h1>
        {user && (
          <div className="user-info">
            <span>Игрок: {user.username}</span>
            {user.gamesPlayed > 0 && (
              <span>Игр сыграно: {user.gamesPlayed}</span>
            )}
            {user.bestTime && (
              <span>Лучшее время: {formatTime(user.bestTime)}</span>
            )}
          </div>
        )}
        {gameStartTime && (
          <div className="game-time">
            Время игры: {formatTime(gameTime)}
          </div>
        )}
        {completedCells > 0 && (
          <div className="progress-info">
            Заполнено: {completedCells}/81 ячеек
          </div>
        )}
      </div>
      
      {gameCompleted && (
        <div className="game-completed">
          <h2>🎉 Поздравляем! Игра завершена!</h2>
          <p>Время: {formatTime(gameTime)}</p>
        </div>
      )}
      
      <div className="game-controls">
        {!isMultiplayer ? (
          <button className="multiplayer-btn" onClick={connectToServer}>
            Играть онлайн
          </button>
        ) : (
          <button className="multiplayer-btn" onClick={disconnectFromServer}>
            Отключиться
          </button>
        )}
        
        <button className="new-game-btn" onClick={generateNewGame}>
          Новая игра
        </button>
      </div>

      <div className="game-content">
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
                  disabled={game.puzzle[i][j] !== "" || gameCompleted}
                />
              ))}
            </div>
          ))}
        </div>

        {isMultiplayer && (
          <div className="players-panel">
            <h3>Игроки онлайн ({uniquePlayers(players).length})</h3>
            {uniquePlayers(players).map(player => (
              <div key={player.id} className="player-item">
                <div className="player-info">
                  <span className="player-name">{player.username}</span>
                  <span className="player-time">
                    {formatTime(Date.now() - player.joinTime)}
                  </span>
                </div>
                <div className="player-progress">
                  <span className="completed-cells">
                    {player.completedCells}/81
                  </span>
                  <div className="progress-bar">
                    <div 
                      className="progress-fill" 
                      style={{width: `${(player.completedCells / 81) * 100}%`}}
                    ></div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default Sudoku;