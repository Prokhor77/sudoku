import React, { useState, useEffect } from "react";
import Auth from "./components/Auth";
import Sudoku from "./components/Sudoku";
import AppBar from '@mui/material/AppBar';
import Toolbar from '@mui/material/Toolbar';
import Typography from '@mui/material/Typography';
import Box from '@mui/material/Box';
import CircularProgress from '@mui/material/CircularProgress';
import Avatar from '@mui/material/Avatar';
import Stack from '@mui/material/Stack';
import LogoutIcon from '@mui/icons-material/Logout';
import AccountCircleIcon from '@mui/icons-material/AccountCircle';
import Button from '@mui/material/Button';
import "./App.css";

function App() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
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
    localStorage.removeItem("user");
  };

  if (loading) {
    return (
      <Box sx={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', bgcolor: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)' }}>
        <CircularProgress color="primary" size={48} sx={{ mb: 2 }} />
        <Typography color="white" variant="h6">Загрузка...</Typography>
      </Box>
    );
  }

  if (!user) {
    return <Auth onLogin={handleLogin} />;
  }

  return (
    <Box sx={{ minHeight: '100vh', bgcolor: '#f5f5f5', m: 0, p: 0 }}>
      <AppBar position="fixed" color="primary" elevation={3} sx={{ boxShadow: 2, m: 0, p: 0 }}>
        <Toolbar disableGutters sx={{ minHeight: 56, width: '100%', m: 0, p: 0 }}>
          <Box sx={{ flex: 1, display: 'flex', alignItems: 'center', m: 0, p: 0 }}>
            <Typography variant="h6" component="div" sx={{ fontWeight: 700, letterSpacing: 1, color: 'white', pl: 4, pr: 2 }}>
              Sudoku Multiplayer
            </Typography>
          </Box>
          <Box sx={{ display: 'flex', alignItems: 'center', pr: 4 }}>
            <Stack direction="row" spacing={1} alignItems="center">
              <Avatar sx={{ bgcolor: 'white', color: 'primary.main', width: 32, height: 32 }}>
                <AccountCircleIcon />
              </Avatar>
              <Typography variant="body1" sx={{ fontWeight: 700, color: 'white', letterSpacing: 0.5 }}>
                {user.username}
              </Typography>
            </Stack>
            <Button
              color="inherit"
              startIcon={<LogoutIcon />}
              onClick={handleLogout}
              sx={{ fontWeight: 600, ml: 2 }}
            >
              Выйти
            </Button>
          </Box>
        </Toolbar>
      </AppBar>
      {/* Отступ для фиксированной шапки */}
      <Toolbar disableGutters sx={{ minHeight: 56, p: 0, m: 0 }} />
      <Sudoku user={user} />
    </Box>
  );
}

export default App;
