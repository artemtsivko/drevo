import React, { useState } from 'react';
import GenderPicker from './GenderPicker.jsx';
import PlaceInput from './PlaceInput.jsx';

// Майстер першого запуску. Веде користувача через кроки:
// 1) Я  2) Батьки (тато + мама)  3) Партнер  4) Діти.
// Наприкінці повертає структуру, яку App збереже у Firestore одним пакетом.

function Field({ label, ...props }) {
  return (
    <div>
      <label>{label}</label>
      <input {...props} />
    </div>
  );
}

// Компактна форма однієї людини для майстра
function MiniPerson({ value, onChange, hideGender }) {
  const set = (k, v) => onChange({ ...value, [k]: v });
  return (
    <div className="stack" style={{ gap: 10 }}>
      <div className="grid-2">
        <Field label="Ім'я *" value={value.firstName || ''} onChange={(e) => set('firstName', e.target.value)} />
        <Field label="Прізвище" value={value.lastName || ''} onChange={(e) => set('lastName', e.target.value)} />
      </div>
      <Field label="Дівоче прізвище (якщо є)" value={value.maidenName || ''} onChange={(e) => set('maidenName', e.target.value)} />
      <div className="grid-2">
        <Field label="Дата народження" type="date" value={value.birthDate || ''} onChange={(e) => set('birthDate', e.target.value)} />
        <Field label="Рік (якщо дата невідома)" type="number" placeholder="напр. 1990" value={value.birthYear || ''} onChange={(e) => set('birthYear', e.target.value)} />
      </div>
      <div>
        <label>Місце народження</label>
        <PlaceInput value={value.birthPlace || ''} onChange={(v) => set('birthPlace', v)} placeholder="Почніть вводити місто чи село…" />
      </div>
      {!hideGender && (
        <GenderPicker value={value.gender || ''} onChange={(v) => set('gender', v)} />
      )}
    </div>
  );
}

const empty = { firstName: '', lastName: '', maidenName: '', birthDate: '', birthYear: '', birthPlace: '', gender: '' };

export default function Onboarding({ profile, onFinish, onSkip }) {
  const [step, setStep] = useState(0);

  const [me, setMe] = useState({
    ...empty,
    firstName: (profile.displayName || '').split(' ')[0] || '',
    lastName: (profile.displayName || '').split(' ').slice(1).join(' ') || '',
  });
  const [father, setFather] = useState({ ...empty, gender: 'm' });
  const [mother, setMother] = useState({ ...empty, gender: 'f' });
  const [partner, setPartner] = useState({ ...empty });
  const [children, setChildren] = useState([]);

  const steps = ['Це я', 'Мої батьки', 'Партнер', 'Діти'];

  const addChild = () => setChildren((c) => [...c, { ...empty }]);
  const setChild = (i, v) => setChildren((c) => c.map((x, j) => (j === i ? v : x)));
  const removeChild = (i) => setChildren((c) => c.filter((_, j) => j !== i));

  const finish = () => {
    const has = (p) => p.firstName && p.firstName.trim();
    onFinish({
      me,
      father: has(father) ? father : null,
      mother: has(mother) ? mother : null,
      partner: has(partner) ? partner : null,
      children: children.filter(has),
    });
  };

  const canNext = step === 0 ? me.firstName.trim() : true;

  return (
    <div className="modal-backdrop onboarding-backdrop">
      <div className="modal" style={{ maxWidth: 560 }}>
        <div className="modal-head">
          <h3>{steps[step]}</h3>
          <span className="person-meta">{step + 1} / {steps.length}</span>
        </div>

        <div className="modal-body stack">
          {step === 0 && (
            <>
              <p className="section-sub" style={{ margin: 0 }}>
                З цього почнеться ваш родовід. Ця персона буде позначена як «Це я».
              </p>
              <MiniPerson value={me} onChange={setMe} />
            </>
          )}

          {step === 1 && (
            <>
              <p className="section-sub" style={{ margin: 0 }}>
                Додайте батьків. Будь-кого можна пропустити — залиште поля порожніми.
              </p>
              <div className="card" style={{ background: '#fbfaf5' }}>
                <label style={{ fontSize: 13, marginBottom: 8 }}>👨 Тато</label>
                <MiniPerson value={father} onChange={setFather} hideGender />
              </div>
              <div className="card" style={{ background: '#fbfaf5' }}>
                <label style={{ fontSize: 13, marginBottom: 8 }}>👩 Мама</label>
                <MiniPerson value={mother} onChange={setMother} hideGender />
              </div>
            </>
          )}

          {step === 2 && (
            <>
              <p className="section-sub" style={{ margin: 0 }}>
                Додайте чоловіка або дружину. Якщо не потрібно — пропустіть цей крок.
              </p>
              <MiniPerson value={partner} onChange={setPartner} />
            </>
          )}

          {step === 3 && (
            <>
              <p className="section-sub" style={{ margin: 0 }}>
                Додайте дітей. Можна додати кількох або пропустити.
              </p>
              {children.map((ch, i) => (
                <div key={i} className="card" style={{ background: '#fbfaf5' }}>
                  <div className="row" style={{ justifyContent: 'space-between', marginBottom: 8 }}>
                    <label style={{ margin: 0 }}>Дитина {i + 1}</label>
                    <button className="btn btn-ghost btn-sm" onClick={() => removeChild(i)}>Прибрати</button>
                  </div>
                  <MiniPerson value={ch} onChange={(v) => setChild(i, v)} />
                </div>
              ))}
              <button className="btn btn-ghost" onClick={addChild}>+ Додати дитину</button>
            </>
          )}
        </div>

        <div className="modal-foot">
          {step > 0 && (
            <button className="btn btn-ghost" onClick={() => setStep((s) => s - 1)}>Назад</button>
          )}
          <button className="btn btn-ghost" onClick={onSkip}>Пропустити майстер</button>
          <div className="header-spacer" />
          {step < steps.length - 1 ? (
            <button className="btn" disabled={!canNext} onClick={() => setStep((s) => s + 1)}>Далі</button>
          ) : (
            <button className="btn" onClick={finish}>Готово</button>
          )}
        </div>
      </div>
    </div>
  );
}
