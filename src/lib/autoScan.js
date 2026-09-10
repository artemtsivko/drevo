import { findMatches } from './matching.js';
import {
  getAllUsersForScan, getPeopleOnce, createMergeProposal, proposalExists,
} from './store.js';

// Автоматичний фоновий пошук збігів між моїм деревом і деревами ВСІХ інших користувачів,
// включно з приватними — приватність не приховує людину від алгоритму порівняння,
// вона лише обмежує, що показується в інтерфейсі (лише короткий контекст при пропозиції).
export async function runAutoScan(uid, profile, myPeople, grantedOwnerIds) {
  if (!profile.autoMatchEnabled) return { checked: 0, created: 0 };
  if (Object.keys(myPeople).length === 0) return { checked: 0, created: 0 };

  const allUsers = await getAllUsersForScan();
  const candidateOwners = new Map();
  allUsers.forEach((u) => { if (u.uid !== uid) candidateOwners.set(u.uid, u); });

  let checked = 0, created = 0;

  for (const owner of candidateOwners.values()) {
    const theirPeople = await getPeopleOnce(owner.uid);
    // Якщо простори вже обʼєднані (spaceMembers), одні й ті самі документи потраплять
    // в обидва списки — це не "збіг", а буквально той самий запис. Виключаємо їх.
    const theirPeopleFiltered = {};
    Object.values(theirPeople).forEach((p) => {
      if (!myPeople[p.id]) theirPeopleFiltered[p.id] = p;
    });
    if (Object.keys(theirPeopleFiltered).length === 0) continue;

    const ms = findMatches(myPeople, theirPeopleFiltered);
    checked += ms.length;
    for (const m of ms) {
      // якщо вже пов'язані (linkedTo) — пропускаємо
      const already = (m.mine.linkedTo || []).some((l) => l.ownerId === owner.uid && l.personId === m.theirId);
      if (already) continue;
      const exists = await proposalExists(m.mineId, m.theirId);
      if (exists) continue;
      await createMergeProposal({
        initiatorUid: uid,
        initiatorName: profile.displayName,
        respondentUid: owner.uid,
        type: 'link',
        minePersonId: m.mineId,
        mineName: `${m.mine.firstName} ${m.mine.lastName || ''}`.trim(),
        theirPersonId: m.theirId,
        theirName: `${m.theirs.firstName} ${m.theirs.lastName || ''}`.trim(),
        reasons: m.reasons,
        autoDetected: true,
      });
      created++;
    }
  }
  return { checked, created };
}
