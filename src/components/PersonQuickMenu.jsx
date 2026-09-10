import React from 'react';

// Невелика контекстна менюшка: зʼявляється біля картки людини при кліку.
export default function PersonQuickMenu({ x, y, person, onEdit, onAddFather, onAddMother, onAddPartner, onAddChild, onClose, hasFather, hasMother }) {
  return (
    <div className="quick-menu-backdrop" onClick={onClose}>
      <div
        className="quick-menu"
        style={{ left: x, top: y }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="quick-menu-title">{person.firstName} {person.lastName}</div>
        <button onClick={onEdit}>✏️ Редагувати</button>
        {!hasFather && <button onClick={onAddFather}>👨 Додати батька</button>}
        {!hasMother && <button onClick={onAddMother}>👩 Додати матір</button>}
        <button onClick={onAddPartner}>💍 Додати партнера</button>
        <button onClick={onAddChild}>👶 Додати дитину</button>
      </div>
    </div>
  );
}
