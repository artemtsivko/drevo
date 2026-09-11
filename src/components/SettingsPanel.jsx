import React, { useState, useEffect } from 'react';
import { updateUserSettings, leaveFamilySpace, getUserProfile } from '../lib/store.js';

export default function SettingsPanel({ profile, uid, space }) {
  const [isPublic, setIsPublic] = useState(profile.isPublic);
  const [autoMatch, setAutoMatch] = useState(profile.autoMatchEnabled !== false);
  const [msg, setMsg] = useState(null);
  const [coMembers, setCoMembers] = useState([]);

  useEffect(() => {
    const otherUids = (space?.members || []).filter((m) => m !== uid);
    if (otherUids.length === 0) { setCoMembers([]); return; }
    Promise.all(otherUids.map((id) => getUserProfile(id))).then((profiles) => {
      setCoMembers(profiles.filter(Boolean));
    });
  }, [uid, space]);

  const savePrivacy = async (val) => {
    setIsPublic(val);
    await updateUserSettings(uid, { isPublic: val });
  };

  const saveAutoMatch = async (val) => {
    setAutoMatch(val);
    await updateUserSettings(uid, { autoMatchEnabled: val });
  };

  const leave = async (otherName) => {
    if (!confirm(
      `Вийти зі спільного родоводу? Ви заберете себе і своїх кровних родичів (батьків, дітей) в окремий родовід. ` +
      `Спільні діти лишаться видимими для всіх. Це не видаляє жодних даних — лише розділяє права редагування.`
    )) return;
    try {
      await leaveFamilySpace(uid, space.id);
      setMsg({ t: 'ok', s: 'Ви вийшли зі спільного родоводу. Ваша лінія тепер у окремому дереві.' });
    } catch (err) {
      setMsg({ t: 'warn', s: `Не вдалось вийти: ${err.message}` });
    }
  };

  return (
    <div className="stack">
      <div className="card stack">
        <div>
          <h2 className="section-title">Автоматичний пошук збігів</h2>
          <p className="section-sub">
            Система сама шукає спільних родичів серед усіх родоводів (включно з приватними)
            і пропонує об'єднання, коли знаходить збіг. Приватність не приховує від пошуку —
            вона лише приховує повний доступ до вашого дерева без вашої згоди.
          </p>
        </div>
        <div className="pill-toggle">
          <button className={autoMatch ? 'active' : ''} onClick={() => saveAutoMatch(true)}>✅ Увімкнено</button>
          <button className={!autoMatch ? 'active' : ''} onClick={() => saveAutoMatch(false)}>🚫 Вимкнено</button>
        </div>
      </div>

      <div className="card stack">
        <div>
          <h2 className="section-title">Приватність родоводу</h2>
          <p className="section-sub">Публічний родовід легше знайти вручну іншим користувачам (пошук за email тощо).</p>
        </div>
        <div className="pill-toggle">
          <button className={!isPublic ? 'active' : ''} onClick={() => savePrivacy(false)}>🔒 Приватний</button>
          <button className={isPublic ? 'active' : ''} onClick={() => savePrivacy(true)}>🌍 Публічний</button>
        </div>
      </div>

      <div className="card stack">
        <div>
          <h2 className="section-title">Спільний родовід</h2>
          <p className="section-sub" style={{ margin: 0 }}>
            Люди, з якими у вас спільний родовід — усі можуть редагувати і додавати родичів.
          </p>
        </div>
        {coMembers.length === 0
          ? <p className="section-sub" style={{ margin: 0 }}>Ви ведете родовід самостійно, ні з ким не обʼєднані.</p>
          : coMembers.map((c) => (
            <div key={c.uid} className="person">
              {c.photoURL && <div className="avatar"><img src={c.photoURL} alt="" /></div>}
              <div style={{ flex: 1 }}>
                <div className="person-name">{c.displayName || c.email}</div>
                <div className="person-meta">спільне редагування родоводу</div>
              </div>
              <button className="btn btn-danger btn-sm" onClick={() => leave(c.displayName)}>Вийти</button>
            </div>
          ))}
        {msg && <div className={`notice ${msg.t === 'warn' ? 'notice-warn' : ''}`}>{msg.s}</div>}
      </div>
    </div>
  );
}
