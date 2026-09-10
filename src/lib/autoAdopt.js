import { scoreMatch } from './matching.js';
import { getAllUsersForScan, getPeopleOnce, addPerson, updatePerson } from './store.js';

// "Сильний" збіг — для автоматичного копіювання гілки без підтвердження.
// Вимагаємо не просто ім'я+рік, а щоб чужий запис уже мав СВОЇХ батьків або інших дітей —
// це ознака, що там справді ціле дерево, а не самотній однофамілець.
function isStrongMatch(a, peopleA, b, peopleB) {
  const r = scoreMatch(a, peopleA, b, peopleB);
  if (!r.match) return false;
  const bHasOwnParents = (b.parentIds || []).some((id) => peopleB[id]);
  const bHasOtherChildren = (b.childIds || []).some((id) => peopleB[id]);
  return bHasOwnParents || bHasOtherChildren;
}

// Копіює гілку предків і рідних дітей (братів/сестер) від знайденого збігу matchPersonId
// (з чужого дерева theirPeople) у моє дерево, під ownerId = myUid.
// myExistingPersonId — якщо це саме той запис, що я вже маю (мій батько/мати) — не дублюємо,
// а домальовуємо йому предків/братів-сестер.
async function copyBranch(myUid, sourceOwnerId, theirPeople, matchPersonId, myExistingPersonId, alreadyCopied) {
  if (alreadyCopied.has(matchPersonId)) return alreadyCopied.get(matchPersonId);

  const source = theirPeople[matchPersonId];
  if (!source) return null;

  const myId = myExistingPersonId || await addPerson(myUid, {
    firstName: source.firstName, lastName: source.lastName, maidenName: source.maidenName,
    gender: source.gender, birthDate: source.birthDate, birthYear: source.birthYear,
    birthPlace: source.birthPlace, deathDate: source.deathDate, deathPlace: source.deathPlace,
    bio: source.bio,
    linkedTo: [{ ownerId: sourceOwnerId, personId: matchPersonId }],
  });
  alreadyCopied.set(matchPersonId, myId);

  const newParentIds = [];
  for (const pid of source.parentIds || []) {
    const copiedParentId = await copyBranch(myUid, sourceOwnerId, theirPeople, pid, null, alreadyCopied);
    if (copiedParentId) newParentIds.push(copiedParentId);
  }

  const newChildIds = [];
  for (const cid of source.childIds || []) {
    if (cid === matchPersonId) continue;
    const copiedChildId = await copyBranch(myUid, sourceOwnerId, theirPeople, cid, null, alreadyCopied);
    if (copiedChildId) newChildIds.push(copiedChildId);
  }

  if (newParentIds.length) {
    await updatePerson(myId, { parentIds: newParentIds });
    for (const pid of newParentIds) {
      await updatePerson(pid, { childIds: Array.from(new Set([myId])) });
    }
  }
  if (newChildIds.length) {
    await updatePerson(myId, { childIds: newChildIds });
    for (const cid of newChildIds) {
      await updatePerson(cid, { parentIds: Array.from(new Set([myId])) });
    }
  }
  return myId;
}

// Головна функція: викликається одразу після завершення онбордингу.
// Перевіряє батька і матір новачка на сильний збіг з чужими деревами; якщо знайдено —
// копіює гілку (предків + братів/сестер) у дерево новачка, автоматично, без підтвердження.
export async function tryAutoAdopt(myUid, myPeopleAfterOnboarding, fatherLocalId, motherLocalId) {
  const allUsers = await getAllUsersForScan();
  const targets = [fatherLocalId, motherLocalId].filter(Boolean);
  if (targets.length === 0) return { adopted: 0 };

  let adopted = 0;

  for (const owner of allUsers) {
    if (owner.uid === myUid) continue;
    const theirPeople = await getPeopleOnce(owner.uid);
    if (Object.keys(theirPeople).length === 0) continue;

    for (const myParentId of targets) {
      const myParent = myPeopleAfterOnboarding[myParentId];
      if (!myParent) continue;
      for (const theirPerson of Object.values(theirPeople)) {
        if (isStrongMatch(myParent, myPeopleAfterOnboarding, theirPerson, theirPeople)) {
          const alreadyCopied = new Map();
          await copyBranch(myUid, owner.uid, theirPeople, theirPerson.id, myParentId, alreadyCopied);
          adopted++;
          break; // досить одного сильного збігу на цього батька/матір
        }
      }
    }
  }
  return { adopted };
}
