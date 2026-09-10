import React, { useEffect, useState } from 'react';
import { findMatches } from '../lib/matching.js';
import {
  getPublicUsers, getPeopleOnce, createMergeProposal,
  respondProposal, updatePerson,
} from '../lib/store.js';

function name(p) { return `${p.firstName} ${p.lastName || ''}`.trim(); }
function born(p) {
  const b = p.birthDate ? p.birthDate.slice(0, 4) : p.birthYear;
  return b ? `${b} р.` : 'рік невідомий';
}

export default function MatchesPanel({ uid, profile, myPeople, proposals }) {
  const [scanning, setScanning] = useState(false);
  const [matches, setMatches] = useState([]);
  const [scanned, setScanned] = useState(false);
  const [sentFor, setSentFor] = useState(new Set());

  const scan = async () => {
    setScanning(true);
    setScanned(false);
    const publicUsers = await getPublicUsers();
    const found = [];
    for (const u of publicUsers) {
      if (u.uid === uid) continue;
      const theirPeople = await getPeopleOnce(u.uid);
      const ms = findMatches(myPeople, theirPeople);
      ms.forEach((m) => found.push({ ...m, owner: u }));
    }
    found.sort((a, b) => b.score - a.score);
    setMatches(found);
    setScanned(true);
    setScanning(false);
  };

  const propose = async (m) => {
    await createMergeProposal({
      initiatorUid: uid,
      initiatorName: profile.displayName,
      respondentUid: m.owner.uid,
      type: 'link',
      minePersonId: m.mineId,
      mineName: name(m.mine),
      theirPersonId: m.theirId,
      theirName: name(m.theirs),
      reasons: m.reasons,
    });
    setSentFor((s) => new Set(s).add(m.mineId + m.theirId));
  };

  const accept = async (pr) => respondProposal(pr.id, 'accepted');
  const reject = async (pr) => respondProposal(pr.id, 'rejected');

  return (
    <div className="stack">
      {proposals.length > 0 && (
        <div className="card stack">
          <h2 className="section-title">Пропозиції на підтвердження ({proposals.length})</h2>
          <p className="section-sub" style={{ margin: 0 }}>
            Інші користувачі знайшли спільних родичів з вами. Підтвердіть, якщо це справді одна людина.
          </p>
          {proposals.map((pr) => (
            <div key={pr.id} className="card" style={{ background: '#fbf3e3', border: '1px solid #ecd4b0' }}>
              <div style={{ marginBottom: 10 }}>
                <strong>{pr.initiatorName}</strong> вважає, що{' '}
                <strong>{pr.theirName}</strong> у вашому дереві —{' '}
                це та сама людина, що <strong>{pr.mineName}</strong> у нього.
              </div>
              <div className="person-meta" style={{ marginBottom: 12 }}>
                Збіги: {(pr.reasons || []).join(', ')}
              </div>
              <div className="row">
                <button className="btn btn-sm" onClick={() => accept(pr)}>Підтвердити</button>
                <button className="btn btn-ghost btn-sm" onClick={() => reject(pr)}>Відхилити</button>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="card stack">
        <div className="row">
          <div style={{ flex: 1 }}>
            <h2 className="section-title">Пошук спільних родичів</h2>
            <p className="section-sub" style={{ margin: 0 }}>
              Система порівняє ваших родичів з публічними родоводами за іменем, роком народження та зв'язками.
            </p>
          </div>
          <button className="btn" onClick={scan} disabled={scanning}>
            {scanning ? 'Шукаю…' : 'Знайти збіги'}
          </button>
        </div>

        {!profile.isPublic && (
          <div className="notice notice-warn">
            Ваш родовід приватний — інші не бачитимуть вас у пошуку. Зробіть його публічним у Налаштуваннях для двостороннього пошуку.
          </div>
        )}

        {scanned && matches.length === 0 && (
          <div className="empty" style={{ padding: 24 }}>Збігів не знайдено.</div>
        )}

        {matches.map((m) => {
          const key = m.mineId + m.theirId;
          const sent = sentFor.has(key);
          return (
            <div key={key} className="person">
              <div style={{ flex: 1 }}>
                <div className="person-name">{name(m.mine)} ↔ {name(m.theirs)}</div>
                <div className="person-meta">
                  {born(m.mine)} · збіги: {m.reasons.join(', ')}
                </div>
              </div>
              <button className="btn btn-sm" onClick={() => propose(m)} disabled={sent}>
                {sent ? 'Надіслано' : "Запропонувати об'єднання"}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
