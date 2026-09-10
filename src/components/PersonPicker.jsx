import React, { useState, useRef, useEffect } from 'react';

function sortByLastName(list) {
  return [...list].sort((a, b) => (a.lastName || '').localeCompare(b.lastName || '', 'uk'));
}

// Якщо людина вже призначена (напр. партнер уже обраний) — показуємо лише її ім'я з кнопкою "Змінити".
// Інакше — поле пошуку з випадним списком (відсортованим за прізвищем), а не суцільний перелік.
export default function PersonPicker({ people, excludeId, selectedId, onSelect, placeholder }) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const boxRef = useRef(null);

  useEffect(() => {
    function onClickOutside(e) {
      if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, []);

  const selected = selectedId ? people[selectedId] : null;

  if (selected) {
    return (
      <div className="person-picker-selected">
        <span>{selected.firstName} {selected.lastName}</span>
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => onSelect(null)}>Змінити</button>
      </div>
    );
  }

  const candidates = sortByLastName(
    Object.values(people).filter((p) => p.id !== excludeId)
  ).filter((p) => (p.firstName + ' ' + (p.lastName || '')).toLowerCase().includes(query.toLowerCase()));

  return (
    <div ref={boxRef} style={{ position: 'relative' }}>
      <input
        value={query}
        placeholder={placeholder || 'Почніть вводити ім\'я…'}
        onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        autoComplete="off"
      />
      {open && candidates.length > 0 && (
        <div className="autocomplete-list">
          {candidates.map((p) => (
            <div key={p.id} className="autocomplete-item" onClick={() => { onSelect(p.id); setOpen(false); setQuery(''); }}>
              {p.firstName} {p.lastName}
              {p.birthYear || p.birthDate ? (
                <span className="person-meta"> · {p.birthDate ? p.birthDate.slice(0, 4) : p.birthYear}</span>
              ) : null}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
