import React, { useEffect, useState } from 'react';
import { onAuthStateChanged, signInWithPopup, signOut } from 'firebase/auth';
import { auth, googleProvider } from './firebase.js';
import {
  ensureUserProfile, watchPeople, addPerson, updatePerson, deletePerson,
  linkParentChild, watchIncomingAccess, watchGrants, watchMyAccess,
  watchProposals, saveOnboarding, getAccessibleTrees,
  watchMyAcceptedProposalsToComplete, completeInitiatorSide,
} from './lib/store.js';
import { buildMergedTree } from './lib/mergeTree.js';
import { runAutoScan } from './lib/autoScan.js';

import PersonModal from './components/PersonModal.jsx';
import Onboarding from './components/Onboarding.jsx';
import SettingsPanel from './components/SettingsPanel.jsx';
import MatchesPanel from './components/MatchesPanel.jsx';
import ListView from './views/ListView.jsx';
import ExplorerView from './views/ExplorerView.jsx';
import TreeView from './views/TreeView.jsx';

function Login() {
  const go = () => signInWithPopup(auth, googleProvider).catch((e) => alert(e.message));
  return (
    <div className="login-wrap">
      <div className="login-card">
        <div className="brand">🌳 Рід</div>
        <p>
          Ведіть родовід разом. Додавайте родичів, будуйте дерево — і знаходьте
          спільних предків з іншими родинами.
        </p>
        <button className="google-btn" onClick={go}>
          <svg width="20" height="20" viewBox="0 0 48 48">
            <path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9 3.6l6.8-6.8C35.6 2.4 30.2 0 24 0 14.6 0 6.5 5.4 2.6 13.2l7.9 6.1C12.4 13.2 17.7 9.5 24 9.5z"/>
            <path fill="#4285F4" d="M46.1 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.4c-.5 2.9-2.1 5.3-4.6 7l7.1 5.5c4.2-3.9 6.6-9.6 6.6-16.5z"/>
            <path fill="#FBBC05" d="M10.5 28.3c-.5-1.5-.8-3-.8-4.8s.3-3.3.8-4.8l-7.9-6.1C1 15.9 0 19.8 0 24s1 8.1 2.6 11.4l7.9-6.1z"/>
            <path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.1-5.5c-2 1.3-4.5 2.1-8.8 2.1-6.3 0-11.6-3.7-13.5-9.3l-7.9 6.1C6.5 42.6 14.6 48 24 48z"/>
          </svg>
          Увійти через Google
        </button>
      </div>
    </div>
  );
}

