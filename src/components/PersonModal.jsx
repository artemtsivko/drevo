import React, { useState } from 'react';

const blank = {
  firstName: '', lastName: '', maidenName: '', gender: '',
  birthDate: '', birthYear: '', birthPlace: '',
  deathDate: '', deathPlace: '', bio: '',
  parentIds: [], childIds: [], spouseIds: [],
};

export default function PersonModal({ person, people, onSave, onClose, onDelete, readOnly }) {
  const [form, setForm] = useState({ ...blank, ...(person || {}) });

  const others = Object.values(people).filter((p) => p.id !== form.id);
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const toggleRel = (key, id) => {
    const list = form[key] || [];
    set(key, list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);
  };

  const parents = form.parentIds || [];

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h3>{form.id ? (readOnly ? 'Профіль родича' : 'Редагувати родича') : 'Новий родич'}</h3>
          <button className="x-btn" onClick={onClose}>×</button>
        </div>
        <div className="modal-body stack">
          <div className="grid-2">
            <div>
              <label>Ім'я *</label>
              <input value={form.firstName} disabled={readOnly}
                onChange={(e) => set('firstName', e.target.value)} />
            </div>
            <div>
              <label>Прізвище</label>
              <input value={form.lastName} disabled={readOnly}
                onChange={(e) => set('lastName', e.target.value)} />
            </div>
          </div>

          <div className="grid-2">
            <div>
              <label>Дівоче прізвище</label>
              <input value={form.maidenName} disabled={readOnly}
                onChange={(e) => set('maidenName', e.target.value)} />
            </div>
            <div>
              <label>Стать</label>
              <select value={form.gender} disabled={readOnly}
                onChange={(e) => set('gender', e.target.value)}>
                <option value="">—</option>
                <option value="m">Чоловік</option>
                <option value="f">Жінка</option>
              </select>
            </div>
          </div>

          <div className="grid-2">
            <div>
              <label>Дата народження</label>
              <input type="date" value={form.birthDate} disabled={readOnly}
                onChange={(e) => set('birthDate', e.target.value)} />
            </div>
            <div>
              <label>Рік (якщо дата невідома)</label>
              <input type="number" placeholder="напр. 1925" value={form.birthYear} disabled={readOnly}
                onChange={(e) => set('birthYear', e.target.value)} />
            </div>
          </div>

          <div>
            <label>Місце народження</label>
            <input value={form.birthPlace} disabled={readOnly}
              onChange={(e) => set('birthPlace', e.target.value)} />
          </div>

          <div className="grid-2">
            <div>
              <label>Дата смерті</label>
              <input type="date" value={form.deathDate} disabled={readOnly}
                onChange={(e) => set('deathDate', e.target.value)} />
            </div>
            <div>
              <label>Місце смерті</label>
              <input value={form.deathPlace} disabled={readOnly}
                onChange={(e) => set('deathPlace', e.target.value)} />
            </div>
          </div>

          <div>
            <label>Нотатки / біографія</label>
            <textarea rows={3} value={form.bio} disabled={readOnly}
              onChange={(e) => set('bio', e.target.value)} />
          </div>

          {!readOnly && others.length > 0 && (
            <>
              <div>
                <label>Батьки (оберіть до 2)</label>
                <div className="stack" style={{ maxHeight: 130, overflowY: 'auto', gap: 4 }}>
                  {others.map((p) => (
                    <label key={p.id} style={{ display: 'flex', gap: 8, fontWeight: 400, alignItems: 'center' }}>
                      <input type="checkbox" style={{ width: 'auto' }}
                        checked={parents.includes(p.id)}
                        disabled={!parents.includes(p.id) && parents.length >= 2}
                        onChange={() => toggleRel('parentIds', p.id)} />
                      {p.firstName} {p.lastName}
                    </label>
                  ))}
                </div>
              </div>
              <div>
                <label>Дружина / чоловік</label>
                <div className="stack" style={{ maxHeight: 110, overflowY: 'auto', gap: 4 }}>
                  {others.map((p) => (
                    <label key={p.id} style={{ display: 'flex', gap: 8, fontWeight: 400, alignItems: 'center' }}>
                      <input type="checkbox" style={{ width: 'auto' }}
                        checked={(form.spouseIds || []).includes(p.id)}
                        onChange={() => toggleRel('spouseIds', p.id)} />
                      {p.firstName} {p.lastName}
                    </label>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>

        <div className="modal-foot">
          {form.id && !readOnly && (
            <button className="btn btn-danger btn-sm" onClick={() => onDelete(form.id)}>Видалити</button>
          )}
          <div className="header-spacer" />
          <button className="btn btn-ghost" onClick={onClose}>Закрити</button>
          {!readOnly && (
            <button className="btn" disabled={!form.firstName.trim()}
              onClick={() => onSave(form)}>Зберегти</button>
          )}
        </div>
      </div>
    </div>
  );
}
