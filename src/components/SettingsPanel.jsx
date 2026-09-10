import React, { useState, useEffect } from 'react';
import {
  updateUserSettings, findUserByEmail, requestAccess,
  respondAccess, grantAccess, revokeGrant, getSpaceCoMembers,
  leaveSharedSpace, getUserProfile,
} from '../lib/store.js';

export default function SettingsPanel({
  profile, uid, incomingAccess, grants, myAccess, myPeople,
}) {
  const [isPublic, setIsPublic] = useState(profile.isPublic);
  const [autoMatch, setAutoMatch] = useState(profile.autoMatchEnabled !== false);
  const [email, setEmail] = useState('');
  const [msg, setMsg] = useState(null);
  const [coMembers, setCoMembers] = useState([]); // [{uid, displayName}]

  useEffect(() => {
    const ids = getSpaceCoMembers(uid, myPeople || {});
    if (ids.length === 0) { setCoMembers([]); return; }
    Promise.all(ids.map((id) => getUserProfile(id))).then((profiles) => {
      setCoMembers(profiles.filter(Boolean));
    });
  }, [uid, myPeople]);

  const leaveSpace = async (otherUid, otherName) => {
    if (!confirm(`Розірвати спільний родовід з ${otherName || 'цим користувачем'}? Кожен отримає назад лише те, що сам додав.`)) return;
    try {
      await leaveSharedSpace(uid, otherUid);
      setMsg({ t: 'ok', s: `Спільний родовід з ${otherName || 'користувачем'} розірвано.` });
    } catch (err) {
      setMsg({ t: 'warn', s: `Не вдалось розірвати: ${err.message}` });
    }
  };

  const savePrivacy = async (val) => {
    setIsPublic(val);
    await updateUserSettings(uid, { isPublic: val });
  };

  const saveAutoMatch = async (val) => {
    setAutoMatch(val);
    await updateUserSettings(uid, { autoMatchEnabled: val });
  };

  const askAccess = async () => {
    setMsg(null);
    const target = await findUserByEmail(email);
    if (!target) { setMsg({ t: 'warn', s: 'Користувача з таким email не знайдено.' }); return; }
    if (target.uid === uid) { setMsg({ t: 'warn', s: 'Це ваш власний акаунт.' }); return; }
    await requestAccess(uid, profile.displayName, target.uid);
    setMsg({ t: 'ok', s: `Запит надіслано до ${target.displayName || target.email}.` });
    setEmail('');
  };

  const approve = async (req) => {
    await grantAccess(uid, req.fromUid, req.fromName);
    await respondAccess(req.id, 'approved');
    setMsg({
      t: 'ok',
      s: `Доступ надано ${req.fromName || 'користувачу'}. Якщо доступ взаємний — ваші родоводи щойно об'єдналися в один спільний, редагувати можуть обидва.`,
    });
  };
  const deny = async (req) => respondAccess(req.id, 'denied');

  return (
    <div className="stack">
      <div className="card stack">
        <div>
          <h2 className="section-title">Автоматичний пошук збігів</h2>
          <p className="section-sub">
            Система сама шукає спільних родичів у публічних деревах та в тих, з ким ви поділились доступом,
            і пропонує об'єднання. Можна вимкнути, якщо не хочете отримувати такі пропозиції.
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
          <p className="section-sub">
            Автопошук збігів працює завжди, незалежно від цього налаштування. Приватність визначає лише,
            чи можуть інші відкрити ваш повний родовід без вашого дозволу (доступу).
          </p>
        </div>
        <div className="pill-toggle">
          <button className={!isPublic ? 'active' : ''} onClick={() => savePrivacy(false)}>🔒 Приватний</button>
          <button className={isPublic ? 'active' : ''} onClick={() => savePrivacy(true)}>🌍 Публічний</button>
        </div>
      </div>

      <div className="card stack">
        <div>
          <h2 className="section-title">Запросити доступ</h2>
          <p className="section-sub">
            Введіть email іншого користувача, щоб попросити доступ до його родоводу.
            Якщо доступ стане взаємним (ви обидва дозволите одне одному) — родоводи зіллються
            в один спільний, і редагувати людей зможете обидва.
          </p>
        </div>
        <div className="row">
          <input placeholder="email@example.com" value={email}
            onChange={(e) => setEmail(e.target.value)} style={{ flex: 1 }} />
          <button className="btn" onClick={askAccess} disabled={!email.trim()}>Надіслати запит</button>
        </div>
        {msg && <div className={`notice ${msg.t === 'warn' ? 'notice-warn' : ''}`}>{msg.s}</div>}
      </div>

      <div className="card stack">
        <div>
          <h2 className="section-title">Спільний родовід</h2>
          <p className="section-sub" style={{ margin: 0 }}>
            Люди, з якими у вас взаємний доступ — родовід ведеться разом, редагувати можуть обидва.
          </p>
        </div>
        {coMembers.length === 0
          ? <p className="section-sub" style={{ margin: 0 }}>Ви поки ні з ким не ведете спільний родовід.</p>
          : coMembers.map((c) => (
            <div key={c.uid} className="person">
              {c.photoURL && <div className="avatar"><img src={c.photoURL} alt="" /></div>}
              <div style={{ flex: 1 }}>
                <div className="person-name">{c.displayName || c.email}</div>
                <div className="person-meta">спільне редагування родоводу</div>
              </div>
              <button className="btn btn-danger btn-sm" onClick={() => leaveSpace(c.uid, c.displayName)}>Розірвати</button>
            </div>
          ))}
      </div>

      <div className="card stack">
        <h2 className="section-title">Запити до мене {incomingAccess.length > 0 && `(${incomingAccess.length})`}</h2>
        {incomingAccess.length === 0
          ? <p className="section-sub" style={{ margin: 0 }}>Немає нових запитів.</p>
          : incomingAccess.map((req) => (
            <div key={req.id} className="person">
              <div style={{ flex: 1 }}>
                <div className="person-name">{req.fromName || 'Користувач'}</div>
                <div className="person-meta">просить доступ до вашого родоводу</div>
              </div>
              <button className="btn btn-sm" onClick={() => approve(req)}>Дозволити</button>
              <button className="btn btn-ghost btn-sm" onClick={() => deny(req)}>Відхилити</button>
            </div>
          ))}
      </div>

      <div className="card stack">
        <h2 className="section-title">Кому я надав доступ</h2>
        {grants.length === 0
          ? <p className="section-sub" style={{ margin: 0 }}>Ви ще нікому не надали доступ.</p>
          : grants.map((g) => (
            <div key={g.id} className="person">
              <div style={{ flex: 1 }}>
                <div className="person-name">{g.granteeName || 'Користувач'}</div>
                <div className="person-meta">має доступ до вашого родоводу</div>
              </div>
              <button className="btn btn-ghost btn-sm" onClick={() => revokeGrant(g.id)}>Забрати</button>
            </div>
          ))}
      </div>

      <div className="card stack">
        <h2 className="section-title">Дерева, доступні мені</h2>
        {myAccess.length === 0
          ? <p className="section-sub" style={{ margin: 0 }}>У вас поки немає доступу до чужих родоводів.</p>
          : myAccess.map((g) => (
            <div key={g.id} className="person">
              <div className="avatar">{(g.ownerName || 'К')[0]}</div>
              <div style={{ flex: 1 }}>
                <div className="person-name">Родовід користувача</div>
                <div className="person-meta">доступ надано</div>
              </div>
            </div>
          ))}
      </div>
    </div>
  );
}
