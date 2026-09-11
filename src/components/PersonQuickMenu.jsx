import React, { useState } from 'react';
import PersonPicker from './PersonPicker.jsx';

const RELATION_LABEL = {
  father: 'батька',
  mother: 'матір',
  partner: 'партнера',
  child: 'дитину',
  sibling: 'брата/сестру',
};

// Контекстна менюшка при кліку на картці людини.
// Для дій "додати X" спершу пропонує вибір: нова людина чи вже наявна в дереві.
export default function PersonQuickMenu({
  x, y, person, people,
  onEdit, onAddNew, onLinkExisting, onClose,
  hasFather, hasMother, hasPartner,
}) {
  const [relationMode, setRelationMode] = useState(null); // 'father' | 'mother' | 'partner' | 'child' | 'sibling' | null
  const [pickMode, setPickMode] = useState(false); // показуємо пошук наявної людини

  const startRelation = (rel) => { setRelationMode(rel); setPickMode(false); };

  const excludeId = person.id;
  const hasAnyParent = hasFather || hasMother;

  return (
    <div className="quick-menu-backdrop" onClick={onClose}>
      <div className="quick-menu" style={{ left: x, top: y }} onClick={(e) => e.stopPropagation()}>
        {!relationMode && (
          <>
            <div className="quick-menu-title">{person.firstName} {person.lastName}</div>
            <button onClick={onEdit}>✏️ Редагувати</button>
            {!hasFather && <button onClick={() => startRelation('father')}>👨 Додати батька</button>}
            {!hasMother && <button onClick={() => startRelation('mother')}>👩 Додати матір</button>}
            {!hasPartner && <button onClick={() => startRelation('partner')}>💍 Додати партнера</button>}
            <button onClick={() => startRelation('child')}>👶 Додати дитину</button>
            {hasAnyParent && <button onClick={() => startRelation('sibling')}>👫 Додати брата/сестру</button>}
          </>
        )}

        {relationMode && !pickMode && (
          <>
            <div className="quick-menu-title">Додати {RELATION_LABEL[relationMode]}</div>
            <button onClick={() => onAddNew(relationMode)}>✨ Нова людина</button>
            <button onClick={() => setPickMode(true)}>🔎 Обрати з наявних</button>
            <button onClick={() => setRelationMode(null)}>← Назад</button>
          </>
        )}

        {relationMode && pickMode && (
          <div style={{ padding: '4px 8px 8px', minWidth: 220 }}>
            <div className="quick-menu-title" style={{ border: 'none', marginBottom: 6 }}>
              Кого обрати як {RELATION_LABEL[relationMode]}?
            </div>
            <PersonPicker
              people={people}
              excludeId={excludeId}
              selectedId={null}
              onSelect={(id) => { if (id) onLinkExisting(relationMode, id); }}
              placeholder="Пошук за іменем…"
            />
            <button style={{ marginTop: 6 }} onClick={() => setPickMode(false)}>← Назад</button>
          </div>
        )}
      </div>
    </div>
  );
}
