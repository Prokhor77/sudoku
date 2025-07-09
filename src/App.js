import React, { useState, useEffect } from "react";
import Auth from "./components/Auth";
import Sudoku from "./components/Sudoku";
import SudokuBattle from "./components/SudokuBattle";
import GameSelector from "./components/GameSelector";
import AdminPanel from "./components/AdminPanel";
import "./App.css";

function App() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [gameMode, setGameMode] = useState(null); // null, 'classic', 'battle'
  const [showAdminPanel, setShowAdminPanel] = useState(false);

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
    setShowAdminPanel(false);
  };

  const handleAdminPanel = () => {
    setShowAdminPanel(true);
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

  // Защита: только admin может видеть админку
  if (showAdminPanel && user.username !== 'admin') {
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
        <div style={{padding: 40, textAlign: 'center', color: 'red', fontWeight: 'bold', fontSize: '1.5rem'}}>
          Доступ к административной панели запрещён
        </div>
        <button className="back-btn" onClick={handleBackToMenu} style={{marginTop: 20}}>
          ← Назад в меню
        </button>
      </div>
    );
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
      
      {showAdminPanel ? (
        <AdminPanel onBackToMenu={handleBackToMenu} />
      ) : gameMode === null ? (
        <GameSelector onGameSelect={handleGameSelect} onAdminPanel={handleAdminPanel} isAdmin={user.username === 'admin'} />
      ) : gameMode === 'classic' ? (
        <Sudoku user={user} onBackToMenu={handleBackToMenu} />
      ) : (
        <SudokuBattle user={user} onBackToMenu={handleBackToMenu} />
      )}
    </div>
  );
}

export default App;
