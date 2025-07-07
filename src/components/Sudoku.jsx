import React, { useState, useEffect, useRef } from "react";
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Paper from '@mui/material/Paper';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import LinearProgress from '@mui/material/LinearProgress';
import Stack from '@mui/material/Stack';
import List from '@mui/material/List';
import ListItem from '@mui/material/ListItem';
import Divider from '@mui/material/Divider';
import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';

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
          
        default:
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
    <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3, maxWidth: 1200, mx: 'auto', p: 2 }}>
      <Typography variant="h4" align="center" sx={{ mt: 2, mb: 1 }}>
        Судоку {isMultiplayer && <span style={{ color: '#1976d2' }}>(Мультиплеер)</span>}
      </Typography>
      <Stack direction="row" spacing={2} alignItems="center" justifyContent="center">
        <Button variant={isMultiplayer ? "contained" : "outlined"} color="primary" onClick={isMultiplayer ? disconnectFromServer : connectToServer}>
          {isMultiplayer ? "Отключиться" : "Играть онлайн"}
        </Button>
        <Button variant="contained" color="success" onClick={generateNewGame}>
          Новая игра
        </Button>
      </Stack>
      <Box sx={{ display: 'flex', gap: 4, width: '100%', justifyContent: 'center' }}>
        <Paper elevation={4} sx={{ p: 3, bgcolor: '#fff', borderRadius: 3 }}>
          <Box sx={{ mb: 2 }}>
            <Typography variant="subtitle1" color="text.secondary">
              Игрок: <b>{user.username}</b>
            </Typography>
            {user.gamesPlayed > 0 && (
              <Typography variant="body2" color="text.secondary">Игр сыграно: {user.gamesPlayed}</Typography>
            )}
            {user.bestTime && (
              <Typography variant="body2" color="text.secondary">Лучшее время: {formatTime(user.bestTime)}</Typography>
            )}
            {gameStartTime && (
              <Typography variant="h6" color="primary" sx={{ mt: 1 }}>
                Время игры: {formatTime(gameTime)}
              </Typography>
            )}
            {completedCells > 0 && (
              <Typography variant="body2" color="success.main" sx={{ mt: 1 }}>
                Заполнено: {completedCells}/81 ячеек
              </Typography>
            )}
          </Box>
          {gameCompleted && (
            <Alert severity="success" sx={{ mb: 2 }}>
              <Typography variant="h6">🎉 Поздравляем! Игра завершена!</Typography>
              <Typography>Время: {formatTime(gameTime)}</Typography>
            </Alert>
          )}
          <Box sx={{ display: 'inline-block', border: '3px solid #333', bgcolor: '#f9f9f9', mb: 2 }}>
            {board.map((row, i) => (
              <Box key={i} sx={{ display: 'flex' }}>
                {row.map((cell, j) => (
                  <input
                    className={getCellClassName(i, j)}
                    key={j}
                    value={cell}
                    onChange={(e) => handleChange(i, j, e.target.value)}
                    maxLength={1}
                    disabled={game.puzzle[i][j] !== "" || gameCompleted}
                    style={{
                      width: 50, height: 50, textAlign: 'center', fontSize: 24, fontWeight: 'bold',
                      border: '1px solid #ccc', background: game.puzzle[i][j] !== "" ? '#f0f0f0' : '#fff',
                      outline: 'none', transition: 'background-color 0.3s',
                      borderRight: (j + 1) % 3 === 0 && j !== 8 ? '3px solid #333' : undefined,
                      borderBottom: (i + 1) % 3 === 0 && i !== 8 ? '3px solid #333' : undefined,
                      color: game.puzzle[i][j] !== "" ? '#333' : undefined,
                      borderRadius: 0
                    }}
                  />
                ))}
              </Box>
            ))}
          </Box>
        </Paper>
        <Card sx={{ minWidth: 300, maxWidth: 350, bgcolor: '#f8f9fa', borderRadius: 3, boxShadow: 3 }}>
          <CardContent>
            <Typography variant="h6" align="center" gutterBottom>
              Игроки онлайн ({uniquePlayers(players).length})
            </Typography>
            <Divider sx={{ mb: 2 }} />
            <List>
              {uniquePlayers(players).map(player => (
                <ListItem key={player.id} sx={{ flexDirection: 'column', alignItems: 'flex-start', mb: 2, p: 0 }}>
                  <Box sx={{ width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Typography variant="subtitle1" fontWeight={600}>{player.username}</Typography>
                    <Typography variant="caption" color="text.secondary">{formatTime(Date.now() - player.joinTime)}</Typography>
                  </Box>
                  <Box sx={{ width: '100%', mt: 1 }}>
                    <LinearProgress variant="determinate" value={player.completedCells / 81 * 100} sx={{ height: 8, borderRadius: 5 }} />
                    <Typography variant="caption" color="text.secondary">{player.completedCells}/81</Typography>
                  </Box>
                </ListItem>
              ))}
            </List>
          </CardContent>
        </Card>
      </Box>
    </Box>
  );
}

export default Sudoku;