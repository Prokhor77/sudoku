import React, { useState, useEffect } from "react";
import Auth from "./components/Auth";
import Sudoku from "./components/Sudoku";
import SudokuBattle from "./components/SudokuBattle";
import GameSelector from "./components/GameSelector";
import "./App.css";

function App() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [gameMode, setGameMode] = useState(null); // null, 'classic', 'battle'

  useEffect(() => {
    // Проверяем, есть ли сохраненный пользователь
    const savedUser = localStorage.getItem("user");
    if (savedUser) {
      try {
        setUser(JSON.parse(savedUser));
      } catch (error) {
        localStorage.removeItem("user");
      }
    }
    setLoading(false);
  }, []);

  const handleLogin = (userData) => {
    setUser(userData);
  };

  const handleLogout = () => {
    setUser(null);
    setGameMode(null);
    localStorage.removeItem("user");
  };

  const handleGameSelect = (mode) => {
    setGameMode(mode);
  };

  const handleBackToMenu = () => {
    setGameMode(null);
  };

  if (loading) {
    return (
      <div className="loading">
        <div className="loading-spinner"></div>
        <p>Загрузка...</p>
      </div>
    );
  }

  if (!user) {
    return <Auth onLogin={handleLogin} />;
  }

  return (
    <div className="App">
      <div className="header">
        <div className="user-section">
          <span className="welcome">Добро пожаловать, {user.username}!</span>
          <button className="logout-btn" onClick={handleLogout}>
            Выйти
          </button>
        </div>
      </div>
      
      {gameMode === null ? (
        <GameSelector onGameSelect={handleGameSelect} />
      ) : gameMode === 'classic' ? (
        <Sudoku user={user} onBackToMenu={handleBackToMenu} />
      ) : (
        <SudokuBattle user={user} onBackToMenu={handleBackToMenu} />
      )}
    </div>
  );
}

export default App;
