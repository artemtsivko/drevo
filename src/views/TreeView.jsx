import React, { useMemo, useState, useRef } from 'react';
import PersonQuickMenu from '../components/PersonQuickMenu.jsx';

// Генеалогічна розкладка "знизу вгору" (як у класичних family-tree builders):
// - партнери показані як ОДНА картка (двоє імен в одному блоці);
// - брати/сестри завжди сусідні (юніти дітей одних батьків розташовуються поруч,
//   без перемішування з юнітами інших батьків);
// - батьківська пара центрується РІВНО над серединою своїх дітей;
// - між піддеревами різних (не кровно пов'язаних по прямій лінії до "я") гілок є
//   додатковий проміжок, щоб візуально відділяти сім'ї;
// - рівень (generation) — я = 0, батьки = -1, діти = +1.

const CARD_W = 220, CARD_H_SINGLE = 74, CARD_H_COUPLE = 116;
const GAP_X = 28, FAMILY_GAP = 56, GAP_Y = 110, SLOT_W = 140;

function assignGenerations(people) {
  const gen = {};
  const ids = Object.keys(people);
  if (ids.length === 0) return gen;

  let start = ids.find((id) => people[id].isSelf);
  if (!start) start = ids.find((id) => !(people[id].parentIds || []).some((p) => people[p]));
  if (!start) start = ids[0];

  const queue = [[start, 0]];
  const seen = new Set();
  while (queue.length) {
    const [id, g] = queue.shift();
    if (seen.has(id)) continue;
    seen.add(id);
    gen[id] = g;
    const p = people[id];
    (p.parentIds || []).forEach((pid) => { if (people[pid] && !seen.has(pid)) queue.push([pid, g - 1]); });
    (p.childIds || []).forEach((cid) => { if (people[cid] && !seen.has(cid)) queue.push([cid, g + 1]); });
    (p.spouseIds || []).forEach((sid) => { if (people[sid] && !seen.has(sid)) queue.push([sid, g]); });
  }
  ids.forEach((id) => { if (gen[id] === undefined) gen[id] = 0; });
  return gen;
}

// Обʼєднує людину з партнером (того ж рівня) в один "юніт" — пара чи одинак.
function buildUnitsIndex(people, gen) {
  const personToUnit = {}; // personId -> unit
  const units = {}; // unitId -> unit
  const seen = new Set();

  Object.keys(people).forEach((id) => {
    if (seen.has(id)) return;
    const p = people[id];
    const spouse = (p.spouseIds || []).find(
      (sid) => people[sid] && gen[sid] === gen[id] && !seen.has(sid)
    );
    let unit;
    if (spouse) {
      let left = id, right = spouse;
      if (people[id].gender === 'f' && people[spouse].gender === 'm') { left = spouse; right = id; }
      unit = { id: left + '_' + right, members: [left, right], isCouple: true, gen: gen[id] };
      seen.add(id); seen.add(spouse);
    } else {
      unit = { id, members: [id], isCouple: false, gen: gen[id] };
      seen.add(id);
    }
    units[unit.id] = unit;
    unit.members.forEach((m) => { personToUnit[m] = unit.id; });
  });

  return { units, personToUnit };
}

function unitHeight(u) { return u.isCouple ? CARD_H_COUPLE : CARD_H_SINGLE; }

// Знаходить дітей юніту (унікальні child-юніти, обʼєднавши дітей усіх членів юніту).
function unitChildren(unit, people, personToUnit) {
  const kidUnits = new Set();
  unit.members.forEach((m) => {
    (people[m].childIds || []).forEach((cid) => {
      const cu = personToUnit[cid];
      if (cu) kidUnits.add(cu);
    });
  });
  return Array.from(kidUnits);
}

