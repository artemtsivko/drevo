import React, { useEffect, useState } from 'react';
import { findMatches } from '../lib/matching.js';
import {
  getPublicUsers, getPeopleOnce, createMergeProposal,
  acceptProposal, rejectProposal, getMyLinks, unlinkPersons,
} from '../lib/store.js';

function name(p) { return `${p.firstName} ${p.lastName || ''}`.trim(); }
function born(p) {
  const b = p.birthDate ? p.birthDate.slice(0, 4) : p.birthYear;
  return b ? `${b} р.` : 'рік невідомий';
}

// Короткий контекст (2-3 звʼязки) для порівняння: батьки і діти по обох боках,
// щоб було видно, чи це справді той самий чоловік.
function relContext(person, peopleMap) {
  const lines = [];
  (person.parentIds || []).slice(0, 2).forEach((pid) => {
    const p = peopleMap[pid];
    if (p) lines.push(`Батько/мати: ${name(p)}${p.birthYear || p.birthDate ? ' (' + born(p) + ')' : ''}`);
  });
  (person.childIds || []).slice(0, 2).forEach((cid) => {
    const c = peopleMap[cid];
    if (c) lines.push(`Дитина: ${name(c)}${c.birthYear || c.birthDate ? ' (' + born(c) + ')' : ''}`);
  });
  return lines.slice(0, 3);
}

export default function MatchesPanel({ uid, profile, myPeople, proposals }) {
  const [scanning, setScanning] = useState(false);
  const [matches, setMatches] = useState([]);
  const [scanned, setScanned] = useState(false);
  const [sentFor, setSentFor] = useState(new Set());
  const [myLinks, setMyLinks] = useState([]);
  const [theirPeopleCache, setTheirPeopleCache] = useState({}); // ownerId -> people map

  useEffect(() => { getMyLinks(uid).then(setMyLinks); }, [uid]);

  const ensureTheirPeople = async (ownerId) => {
    if (theirPeopleCache[ownerId]) return theirPeopleCache[ownerId];
    const p = await getPeopleOnce(ownerId);
    setTheirPeopleCache((c) => ({ ...c, [ownerId]: p }));
    return p;
  };

  // Підвантажуємо контекст (чужих людей) для кожної відкритої пропозиції
  useEffect(() => {
    proposals.forEach((pr) => { ensureTheirPeople(pr.initiatorUid); });
  }, [proposals]);

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

  const accept = async (pr) => {
    await acceptProposal(pr);
    getMyLinks(uid).then(setMyLinks);
  };
  const reject = async (pr) => rejectProposal(pr.id);

  const removeLink = async (link) => {
    if (!confirm('Розірвати це об\'єднання? Дерева знову стануть окремими для цієї людини.')) return;
    await unlinkPersons(uid, link.myPersonId, link.otherOwnerId, link.otherPersonId);
    getMyLinks(uid).then(setMyLinks);
  };

  return (
    <div className="stack">
      {proposals.length > 0 && (
        <div className="card stack">
          <h2 className="section-title">Пропозиції на підтвердження ({proposals.length})</h2>
          <p className="section-sub" style={{ margin: 0 }}>
            Перегляньте зв'язки з обох боків, щоб переконатись — це справді одна людина.
          </p>
          {proposals.map((pr) => {
            const theirPeople = theirPeopleCache[pr.initiatorUid] || {};
            const mine = myPeople[pr.theirPersonId]; // моя персона в цій пропозиції — respondent-side
            const theirs = theirPeople[pr.minePersonId];
            return (
              <div key={pr.id} className="card" style={{ background: '#fbf3e3', border: '1px solid #ecd4b0' }}>
                <div style={{ marginBottom: 10 }}>
                  <strong>{pr.initiatorName}</strong> вважає, що{' '}
                  <strong>{pr.theirName}</strong> у вашому дереві —{' '}
                  це та сама людина, що <strong>{pr.mineName}</strong> у нього.
                </div>
                <div className="grid-2" style={{ marginBottom: 10 }}>
                  <div className="card" style={{ background: '#fffdf8', padding: 10 }}>
                    <div style={{ fontWeight: 700, marginBottom: 4 }}>{pr.theirName} (ваш родич)</div>
                    {mine ? relContext(mine, myPeople).map((l, i) => (
                      <div key={i} className="person-meta">{l}</div>
                    )) : <div className="person-meta">—</div>}
                  </div>
                  <div className="card" style={{ background: '#fffdf8', padding: 10 }}>
                    <div style={{ fontWeight: 700, marginBottom: 4 }}>{pr.mineName} (у {pr.initiatorName})</div>
                    {theirs ? relContext(theirs, theirPeople).map((l, i) => (
                      <div key={i} className="person-meta">{l}</div>
                    )) : <div className="person-meta">—</div>}
                  </div>
                </div>
                <div className="person-meta" style={{ marginBottom: 12 }}>
                  Збіги: {(pr.reasons || []).join(', ')}
                </div>
                <div className="row">
                  <button className="btn btn-sm" onClick={() => accept(pr)}>Підтвердити — це одна людина</button>
                  <button className="btn btn-ghost btn-sm" onClick={() => reject(pr)}>Відхилити</button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {myLinks.length > 0 && (
        <div className="card stack">
          <h2 className="section-title">Підтверджені об'єднання</h2>
          <p className="section-sub" style={{ margin: 0 }}>
            Дерева злиті для цих людей. Якщо збіг виявився помилковим — можна розірвати.
          </p>
          {myLinks.map((l, i) => (
            <div key={i} className="person">
              <div style={{ flex: 1 }}>
                <div className="person-name">{name(l.myPerson)}</div>
                <div className="person-meta">об'єднано з деревом іншого користувача</div>
              </div>
              <button className="btn btn-ghost btn-sm" onClick={() => removeLink(l)}>Розірвати</button>
            </div>
          ))}
        </div>
      )}

      <div className="card stack">
        <div className="row">
          <div style={{ flex: 1 }}>
            <h2 className="section-title">Пошук спільних родичів</h2>
            <p className="section-sub" style={{ margin: 0 }}>
              Система вже шукає збіги автоматично у фоні. Можете й запустити пошук вручну.
            </p>
          </div>
          <button className="btn" onClick={scan} disabled={scanning}>
            {scanning ? 'Шукаю…' : 'Знайти збіги'}
          </button>
        </div>

        {!profile.isPublic && (
          <div className="notice notice-warn">
            Ваш родовід приватний — інші не бачитимуть вас у пошуку. Зробіть його публічним у Налаштуваннях
            для двостороннього пошуку (доступ, наданий напряму, теж скановиться, незалежно від приватності).
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
