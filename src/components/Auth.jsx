import React, { useState } from "react";
import "./Auth.css";

function Auth({ onLogin }) {
  const [isLogin, setIsLogin] = useState(true);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setMessage("");

    if (!username.trim() || !password.trim()) {
      setMessage("Заполните все поля");
      setLoading(false);
      return;
    }

    try {
      const endpoint = isLogin ? "/api/login" : "/api/register";
      const response = await fetch(`http://localhost:3001${endpoint}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ username, password }),
      });

      const data = await response.json();

      if (data.success) {
        setMessage(data.message);
        if (isLogin) {
          // Сохраняем данные пользователя
          localStorage.setItem("user", JSON.stringify(data.userData));
          onLogin(data.userData);
        } else {
          // После регистрации переключаемся на вход
          setIsLogin(true);
          setPassword("");
        }
      } else {
        setMessage(data.message);
      }
    } catch (error) {
      setMessage("Ошибка соединения с сервером");
    }

    setLoading(false);
  };

  return (
    <div className="auth-container">
      <div className="auth-card">
        <h2>{isLogin ? "Вход в игру" : "Регистрация"}</h2>
        
        {message && (
          <div className={`message ${message.includes("успеш") ? "success" : "error"}`}>
            {message}
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label htmlFor="username">Имя пользователя:</label>
            <input
              type="text"
              id="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="Введите имя пользователя"
              disabled={loading}
            />
          </div>

          <div className="form-group">
            <label htmlFor="password">Пароль:</label>
            <input
              type="password"
              id="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Введите пароль"
              disabled={loading}
            />
          </div>

          <button type="submit" className="auth-btn" disabled={loading}>
            {loading ? "Загрузка..." : (isLogin ? "Войти" : "Зарегистрироваться")}
          </button>
        </form>

        <div className="auth-switch">
          <p>
            {isLogin ? "Нет аккаунта?" : "Уже есть аккаунт?"}{" "}
            <button
              type="button"
              onClick={() => {
                setIsLogin(!isLogin);
                setMessage("");
                setPassword("");
              }}
              disabled={loading}
            >
              {isLogin ? "Зарегистрироваться" : "Войти"}
            </button>
          </p>
        </div>
      </div>
    </div>
  );
}

export default Auth; 