import React, { useState } from "react";
import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Typography from '@mui/material/Typography';
import TextField from '@mui/material/TextField';
import Button from '@mui/material/Button';
import Alert from '@mui/material/Alert';

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
    <Box sx={{ minHeight: '100vh', bgcolor: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center', p: 2 }}>
      <Card sx={{ maxWidth: 400, width: '100%', borderRadius: 3, boxShadow: 6 }}>
        <CardContent>
          <Typography variant="h5" align="center" gutterBottom>
            {isLogin ? "Вход в игру" : "Регистрация"}
          </Typography>

          {message && (
            <Alert severity={message.includes("успеш") ? "success" : "error"} sx={{ mb: 2 }}>
              {message}
            </Alert>
          )}

          <Box component="form" onSubmit={handleSubmit} sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <TextField
              label="Имя пользователя"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              disabled={loading}
              autoFocus
              fullWidth
            />
            <TextField
              label="Пароль"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={loading}
              fullWidth
            />
            <Button type="submit" variant="contained" color={isLogin ? "primary" : "success"} disabled={loading} fullWidth size="large">
              {loading ? "Загрузка..." : (isLogin ? "Войти" : "Зарегистрироваться")}
            </Button>
          </Box>

          <Box sx={{ mt: 3, textAlign: 'center' }}>
            <Typography variant="body2" color="text.secondary">
              {isLogin ? "Нет аккаунта?" : "Уже есть аккаунт?"}
              <Button
                variant="text"
                size="small"
                onClick={() => {
                  setIsLogin(!isLogin);
                  setMessage("");
                  setPassword("");
                }}
                disabled={loading}
                sx={{ ml: 1 }}
              >
                {isLogin ? "Зарегистрироваться" : "Войти"}
              </Button>
            </Typography>
          </Box>
        </CardContent>
      </Card>
    </Box>
  );
}

export default Auth; 