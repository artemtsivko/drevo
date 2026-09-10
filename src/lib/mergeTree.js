// Будує "об'єднаний" родовід з кількох дерев (моє + ті, до яких мені надано доступ),
// зливаючи персон, позначених як linkedTo (підтверджене об'єднання) в один вузол.
//
// Формат вхідних дерев: [{ ownerId, people: {id: person} }, ...]
// Формат виходу: { people: {mergedId: mergedPerson} } — де mergedPerson містить
// обʼєднані parentIds/childIds/spouseIds (де посилання вже перекладені на mergedId),
// і поле sources: [{ownerId, personId}] — звідки взяті дані.

function keyOf(ownerId, personId) { return `${ownerId}::${personId}`; }

export function buildMergedTree(trees) {
  // 1. Індексуємо всіх людей за (ownerId, personId)
  const raw = {}; // key -> {ownerId, personId, person}
  trees.forEach(({ ownerId, people }) => {
    Object.values(people || {}).forEach((p) => {
      raw[keyOf(ownerId, p.id)] = { ownerId, personId: p.id, person: p };
    });
  });

  // 2. Union-Find для злиття пов'язаних персон (linkedTo — симетрично підтверджені пари)
  const parent = {};
  const find = (k) => {
    if (!(k in parent)) parent[k] = k;
    while (parent[k] !== k) k = parent[k];
    return k;
  };
  const union = (a, b) => {
    const ra = find(a), rb = find(b);
    if (ra !== rb) parent[ra] = rb;
  };

  Object.values(raw).forEach(({ ownerId, personId, person }) => {
    (person.linkedTo || []).forEach((link) => {
      const otherKey = keyOf(link.ownerId, link.personId);
      if (raw[otherKey]) union(keyOf(ownerId, personId), otherKey);
    });
  });

  // 3. Групуємо за коренем union-find
  const groups = {}; // rootKey -> [entries]
  Object.keys(raw).forEach((k) => {
    const r = find(k);
    (groups[r] = groups[r] || []).push(raw[k]);
  });

  // 4. Будуємо обʼєднаних людей: root key групи = mergedId
  const mergedId = {}; // key -> mergedId
  Object.entries(groups).forEach(([root, entries]) => {
    entries.forEach((e) => { mergedId[keyOf(e.ownerId, e.personId)] = root; });
  });

  const merged = {};
  Object.entries(groups).forEach(([root, entries]) => {
    // Беремо найповніший запис як основу (найбільше заповнених полів), решта — джерела
    const base = entries.slice().sort((a, b) => fieldCount(b.person) - fieldCount(a.person))[0];
    const parentSet = new Set();
    const childSet = new Set();
    const spouseSet = new Set();
    entries.forEach((e) => {
      (e.person.parentIds || []).forEach((pid) => {
        const mk = mergedId[keyOf(e.ownerId, pid)];
        if (mk) parentSet.add(mk);
      });
      (e.person.childIds || []).forEach((cid) => {
        const mk = mergedId[keyOf(e.ownerId, cid)];
        if (mk) childSet.add(mk);
      });
      (e.person.spouseIds || []).forEach((sid) => {
        const mk = mergedId[keyOf(e.ownerId, sid)];
        if (mk) spouseSet.add(mk);
      });
    });

    merged[root] = {
      ...base.person,
      id: root,
      parentIds: Array.from(parentSet).slice(0, 2),
      childIds: Array.from(childSet),
      spouseIds: Array.from(spouseSet),
      isMerged: entries.length > 1,
      sources: entries.map((e) => ({ ownerId: e.ownerId, personId: e.personId })),
    };
  });

  return { people: merged, keyToMergedId: mergedId };
}

function fieldCount(p) {
  let n = 0;
  ['firstName', 'lastName', 'maidenName', 'birthDate', 'birthYear', 'birthPlace',
    'deathDate', 'deathPlace', 'bio', 'photoURL', 'gender'].forEach((f) => { if (p[f]) n++; });
  return n;
}
