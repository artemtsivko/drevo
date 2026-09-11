import {
  collection, doc, getDoc, getDocs, setDoc, updateDoc, deleteDoc,
  query, where, onSnapshot, serverTimestamp, addDoc, arrayUnion, arrayRemove,
} from 'firebase/firestore';
import { db } from '../firebase.js';
import { findMatches } from './matching.js';

// =====================================================================================
// МОДЕЛЬ: "Family Space" (спільний простір)
// =====================================================================================
// Кожна людина (документ у /people) належить РІВНО ОДНОМУ простору через поле spaceId.
// Простір — документ у /familySpaces: { members: [uid, uid, ...] }.
// Право редагувати людину = мій uid є в members того простору, якому вона належить.
//
// Це замінює попередній підхід (масив spaceMembers на кожному документі людини), бо:
//  - об'єднання/вихід — це ОДНА зміна одного документа простору, а не сотні updateDoc;
//  - Firestore Rules можуть перевірити належність через єдиний get(), без вразливих
//    масових операцій, які частково падали через права доступу.
//
// linkedTo лишається ОКРЕМИМ поняттям: це позначка "ця персона з іншого простору —
// та сама людина, що й ця" (для показу "спільний родич"), і не впливає на права редагування.
// =====================================================================================

// ---- Профіль користувача ----
export async function ensureUserProfile(user) {
  const ref = doc(db, 'users', user.uid);
  const snap = await getDoc(ref);
  if (!snap.exists()) {
    await setDoc(ref, {
      uid: user.uid,
      displayName: user.displayName || '',
      email: user.email || '',
      photoURL: user.photoURL || '',
      isPublic: false,
      autoMatchEnabled: true,
      createdAt: serverTimestamp(),
    });
  }
  const spaceId = await ensureOwnSpace(user.uid);
  const profile = (await getDoc(ref)).data();
  return { ...profile, spaceId };
}

export async function updateUserSettings(uid, patch) {
  await updateDoc(doc(db, 'users', uid), patch);
}

export async function getUserProfile(uid) {
  const snap = await getDoc(doc(db, 'users', uid));
  return snap.exists() ? snap.data() : null;
}

// ---- Family Spaces ----
export async function ensureOwnSpace(uid) {
  const existing = await getDocs(query(collection(db, 'familySpaces'), where('members', 'array-contains', uid)));
  if (!existing.empty) return existing.docs[0].id;
  const ref = await addDoc(collection(db, 'familySpaces'), {
    members: [uid],
    createdAt: serverTimestamp(),
  });
  return ref.id;
}

export function watchMySpace(uid, cb) {
  const q = query(collection(db, 'familySpaces'), where('members', 'array-contains', uid));
  return onSnapshot(q, async (snap) => {
    if (snap.empty) { cb(null); return; }
    if (snap.size === 1) {
      const d = snap.docs[0];
      cb({ id: d.id, ...d.data() });
      return;
    }
    // Перехідний стан (щойно відбулось обʼєднання): я числюсь у кількох просторах.
    // Знаходимо той, де реально є люди — це і є актуальний; запускаємо фонову очистку
    // порожніх дублікатів (не чекаючи результату, щоб не затримувати відображення).
    cleanupEmptyMergedSpaces(uid).catch(() => {});
    for (const d of snap.docs) {
      const peopleSnap = await getDocs(query(collection(db, 'people'), where('spaceId', '==', d.id)));
      if (!peopleSnap.empty) { cb({ id: d.id, ...d.data() }); return; }
    }
    // Усі порожні (щойно щойно щойно) — беремо перший, очистка невдовзі приведе до норми
    const d = snap.docs[0];
    cb({ id: d.id, ...d.data() });
  });
}

