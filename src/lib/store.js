import {
  collection, doc, getDoc, getDocs, setDoc, updateDoc, deleteDoc,
  query, where, onSnapshot, serverTimestamp, addDoc,
} from 'firebase/firestore';
import { db } from '../firebase.js';

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
  return (await getDoc(ref)).data();
}

export async function updateUserSettings(uid, patch) {
  await updateDoc(doc(db, 'users', uid), patch);
}

export async function getUserProfile(uid) {
  const snap = await getDoc(doc(db, 'users', uid));
  return snap.exists() ? snap.data() : null;
}

// ---- Люди (родичі) ----
// Кожна людина належить простору спільного редагування: spaceMembers — масив uid,
// хто може редагувати. Спочатку це лише сам власник [ownerId]; коли двоє дають доступ
// одне одному (взаємний grant), обидва додаються в spaceMembers усіх існуючих записів
// з обох боків — і відтоді це справді один спільний родовід на двох.
export function watchPeople(uid, cb) {
  const q = query(collection(db, 'people'), where('spaceMembers', 'array-contains', uid));
  return onSnapshot(q, (snap) => {
    const people = {};
    snap.forEach((d) => { people[d.id] = { id: d.id, ...d.data() }; });
    cb(people);
  });
}

export async function getPeopleOnce(uid) {
  const q = query(collection(db, 'people'), where('spaceMembers', 'array-contains', uid));
  const snap = await getDocs(q);
  const people = {};
  snap.forEach((d) => { people[d.id] = { id: d.id, ...d.data() }; });
  return people;
}

// Читає дерево за ORIGINAL creator (ownerId), незалежно від spaceMembers —
// використовується лише для автопошуку збігів/сканування чужих дерев,
// де нам потрібні саме "їхні" дані для порівняння, а не спільний простір.
export async function getPeopleByCreator(ownerId) {
  const q = query(collection(db, 'people'), where('ownerId', '==', ownerId));
  const snap = await getDocs(q);
  const people = {};
  snap.forEach((d) => { people[d.id] = { id: d.id, ...d.data() }; });
  return people;
}

// Міграція: старі записи (створені до появи spaceMembers) мають лише ownerId.
// Одноразово при вході проставляємо їм spaceMembers = [ownerId], інакше вони
// зникнуть із запиту array-contains. Безпечно викликати повторно — пропускає вже мігровані.
export async function migrateLegacyPeople(uid) {
  const q = query(collection(db, 'people'), where('ownerId', '==', uid));
  const snap = await getDocs(q);
  const updates = [];
  snap.forEach((d) => {
    const data = d.data();
    if (!data.spaceMembers || data.spaceMembers.length === 0) {
      updates.push(updateDoc(d.ref, { spaceMembers: [uid] }));
    }
  });
  if (updates.length) await Promise.all(updates);
}

