import React, { useMemo, useState, useRef, useCallback } from 'react';
import PersonQuickMenu from '../components/PersonQuickMenu.jsx';

// Генеалогічна розкладка з об'єднаними картками пари:
// - партнери показані як ОДНА картка (двоє імен в одному блоці),
// - діти центруються під карткою пари,
// - батьки/предки — рівнем вище.
// Рівень (generation) рахуємо відносно персони "я": я = 0, батьки = -1, діти = +1.

const CARD_W = 220, CARD_H_SINGLE = 74, CARD_H_COUPLE = 116;
const GAP_X = 30, GAP_Y = 110, SLOT_W = 140;

function assignGenerations(people) {
  const gen = {};
  const ids = Object.keys(people);
  if (ids.length === 0) return gen;

  let start = ids.find((id) => people[id].isSelf);
  if (!start) start = ids.find((id) => !(people[id].parentIds || []).some((p) => people[p]));
  if (!start) start = ids[0];

  const queue = [[start, 0]];
  while (queue.length) {
    const [id, g] = queue.shift();
    if (gen[id] !== undefined) continue;
    gen[id] = g;
    const p = people[id];
    (p.parentIds || []).forEach((pid) => { if (people[pid] && gen[pid] === undefined) queue.push([pid, g - 1]); });
    (p.childIds || []).forEach((cid) => { if (people[cid] && gen[cid] === undefined) queue.push([cid, g + 1]); });
    (p.spouseIds || []).forEach((sid) => { if (people[sid] && gen[sid] === undefined) queue.push([sid, g]); });
  }
  ids.forEach((id) => { if (gen[id] === undefined) gen[id] = 0; });
  return gen;
}

// Групуємо кожен рівень у юніти: пара (об'єднана картка) або одинак.
function buildUnits(people, gen) {
  const byGen = {};
  Object.keys(people).forEach((id) => {
    const g = gen[id];
    (byGen[g] = byGen[g] || []).push(id);
  });

  const unitsByGen = {};
  Object.keys(byGen).forEach((g) => {
    const seen = new Set();
    const units = [];
    byGen[g].forEach((id) => {
      if (seen.has(id)) return;
      const p = people[id];
      const spouse = (p.spouseIds || []).find(
        (sid) => people[sid] && gen[sid] === Number(g) && !seen.has(sid)
      );
      if (spouse) {
        let left = id, right = spouse;
        if (people[id].gender === 'f' && people[spouse].gender === 'm') { left = spouse; right = id; }
        units.push({ id: left + '_' + right, members: [left, right], isCouple: true });
        seen.add(id); seen.add(spouse);
      } else {
        units.push({ id, members: [id], isCouple: false });
        seen.add(id);
      }
    });
    unitsByGen[g] = units;
  });
  return unitsByGen;
}

function unitHeight(u) { return u.isCouple ? CARD_H_COUPLE : CARD_H_SINGLE; }

function layout(people) {
  const gen = assignGenerations(people);
  const unitsByGen = buildUnits(people, gen);
  const gens = Object.keys(unitsByGen).map(Number).sort((a, b) => a - b);

  const unitPos = {}; // unit.id -> {x, y, w, h, unit}
  const memberUnit = {}; // personId -> unit.id
  let maxRowW = 0;
  const rowWidths = {};

  gens.forEach((g) => {
    const units = unitsByGen[g];
    const w = units.reduce((acc) => acc + CARD_W + GAP_X, 0) - GAP_X;
    rowWidths[g] = Math.max(w, 0);
    maxRowW = Math.max(maxRowW, rowWidths[g]);
  });

  const width = maxRowW + GAP_X * 2 + SLOT_W * 2;
  const minGen = gens[0] ?? 0;

  gens.forEach((g) => {
    const units = unitsByGen[g];
    let x = (width - rowWidths[g]) / 2;
    const y = 30 + (g - minGen) * (Math.max(CARD_H_COUPLE, CARD_H_SINGLE) + GAP_Y);
    units.forEach((u) => {
      unitPos[u.id] = { x, y, w: CARD_W, h: unitHeight(u), unit: u };
      u.members.forEach((m) => { memberUnit[m] = u.id; });
      x += CARD_W + GAP_X;
    });
  });

  const height = 30 + (gens.length ? (gens[gens.length - 1] - minGen + 1) : 1) * (Math.max(CARD_H_COUPLE, CARD_H_SINGLE) + GAP_Y) + 60;
  return { unitPos, memberUnit, width, height, gen, unitsByGen, gens, minGen };
}

