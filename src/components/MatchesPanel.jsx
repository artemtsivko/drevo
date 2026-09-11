import React, { useState } from 'react';
import {
  scanForSpaceMatches, spaceMergeProposalExists, createSpaceMergeProposal,
  acceptSpaceMergeProposal, rejectSpaceMergeProposal,
} from '../lib/store.js';

function born(p) {
  const b = p.birthDate ? p.birthDate.slice(0, 4) : p.birthYear;
  return b ? `${b} р.` : 'рік невідомий';
}

export default function MatchesPanel({ uid, profile, space, myPeople, proposals }) {
  const [scanning, setScanning] = useState(false);
  const [manualResults, setManualResults] = useState([]);
  const [scanned, setScanned] = useState(false);
  const [sentFor, setSentFor] = useState(new Set());
  const [busy, setBusy] = useState(null);

  const scan = async () => {
    setScanning(true);
    setScanned(false);
    const results = await scanForSpaceMatches(space.id, myPeople);
    setManualResults(results);
    setScanned(true);
    setScanning(false);
  };

  const propose = async (r) => {
    const exists = await spaceMergeProposalExists(space.id, r.theirSpaceId);
    if (exists) { setSentFor((s) => new Set(s).add(r.theirSpaceId)); return; }
    await createSpaceMergeProposal({
      fromSpaceId: space.id, fromUid: uid, fromName: profile.displayName,
      toSpaceId: r.theirSpaceId, matches: r.matches,
    });
    setSentFor((s) => new Set(s).add(r.theirSpaceId));
  };

  const accept = async (pr) => {
    setBusy(pr.id);
    try {
      await acceptSpaceMergeProposal(pr);
    } catch (err) {
      alert('Не вдалось обʼєднати: ' + err.message);
    }
    setBusy(null);
  };
  const reject = async (pr) => rejectSpaceMergeProposal(pr.id);

  return (
    <div className="stack">
      {proposals.length > 0 && (
        <div className="card stack">
          <h2 className="section-title">Пропозиції на об'єднання родоводів ({proposals.length})</h2>
          <p className="section-sub" style={{ margin: 0 }}>
            Знайдено спільних родичів з іншим родоводом. Перегляньте збіги — після підтвердження
            ваші дерева стануть одним спільним, редагувати зможете обидва.
          </p>
          {proposals.map((pr) => (
            <div key={pr.id} className="card" style={{ background: '#fbf3e3', border: '1px solid #ecd4b0' }}>
              <div style={{ marginBottom: 10 }}>
                <strong>{pr.fromName}</strong> пропонує об'єднати родоводи — знайдено {pr.matches.length} спільних людей:
              </div>
              <div className="stack" style={{ gap: 6, marginBottom: 12 }}>
                {pr.matches.map((m, i) => (
                  <div key={i} className="card" style={{ background: '#fffdf8', padding: 10 }}>
                    <div style={{ fontWeight: 700 }}>{m.mineName} ↔ {m.theirName}</div>
                    <div className="person-meta">Збіги: {(m.reasons || []).join(', ')}</div>
                  </div>
                ))}
              </div>
              <div className="row">
                <button className="btn btn-sm" disabled={busy === pr.id} onClick={() => accept(pr)}>
                  {busy === pr.id ? 'Обʼєдную…' : "Об'єднати родоводи"}
                </button>
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
              Система вже шукає збіги автоматично у фоні. Можете й запустити пошук вручну.
            </p>
          </div>
          <button className="btn" onClick={scan} disabled={scanning}>
            {scanning ? 'Шукаю…' : 'Знайти збіги'}
          </button>
        </div>

        {scanned && manualResults.length === 0 && (
          <div className="empty" style={{ padding: 24 }}>Збігів не знайдено.</div>
        )}

        {manualResults.map((r) => {
          const sent = sentFor.has(r.theirSpaceId);
          return (
            <div key={r.theirSpaceId} className="person">
              <div style={{ flex: 1 }}>
                <div className="person-name">{r.matches.length} спільних людей знайдено</div>
                <div className="person-meta">
                  {r.matches.slice(0, 3).map((m) => m.mine.firstName).join(', ')}
                  {r.matches.length > 3 ? '…' : ''}
                </div>
              </div>
              <button className="btn btn-sm" onClick={() => propose(r)} disabled={sent}>
                {sent ? 'Надіслано' : "Запропонувати об'єднання"}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