// Рекурсивна розкладка: для кожного юніту рахуємо позицію x (центр) на основі
// позицій його дітей (якщо є) — це і гарантує, що брати/сестри йдуть поспіль,
// а батьки центруються над своєю групою дітей, а не над усім рядком покоління.
function layout(people) {
  const gen = assignGenerations(people);
  const { units, personToUnit } = buildUnitsIndex(people, gen);

  const allUnits = Object.values(units);
  const gens = Array.from(new Set(allUnits.map((u) => u.gen))).sort((a, b) => a - b);
  const minGen = gens[0] ?? 0;

  // Корені кожного покоління (юніти БЕЗ батьківського юніту серед видимих)
  const hasParentUnit = new Set();
  allUnits.forEach((u) => {
    const kids = unitChildren(u, people, personToUnit);
    kids.forEach((k) => hasParentUnit.add(k));
  });

  const unitX = {}; // unit.id -> центр по X (ліва межа обчислюється при рендері)
  const visited = new Set();

  // Рекурсивно розміщує піддерево, що починається з юніту `u`, так щоб його ліва
  // межа була >= startX. Повертає [ліва, права] межі зайнятого простору.
  function placeSubtree(u, startX) {
    if (visited.has(u.id)) return [unitX[u.id] - CARD_W / 2, unitX[u.id] + CARD_W / 2];
    visited.add(u.id);

    const kids = unitChildren(u, people, personToUnit)
      .map((id) => units[id])
      .filter(Boolean)
      .sort((a, b) => {
        // Сортуємо дітей за датою народження (старші ліворуч), якщо відома
        const pa = people[a.members[0]], pb = people[b.members[0]];
        const ya = pa.birthDate || pa.birthYear || '9999';
        const yb = pb.birthDate || pb.birthYear || '9999';
        return String(ya).localeCompare(String(yb));
      });

    if (kids.length === 0) {
      unitX[u.id] = startX + CARD_W / 2;
      return [startX, startX + CARD_W];
    }

    let cursor = startX;
    let firstChildCenter = null, lastChildCenter = null;
    kids.forEach((k, i) => {
      const [, right] = placeSubtree(k, cursor);
      const center = unitX[k.id];
      if (i === 0) firstChildCenter = center;
      lastChildCenter = center;
      cursor = right + GAP_X;
    });
    const rightEdge = cursor - GAP_X;
    const myCenter = (firstChildCenter + lastChildCenter) / 2;
    unitX[u.id] = myCenter;
    return [Math.min(startX, myCenter - CARD_W / 2), Math.max(rightEdge, myCenter + CARD_W / 2)];
  }

  // Корені (юніти без видимого батьківського юніту), впорядковані по поколінню
  // від НАЙСТАРШОГО (найменший gen) — так предки задають структуру, а не навпаки.
  // Якщо коренів декілька в одному поколінні — розміщуємо з проміжком FAMILY_GAP,
  // групуючи разом лише тих, хто веде до спільних нащадків (природно вийде через
  // те, що спільні нащадки вже visited і їх x зафіксовано).
  let cursor = 0;
  const topGen = gens[0];
  const topRoots = allUnits.filter((u) => u.gen === topGen && !hasParentUnit.has(u.id));
  // Якщо на найвищому рівні коренів нема (усі мають батьків поза видимим діапазоном —
  // не повинно траплятись, але про всяк випадок), беремо всі юніти найвищого рівня.
  const rootsToPlace = topRoots.length ? topRoots : allUnits.filter((u) => u.gen === topGen);

  rootsToPlace.forEach((r) => {
    const [, right] = placeSubtree(r, cursor);
    cursor = right + FAMILY_GAP;
  });

  // Юніти, які лишились нерозміщеними (відірвані піддерева — напр. хтось доданий
  // без звʼязку з основним деревом) — розкладаємо їх окремими "острівцями" праворуч.
  allUnits.forEach((u) => {
    if (visited.has(u.id)) return;
    const [, right] = placeSubtree(u, cursor);
    cursor = right + FAMILY_GAP;
  });

  // Переводимо x-центри в абсолютні позиції з y за поколінням
  const unitPos = {};
  const memberUnit = {};
  let minX = Infinity, maxX = -Infinity;
  allUnits.forEach((u) => {
    const cx = unitX[u.id];
    minX = Math.min(minX, cx - CARD_W / 2);
    maxX = Math.max(maxX, cx + CARD_W / 2);
  });
  if (!isFinite(minX)) { minX = 0; maxX = CARD_W; }

  const offsetX = SLOT_W - minX + 20;
  allUnits.forEach((u) => {
    const x = unitX[u.id] + offsetX - CARD_W / 2;
    const y = 30 + (u.gen - minGen) * (Math.max(CARD_H_COUPLE, CARD_H_SINGLE) + GAP_Y);
    unitPos[u.id] = { x, y, w: CARD_W, h: unitHeight(u), unit: u };
    u.members.forEach((m) => { memberUnit[m] = u.id; });
  });

  const width = (maxX - minX) + offsetX + SLOT_W + 40;
  const height = 30 + (gens.length ? (gens[gens.length - 1] - minGen + 1) : 1) * (Math.max(CARD_H_COUPLE, CARD_H_SINGLE) + GAP_Y) + 60;

  return { unitPos, memberUnit, width, height, gen, minGen };
}

