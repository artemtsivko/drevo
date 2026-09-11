import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import GenderPicker from './GenderPicker.jsx';
import PlaceInput from './PlaceInput.jsx';
import PersonPicker from './PersonPicker.jsx';

const blank = {
  firstName: '', lastName: '', maidenName: '', gender: '',
  birthDate: '', birthYear: '', birthPlace: '',
  deathDate: '', deathPlace: '', bio: '',
  parentIds: [], childIds: [], spouseIds: [],
};

export default function PersonModal({ person, people, onSave, onClose, onDelete, readOnly }) {
  const [form, setForm] = useState({ ...blank, ...(person || {}) });

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const parents = form.parentIds || [];
  const father = parents.find((id) => people[id] && people[id].gender !== 'f') || parents[0] || null;
  const mother = parents.find((id) => people[id] && people[id].gender === 'f' && id !== father) || null;

  const setParent = (slot, id) => {
    let next = [...parents];
    if (slot === 'father') {
      next = next.filter((x) => x !== father);
      if (id) next.push(id);
    } else {
      next = next.filter((x) => x !== mother);
      if (id) next.push(id);
    }
    set('parentIds', next.filter(Boolean));
  };

  const spouseId = (form.spouseIds || [])[0] || null;
  const setSpouse = (id) => set('spouseIds', id ? [id] : []);

  const createdByName = person && person.createdByName;
  const lastEditedByName = person && person.lastEditedByName;
  const editedByDifferent = createdByName && lastEditedByName && lastEditedByName !== createdByName;

  // Якщо форма відкрита через швидке додавання (квік-меню "Додати батька/матір/партнера/дитину"),
  // звʼязок вже заданий тим, звідки її відкрили (childIds/parentIds/spouseIds у префілі) —
  // не показуємо додаткові поля вибору батьків/партнера для щойно створюваної людини,
  // це і зайве, і подовжує форму без потреби.
  const isQuickAdd = !form.id && (
    (form.childIds && form.childIds.length > 0) ||
    (form.parentIds && form.parentIds.length > 0) ||
    (form.spouseIds && form.spouseIds.length > 0)
  );
  const showRelationPickers = !readOnly && !isQuickAdd;

  return createPortal(
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h3>{form.id ? (readOnly ? 'Профіль родича' : 'Редагувати родича') : 'Новий родич'}</h3>
          <button className="x-btn" onClick={onClose}>×</button>
        </div>
        <div className="modal-body stack">
          {createdByName && (
            <div className="notice" style={{ fontSize: 12 }}>
              Створив(ла): {createdByName}
              {editedByDifferent && <> · останнім редагував(ла): {lastEditedByName}</>}
            </div>
          )}
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

          <div>
            <label>Дівоче прізвище (якщо є)</label>
            <input value={form.maidenName} disabled={readOnly}
              onChange={(e) => set('maidenName', e.target.value)} />
          </div>

          {!readOnly ? (
            <GenderPicker value={form.gender} onChange={(v) => set('gender', v)} />
          ) : (
            <div>
              <label>Стать</label>
              <div>{form.gender === 'm' ? 'Чоловік' : form.gender === 'f' ? 'Жінка' : '—'}</div>
            </div>
          )}

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
            {readOnly
              ? <div>{form.birthPlace || '—'}</div>
              : <PlaceInput value={form.birthPlace} onChange={(v) => set('birthPlace', v)} placeholder="Почніть вводити місто чи село…" />}
          </div>

          <div className="grid-2">
            <div>
              <label>Дата смерті</label>
              <input type="date" value={form.deathDate} disabled={readOnly}
                onChange={(e) => set('deathDate', e.target.value)} />
            </div>
            <div>
              <label>Місце смерті</label>
              {readOnly
                ? <div>{form.deathPlace || '—'}</div>
                : <PlaceInput value={form.deathPlace} onChange={(v) => set('deathPlace', v)} placeholder="Місто чи село…" />}
            </div>
          </div>

          <div>
            <label>Нотатки / біографія</label>
            <textarea rows={3} value={form.bio} disabled={readOnly}
              onChange={(e) => set('bio', e.target.value)} />
          </div>

          {showRelationPickers && (
            <>
              <div>
                <label>👨 Батько</label>
                <PersonPicker people={people} excludeId={form.id} selectedId={father}
                  onSelect={(id) => setParent('father', id)} placeholder="Пошук батька…" />
              </div>
              <div>
                <label>👩 Мати</label>
                <PersonPicker people={people} excludeId={form.id} selectedId={mother}
                  onSelect={(id) => setParent('mother', id)} placeholder="Пошук матері…" />
              </div>
              <div>
                <label>💍 Партнер</label>
                <PersonPicker people={people} excludeId={form.id} selectedId={spouseId}
                  onSelect={setSpouse} placeholder="Пошук партнера…" />
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
    </div>,
    document.body
  );
}
