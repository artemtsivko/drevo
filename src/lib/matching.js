// Алгоритм пошуку однакових родичів між родоводами різних користувачів.
// Збіг визначається за: іменем + датою (або роком) народження + збігом батьків/дітей.

function normalizeName(s) {
  return (s || '')
    .toLowerCase()
    .replace(/['`ʼ’]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// Нормалізуємо дату народження до порівнюваного вигляду.
// Якщо є повна дата — порівнюємо по ній. Якщо лише рік — порівнюємо по році.
function birthKey(person) {
  if (person.birthDate) return { type: 'date', value: person.birthDate };
  if (person.birthYear) return { type: 'year', value: String(person.birthYear) };
  return { type: 'none', value: null };
}

function birthMatches(a, b) {
  const ka = birthKey(a);
  const kb = birthKey(b);
  if (ka.type === 'none' || kb.type === 'none') return false;
  // Обидва мають повну дату
  if (ka.type === 'date' && kb.type === 'date') return ka.value === kb.value;
  // Хоча б один має лише рік — порівнюємо роки
  const yearA = ka.type === 'date' ? ka.value.slice(0, 4) : ka.value;
  const yearB = kb.type === 'date' ? kb.value.slice(0, 4) : kb.value;
  return yearA === yearB;
}

function nameMatches(a, b) {
  const fa = normalizeName(a.firstName);
  const fb = normalizeName(b.firstName);
  const la = normalizeName(a.lastName);
  const lb = normalizeName(b.lastName);
  if (!fa || !fb) return false;
  // Ім'я обов'язкове; прізвище співставляємо, якщо вказане в обох
  if (fa !== fb) return false;
  if (la && lb && la !== lb) return false;
  return true;
}

// Порівнюємо множини імен батьків/дітей (за нормалізованим повним іменем).
function relativeNameSet(people, ids) {
  const set = new Set();
  (ids || []).forEach((id) => {
    const p = people[id];
    if (p) set.add(normalizeName(p.firstName) + '|' + normalizeName(p.lastName));
  });
  return set;
}

function intersects(setA, setB) {
  for (const v of setA) if (setB.has(v)) return true;
  return false;
}

// Оцінка збігу двох людей з різних дерев.
// peopleA / peopleB — словники {id: person} відповідних дерев.
export function scoreMatch(a, peopleA, b, peopleB) {
  if (!nameMatches(a, b)) return { match: false, score: 0, reasons: [] };
  if (!birthMatches(a, b)) return { match: false, score: 0, reasons: [] };

  const reasons = ['імʼя збігається', 'дата/рік народження збігається'];
  let score = 2;

  const parentsA = relativeNameSet(peopleA, a.parentIds);
  const parentsB = relativeNameSet(peopleB, b.parentIds);
  const childrenA = relativeNameSet(peopleA, a.childIds);
  const childrenB = relativeNameSet(peopleB, b.childIds);

  const parentOverlap = intersects(parentsA, parentsB);
  const childOverlap = intersects(childrenA, childrenB);

  if (parentOverlap) {
    score += 1;
    reasons.push('спільний батько/мати');
  }
  if (childOverlap) {
    score += 1;
    reasons.push('спільна дитина');
  }

  // Вимагаємо збіг щонайменше по одному родинному зв'язку (батьки або діти),
  // щоб уникнути хибних збігів по однакових іменах.
  const relationalOverlap = parentOverlap || childOverlap;
  const bothHaveNoRelatives =
    parentsA.size === 0 && parentsB.size === 0 && childrenA.size === 0 && childrenB.size === 0;

  const match = relationalOverlap || bothHaveNoRelatives;
  return { match, score, reasons };
}

// Знаходимо всі потенційні збіги між моїм деревом і чужим.
export function findMatches(myPeople, theirPeople) {
  const results = [];
  const myList = Object.values(myPeople);
  const theirList = Object.values(theirPeople);
  for (const a of myList) {
    for (const b of theirList) {
      const r = scoreMatch(a, myPeople, b, theirPeople);
      if (r.match) {
        results.push({
          mineId: a.id,
          theirId: b.id,
          score: r.score,
          reasons: r.reasons,
          mine: a,
          theirs: b,
        });
      }
    }
  }
  // Сортуємо за силою збігу
  results.sort((x, y) => y.score - x.score);
  return results;
}