function born(p) {
  const b = p.birthDate ? p.birthDate.slice(0, 4) : p.birthYear;
  const d = p.deathDate ? p.deathDate.slice(0, 4) : p.deathYear;
  if (!b && !d) return '';
  return `${b || '?'}${d ? '–' + d : ''}`;
}

function ageInfo(p) {
  const birthYear = p.birthDate ? parseInt(p.birthDate.slice(0, 4), 10) : (p.birthYear ? parseInt(p.birthYear, 10) : null);
  if (!birthYear) return null;

  const isDead = !!(p.isDeceased || p.deathDate || p.deathYear);
  if (isDead) {
    const deathYear = p.deathDate ? parseInt(p.deathDate.slice(0, 4), 10) : (p.deathYear ? parseInt(p.deathYear, 10) : null);
    if (!deathYear) return { label: '† помер' + (p.gender === 'f' ? 'ла' : ''), dead: true };
    const years = deathYear - birthYear;
    return { label: `† прожив${p.gender === 'f' ? 'а' : ''} ${years} р.`, dead: true };
  }

  const now = new Date();
  let age = now.getFullYear() - birthYear;
  if (p.birthDate) {
    const bd = new Date(p.birthDate);
    const had = (now.getMonth() > bd.getMonth()) || (now.getMonth() === bd.getMonth() && now.getDate() >= bd.getDate());
    if (!had) age -= 1;
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

export default function TreeView({ people, sharedIds, matchableIds, onOpen, onAddNew, onLinkExisting, onAddPerson, onAddChildDirect, onMatchPerson, fullscreen, onToggleFullscreen }) {
  const { unitPos, memberUnit, width, height, gen, minGen } = useMemo(() => layout(people), [people]);
  const [zoom, setZoom] = useState(0.85);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const drag = useRef(null);
  const pinch = useRef(null);
  const [menu, setMenu] = useState(null);
  const containerRef = useRef(null);

  if (Object.keys(people).length === 0) {
    return <div className="empty"><div className="empty-emoji">🌿</div>Дерево з'явиться, коли додасте родичів.</div>;
  }

  const onDown = (e) => { drag.current = { x: e.clientX - pan.x, y: e.clientY - pan.y }; };
  const onMove = (e) => {
    if (!drag.current) return;
    setPan({ x: e.clientX - drag.current.x, y: e.clientY - drag.current.y });
  };
  const onUp = () => { drag.current = null; };

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

  const childEdges = [];
  const drawnUnits = new Set();
  Object.values(unitPos).forEach(({ unit, x, y, w, h }) => {
    if (drawnUnits.has(unit.id)) return;
    drawnUnits.add(unit.id);
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

  // Слоти "+ додати батьків" для коренів (людей без батьків на найвищому видимому рівні)
  const slots = [];
  Object.values(unitPos).forEach(({ unit, x, y, w, h }) => {
    const anyHasParents = unit.members.some((m) => (people[m].parentIds || []).some((pid) => people[pid]));
    if (!anyHasParents && gen[unit.members[0]] === minGen) {
      slots.push({ x: x + w / 2, y: y - GAP_Y + 20, personId: unit.members[0] });
    }
  });

  return (
    <div className={fullscreen ? 'tree-fullscreen' : 'card'} style={{ padding: 0, overflow: 'hidden', position: 'relative' }} ref={containerRef}>
      <div className="row" style={{ position: 'absolute', top: 10, right: 10, zIndex: 5, gap: 6 }}>
        {onAddPerson && (
          <button className="btn btn-sm" onClick={onAddPerson}>+ Людина</button>
        )}
        <button className="btn btn-ghost btn-sm" onClick={() => setZoom((z) => Math.min(2, z + 0.15))}>+</button>
        <button className="btn btn-ghost btn-sm" onClick={() => setZoom((z) => Math.max(0.3, z - 0.15))}>−</button>
        <button className="btn btn-ghost btn-sm" onClick={() => { setZoom(0.85); setPan({ x: 0, y: 0 }); }}>⟳</button>
        {onToggleFullscreen && (
          <button className="btn btn-ghost btn-sm" onClick={onToggleFullscreen} title={fullscreen ? 'Згорнути' : 'На весь екран'}>
            {fullscreen ? '⤡' : '⤢'}
          </button>
        )}
      </div>
      <div
        className="tree-canvas"
        style={fullscreen ? { height: '100%' } : undefined}
        onMouseDown={onDown} onMouseMove={onMove} onMouseUp={onUp} onMouseLeave={onUp}
        onTouchStart={onTouchStart} onTouchMove={onTouchMove} onTouchEnd={onTouchEnd}
        onWheel={onWheel}
      >
        <svg width="100%" height="100%" style={{ display: 'block', cursor: drag.current ? 'grabbing' : 'grab' }}>
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
                    const shared = sharedIds && sharedIds.has(p.id);
                    const matchable = matchableIds && matchableIds.has(p.id);
                    const rowH = isCouple ? h / 2 : h;
                    const ry = i * rowH;
                    const age = ageInfo(p);
                    const textX = w / 2;
                    return (
                      <g key={mid} transform={`translate(0,${ry})`}>
                        <rect width={w} height={rowH} rx={isCouple ? 0 : 12}
                          fill={bg(p)}
                          stroke={p.isSelf ? '#2c5038' : shared ? '#b08341' : border(p)}
                          strokeWidth={p.isSelf ? '2.6' : '1.4'}
                          style={{ cursor: 'pointer' }}
                          onClick={(e) => openMenu(e, p)} />
                        <text x={textX} y={rowH / 2 - 16} textAnchor="middle" fontFamily="Georgia, serif" fontSize="14" fontWeight="700" fill="#1c2620" style={{ pointerEvents: 'none' }}>
                          {(p.firstName + ' ' + (p.lastName || '')).trim().slice(0, 22)}
                        </text>
                        <text x={textX} y={rowH / 2 + 2} textAnchor="middle" fontFamily="Segoe UI, sans-serif" fontSize="11" fill="#4a5850" style={{ pointerEvents: 'none' }}>
                          {born(p)}{p.maidenName ? ' · уродж. ' + p.maidenName.slice(0, 12) : ''}
                        </text>
                        {age && (
                          <text x={textX} y={rowH / 2 + 18} textAnchor="middle" fontFamily="Segoe UI, sans-serif" fontSize="11"
                            fontWeight="600" fill={age.dead ? '#8c5a1e' : '#3f6b4c'} style={{ pointerEvents: 'none' }}>
                            {age.label}
                          </text>
                        )}
                        {p.isSelf && <circle cx={w - 14} cy="12" r="5" fill="#2c5038" style={{ pointerEvents: 'none' }} />}
                        {shared && !p.isSelf && <circle cx={w - 14} cy="12" r="5" fill="#b08341" style={{ pointerEvents: 'none' }} />}
                        {matchable && (
                          <g transform={`translate(14,12)`} style={{ cursor: 'pointer' }}
                            onClick={(e) => { e.stopPropagation(); onMatchPerson && onMatchPerson(p); }}>
                            <circle r="9" fill="#fff" stroke="#b08341" strokeWidth="1.5" />
                            <text textAnchor="middle" dy="3.5" fontSize="11" fill="#b08341">🔗</text>
                          </g>
                        )}
                        {/* Кнопка "+ дитина" знизу картки */}
                        <g transform={`translate(${w / 2},${rowH + (i === unit.members.length - 1 ? 0 : 0)})`}
                          style={{ cursor: 'pointer', display: i === unit.members.length - 1 ? 'block' : 'none' }}
                          onClick={(e) => { e.stopPropagation(); onAddChildDirect ? onAddChildDirect(p) : onAddNew('child', p); }}>
                        </g>
                      </g>
                    );
                  })}
                  {isCouple && <line x1="0" y1={h / 2} x2={w} y2={h / 2} stroke="#d9d2c4" strokeWidth="1" />}
                  {/* Кнопка "+" знизу картки-юніту — додати дитину */}
                  <g transform={`translate(${w / 2},${h})`} style={{ cursor: 'pointer' }}
                    onClick={() => onAddNew('child', people[unit.members[0]])}>
                    <circle cy="14" r="11" fill="#fffdf8" stroke="#9db3a2" strokeWidth="1.5" />
                    <text y="18.5" textAnchor="middle" fontSize="15" fill="#3f6b4c">+</text>
                  </g>
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
          hasPartner={(menu.person.spouseIds || []).some((id) => people[id])}
          onEdit={() => act(onOpen)}
          onAddNew={(relation) => act(onAddNew, relation)}
          onLinkExisting={(relation, existingId) => act(onLinkExisting, relation, existingId)}
          onClose={() => setMenu(null)}
        />
      )}
    </div>
  );
}