function born(p) {
  const b = p.birthDate ? p.birthDate.slice(0, 4) : p.birthYear;
  const d = p.deathDate ? p.deathDate.slice(0, 4) : '';
  if (!b && !d) return '';
  return `${b || '?'}${d ? '–' + d : ''}`;
}

// Розраховує вік (якщо живий) або скільки прожив (якщо помер), з роками/датами.
function ageInfo(p) {
  const birthYear = p.birthDate ? parseInt(p.birthDate.slice(0, 4), 10) : (p.birthYear ? parseInt(p.birthYear, 10) : null);
  if (!birthYear) return null;

  const isDead = !!(p.deathDate || p.deathYear);
  if (isDead) {
    const deathYear = p.deathDate ? parseInt(p.deathDate.slice(0, 4), 10) : parseInt(p.deathYear, 10);
    if (!deathYear) return null;
    const years = deathYear - birthYear;
    return { label: `† прожив${p.gender === 'f' ? 'а' : ''} ${years} р.`, dead: true };
  }

  const now = new Date();
  let age = now.getFullYear() - birthYear;
  if (p.birthDate) {
    const bd = new Date(p.birthDate);
    const hadBirthdayThisYear = (now.getMonth() > bd.getMonth()) ||
      (now.getMonth() === bd.getMonth() && now.getDate() >= bd.getDate());
    if (!hadBirthdayThisYear) age -= 1;
  }
  if (age < 0 || age > 130) return null;
  return { label: `${age} р.`, dead: false };
}

function bg(p) {
  if (p.gender === 'm') return '#eaf1fb';
  if (p.gender === 'f') return '#fbeaf3';
  return '#fffdf8';
}
function border(p) {
  if (p.gender === 'm') return '#4d7bc4';
  if (p.gender === 'f') return '#c45a94';
  return '#3f6b4c';
}

