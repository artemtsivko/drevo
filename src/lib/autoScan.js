import { findMatches } from './matching.js';
import {
  getPublicUsers, getPeopleOnce, createMergeProposal, proposalExists,
} from './store.js';

// Автоматичний фоновий пошук збігів між моїм деревом і:
// 1) усіма публічними деревами інших користувачів,
// 2) деревами тих, з ким я вже поділився/хто поділився зі мною доступом (grants).
// Для кожного знайденого збігу, якщо ще немає активної пропозиції — створює нову.
// Викликається періодично (напр. при вході і раз на кілька хвилин) або вручну.
export async function runAutoScan(uid, profile, myPeople, grantedOwnerIds) {
  if (!profile.autoMatchEnabled) return { checked: 0, created: 0 };
  if (Object.keys(myPeople).length === 0) return { checked: 0, created: 0 };

  const candidateOwners = new Map(); // ownerId -> {uid, displayName}

  const publicUsers = await getPublicUsers();
  publicUsers.forEach((u) => { if (u.uid !== uid) candidateOwners.set(u.uid, u); });

  (grantedOwnerIds || []).forEach((o) => {
    if (o.uid !== uid) candidateOwners.set(o.uid, o);
  });

  let checked = 0, created = 0;

  for (const owner of candidateOwners.values()) {
    const theirPeople = await getPeopleOnce(owner.uid);
    const ms = findMatches(myPeople, theirPeople);
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