export async function addPerson(ownerId, person, actingUid, spaceMembers) {
  const creator = actingUid || ownerId;
  const members = spaceMembers && spaceMembers.length ? Array.from(new Set(spaceMembers)) : [ownerId];
  const ref = await addDoc(collection(db, 'people'), {
    ownerId,
    spaceMembers: members,
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
    createdBy: creator,
    createdByName: person.createdByName || '',
    lastEditedBy: creator,
    lastEditedByName: person.createdByName || '',
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return ref.id;
}

// Пакетне збереження результату онбордингу: створює всіх людей і зв'язки за один прохід.
export async function saveOnboarding(ownerId, data) {
  const { me, father, mother, partner, children } = data;
  const meId = await addPerson(ownerId, { ...me, isSelf: true });

  let fatherId = null, motherId = null;
  const parentIds = [];
  if (father) { fatherId = await addPerson(ownerId, father); parentIds.push(fatherId); }
  if (mother) { motherId = await addPerson(ownerId, mother); parentIds.push(motherId); }

  let partnerId = null;
  if (partner) partnerId = await addPerson(ownerId, partner);

  const childIds = [];
  for (const ch of children || []) childIds.push(await addPerson(ownerId, ch));

  // Зв'язки для "я": батьки зверху, діти знизу, партнер збоку
  await updatePerson(meId, {
    parentIds,
    childIds,
    spouseIds: partnerId ? [partnerId] : [],
  });

  // Зворотні зв'язки
  for (const pid of parentIds) {
    await updatePerson(pid, { childIds: [meId] });
  }
  if (partnerId) {
    await updatePerson(partnerId, { spouseIds: [meId], childIds });
  }
  for (const cid of childIds) {
    const cParents = partnerId ? [meId, partnerId] : [meId];
    await updatePerson(cid, { parentIds: cParents });
  }

  return { meId, fatherId, motherId, partnerId, childIds };
}

export async function updatePerson(personId, patch, actingUid, actingName) {
  const fullPatch = { ...patch, updatedAt: serverTimestamp() };
  if (actingUid) {
    fullPatch.lastEditedBy = actingUid;
    fullPatch.lastEditedByName = actingName || '';
  }
  await updateDoc(doc(db, 'people', personId), fullPatch);
}

export async function deletePerson(personId) {
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
    await updatePerson(parentId, {
      childIds: (parent.childIds || []).filter((id) => id !== childId),
    });
  }
  if (child) {
    await updatePerson(childId, {
      parentIds: (child.parentIds || []).filter((id) => id !== parentId),
    });
  }
}

// ---- Запити доступу до дерева ----
export async function requestAccess(fromUid, fromName, toUid) {
  await addDoc(collection(db, 'accessRequests'), {
    fromUid, fromName, toUid, status: 'pending', createdAt: serverTimestamp(),
  });
}

export function watchIncomingAccess(uid, cb) {
  const q = query(
    collection(db, 'accessRequests'),
    where('toUid', '==', uid),
    where('status', '==', 'pending'),
  );
  return onSnapshot(q, (snap) => {
    const list = [];
    snap.forEach((d) => list.push({ id: d.id, ...d.data() }));
    cb(list);
  });
}

export async function respondAccess(requestId, status) {
  await updateDoc(doc(db, 'accessRequests', requestId), { status });
}

// Кому я надав доступ (grants)
export function watchGrants(uid, cb) {
  const q = query(collection(db, 'grants'), where('ownerId', '==', uid));
  return onSnapshot(q, (snap) => {
    const list = [];
    snap.forEach((d) => list.push({ id: d.id, ...d.data() }));
    cb(list);
  });
}

export async function grantAccess(ownerId, granteeUid, granteeName) {
  // Детермінований ID, щоб правила Firestore могли перевіряти доступ через exists()
  const id = `${ownerId}_${granteeUid}`;
  await setDoc(doc(db, 'grants', id), {
    ownerId, granteeUid, granteeName, createdAt: serverTimestamp(),
  });

  // Перевіряємо, чи це взаємний доступ (зустрічний grant granteeUid -> ownerId вже існує).
  // Якщо так — це і є момент "двоє в парі": зливаємо простори редагування назавжди.
  const reverseId = `${granteeUid}_${ownerId}`;
  const reverseSnap = await getDoc(doc(db, 'grants', reverseId));
  if (reverseSnap.exists()) {
    await mergeSpaces(ownerId, granteeUid);
  }
}

// Зливає простори редагування двох користувачів: усі їхні існуючі записи людей
// стають доступними для редагування ОБОМ (spaceMembers розширюється на обидва uid).
// Викликається лише після підтвердженого взаємного доступу (grant в обидва боки).
export async function mergeSpaces(uidA, uidB) {
  const [peopleA, peopleB] = await Promise.all([
    getPeopleByCreator(uidA),
    getPeopleByCreator(uidB),
  ]);
  // Також враховуємо записи, які вже є в чиємусь розширеному просторі (напр. потрійне злиття)
  const allDocsSnap = await getDocs(query(collection(db, 'people'), where('spaceMembers', 'array-contains', uidA)));
  const allDocsSnapB = await getDocs(query(collection(db, 'people'), where('spaceMembers', 'array-contains', uidB)));

  const touched = new Map(); // id -> {ref, currentMembers}
  const collect = (snap) => snap.forEach((d) => touched.set(d.id, { ref: d.ref, members: d.data().spaceMembers || [] }));
  collect(allDocsSnap);
  collect(allDocsSnapB);
  Object.values(peopleA).forEach((p) => { if (!touched.has(p.id)) touched.set(p.id, { ref: doc(db, 'people', p.id), members: p.spaceMembers || [] }); });
  Object.values(peopleB).forEach((p) => { if (!touched.has(p.id)) touched.set(p.id, { ref: doc(db, 'people', p.id), members: p.spaceMembers || [] }); });

  // Обʼєднаний простір = всі uid, що вже фігурують хоч в одному з документів, + uidA/uidB
  const unifiedSpace = new Set([uidA, uidB]);
  touched.forEach(({ members }) => members.forEach((m) => unifiedSpace.add(m)));
  const finalSpace = Array.from(unifiedSpace);

  const updates = [];
  touched.forEach(({ ref }) => { updates.push(updateDoc(ref, { spaceMembers: finalSpace })); });
  await Promise.all(updates);
}

// Список користувачів (uid), з якими я зараз у спільному просторі редагування —
// обчислюється з моїх власних людей (унікальні spaceMembers мінус я сам).
export function getSpaceCoMembers(myUid, myPeople) {
  const set = new Set();
  Object.values(myPeople).forEach((p) => {
    (p.spaceMembers || []).forEach((m) => { if (m !== myUid) set.add(m); });
  });
  return Array.from(set);
}
// Кожен документ повертається до spaceMembers = [його власний ownerId] — тобто дерево
// знову розпадається на "моє" (те, що я створив) і "її" (те, що вона створила),
// як було до обʼєднання. Дані нікуди не зникають, просто розходяться права редагування.
export async function leaveSharedSpace(myUid, otherUid) {
  const [mySnap, otherSnap] = await Promise.all([
    getDocs(query(collection(db, 'people'), where('spaceMembers', 'array-contains', myUid))),
    getDocs(query(collection(db, 'people'), where('spaceMembers', 'array-contains', otherUid))),
  ]);
  const touched = new Map();
  const collect = (snap) => snap.forEach((d) => touched.set(d.id, d));
  collect(mySnap);
  collect(otherSnap);

  const updates = [];
  touched.forEach((d) => {
    const data = d.data();
    // Документ повертається лише до свого творця — інший учасник втрачає доступ до нього.
    updates.push(updateDoc(d.ref, { spaceMembers: [data.ownerId] }));
  });
  await Promise.all(updates);

  // Прибираємо grants в обидва боки, щоб не спрацювало повторне автозлиття
  const g1 = doc(db, 'grants', `${myUid}_${otherUid}`);
  const g2 = doc(db, 'grants', `${otherUid}_${myUid}`);
  await Promise.all([
    deleteDoc(g1).catch(() => {}),
    deleteDoc(g2).catch(() => {}),
  ]);
}

export async function revokeGrant(grantId) {
  await deleteDoc(doc(db, 'grants', grantId));
}

// Дерева, до яких я маю доступ (я grantee)
export function watchMyAccess(uid, cb) {
  const q = query(collection(db, 'grants'), where('granteeUid', '==', uid));
  return onSnapshot(q, (snap) => {
    const list = [];
    snap.forEach((d) => list.push({ id: d.id, ...d.data() }));
    cb(list);
  });
}

// ---- Пропозиції об'єднання / правок ----
// type: 'link' — пропозиція, що дві персони (mine/theirs) — одна й та ж людина.
export async function createMergeProposal(proposal) {
  await addDoc(collection(db, 'mergeProposals'), {
    ...proposal, status: 'pending', createdAt: serverTimestamp(),
  });
}

export function watchProposals(uid, cb) {
  const q = query(
    collection(db, 'mergeProposals'),
    where('respondentUid', '==', uid),
    where('status', '==', 'pending'),
  );
  return onSnapshot(q, (snap) => {
    const list = [];
    snap.forEach((d) => list.push({ id: d.id, ...d.data() }));
    cb(list);
  });
}

const FILLABLE_FIELDS = [
  'lastName', 'maidenName', 'gender', 'birthDate', 'birthYear', 'birthPlace',
  'deathDate', 'deathPlace', 'bio', 'photoURL',
];

// Доповнює порожні поля моєї персони даними з іншої сторони (якщо там вони є).
// Не перезаписує те, що вже заповнено — лише додає відсутнє.
function fillMissingFields(mine, theirs) {
  const patch = {};
  FILLABLE_FIELDS.forEach((f) => {
    if (!mine[f] && theirs[f]) patch[f] = theirs[f];
  });
  return patch;
}

// Підтвердження пропозиції. КОЖЕН користувач може писати лише у свій документ (правила безпеки),
// тому respondent (той, хто підтверджує) оновлює linkedTo лише на СВОЇЙ персоні (theirPersonId —
// це ID у дереві респондента). Ініціатор, коли сам погоджується на власну пропозицію, або коли
// побачить, що respondent прийняв — оновлює linkedTo на своїй персоні окремим викликом.
// Простіше: приймаючи, respondent одразу оновлює свою персону І позначає пропозицію 'accepted'.
// Клієнт ІНІЦІАТОРА, побачивши статус 'accepted' на своїй пропозиції, довзвʼязує свою сторону.
// Обидві сторони також доповнюють власні порожні поля даними іншої сторони (якщо ті відомі).
export async function acceptProposal(pr, myUid) {
  // myUid — це той, хто зараз підтверджує (завжди pr.respondentUid у нашому UI)
  const isRespondent = myUid === pr.respondentUid;
  const myPersonId = isRespondent ? pr.theirPersonId : pr.minePersonId;
  const otherUid = isRespondent ? pr.initiatorUid : pr.respondentUid;
  const otherPersonId = isRespondent ? pr.minePersonId : pr.theirPersonId;

  const [mySnap, otherSnap] = await Promise.all([
    getDoc(doc(db, 'people', myPersonId)),
    getDoc(doc(db, 'people', otherPersonId)),
  ]);
  if (!mySnap.exists()) throw new Error('Персону не знайдено — можливо, її вже видалили.');
  const mine = mySnap.data();
  const theirs = otherSnap.exists() ? otherSnap.data() : {};

  const merged = Array.from(
    new Map([...(mine.linkedTo || []), { ownerId: otherUid, personId: otherPersonId }]
      .map((l) => [l.ownerId + '_' + l.personId, l])).values()
  );
  const fillPatch = fillMissingFields(mine, theirs);

  await updateDoc(doc(db, 'people', myPersonId), { linkedTo: merged, ...fillPatch });
  await updateDoc(doc(db, 'mergeProposals', pr.id), {
    status: 'accepted',
    [isRespondent ? 'respondentAccepted' : 'initiatorAccepted']: true,
  });
}

// Викликається клієнтом ІНІЦІАТОРА, коли він бачить, що його власна пропозиція отримала
// статус 'accepted' від респондента, але його сторона ще не зв'язана.
export async function completeInitiatorSide(pr) {
  const [mySnap, otherSnap] = await Promise.all([
    getDoc(doc(db, 'people', pr.minePersonId)),
    getDoc(doc(db, 'people', pr.theirPersonId)),
  ]);
  if (!mySnap.exists()) return;
  const mine = mySnap.data();
  const already = (mine.linkedTo || []).some(
    (l) => l.ownerId === pr.respondentUid && l.personId === pr.theirPersonId
  );
  if (already) return;
  const theirs = otherSnap.exists() ? otherSnap.data() : {};
  const merged = Array.from(
    new Map([...(mine.linkedTo || []), { ownerId: pr.respondentUid, personId: pr.theirPersonId }]
      .map((l) => [l.ownerId + '_' + l.personId, l])).values()
  );
  const fillPatch = fillMissingFields(mine, theirs);
  await updateDoc(doc(db, 'people', pr.minePersonId), { linkedTo: merged, ...fillPatch });
}

// Пропозиції, які Я ініціював і respondent вже підтвердив, але моя сторона ще не звʼязана.
export function watchMyAcceptedProposalsToComplete(uid, cb) {
  const q = query(
    collection(db, 'mergeProposals'),
    where('initiatorUid', '==', uid),
    where('status', '==', 'accepted'),
  );
  return onSnapshot(q, (snap) => {
    const list = [];
    snap.forEach((d) => list.push({ id: d.id, ...d.data() }));
    cb(list);
  });
}

export async function rejectProposal(proposalId) {
  await updateDoc(doc(db, 'mergeProposals', proposalId), { status: 'rejected' });
}

// Розірвати вже підтверджене об'єднання конкретної людини (якщо збіг був помилковим).
export async function unlinkPersons(ownerIdA, personIdA, ownerIdB, personIdB) {
  const refA = doc(db, 'people', personIdA);
  const refB = doc(db, 'people', personIdB);
  const [snapA, snapB] = await Promise.all([getDoc(refA), getDoc(refB)]);
  if (snapA.exists()) {
    const linked = (snapA.data().linkedTo || []).filter(
      (l) => !(l.ownerId === ownerIdB && l.personId === personIdB)
    );
    await updateDoc(refA, { linkedTo: linked });
  }
  if (snapB.exists()) {
    const linked = (snapB.data().linkedTo || []).filter(
      (l) => !(l.ownerId === ownerIdA && l.personId === personIdA)
    );
    await updateDoc(refB, { linkedTo: linked });
  }
}

// Усі підтверджені об'єднання, де я є однією зі сторін (для показу в Налаштуваннях).
export async function getMyLinks(uid) {
  const myPeople = await getPeopleOnce(uid);
  const links = [];
  Object.values(myPeople).forEach((p) => {
    (p.linkedTo || []).forEach((l) => {
      links.push({ myPersonId: p.id, myPerson: p, otherOwnerId: l.ownerId, otherPersonId: l.personId });
    });
  });
  return links;
}

// ---- Пошук користувачів (за email) ----
export async function findUserByEmail(email) {
  const q = query(collection(db, 'users'), where('email', '==', email.toLowerCase().trim()));
  const snap = await getDocs(q);
  let found = null;
  snap.forEach((d) => { found = d.data(); });
  return found;
}

export async function getPublicUsers() {
  const q = query(collection(db, 'users'), where('isPublic', '==', true));
  const snap = await getDocs(q);
  const list = [];
  snap.forEach((d) => list.push(d.data()));
  return list;
}

// Усі користувачі системи (включно з приватними) — використовується ЛИШЕ для фонового
// автопошуку збігів. Сам факт приватності не приховує людину від алгоритму порівняння,
// але приховує від людей повний доступ до чужого дерева (це окреме право, grants).
export async function getAllUsersForScan() {
  const snap = await getDocs(collection(db, 'users'));
  const list = [];
  snap.forEach((d) => list.push(d.data()));
  return list;
}

// Дерева, доступні мені для об'єднаного перегляду: моє власне + ті, кому я дав/хто дав мені доступ.
export async function getAccessibleTrees(uid) {
  const own = await getPeopleOnce(uid);
  const trees = [{ ownerId: uid, people: own }];

  const grantsToMe = await getDocs(query(collection(db, 'grants'), where('granteeUid', '==', uid)));
  const ownerIds = new Set();
  grantsToMe.forEach((d) => ownerIds.add(d.data().ownerId));

  for (const ownerId of ownerIds) {
    const theirs = await getPeopleOnce(ownerId);
    trees.push({ ownerId, people: theirs });
  }
  return trees;
}

// Чи вже існує (pending/accepted) пропозиція між цими двома конкретними персонами —
// щоб автоскан не спамив однаковими пропозиціями повторно.
export async function proposalExists(minePersonId, theirPersonId) {
  const q1 = query(
    collection(db, 'mergeProposals'),
    where('minePersonId', '==', minePersonId),
    where('theirPersonId', '==', theirPersonId),
  );
  const q2 = query(
    collection(db, 'mergeProposals'),
    where('minePersonId', '==', theirPersonId),
    where('theirPersonId', '==', minePersonId),
  );
  const [s1, s2] = await Promise.all([getDocs(q1), getDocs(q2)]);
  let found = false;
  s1.forEach((d) => { if (d.data().status !== 'rejected') found = true; });
  s2.forEach((d) => { if (d.data().status !== 'rejected') found = true; });
  return found;
}
