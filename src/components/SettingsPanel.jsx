import React, { useState } from 'react';
import {
  updateUserSettings, findUserByEmail, requestAccess,
  respondAccess, grantAccess, revokeGrant,
} from '../lib/store.js';

export default function SettingsPanel({
  profile, uid, incomingAccess, grants, myAccess,
}) {
  const [isPublic, setIsPublic] = useState(profile.isPublic);
  const [email, setEmail] = useState('');
  const [msg, setMsg] = useState(null);

  const savePrivacy = async (val) => {
    setIsPublic(val);
    await updateUserSettings(uid, { isPublic: val });
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
  };
  const deny = async (req) => respondAccess(req.id, 'denied');

  return (
    <div className="stack">
      <div className="card stack">
        <div>
          <h2 className="section-title">Приватність родоводу</h2>
          <p className="section-sub">Публічний родовід можуть знаходити інші користувачі для пошуку спільних родичів.</p>
        </div>
        <div className="pill-toggle">
          <button className={!isPublic ? 'active' : ''} onClick={() => savePrivacy(false)}>🔒 Приватний</button>
          <button className={isPublic ? 'active' : ''} onClick={() => savePrivacy(true)}>🌍 Публічний</button>
        </div>
      </div>

      <div className="card stack">
        <div>
          <h2 className="section-title">Запросити доступ</h2>
          <p className="section-sub">Введіть email іншого користувача, щоб попросити доступ до його повного родоводу.</p>
        </div>
        <div className="row">
          <input placeholder="email@example.com" value={email}
            onChange={(e) => setEmail(e.target.value)} style={{ flex: 1 }} />
          <button className="btn" onClick={askAccess} disabled={!email.trim()}>Надіслати запит</button>
        </div>
        {msg && <div className={`notice ${msg.t === 'warn' ? 'notice-warn' : ''}`}>{msg.s}</div>}
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
