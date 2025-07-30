import React, { useState, useEffect } from "react";
import "./AdminPanel.css";

function AdminPanel({ onBackToMenu }) {
  const [stats, setStats] = useState(null);
  const [games, setGames] = useState([]);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('stats');
  const [filters, setFilters] = useState({
    page: 1,
    limit: 20,
    username: '',
    gameMode: '',
    dateFrom: '',
    dateTo: ''
  });

  useEffect(() => {
    loadStats();
    loadGames();
    loadUsers();
  }, []);

  const loadStats = async () => {
    try {
      const response = await fetch('http://localhost:3001/api/admin/stats', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({})
      });
      const data = await response.json();
      setStats(data);
    } catch (error) {
      console.error('Ошибка загрузки статистики:', error);
    }
  };

  const loadGames = async () => {
    try {
      const response = await fetch('http://localhost:3001/api/admin/games', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(filters)
      });
      const data = await response.json();
      setGames(data);
    } catch (error) {
      console.error('Ошибка загрузки игр:', error);
    }
  };

  const loadUsers = async () => {
    try {
      const response = await fetch('http://localhost:3001/api/admin/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({})
      });
      const data = await response.json();
      setUsers(data);
    } catch (error) {
      console.error('Ошибка загрузки пользователей:', error);
    } finally {
      setLoading(false);
    }
  };

  const formatTime = (time) => {
    if (!time) return 'Н/Д';
    const minutes = Math.floor(time / 60000);
    const seconds = Math.floor((time % 60000) / 1000);
    return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  };

  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleString('ru-RU');
  };

  const handleFilterChange = (key, value) => {
    setFilters(prev => ({ ...prev, [key]: value, page: 1 }));
  };

  const handlePageChange = (newPage) => {
    setFilters(prev => ({ ...prev, page: newPage }));
  };

  useEffect(() => {
    if (activeTab === 'games') {
      loadGames();
    }
  }, [filters, activeTab]);

  if (loading) {
    return (
      <div className="admin-loading">
        <div className="loading-spinner"></div>
        <p>Загрузка административной панели...</p>
      </div>
    );
  }

  return (
    <div className="admin-panel">
      <div className="admin-header">
        <h1>Административная панель</h1>
        <button className="back-btn" onClick={onBackToMenu}>
          ← Назад в меню
        </button>
      </div>

      <div className="admin-tabs">
        <button 
          className={`tab-btn ${activeTab === 'stats' ? 'active' : ''}`}
          onClick={() => setActiveTab('stats')}
        >
          Статистика
        </button>
        <button 
          className={`tab-btn ${activeTab === 'games' ? 'active' : ''}`}
          onClick={() => setActiveTab('games')}
        >
          Игры
        </button>
        <button 
          className={`tab-btn ${activeTab === 'users' ? 'active' : ''}`}
          onClick={() => setActiveTab('users')}
        >
          Пользователи
        </button>
      </div>

      <div className="admin-content">
        {activeTab === 'stats' && stats && (
          <div className="stats-section">
            <div className="stats-grid">
              <div className="stat-card">
                <h3>Общая статистика</h3>
                <div className="stat-item">
                  <span>Всего игр:</span>
                  <span className="stat-value">{stats.gameStatistics.totalGames}</span>
                </div>
                <div className="stat-item">
                  <span>Среднее время:</span>
                  <span className="stat-value">{formatTime(stats.gameStatistics.averageGameTime)}</span>
                </div>
                <div className="stat-item">
                  <span>Классических игр:</span>
                  <span className="stat-value">{stats.gameStatistics.gamesByMode.classic}</span>
                </div>
                <div className="stat-item">
                  <span>Боевых игр:</span>
                  <span className="stat-value">{stats.gameStatistics.gamesByMode.battle}</span>
                </div>
              </div>

              <div className="stat-card">
                <h3>Пользователи</h3>
                <div className="stat-item">
                  <span>Всего пользователей:</span>
                  <span className="stat-value">{stats.userStatistics.totalUsers}</span>
                </div>
                <div className="stat-item">
                  <span>Активных:</span>
                  <span className="stat-value">{stats.userStatistics.activeUsers}</span>
                </div>
                <div className="stat-item">
                  <span>Онлайн:</span>
                  <span className="stat-value">{stats.userStatistics.onlineUsers}</span>
                </div>
              </div>

              <div className="stat-card">
                <h3>Рекорды</h3>
                {stats.gameStatistics.fastestGame ? (
                  <>
                    <div className="stat-item">
                      <span>Самое быстрое время:</span>
                      <span className="stat-value">{formatTime(stats.gameStatistics.fastestGame.gameTime)}</span>
                    </div>
                    <div className="stat-item">
                      <span>Игрок:</span>
                      <span className="stat-value">{stats.gameStatistics.fastestGame.username}</span>
                    </div>
                  </>
                ) : (
                  <div className="stat-item">
                    <span>Нет данных</span>
                  </div>
                )}
              </div>

              <div className="stat-card">
                <h3>Самый активный игрок</h3>
                {stats.gameStatistics.mostActivePlayer ? (
                  <>
                    <div className="stat-item">
                      <span>Игрок:</span>
                      <span className="stat-value">{stats.gameStatistics.mostActivePlayer.username}</span>
                    </div>
                    <div className="stat-item">
                      <span>Игр сыграно:</span>
                      <span className="stat-value">{stats.gameStatistics.mostActivePlayer.gamesPlayed}</span>
                    </div>
                  </>
                ) : (
                  <div className="stat-item">
                    <span>Нет данных</span>
                  </div>
                )}
              </div>
            </div>

            <div className="recent-games">
              <h3>Последние игры</h3>
              <div className="games-table">
                <table>
                  <thead>
                    <tr>
                      <th>Игрок</th>
                      <th>Режим</th>
                      <th>Время</th>
                      <th>Дата</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stats.recentGames.map(game => (
                      <tr key={game.id}>
                        <td>{game.username}</td>
                        <td>{game.gameMode === 'classic' ? 'Классика' : 'Бой'}</td>
                        <td>{formatTime(game.gameTime)}</td>
                        <td>{formatDate(game.date)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="top-players">
              <h3>Топ игроков</h3>
              <div className="players-table">
                <table>
                  <thead>
                    <tr>
                      <th>Место</th>
                      <th>Игрок</th>
                      <th>Игр сыграно</th>
                      <th>Лучшее время</th>
                      <th>Среднее время</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stats.topPlayers.map((player, index) => (
                      <tr key={player.username}>
                        <td>{index + 1}</td>
                        <td>{player.username}</td>
                        <td>{player.gamesPlayed}</td>
                        <td>{formatTime(player.bestTime)}</td>
                        <td>{formatTime(player.averageTime)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'games' && (
          <div className="games-section">
            <div className="filters">
              <input
                type="text"
                placeholder="Поиск по игроку"
                value={filters.username}
                onChange={(e) => handleFilterChange('username', e.target.value)}
              />
              <select
                value={filters.gameMode}
                onChange={(e) => handleFilterChange('gameMode', e.target.value)}
              >
                <option value="">Все режимы</option>
                <option value="classic">Классика</option>
                <option value="battle">Бой</option>
              </select>
              <input
                type="date"
                value={filters.dateFrom}
                onChange={(e) => handleFilterChange('dateFrom', e.target.value)}
              />
              <input
                type="date"
                value={filters.dateTo}
                onChange={(e) => handleFilterChange('dateTo', e.target.value)}
              />
            </div>

            <div className="games-table">
              <table>
                <thead>
                  <tr>
                    <th>ID</th>
                    <th>Игрок</th>
                    <th>Режим</th>
                    <th>Время</th>
                    <th>Сложность</th>
                    <th>Мультиплеер</th>
                    <th>Дата</th>
                  </tr>
                </thead>
                <tbody>
                  {games.results?.map(game => (
                    <tr key={game.id}>
                      <td>{game.id.slice(-8)}</td>
                      <td>{game.username}</td>
                      <td>{game.gameMode === 'classic' ? 'Классика' : 'Бой'}</td>
                      <td>{formatTime(game.gameTime)}</td>
                      <td>{game.difficulty || 'Средняя'}</td>
                      <td>{game.multiplayer ? 'Да' : 'Нет'}</td>
                      <td>{formatDate(game.date)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {games.totalPages > 1 && (
              <div className="pagination">
                <button
                  disabled={filters.page <= 1}
                  onClick={() => handlePageChange(filters.page - 1)}
                >
                  ←
                </button>
                <span>Страница {filters.page} из {games.totalPages}</span>
                <button
                  disabled={filters.page >= games.totalPages}
                  onClick={() => handlePageChange(filters.page + 1)}
                >
                  →
                </button>
              </div>
            )}
          </div>
        )}

        {activeTab === 'users' && (
          <div className="users-section">
            <div className="users-table">
              <table>
                <thead>
                  <tr>
                    <th>Пользователь</th>
                    <th>Дата регистрации</th>
                    <th>Игр сыграно</th>
                    <th>Лучшее время</th>
                    <th>Среднее время</th>
                    <th>Последняя игра</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map(user => (
                    <tr key={user.username}>
                      <td>{user.username}</td>
                      <td>{formatDate(user.createdAt)}</td>
                      <td>{user.totalGames}</td>
                      <td>{formatTime(user.bestTimeFromResults)}</td>
                      <td>{formatTime(user.averageTime)}</td>
                      <td>{user.lastGame ? formatDate(user.lastGame) : 'Нет'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default AdminPanel; 