export default function TreeView({ people, sharedIds, onOpen, onAddNew, onLinkExisting, onAddPerson, mode }) {
  const { unitPos, memberUnit, width, height, gen, gens, minGen } = useMemo(() => layout(people), [people]);
  const [zoom, setZoom] = useState(0.85);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const drag = useRef(null);
  const pinch = useRef(null);
  const [menu, setMenu] = useState(null); // {x, y, person}
  const containerRef = useRef(null);

  if (Object.keys(people).length === 0) {
    return <div className="empty"><div className="empty-emoji">🌿</div>Дерево з'явиться, коли додасте родичів.</div>;
  }

  // --- миша ---
  const onDown = (e) => { drag.current = { x: e.clientX - pan.x, y: e.clientY - pan.y }; };
  const onMove = (e) => {
    if (!drag.current) return;
    setPan({ x: e.clientX - drag.current.x, y: e.clientY - drag.current.y });
  };
  const onUp = () => { drag.current = null; };

  // --- дотик: пан одним пальцем, pinch-zoom двома ---
  const dist = (t) => Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);

  const onTouchStart = (e) => {
    if (e.touches.length === 1) {
      drag.current = { x: e.touches[0].clientX - pan.x, y: e.touches[0].clientY - pan.y };
    } else if (e.touches.length === 2) {
      drag.current = null;
      pinch.current = { d: dist(e.touches), zoom };
    }
  };
  const onTouchMove = (e) => {
    if (e.touches.length === 1 && drag.current) {
      setPan({ x: e.touches[0].clientX - drag.current.x, y: e.touches[0].clientY - drag.current.y });
      e.preventDefault();
    } else if (e.touches.length === 2 && pinch.current) {
      const d = dist(e.touches);
      const nz = Math.min(2, Math.max(0.3, pinch.current.zoom * (d / pinch.current.d)));
      setZoom(nz);
      e.preventDefault();
    }
  };
  const onTouchEnd = () => { drag.current = null; pinch.current = null; };

  const onWheel = (e) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? -0.08 : 0.08;
    setZoom((z) => Math.min(2, Math.max(0.3, z + delta)));
  };

  const openMenu = (e, p) => {
    e.stopPropagation();
    const rect = containerRef.current.getBoundingClientRect();
    const MENU_W = 230, MENU_H_MAX = 260;
    let x = e.clientX - rect.left;
    let y = e.clientY - rect.top;
    // не даємо меню виходити за праву/нижню межу контейнера
    x = Math.min(x, rect.width - MENU_W - 10);
    y = Math.min(y, rect.height - MENU_H_MAX - 10);
    x = Math.max(x, 10);
    y = Math.max(y, 10);
    setMenu({ x, y, person: p });
  };

  const act = (fn, ...args) => {
    fn(...args, menu.person);
    setMenu(null);
  };

  // Ребра до дітей: від низу картки-юніту батьків до верху картки-юніту дитини
  const childEdges = [];
  const drawnUnits = new Set();
  Object.values(unitPos).forEach(({ unit, x, y, w, h }) => {
    if (drawnUnits.has(unit.id)) return;
    drawnUnits.add(unit.id);
    // збираємо унікальних дітей юніту (з усіх його членів)
    const kidSet = new Set();
    unit.members.forEach((m) => (people[m].childIds || []).forEach((c) => { if (people[c] && memberUnit[c]) kidSet.add(c); }));
    if (kidSet.size === 0) return;
    const sx = x + w / 2, sy = y + h;
    const doneChildUnits = new Set();
    kidSet.forEach((c) => {
      const cu = memberUnit[c];
      if (doneChildUnits.has(cu)) return;
      doneChildUnits.add(cu);
      const cp = unitPos[cu];
      childEdges.push({ sx, sy, cx: cp.x + cp.w / 2, cy: cp.y });
    });
  });

  // Порожні слоти: додати батьків зверху для коренів, додати дитину знизу для листків
  const slots = [];
  Object.values(unitPos).forEach(({ unit, x, y, w, h }) => {
    const anyHasParents = unit.members.some((m) => (people[m].parentIds || []).some((pid) => people[pid]));
    if (!anyHasParents && gen[unit.members[0]] === minGen) {
      slots.push({ type: 'addParents', x: x + w / 2, y: y - GAP_Y + 20, personId: unit.members[0] });
    }
  });

  return (
    <div className="card" style={{ padding: 0, overflow: 'hidden', position: 'relative' }} ref={containerRef}>
      <div className="row" style={{ position: 'absolute', top: 10, right: 10, zIndex: 5, gap: 6 }}>
        {onAddPerson && (
          <button className="btn btn-sm" onClick={onAddPerson}>+ Людина</button>
        )}
        <button className="btn btn-ghost btn-sm" onClick={() => setZoom((z) => Math.min(2, z + 0.15))}>+</button>
        <button className="btn btn-ghost btn-sm" onClick={() => setZoom((z) => Math.max(0.3, z - 0.15))}>−</button>
        <button className="btn btn-ghost btn-sm" onClick={() => { setZoom(0.85); setPan({ x: 0, y: 0 }); }}>⟳</button>
      </div>
      <div
        className="tree-canvas"
        style={{ cursor: drag.current ? 'grabbing' : 'grab' }}
        onMouseDown={onDown} onMouseMove={onMove} onMouseUp={onUp} onMouseLeave={onUp}
        onTouchStart={onTouchStart} onTouchMove={onTouchMove} onTouchEnd={onTouchEnd}
        onWheel={onWheel}
      >
        <svg width="100%" height="100%" style={{ display: 'block' }}>
          <g transform={`translate(${pan.x},${pan.y}) scale(${zoom})`}>
            {childEdges.map((e, i) => {
              const my = (e.sy + e.cy) / 2;
              return (
                <path key={'c' + i}
                  d={`M${e.sx},${e.sy} C${e.sx},${my} ${e.cx},${my} ${e.cx},${e.cy}`}
                  fill="none" stroke="#9db3a2" strokeWidth="1.8" />
              );
            })}

            {slots.map((s, i) => (
              <g key={'slot' + i} transform={`translate(${s.x - SLOT_W / 2},${s.y - 34})`}
                style={{ cursor: 'pointer' }}
                onClick={() => onAddNew('father', people[s.personId])}>
                <rect width={SLOT_W} height="34" rx="8" fill="none" stroke="#c7bfa8" strokeWidth="1.5" strokeDasharray="5 4" />
                <text x={SLOT_W / 2} y="21" textAnchor="middle" fontFamily="Segoe UI, sans-serif" fontSize="12" fill="#9a8f78">
                  + додати батьків
                </text>
              </g>
            ))}

            {Object.entries(unitPos).map(([uid, { unit, x, y, w, h }]) => {
              const isCouple = unit.isCouple;
              return (
                <g key={uid} transform={`translate(${x},${y})`}>
                  <rect width={w} height={h} rx="12" fill="#fffdf8" stroke="#d9d2c4" strokeWidth="1" />
                  {unit.members.map((mid, i) => {
                    const p = people[mid];
                    const shared = sharedIds.has(p.id);
                    const rowH = isCouple ? h / 2 : h;
                    const ry = i * rowH;
                    const age = ageInfo(p);
                    return (
                      <g key={mid} transform={`translate(0,${ry})`}
                        style={{ cursor: 'pointer' }}
                        onClick={(e) => openMenu(e, p)}>
                        <rect width={w} height={rowH} rx={isCouple ? 0 : 12}
                          fill={bg(p)}
                          stroke={p.isSelf ? '#2c5038' : shared ? '#b08341' : border(p)}
                          strokeWidth={p.isSelf ? '2.6' : '1.4'} />
                        <text x="14" y={rowH / 2 - 16} fontFamily="Georgia, serif" fontSize="14" fontWeight="700" fill="#1c2620">
                          {(p.firstName + ' ' + (p.lastName || '')).trim().slice(0, 22)}
                        </text>
                        <text x="14" y={rowH / 2 + 2} fontFamily="Segoe UI, sans-serif" fontSize="11" fill="#4a5850">
                          {born(p)}{p.maidenName ? ' · уродж. ' + p.maidenName.slice(0, 12) : ''}
                        </text>
                        {age && (
                          <text x="14" y={rowH / 2 + 18} fontFamily="Segoe UI, sans-serif" fontSize="11"
                            fontWeight="600" fill={age.dead ? '#8c5a1e' : '#3f6b4c'}>
                            {age.label}
                          </text>
                        )}
                        {p.isSelf && <circle cx={w - 14} cy="12" r="5" fill="#2c5038" />}
                        {shared && !p.isSelf && <circle cx={w - 14} cy="12" r="5" fill="#b08341" />}
                      </g>
                    );
                  })}
                  {isCouple && <line x1="0" y1={h / 2} x2={w} y2={h / 2} stroke="#d9d2c4" strokeWidth="1" />}
                </g>
              );
            })}
          </g>
        </svg>
      </div>

      {menu && (
        <PersonQuickMenu
          x={menu.x} y={menu.y} person={menu.person} people={people}
          hasFather={(menu.person.parentIds || []).some((id) => people[id] && people[id].gender !== 'f')}
          hasMother={(menu.person.parentIds || []).some((id) => people[id] && people[id].gender === 'f')}
          onEdit={() => act(onOpen)}
          onAddNew={(relation) => act(onAddNew, relation)}
          onLinkExisting={(relation, existingId) => act(onLinkExisting, relation, existingId)}
          onClose={() => setMenu(null)}
        />
      )}
    </div>
  );
}
