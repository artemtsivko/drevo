import React, { useEffect, useState } from 'react';
import { onAuthStateChanged, signInWithPopup, signOut } from 'firebase/auth';
import { auth, googleProvider } from './firebase.js';
import {
  ensureUserProfile, watchPeople, addPerson, updatePerson, deletePerson,
  linkParentChild, watchIncomingAccess, watchGrants, watchMyAccess,
  watchProposals,
} from './lib/store.js';

import PersonModal from './components/PersonModal.jsx';
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
  const [showModal, setShowModal] = useState(false);

  const [incomingAccess, setIncomingAccess] = useState([]);
  const [grants, setGrants] = useState([]);
  const [myAccess, setMyAccess] = useState([]);
  const [proposals, setProposals] = useState([]);

  useEffect(() => onAuthStateChanged(auth, async (u) => {
    setUser(u || null);
    if (u) setProfile(await ensureUserProfile(u));
  }), []);

  useEffect(() => {
    if (!user) return;
    const unsubs = [
      watchPeople(user.uid, setPeople),
      watchIncomingAccess(user.uid, setIncomingAccess),
      watchGrants(user.uid, setGrants),
      watchMyAccess(user.uid, setMyAccess),
      watchProposals(user.uid, setProposals),
    ];
    return () => unsubs.forEach((f) => f && f());
  }, [user]);

  if (user === undefined) return <div className="login-wrap"><div className="brand">🌳 Рід</div></div>;
  if (user === null) return <Login />;
  if (!profile) return <div className="login-wrap"><div className="brand">Завантаження…</div></div>;

  // Спільні родичі поки визначаємо як 0 (наповнюється після підтверджених об'єднань).
  const sharedIds = new Set();

  const openNew = () => { setEditing(null); setShowModal(true); };
  const openPerson = (p) => { setEditing(p); setShowModal(true); };

  const save = async (form) => {
    if (form.id) {
      const { id, ...patch } = form;
      await updatePerson(id, patch);
      // синхронізуємо зворотні зв'язки батьки/діти
      const fresh = { ...people, [id]: form };
      for (const pid of form.parentIds || []) await linkParentChild(pid, id, fresh);
    } else {
      const newId = await addPerson(user.uid, form);
      const fresh = { ...people, [newId]: { ...form, id: newId } };
      for (const pid of form.parentIds || []) await linkParentChild(pid, newId, fresh);
    }
    setShowModal(false);
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
                <button className={view === 'graph' ? 'active' : ''} onClick={() => setView('graph')}>Граф</button>
                <button className={view === 'list' ? 'active' : ''} onClick={() => setView('list')}>Список</button>
                <button className={view === 'explorer' ? 'active' : ''} onClick={() => setView('explorer')}>Провідник</button>
              </div>
              <div className="header-spacer" />
              <span className="person-meta">{Object.keys(people).length} родичів</span>
            </div>

            {view === 'tree' && <TreeView people={people} sharedIds={sharedIds} onOpen={openPerson} mode="tree" />}
            {view === 'graph' && <TreeView people={people} sharedIds={sharedIds} onOpen={openPerson} mode="graph" />}
            {view === 'list' && <ListView people={people} sharedIds={sharedIds} onOpen={openPerson} />}
            {view === 'explorer' && <ExplorerView people={people} sharedIds={sharedIds} onOpen={openPerson} />}
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
          person={editing} people={people}
          onSave={save} onClose={() => setShowModal(false)} onDelete={remove}
        />
      )}
    </div>
  );
}
