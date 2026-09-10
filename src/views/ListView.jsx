import React, { useState } from 'react';

function initials(p) {
  return ((p.firstName || '?')[0] + (p.lastName ? p.lastName[0] : '')).toUpperCase();
}
function lifespan(p) {
  const b = p.birthDate ? p.birthDate.slice(0, 4) : p.birthYear;
  const d = p.deathDate ? p.deathDate.slice(0, 4) : '';
  if (!b && !d) return '';
  return `${b || '?'}${d ? ' – ' + d : ''}`;
}

export default function ListView({ people, sharedIds, onOpen }) {
  const [q, setQ] = useState('');
  const list = Object.values(people)
    .filter((p) => {
      const s = (p.firstName + ' ' + p.lastName + ' ' + p.birthPlace).toLowerCase();
      return s.includes(q.toLowerCase());
    })
    .sort((a, b) => (a.lastName || '').localeCompare(b.lastName || '', 'uk'));

  if (Object.keys(people).length === 0) {
    return (
      <div className="empty">
        <div className="empty-emoji">🌳</div>
        Ще немає жодного родича. Натисніть «Додати родича», щоб почати родовід.
      </div>
    );
  }

  return (
    <div className="stack">
      <input placeholder="Пошук за іменем чи місцем…" value={q} onChange={(e) => setQ(e.target.value)} />
      <div className="stack">
        {list.map((p) => (
          <div key={p.id} className="person" onClick={() => onOpen(p)} style={{ cursor: 'pointer' }}>
            <div className="avatar">
              {p.photoURL ? <img src={p.photoURL} alt="" /> : initials(p)}
            </div>
            <div style={{ flex: 1 }}>
              <div className="person-name">
                {p.firstName} {p.lastName}
                {p.maidenName ? <span className="person-meta"> (уродж. {p.maidenName})</span> : null}
              </div>
              <div className="person-meta">
                {lifespan(p)}{p.birthPlace ? ` · ${p.birthPlace}` : ''}
              </div>
            </div>
            {p.isSelf && <span className="shared-tag" style={{ color: '#2c5038', borderColor: '#2c5038' }}>це я</span>}
            {sharedIds.has(p.id) && <span className="shared-tag">спільний</span>}
          </div>
        ))}
      </div>
    </div>
  );
}
