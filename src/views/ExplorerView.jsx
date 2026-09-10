import React, { useState } from 'react';

function label(p) {
  const b = p.birthDate ? p.birthDate.slice(0, 4) : p.birthYear;
  return `${p.firstName} ${p.lastName || ''}`.trim() + (b ? ` (${b})` : '');
}

function Node({ id, people, depth, onOpen, sharedIds, expanded, toggle, path }) {
  const p = people[id];
  if (!p) return null;
  const children = (p.childIds || [])
    .filter((c) => people[c])
    .sort((a, b) => (people[a].lastName || '').localeCompare(people[b].lastName || '', 'uk'));
  const hasChildren = children.length > 0;
  const key = path + '/' + id;
  const isOpen = expanded.has(key);

  return (
    <div style={{ paddingLeft: depth ? 18 : 0 }}>
      <div className="row" style={{ padding: '3px 0', gap: 6, flexWrap: 'nowrap' }}>
        <button
          onClick={() => hasChildren && toggle(key)}
          style={{
            background: 'none', border: 'none', width: 18, color: '#4a5850',
            fontFamily: 'monospace', fontSize: 13,
            visibility: hasChildren ? 'visible' : 'hidden',
          }}
        >{isOpen ? '▾' : '▸'}</button>
        <span style={{ fontSize: 15 }}>{hasChildren ? '📁' : '📄'}</span>
        <button
          onClick={() => onOpen(p)}
          style={{
            background: 'none', border: 'none', fontFamily: 'inherit',
            fontSize: 15, color: '#1c2620', textAlign: 'left',
          }}
        >
          {label(p)}
          {sharedIds.has(p.id) && <span className="shared-tag" style={{ marginLeft: 8 }}>спільний</span>}
        </button>
      </div>
      {isOpen && children.map((c) => (
        <Node key={c} id={c} people={people} depth={depth + 1} onOpen={onOpen}
          sharedIds={sharedIds} expanded={expanded} toggle={toggle} path={key} />
      ))}
    </div>
  );
}

export default function ExplorerView({ people, sharedIds, onOpen }) {
  const [expanded, setExpanded] = useState(new Set());
  const toggle = (k) => setExpanded((s) => {
    const n = new Set(s);
    n.has(k) ? n.delete(k) : n.add(k);
    return n;
  });

  // Корені — люди без батьків у цьому дереві, відсортовані за прізвищем
  const roots = Object.values(people)
    .filter((p) => !(p.parentIds || []).some((id) => people[id]))
    .sort((a, b) => (a.lastName || '').localeCompare(b.lastName || '', 'uk'));

  if (roots.length === 0) {
    return <div className="empty"><div className="empty-emoji">📂</div>Порожньо.</div>;
  }

  return (
    <div className="card" style={{ fontFamily: 'inherit' }}>
      {roots.map((r) => (
        <Node key={r.id} id={r.id} people={people} depth={0} onOpen={onOpen}
          sharedIds={sharedIds} expanded={expanded} toggle={toggle} path="root" />
      ))}
    </div>
  );
}