export async function getSpace(spaceId) {
  const snap = await getDoc(doc(db, 'familySpaces', spaceId));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

// ---- Люди (родичі) ----
export function watchPeople(spaceId, cb) {
  if (!spaceId) { cb({}); return () => {}; }
  const q = query(collection(db, 'people'), where('spaceId', '==', spaceId));
  return onSnapshot(q, (snap) => {
    const people = {};
    snap.forEach((d) => { people[d.id] = { id: d.id, ...d.data() }; });
    cb(people);
  });
}

export async function getPeopleOnce(spaceId) {
  if (!spaceId) return {};
  const q = query(collection(db, 'people'), where('spaceId', '==', spaceId));
  const snap = await getDocs(q);
  const people = {};
  snap.forEach((d) => { people[d.id] = { id: d.id, ...d.data() }; });
  return people;
}

export async function addPerson(spaceId, person, actingUid, actingName) {
  const ref = await addDoc(collection(db, 'people'), {
    spaceId,
    firstName: person.firstName || '',
    lastName: person.lastName || '',
    maidenName: person.maidenName || '',
    gender: person.gender || '',
    birthDate: person.birthDate || '',
    birthYear: person.birthYear || '',
    birthPlace: person.birthPlace || '',
    deathDate: person.deathDate || '',
    deathPlace: person.deathPlace || '',
    bio: person.bio || '',
    photoURL: person.photoURL || '',
    isSelf: person.isSelf || false,
    parentIds: person.parentIds || [],
    childIds: person.childIds || [],
    spouseIds: person.spouseIds || [],
    linkedTo: person.linkedTo || [],
    createdBy: actingUid || '',
    createdByName: actingName || '',
    lastEditedBy: actingUid || '',
    lastEditedByName: actingName || '',
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return ref.id;
}

export async function updatePerson(personId, patch, actingUid, actingName) {
  const fullPatch = { ...patch, updatedAt: serverTimestamp() };
  if (actingUid) {
    fullPatch.lastEditedBy = actingUid;
    fullPatch.lastEditedByName = actingName || '';
  }
  await updateDoc(doc(db, 'people', personId), fullPatch);
}

// Видаляє людину І очищує всі посилання на неї в інших людей того ж простору.
export async function deletePerson(personId, spaceId) {
  const people = await getPeopleOnce(spaceId);
  const updates = [];
  Object.values(people).forEach((p) => {
    if (p.id === personId) return;
    let changed = false;
    const patch = {};
    if ((p.parentIds || []).includes(personId)) {
      patch.parentIds = p.parentIds.filter((id) => id !== personId);
      changed = true;
    }
    if ((p.childIds || []).includes(personId)) {
      patch.childIds = p.childIds.filter((id) => id !== personId);
      changed = true;
    }
    if ((p.spouseIds || []).includes(personId)) {
      patch.spouseIds = p.spouseIds.filter((id) => id !== personId);
      changed = true;
    }
    if (changed) updates.push(updateDoc(doc(db, 'people', p.id), patch));
  });
  await Promise.all(updates);
  await deleteDoc(doc(db, 'people', personId));
}

// Двонаправлене зв'язування батько<->дитина
export async function linkParentChild(parentId, childId, people) {
  const parent = people[parentId];
  const child = people[childId];
  if (!parent || !child) return;
  const newChildIds = Array.from(new Set([...(parent.childIds || []), childId]));
  const newParentIds = Array.from(new Set([...(child.parentIds || []), parentId]));
  await updatePerson(parentId, { childIds: newChildIds });
  await updatePerson(childId, { parentIds: newParentIds });
}

export async function unlinkParentChild(parentId, childId, people) {
  const parent = people[parentId];
  const child = people[childId];
  if (parent) {
    await updatePerson(parentId, { childIds: (parent.childIds || []).filter((id) => id !== childId) });
  }
  if (child) {
    await updatePerson(childId, { parentIds: (child.parentIds || []).filter((id) => id !== parentId) });
  }
}

// =====================================================================================
// ПОШУК ЗБІГІВ І ПРОПОЗИЦІЇ ОБ'ЄДНАННЯ ПРОСТОРІВ
// =====================================================================================
export async function getAllUsersForScan() {
  const snap = await getDocs(collection(db, 'users'));
  const list = [];
  snap.forEach((d) => list.push(d.data()));
  return list;
}

export async function scanForSpaceMatches(mySpaceId, myPeople) {
  const allSpacesSnap = await getDocs(collection(db, 'familySpaces'));
  const results = [];
  for (const spaceDoc of allSpacesSnap.docs) {
    if (spaceDoc.id === mySpaceId) continue;
    const theirPeople = await getPeopleOnce(spaceDoc.id);
    if (Object.keys(theirPeople).length === 0) continue;
    const matches = findMatches(myPeople, theirPeople);
    if (matches.length > 0) {
      results.push({ theirSpaceId: spaceDoc.id, theirMembers: spaceDoc.data().members || [], matches });
    }
  }
  return results;
}

export async function spaceMergeProposalExists(spaceA, spaceB) {
  const q1 = query(
    collection(db, 'spaceMergeProposals'),
    where('fromSpaceId', '==', spaceA), where('toSpaceId', '==', spaceB), where('status', '==', 'pending'),
  );
  const q2 = query(
    collection(db, 'spaceMergeProposals'),
    where('fromSpaceId', '==', spaceB), where('toSpaceId', '==', spaceA), where('status', '==', 'pending'),
  );
  const [s1, s2] = await Promise.all([getDocs(q1), getDocs(q2)]);
  return !s1.empty || !s2.empty;
}

export async function createSpaceMergeProposal({ fromSpaceId, fromUid, fromName, toSpaceId, matches }) {
  const matchSummary = matches.map((m) => ({
    mineId: m.mineId, theirId: m.theirId, reasons: m.reasons,
    mineName: `${m.mine.firstName} ${m.mine.lastName || ''}`.trim(),
    theirName: `${m.theirs.firstName} ${m.theirs.lastName || ''}`.trim(),
  }));
  await addDoc(collection(db, 'spaceMergeProposals'), {
    fromSpaceId, fromUid, fromName, toSpaceId,
    matches: matchSummary,
    status: 'pending',
    createdAt: serverTimestamp(),
  });
}

export function watchIncomingSpaceMergeProposals(mySpaceId, cb) {
  if (!mySpaceId) { cb([]); return () => {}; }
  const q = query(
    collection(db, 'spaceMergeProposals'),
    where('toSpaceId', '==', mySpaceId),
    where('status', '==', 'pending'),
  );
  return onSnapshot(q, (snap) => {
    const list = [];
    snap.forEach((d) => list.push({ id: d.id, ...d.data() }));
    cb(list);
  });
}

export async function rejectSpaceMergeProposal(proposalId) {
  await updateDoc(doc(db, 'spaceMergeProposals', proposalId), { status: 'rejected' });
}

const FILLABLE_FIELDS = [
  'lastName', 'maidenName', 'gender', 'birthDate', 'birthYear', 'birthPlace',
  'deathDate', 'deathPlace', 'bio', 'photoURL',
];

// Приймає пропозицію (викликає учасник TOSPACE — той, кому її адресовано).
// Переносить усіх людей fromSpace у toSpace (з перекладом id для збіжних), додає
// учасників fromSpace у members toSpace. Старий fromSpace лишається існувати —
// його колишні учасники самі приберуть себе з нього при наступному завантаженні
// (finishLeavingOldSpace), бо лише вони мають право редагувати той документ.
export async function acceptSpaceMergeProposal(proposal) {
  const { fromSpaceId, toSpaceId, matches } = proposal;

  const [fromPeople, toPeople, fromSpaceSnap] = await Promise.all([
    getPeopleOnce(fromSpaceId),
    getPeopleOnce(toSpaceId),
    getDoc(doc(db, 'familySpaces', fromSpaceId)),
  ]);
  const fromMembers = fromSpaceSnap.exists() ? (fromSpaceSnap.data().members || []) : [];

  const matchedFromIds = new Set((matches || []).map((m) => m.theirId));
  const updates = [];

  (matches || []).forEach((m) => {
    const mine = toPeople[m.mineId];
    const theirs = fromPeople[m.theirId];
    if (!mine || !theirs) return;
    const patch = {};
    FILLABLE_FIELDS.forEach((f) => { if (!mine[f] && theirs[f]) patch[f] = theirs[f]; });
    const linkedTo = Array.from(
      new Map([...(mine.linkedTo || []), { spaceId: fromSpaceId, personId: m.theirId }]
        .map((l) => [l.spaceId + '_' + l.personId, l])).values()
    );
    patch.linkedTo = linkedTo;
    updates.push(updateDoc(doc(db, 'people', m.mineId), patch));
  });

  const idMap = {};
  (matches || []).forEach((m) => { idMap[m.theirId] = m.mineId; });
  Object.values(fromPeople).forEach((p) => {
    if (matchedFromIds.has(p.id)) return;
    idMap[p.id] = p.id;
  });

  Object.values(fromPeople).forEach((p) => {
    if (matchedFromIds.has(p.id)) return;
    const remap = (ids) => (ids || []).map((id) => idMap[id] || id).filter(Boolean);
    updates.push(updateDoc(doc(db, 'people', p.id), {
      spaceId: toSpaceId,
      parentIds: remap(p.parentIds),
      childIds: remap(p.childIds),
      spouseIds: remap(p.spouseIds),
    }));
  });

  (matches || []).forEach((m) => {
    const theirs = fromPeople[m.theirId];
    const mine = toPeople[m.mineId];
    if (!theirs || !mine) return;
    const remap = (ids) => (ids || []).map((id) => idMap[id] || id).filter(Boolean);
    const mergedParents = Array.from(new Set([...(mine.parentIds || []), ...remap(theirs.parentIds)])).slice(0, 2);
    const mergedChildren = Array.from(new Set([...(mine.childIds || []), ...remap(theirs.childIds)]));
    const mergedSpouses = Array.from(new Set([...(mine.spouseIds || []), ...remap(theirs.spouseIds)]));
    updates.push(updateDoc(doc(db, 'people', m.mineId), {
      parentIds: mergedParents, childIds: mergedChildren, spouseIds: mergedSpouses,
    }));
  });

  await Promise.all(updates);

  await updateDoc(doc(db, 'familySpaces', toSpaceId), {
    members: arrayUnion(...fromMembers),
  });
  // fromSpace лишається існувати з усіма своїми колишніми members, але БЕЗ жодної
  // людини (усі перенесені). Кожен його колишній учасник, відкривши застосунок,
  // сам побачить (watchMySpace знайде і toSpace, і порожній fromSpace) і викличе
  // finishLeavingOldSpace, щоб прибрати себе з fromSpace.members остаточно.
  await updateDoc(doc(db, 'spaceMergeProposals', proposal.id), { status: 'accepted' });
}

// Довершення з боку КОЛИШНЬОГО учасника fromSpace: якщо він тепер в toSpace (є в його
// members) і fromSpace уже порожній (усі люди перенесені) — прибирає себе з fromSpace.
// Безпечно викликати завжди при вході: якщо нема застарілих порожніх просторів — нічого не робить.
export async function cleanupEmptyMergedSpaces(myUid) {
  const mySpacesSnap = await getDocs(query(collection(db, 'familySpaces'), where('members', 'array-contains', myUid)));
  if (mySpacesSnap.size <= 1) return; // немає дублікатів — нічого прибирати

  for (const spaceDoc of mySpacesSnap.docs) {
    const peopleSnap = await getDocs(query(collection(db, 'people'), where('spaceId', '==', spaceDoc.id)));
    if (peopleSnap.empty) {
      // Цей простір порожній для мене (усі люди вже деінде) — виходжу з нього.
      await updateDoc(doc(db, 'familySpaces', spaceDoc.id), { members: arrayRemove(myUid) }).catch(() => {});
    }
  }
}

// =====================================================================================
// ВИХІД ЗІ СПІЛЬНОГО ПРОСТОРУ ПО КРОВНІЙ ЛІНІЇ
// =====================================================================================
function computeMyBloodline(myUid, people) {
  const starts = Object.values(people).filter((p) => p.createdBy === myUid).map((p) => p.id);
  const visited = new Set(starts);
  const queue = [...starts];
  while (queue.length) {
    const id = queue.shift();
    const p = people[id];
    if (!p) continue;
    (p.parentIds || []).forEach((pid) => { if (people[pid] && !visited.has(pid)) { visited.add(pid); queue.push(pid); } });
    (p.childIds || []).forEach((cid) => { if (people[cid] && !visited.has(cid)) { visited.add(cid); queue.push(cid); } });
  }
  return visited;
}

function isSharedChild(person, myLine, otherUids, people) {
  const parents = (person.parentIds || []).map((id) => people[id]).filter(Boolean);
  const hasMyLineParent = parents.some((pp) => myLine.has(pp.id));
  const hasOtherParent = parents.some((pp) => pp.createdBy && otherUids.includes(pp.createdBy) && !myLine.has(pp.id));
  return hasMyLineParent && hasOtherParent;
}

export async function leaveFamilySpace(myUid, currentSpaceId) {
  const [people, spaceSnap] = await Promise.all([
    getPeopleOnce(currentSpaceId),
    getDoc(doc(db, 'familySpaces', currentSpaceId)),
  ]);
  if (!spaceSnap.exists()) throw new Error('Простір не знайдено.');
  const members = spaceSnap.data().members || [];
  const otherUids = members.filter((m) => m !== myUid);
  if (otherUids.length === 0) return;

  const myLine = computeMyBloodline(myUid, people);
  const sharedChildren = Object.values(people).filter((p) => !myLine.has(p.id) && isSharedChild(p, myLine, otherUids, people));

  const newSpaceRef = await addDoc(collection(db, 'familySpaces'), {
    members: [myUid], createdAt: serverTimestamp(),
  });
  const newSpaceId = newSpaceRef.id;

  const idMap = {};
  const updates = [];

  myLine.forEach((id) => {
    idMap[id] = id;
    updates.push(updateDoc(doc(db, 'people', id), { spaceId: newSpaceId }));
  });

  for (const child of sharedChildren) {
    const newId = await addPerson(newSpaceId, {
      ...child,
      linkedTo: Array.from(new Map([...(child.linkedTo || []), { spaceId: currentSpaceId, personId: child.id }]
        .map((l) => [l.spaceId + '_' + l.personId, l])).values()),
    }, child.createdBy, child.createdByName);
    idMap[child.id] = newId;
    updates.push(updateDoc(doc(db, 'people', child.id), {
      linkedTo: Array.from(new Map([...(child.linkedTo || []), { spaceId: newSpaceId, personId: newId }]
        .map((l) => [l.spaceId + '_' + l.personId, l])).values()),
    }));
  }

  await Promise.all(updates);

  const remapUpdates = [];
  const newSpacePeopleIds = new Set([...myLine, ...sharedChildren.map((c) => idMap[c.id])]);
  for (const id of newSpacePeopleIds) {
    const isCopy = sharedChildren.some((c) => idMap[c.id] === id);
    const original = isCopy ? sharedChildren.find((c) => idMap[c.id] === id) : people[id];
    if (!original) continue;
    const remap = (ids) => (ids || []).map((rid) => idMap[rid]).filter((rid) => rid && newSpacePeopleIds.has(rid));
    remapUpdates.push(updateDoc(doc(db, 'people', id), {
      parentIds: remap(original.parentIds),
      childIds: remap(original.childIds),
      spouseIds: remap(original.spouseIds),
    }));
  }
  await Promise.all(remapUpdates);

  await updateDoc(doc(db, 'familySpaces', currentSpaceId), { members: arrayRemove(myUid) });
}

// =====================================================================================
// ОНБОРДИНГ
// =====================================================================================
export async function saveOnboarding(spaceId, data, actingUid, actingName) {
  const { me, father, mother, partner, children } = data;
  const meId = await addPerson(spaceId, { ...me, isSelf: true }, actingUid, actingName);

  let fatherId = null, motherId = null;
  const parentIds = [];
  if (father) { fatherId = await addPerson(spaceId, father, actingUid, actingName); parentIds.push(fatherId); }
  if (mother) { motherId = await addPerson(spaceId, mother, actingUid, actingName); parentIds.push(motherId); }

  let partnerId = null;
  if (partner) partnerId = await addPerson(spaceId, partner, actingUid, actingName);

  const childIds = [];
  for (const ch of children || []) childIds.push(await addPerson(spaceId, ch, actingUid, actingName));

  await updatePerson(meId, { parentIds, childIds, spouseIds: partnerId ? [partnerId] : [] });
  for (const pid of parentIds) await updatePerson(pid, { childIds: [meId] });
  if (partnerId) await updatePerson(partnerId, { spouseIds: [meId], childIds });
  for (const cid of childIds) {
    await updatePerson(cid, { parentIds: partnerId ? [meId, partnerId] : [meId] });
  }

  return { meId, fatherId, motherId, partnerId, childIds };
}

// ---- Пошук користувачів (за email) ----
export async function findUserByEmail(email) {
  const q = query(collection(db, 'users'), where('email', '==', email.toLowerCase().trim()));
  const snap = await getDocs(q);
  let found = null;
  snap.forEach((d) => { found = d.data(); });
  return found;
}