export default function App() {
  const [user, setUser] = useState(undefined);
  const [profile, setProfile] = useState(null);
  const [people, setPeople] = useState({});
  const [tab, setTab] = useState('tree');
  const [view, setView] = useState('tree');
  const [editing, setEditing] = useState(null);
  const [prefill, setPrefill] = useState(null);
  const [showModal, setShowModal] = useState(false);

  const [incomingAccess, setIncomingAccess] = useState([]);
  const [grants, setGrants] = useState([]);
  const [myAccess, setMyAccess] = useState([]);
  const [proposals, setProposals] = useState([]);
  const [peopleLoaded, setPeopleLoaded] = useState(false);
  const [skipOnboarding, setSkipOnboarding] = useState(false);
  const [mergedPeople, setMergedPeople] = useState(null); // null = ще не завантажено, показуємо власне дерево

  useEffect(() => onAuthStateChanged(auth, async (u) => {
    setUser(u || null);
    if (u) setProfile(await ensureUserProfile(u));
  }), []);

  // Показуємо майстер, коли дерево порожнє і користувач його не пропустив
  const showOnboarding = peopleLoaded && Object.keys(people).length === 0 && !skipOnboarding;

  // Блокуємо скрол фонової сторінки, коли відкрита модалка (форма людини або майстер)
  useEffect(() => {
    const modalOpen = showModal || showOnboarding;
    document.body.style.overflow = modalOpen ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  });

  // Якщо я ініціював пропозицію і інша сторона вже підтвердила — довʼязуємо свою половину.
  useEffect(() => {
    if (!user) return;
    return watchMyAcceptedProposalsToComplete(user.uid, (list) => {
      list.forEach((pr) => { completeInitiatorSide(pr).catch(() => {}); });
    });
  }, [user]);

  useEffect(() => {
    if (!user) return;
    const unsubs = [
      watchPeople(user.uid, (p) => { setPeople(p); setPeopleLoaded(true); }),
      watchIncomingAccess(user.uid, setIncomingAccess),
      watchGrants(user.uid, setGrants),
      watchMyAccess(user.uid, setMyAccess),
      watchProposals(user.uid, setProposals),
    ];
    return () => unsubs.forEach((f) => f && f());
  }, [user]);

  // Перебудовуємо об'єднаний родовід (моє дерево + дерева тих, кому дав/хто дав доступ)
  // при кожній зміні власних даних або списку доступів.
  useEffect(() => {
    if (!user || !peopleLoaded) return;
    let cancelled = false;
    (async () => {
      const trees = await getAccessibleTrees(user.uid);
      if (cancelled) return;
      const { people: merged } = buildMergedTree(trees);
      setMergedPeople(merged);
    })();
    return () => { cancelled = true; };
  }, [user, people, grants, myAccess, peopleLoaded]);

  // Автоматичний фоновий пошук збігів: при вході і кожні 5 хвилин.
  useEffect(() => {
    if (!user || !profile || !peopleLoaded) return;
    const grantedOwnerIds = myAccess.map((g) => ({ uid: g.ownerId }));
    const scan = () => runAutoScan(user.uid, profile, people, grantedOwnerIds).catch(() => {});
    scan();
    const interval = setInterval(scan, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [user, profile, peopleLoaded, Object.keys(people).length, myAccess.length]);

  if (user === undefined) return <div className="login-wrap"><div className="brand">🌳 Рід</div></div>;
  if (user === null) return <Login />;
  if (!profile) return <div className="login-wrap"><div className="brand">Завантаження…</div></div>;

  const finishOnboarding = async (data) => {
    await saveOnboarding(user.uid, data);
    setSkipOnboarding(true);
  };

  if (showOnboarding) {
    return (
      <div>
        <header className="app-header">
          <div className="brand">🌳 Рід</div>
          <div className="header-spacer" />
          <div className="user-chip">
            {profile.photoURL && <img src={profile.photoURL} alt="" />}
            <span>{profile.displayName}</span>
          </div>
        </header>
        <Onboarding
          profile={profile}
          onFinish={finishOnboarding}
          onSkip={() => setSkipOnboarding(true)}
        />
      </div>
    );
  }

  // Для перегляду показуємо об'єднане дерево (моє + доступні мені), поки воно не готове — власне.
  const displayPeople = mergedPeople || people;
  const sharedIds = new Set(
    Object.values(displayPeople).filter((p) => p.isMerged).map((p) => p.id)
  );

  const openNew = () => { setEditing(null); setPrefill(null); setShowModal(true); };

  // Якщо клікнули на обʼєднаний вузол — редагуємо саме МІЙ запис (не чужий і не злитий псевдо-обʼєкт).
  const resolveMine = (mergedPerson) => {
    if (!mergedPerson.isMerged) return people[mergedPerson.id] ? mergedPerson : null;
    const mySource = (mergedPerson.sources || []).find((s) => s.ownerId === user.uid);
    return mySource ? people[mySource.personId] : null;
  };

  const openPerson = (p) => {
    const mine = resolveMine(p);
    if (!mine) {
      alert('Цей родич веде з іншого дерева — редагувати його може лише той користувач, у кого він доданий.');
      return;
    }
    setEditing(mine); setPrefill(null); setShowModal(true);
  };

  // "Нова людина": відкриваємо форму з уже проставленим зв'язком-префілом (завжди відносно МОГО запису)
  const addNewRelated = (relation, mergedPerson) => {
    const person = resolveMine(mergedPerson);
    if (!person) { alert('Можна додавати родичів лише до своїх записів.'); return; }
    setEditing(null);
    if (relation === 'father') {
      setPrefill({ gender: 'm', childIds: [person.id] });
    } else if (relation === 'mother') {
      setPrefill({ gender: 'f', childIds: [person.id] });
    } else if (relation === 'partner') {
      setPrefill({ spouseIds: [person.id] });
    } else if (relation === 'child') {
      const spouse = (person.spouseIds || [])[0];
      setPrefill({ parentIds: spouse ? [person.id, spouse] : [person.id] });
    }
    setShowModal(true);
  };

  // "Обрати з наявних": напряму пов'язуємо двох людей у МОЄМУ дереві, без відкриття форми
  const linkExisting = async (relation, existingId, mergedPerson) => {
    const person = resolveMine(mergedPerson);
    if (!person) { alert('Можна додавати родичів лише до своїх записів.'); return; }
    const fresh = people;
    if (relation === 'father' || relation === 'mother') {
      await linkParentChild(existingId, person.id, fresh);
    } else if (relation === 'partner') {
      const a = fresh[person.id], b = fresh[existingId];
      await updatePerson(person.id, { spouseIds: Array.from(new Set([...(a.spouseIds || []), existingId])) });
      await updatePerson(existingId, { spouseIds: Array.from(new Set([...(b.spouseIds || []), person.id])) });
    } else if (relation === 'child') {
      const spouse = (person.spouseIds || [])[0];
      await linkParentChild(person.id, existingId, fresh);
      if (spouse) await linkParentChild(spouse, existingId, fresh);
    }
  };

  const save = async (form) => {
    if (form.id) {
      const { id, ...patch } = form;
      await updatePerson(id, patch);
      const fresh = { ...people, [id]: form };
      for (const pid of form.parentIds || []) await linkParentChild(pid, id, fresh);
    } else {
      const newId = await addPerson(user.uid, form);
      const fresh = { ...people, [newId]: { ...form, id: newId } };
      for (const pid of form.parentIds || []) await linkParentChild(pid, newId, fresh);
      // Якщо додавали як батька/матір комусь (childIds у префілі)
      for (const cid of form.childIds || []) await linkParentChild(newId, cid, fresh);
      // Якщо додавали як партнера — зв'язок двосторонній
      for (const sid of form.spouseIds || []) {
        const other = people[sid];
        if (other) {
          await updatePerson(sid, { spouseIds: Array.from(new Set([...(other.spouseIds || []), newId])) });
        }
      }
    }
    setShowModal(false);
    setPrefill(null);
  };

  const remove = async (id) => {
    if (!confirm('Видалити цього родича?')) return;
    await deletePerson(id);
    setShowModal(false);
  };

  const proposalCount = proposals.length;
  const accessCount = incomingAccess.length;

  return (
    <div>
      <header className="app-header">
        <div className="brand">🌳 Рід</div>
        <div className="header-spacer" />
        {tab === 'tree' && (
          <button className="btn" onClick={openNew}>+ Додати родича</button>
        )}
        <div className="user-chip">
          {profile.photoURL && <img src={profile.photoURL} alt="" />}
          <span>{profile.displayName}</span>
        </div>
        <button className="btn btn-ghost btn-sm" onClick={() => signOut(auth)}>Вийти</button>
      </header>

      <nav className="tabs">
        <button className={`tab ${tab === 'tree' ? 'active' : ''}`} onClick={() => setTab('tree')}>
          Мій родовід
        </button>
        <button className={`tab ${tab === 'matches' ? 'active' : ''}`} onClick={() => setTab('matches')}>
          Спільні родичі
          {proposalCount > 0 && <span className="badge">{proposalCount}</span>}
        </button>
        <button className={`tab ${tab === 'settings' ? 'active' : ''}`} onClick={() => setTab('settings')}>
          Налаштування
          {accessCount > 0 && <span className="badge">{accessCount}</span>}
        </button>
      </nav>

      <main className="main">
        {tab === 'tree' && (
          <div className="stack">
            <div className="row">
              <div className="pill-toggle">
                <button className={view === 'tree' ? 'active' : ''} onClick={() => setView('tree')}>Дерево</button>
                <button className={view === 'list' ? 'active' : ''} onClick={() => setView('list')}>Список</button>
                <button className={view === 'explorer' ? 'active' : ''} onClick={() => setView('explorer')}>Провідник</button>
              </div>
              <div className="header-spacer" />
              <span className="person-meta">{Object.keys(displayPeople).length} родичів</span>
            </div>

            {view === 'tree' && <TreeView people={displayPeople} sharedIds={sharedIds} onOpen={openPerson} onAddNew={addNewRelated} onLinkExisting={linkExisting} onAddPerson={openNew} mode="tree" />}
            {view === 'list' && <ListView people={displayPeople} sharedIds={sharedIds} onOpen={openPerson} />}
            {view === 'explorer' && <ExplorerView people={displayPeople} sharedIds={sharedIds} onOpen={openPerson} />}
          </div>
        )}

        {tab === 'matches' && (
          <MatchesPanel uid={user.uid} profile={profile} myPeople={people} proposals={proposals} />
        )}

        {tab === 'settings' && (
          <SettingsPanel
            profile={profile} uid={user.uid}
            incomingAccess={incomingAccess} grants={grants} myAccess={myAccess}
          />
        )}
      </main>

      {showModal && (
        <PersonModal
          person={editing || prefill} people={people}
          onSave={save} onClose={() => { setShowModal(false); setPrefill(null); }} onDelete={remove}
        />
      )}
    </div>
  );
}
