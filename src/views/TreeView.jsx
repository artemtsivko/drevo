import React, { useMemo, useState, useRef } from 'react';

// Проста генеалогічна розкладка по поколіннях (зверху вниз).
// mode: 'tree' — компактне дерево нащадків; 'graph' — усі зв'язки з ребрами подружжя.

function computeGenerations(people) {
  const gen = {};
  const ids = Object.keys(people);
  // корені = без батьків
  const roots = ids.filter((id) => !(people[id].parentIds || []).some((p) => people[p]));
  const queue = roots.map((id) => [id, 0]);
  const seen = new Set();
  while (queue.length) {
    const [id, g] = queue.shift();
    if (seen.has(id)) { gen[id] = Math.max(gen[id] ?? 0, g); continue; }
    seen.add(id);
    gen[id] = g;
    (people[id].childIds || []).forEach((c) => {
      if (people[c]) queue.push([c, g + 1]);
    });
  }
  ids.forEach((id) => { if (gen[id] === undefined) gen[id] = 0; });
  return gen;
}

function layout(people) {
  const gen = computeGenerations(people);
  const byGen = {};
  Object.keys(people).forEach((id) => {
    const g = gen[id];
    (byGen[g] = byGen[g] || []).push(id);
  });
  const NODE_W = 150, NODE_H = 58, GAP_X = 26, GAP_Y = 96;
  const pos = {};
  let maxRow = 0;
  Object.keys(byGen).forEach((g) => { maxRow = Math.max(maxRow, byGen[g].length); });
  const width = Math.max(maxRow, 1) * (NODE_W + GAP_X) + GAP_X;

  Object.keys(byGen).sort((a, b) => a - b).forEach((g) => {
    const row = byGen[g];
    const rowW = row.length * (NODE_W + GAP_X);
    const startX = (width - rowW) / 2 + GAP_X / 2;
    row.forEach((id, i) => {
      pos[id] = {
        x: startX + i * (NODE_W + GAP_X),
        y: 30 + g * (NODE_H + GAP_Y),
      };
    });
  });

  const height = (Math.max(...Object.values(gen), 0) + 1) * (NODE_H + GAP_Y) + 40;
  return { pos, width, height, NODE_W, NODE_H };
}

function born(p) {
  const b = p.birthDate ? p.birthDate.slice(0, 4) : p.birthYear;
  const d = p.deathDate ? p.deathDate.slice(0, 4) : '';
  if (!b && !d) return '';
  return `${b || '?'}${d ? '–' + d : ''}`;
}

export default function TreeView({ people, sharedIds, onOpen, mode }) {
  const { pos, width, height, NODE_W, NODE_H } = useMemo(() => layout(people), [people]);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const drag = useRef(null);

  if (Object.keys(people).length === 0) {
    return <div className="empty"><div className="empty-emoji">🌿</div>Дерево з'явиться, коли додасте родичів.</div>;
  }

  const onDown = (e) => { drag.current = { x: e.clientX - pan.x, y: e.clientY - pan.y }; };
  const onMove = (e) => {
    if (!drag.current) return;
    setPan({ x: e.clientX - drag.current.x, y: e.clientY - drag.current.y });
  };
  const onUp = () => { drag.current = null; };

  const edges = [];
  Object.values(people).forEach((p) => {
    (p.childIds || []).forEach((c) => {
      if (pos[c] && pos[p.id]) edges.push({ from: p.id, to: c, kind: 'pc' });
    });
    if (mode === 'graph') {
      (p.spouseIds || []).forEach((s) => {
        if (pos[s] && p.id < s) edges.push({ from: p.id, to: s, kind: 'sp' });
      });
    }
  });

  return (
    <div className="card" style={{ padding: 0, overflow: 'hidden', position: 'relative' }}>
      <div className="row" style={{ position: 'absolute', top: 10, right: 10, zIndex: 5, gap: 6 }}>
        <button className="btn btn-ghost btn-sm" onClick={() => setZoom((z) => Math.min(2, z + 0.15))}>+</button>
        <button className="btn btn-ghost btn-sm" onClick={() => setZoom((z) => Math.max(0.4, z - 0.15))}>−</button>
        <button className="btn btn-ghost btn-sm" onClick={() => { setZoom(1); setPan({ x: 0, y: 0 }); }}>⟳</button>
      </div>
      <div
        style={{ height: 560, overflow: 'hidden', cursor: drag.current ? 'grabbing' : 'grab', background: '#fbfaf5' }}
        onMouseDown={onDown} onMouseMove={onMove} onMouseUp={onUp} onMouseLeave={onUp}
      >
        <svg width="100%" height="560">
          <g transform={`translate(${pan.x},${pan.y}) scale(${zoom})`}>
            {edges.map((e, i) => {
              const a = pos[e.from], b = pos[e.to];
              if (e.kind === 'sp') {
                return <line key={i} x1={a.x + NODE_W / 2} y1={a.y + NODE_H / 2}
                  x2={b.x + NODE_W / 2} y2={b.y + NODE_H / 2}
                  stroke="#b08341" strokeWidth="2" strokeDasharray="5 4" />;
              }
              const x1 = a.x + NODE_W / 2, y1 = a.y + NODE_H;
              const x2 = b.x + NODE_W / 2, y2 = b.y;
              const my = (y1 + y2) / 2;
              return (
                <path key={i} d={`M${x1},${y1} C${x1},${my} ${x2},${my} ${x2},${y2}`}
                  fill="none" stroke="#9db3a2" strokeWidth="1.6" />
              );
            })}
            {Object.values(people).map((p) => {
              const pt = pos[p.id];
              const shared = sharedIds.has(p.id);
              return (
                <g key={p.id} transform={`translate(${pt.x},${pt.y})`}
                  style={{ cursor: 'pointer' }} onClick={() => onOpen(p)}>
                  <rect width={NODE_W} height={NODE_H} rx="9"
                    fill={p.isSelf ? '#e3ecdf' : shared ? '#fbf3e3' : '#fffdf8'}
                    stroke={p.isSelf ? '#2c5038' : shared ? '#b08341' : '#3f6b4c'}
                    strokeWidth={p.isSelf ? '2.4' : '1.6'} />
                  <text x="12" y="24" fontFamily="Georgia, serif" fontSize="14" fontWeight="700" fill="#1c2620">
                    {(p.firstName + ' ' + (p.lastName || '')).slice(0, 18)}
                  </text>
                  <text x="12" y="43" fontFamily="Segoe UI, sans-serif" fontSize="11" fill="#4a5850">
                    {born(p)}{p.birthPlace ? ' · ' + p.birthPlace.slice(0, 16) : ''}
                  </text>
                  {shared && <circle cx={NODE_W - 12} cy="12" r="5" fill="#b08341" />}
                </g>
              );
            })}
          </g>
        </svg>
      </div>
    </div>
  );
}
