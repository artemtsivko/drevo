import {
  getAllUsersForScan, getPeopleOnce, scanForSpaceMatches,
  spaceMergeProposalExists, createSpaceMergeProposal,
} from './store.js';

// Фоновий автопошук: шукає збіги між моїм простором і всіма іншими просторами системи
// (включно з приватними — приватність не приховує від порівняння, лише від повного
// перегляду). Для кожного простору зі збігами створює ОДНУ пропозицію об'єднання
// (не окрему на кожну людину), якщо така ще не існує.
export async function runAutoScan(myUid, profile, mySpaceId, myPeople) {
  if (!profile.autoMatchEnabled) return { created: 0 };
  if (Object.keys(myPeople).length === 0) return { created: 0 };

  const results = await scanForSpaceMatches(mySpaceId, myPeople);
  let created = 0;

  for (const r of results) {
    const exists = await spaceMergeProposalExists(mySpaceId, r.theirSpaceId);
    if (exists) continue;
    await createSpaceMergeProposal({
      fromSpaceId: mySpaceId,
      fromUid: myUid,
      fromName: profile.displayName,
      toSpaceId: r.theirSpaceId,
      matches: r.matches,
    });
    created++;
  }
  return { created };
}
