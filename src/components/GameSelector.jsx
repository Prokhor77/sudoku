import React from "react";
import "./GameSelector.css";

function GameSelector({ onGameSelect }) {
  return (
    <div className="game-selector">
      <div className="selector-container">
        <h1 className="selector-title">Выберите режим игры</h1>
        
        <div className="game-options">
          <div className="game-option" onClick={() => onGameSelect('classic')}>
            <div className="option-icon">🧩</div>
            <h2>Классическая Судоку</h2>
            <p>Традиционная игра в судоку 9x9</p>
            <ul>
              <li>Одиночная игра</li>
              <li>Мультиплеер режим</li>
              <li>Классические правила</li>
            </ul>
          </div>
          
          <div className="game-option" onClick={() => onGameSelect('battle')}>
            <div className="option-icon">⚔️</div>
            <h2>Судоку + Морской Бой</h2>
            <p>Новый режим: заполняйте судоку и атакуйте соперника!</p>
            <ul>
              <li>Два игрока против друг друга</li>
              <li>Заполняйте строки и квадраты</li>
              <li>Получайте бомбочки за достижения</li>
              <li>Атакуйте соперника</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}

export default GameSelector; 