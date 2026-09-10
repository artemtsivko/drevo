import React from 'react';

// Вибір статі кнопками замість select
export default function GenderPicker({ value, onChange }) {
  return (
    <div>
      <label>Стать</label>
      <div className="row" style={{ gap: 8 }}>
        <button
          type="button"
          onClick={() => onChange('m')}
          className={`gender-btn gender-m ${value === 'm' ? 'active' : ''}`}
        >
          👨 Чоловік
        </button>
        <button
          type="button"
          onClick={() => onChange('f')}
          className={`gender-btn gender-f ${value === 'f' ? 'active' : ''}`}
        >
          👩 Жінка
        </button>
      </div>
    </div>
  );
}
