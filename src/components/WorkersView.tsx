'use client';

import { useState, useEffect } from 'react';
import { useStore } from '@/store/useStore';
import { useAuthStore, AppUser } from '@/store/useAuthStore';
import { Worker, WorkerRole } from '@/types';
import { Plus, Trash2, Edit2, Check, X, Users, UserPlus, Key, Link2, AlertCircle, KeyRound } from 'lucide-react';
import clsx from 'clsx';

export default function WorkersView() {
  const { workers, addWorker, updateWorker, deleteWorker } = useStore();
  const { createUser, deleteUser, getUsers, linkUserToWorker, setUserPassword, error: authError } = useAuthStore();
  const [isAdding, setIsAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [newWorker, setNewWorker] = useState({ name: '', role: 'tømrer' as WorkerRole, projectLeaderId: '' });
  const [editWorker, setEditWorker] = useState({ name: '', role: 'tømrer' as WorkerRole, projectLeaderId: '' });
  
  // User management state
  const [showUserManagement, setShowUserManagement] = useState(false);
  const [users, setUsers] = useState<AppUser[]>([]);
  const [isAddingUser, setIsAddingUser] = useState(false);
  const [newUser, setNewUser] = useState({ username: '', password: '', workerId: '' });
  const [linkingUserId, setLinkingUserId] = useState<string | null>(null);
  const [settingPasswordFor, setSettingPasswordFor] = useState<string | null>(null);
  const [newPasswordValue, setNewPasswordValue] = useState('');
  const [userError, setUserError] = useState<string | null>(null);
  const [userSuccess, setUserSuccess] = useState<string | null>(null);

  // Load users when user management is opened
  useEffect(() => {
    if (showUserManagement) {
      loadUsers();
    }
  }, [showUserManagement]);

  const loadUsers = async () => {
    const fetchedUsers = await getUsers();
    setUsers(fetchedUsers);
  };

  const handleCreateUser = async () => {
    setUserError(null);
    if (!newUser.username.trim() || !newUser.password.trim()) {
      setUserError('Brukernavn og passord er påkrevd');
      return;
    }
    
    // Determine role based on selected worker (if any)
    const selectedWorker = workers.find(w => w.id === newUser.workerId);
    const role = selectedWorker?.role === 'prosjektleder' ? 'prosjektleder' : 'prosjektleder';
    
    const success = await createUser(
      newUser.username.trim(),
      newUser.password,
      role,
      newUser.workerId || undefined
    );
    
    if (success) {
      setNewUser({ username: '', password: '', workerId: '' });
      setIsAddingUser(false);
      loadUsers();
    } else {
      setUserError(authError || 'Kunne ikke opprette bruker');
    }
  };

  const handleDeleteUser = async (userId: string) => {
    if (!confirm('Er du sikker på at du vil slette denne brukeren?')) return;
    setUserError(null);
    const success = await deleteUser(userId);
    if (success) {
      loadUsers();
    } else {
      setUserError(authError || 'Kunne ikke slette bruker');
    }
  };

  const handleLinkUser = async (userId: string, workerId: string) => {
    const success = await linkUserToWorker(userId, workerId);
    if (success) {
      setLinkingUserId(null);
      loadUsers();
    }
  };

  const handleSetPassword = async (userId: string) => {
    setUserError(null);
    setUserSuccess(null);
    if (!newPasswordValue.trim()) {
      setUserError('Skriv inn nytt passord');
      return;
    }
    const result = await setUserPassword(userId, newPasswordValue);
    if (result === true) {
      setSettingPasswordFor(null);
      setNewPasswordValue('');
      setUserError(null);
      setUserSuccess('Passord er endret.');
      setTimeout(() => setUserSuccess(null), 4000);
    } else {
      setUserError(typeof result === 'string' ? result : (authError || 'Kunne ikke sette passord'));
    }
  };

  const projectLeaders = workers.filter(w => w.role === 'prosjektleder');
  const carpenters = workers.filter(w => w.role === 'tømrer');

  const handleAdd = () => {
    if (newWorker.name.trim()) {
      addWorker({
        name: newWorker.name.trim(),
        role: newWorker.role,
        projectLeaderId: newWorker.role === 'tømrer' ? newWorker.projectLeaderId || undefined : undefined,
      });
      setNewWorker({ name: '', role: 'tømrer', projectLeaderId: '' });
      setIsAdding(false);
    }
  };

  const handleEdit = (worker: Worker) => {
    setEditingId(worker.id);
    setEditWorker({
      name: worker.name,
      role: worker.role,
      projectLeaderId: worker.projectLeaderId || '',
    });
  };

  const handleSaveEdit = (id: string) => {
    if (editWorker.name.trim()) {
      updateWorker(id, {
        name: editWorker.name.trim(),
        role: editWorker.role,
        projectLeaderId: editWorker.role === 'tømrer' ? editWorker.projectLeaderId || undefined : undefined,
      });
      setEditingId(null);
    }
  };

  const getProjectLeaderName = (id: string | undefined) => {
    if (!id) return 'Ingen';
    const leader = workers.find(w => w.id === id);
    return leader?.name || 'Ukjent';
  };

  // Group carpenters by project leader
  const carpentersByLeader = projectLeaders.map(leader => ({
    leader,
    carpenters: carpenters.filter(c => c.projectLeaderId === leader.id),
  }));
  const unassignedCarpenters = carpenters.filter(c => !c.projectLeaderId);

  return (
    <div className="p-4 md:p-6 overflow-auto h-full pb-24 md:pb-6">
      <div className="max-w-4xl mx-auto">
        {/* Action Buttons */}
        <div className="mb-6 flex flex-wrap gap-3">
          {!isAdding ? (
            <button
              onClick={() => setIsAdding(true)}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              <Plus size={20} />
              Legg til ansatt
            </button>
          ) : null}
          
          <button
            onClick={() => setShowUserManagement(!showUserManagement)}
            className={clsx(
              "flex items-center gap-2 px-4 py-2 rounded-lg transition-colors",
              showUserManagement 
                ? "bg-purple-100 text-purple-700 hover:bg-purple-200"
                : "bg-purple-600 text-white hover:bg-purple-700"
            )}
          >
            <Key size={20} />
            {showUserManagement ? 'Skjul brukere' : 'Administrer brukere'}
          </button>
        </div>

        {/* User Management Section */}
        {showUserManagement && (
          <div className="mb-8 bg-purple-50 rounded-xl border border-purple-200 p-4">
            <h2 className="text-lg font-semibold text-purple-900 mb-4 flex items-center gap-2">
              <Key size={20} />
              Brukeradministrasjon
            </h2>

            {userError && (
              <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg flex items-center gap-2 text-red-700">
                <AlertCircle size={18} />
                <span className="text-sm">{userError}</span>
              </div>
            )}
            {userSuccess && (
              <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-lg flex items-center gap-2 text-green-700">
                <Check size={18} />
                <span className="text-sm">{userSuccess}</span>
              </div>
            )}

            {/* Add User Form */}
            {!isAddingUser ? (
              <button
                onClick={() => setIsAddingUser(true)}
                className="flex items-center gap-2 px-3 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors text-sm mb-4"
              >
                <UserPlus size={16} />
                Opprett ny bruker
              </button>
            ) : (
              <div className="bg-white rounded-lg border border-purple-200 p-4 mb-4">
                <h3 className="font-medium mb-3 text-purple-900">Ny bruker</h3>
                <div className="grid gap-3 md:grid-cols-3">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Brukernavn</label>
                    <input
                      type="text"
                      value={newUser.username}
                      onChange={(e) => setNewUser({ ...newUser, username: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                      placeholder="brukernavn"
                      autoFocus
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Passord</label>
                    <input
                      type="text"
                      value={newUser.password}
                      onChange={(e) => setNewUser({ ...newUser, password: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                      placeholder="passord"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Koble til prosjektleder</label>
                    <select
                      value={newUser.workerId}
                      onChange={(e) => setNewUser({ ...newUser, workerId: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                    >
                      <option value="">Velg prosjektleder...</option>
                      {projectLeaders.map((leader) => (
                        <option key={leader.id} value={leader.id}>
                          {leader.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                <div className="flex gap-2 mt-3">
                  <button
                    onClick={handleCreateUser}
                    className="flex items-center gap-1 px-3 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 text-sm"
                  >
                    <Check size={14} />
                    Opprett
                  </button>
                  <button
                    onClick={() => {
                      setIsAddingUser(false);
                      setNewUser({ username: '', password: '', workerId: '' });
                      setUserError(null);
                    }}
                    className="flex items-center gap-1 px-3 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 text-sm"
                  >
                    <X size={14} />
                    Avbryt
                  </button>
                </div>
              </div>
            )}

            {/* Users List */}
            <div className="space-y-2">
              {users.length === 0 ? (
                <p className="text-sm text-purple-600">Ingen brukere opprettet ennå</p>
              ) : (
                users.map((user) => {
                  const linkedWorker = workers.find(w => w.id === user.workerId);
                  const isSettingPassword = settingPasswordFor === user.id;
                  return (
                    <div key={user.id} className="bg-white rounded-lg border border-purple-100 p-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div
                            className="w-8 h-8 rounded-full flex items-center justify-center text-white text-sm font-medium"
                            style={{ backgroundColor: user.profileColor }}
                          >
                            {user.username.substring(0, 2).toUpperCase()}
                          </div>
                          <div>
                            <div className="font-medium text-gray-900">{user.username}</div>
                            <div className="text-xs text-gray-500">
                              {user.role === 'admin' ? 'Administrator' : 'Prosjektleder'}
                              {linkedWorker && ` - ${linkedWorker.name}`}
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 relative z-10">
                          {linkingUserId === user.id ? (
                            <div className="flex items-center gap-2">
                              <select
                                className="px-2 py-1 border border-gray-300 rounded text-sm"
                                defaultValue=""
                                onChange={(e) => {
                                  if (e.target.value) {
                                    handleLinkUser(user.id, e.target.value);
                                  }
                                }}
                              >
                                <option value="">Velg prosjektleder...</option>
                                {projectLeaders.map((leader) => (
                                  <option key={leader.id} value={leader.id}>
                                    {leader.name}
                                  </option>
                                ))}
                              </select>
                              <button
                                type="button"
                                onClick={() => setLinkingUserId(null)}
                                className="p-1 text-gray-400 hover:text-gray-600"
                              >
                                <X size={14} />
                              </button>
                            </div>
                          ) : (
                            <>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setSettingPasswordFor(isSettingPassword ? null : user.id);
                                  setNewPasswordValue('');
                                  setUserError(null);
                                  setUserSuccess(null);
                                }}
                                className="p-2 min-w-[44px] min-h-[44px] flex items-center justify-center text-gray-400 hover:text-amber-600 hover:bg-amber-50 rounded-lg transition-colors"
                                title="Sett passord (for brukere uten e-post)"
                              >
                                <KeyRound size={16} />
                              </button>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setLinkingUserId(user.id);
                                }}
                                className="p-2 min-w-[44px] min-h-[44px] flex items-center justify-center text-gray-400 hover:text-purple-600 hover:bg-purple-50 rounded-lg transition-colors"
                                title="Koble til prosjektleder"
                              >
                                <Link2 size={16} />
                              </button>
                              {user.role !== 'admin' && (
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleDeleteUser(user.id);
                                  }}
                                  className="p-2 min-w-[44px] min-h-[44px] flex items-center justify-center text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                                  title="Slett bruker"
                                >
                                  <Trash2 size={16} />
                                </button>
                              )}
                            </>
                          )}
                        </div>
                      </div>
                      {isSettingPassword && (
                        <div className="mt-3 pt-3 border-t border-purple-100 flex flex-wrap items-center gap-2">
                          <label className="text-sm text-gray-600">Nytt passord:</label>
                          <input
                            type="password"
                            value={newPasswordValue}
                            onChange={(e) => setNewPasswordValue(e.target.value)}
                            className="px-3 py-1.5 border border-gray-300 rounded text-sm w-40"
                            placeholder="Skriv nytt passord"
                            autoFocus
                          />
                          <button
                            type="button"
                            onClick={() => handleSetPassword(user.id)}
                            className="flex items-center gap-1 px-3 py-1.5 bg-amber-600 text-white rounded-lg hover:bg-amber-700 text-sm cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                            disabled={!newPasswordValue.trim()}
                          >
                            <Check size={14} />
                            Lagre
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setSettingPasswordFor(null);
                              setNewPasswordValue('');
                              setUserError(null);
                              setUserSuccess(null);
                            }}
                            className="flex items-center gap-1 px-3 py-1.5 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 text-sm"
                          >
                            <X size={14} />
                            Avbryt
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>
        )}

        {/* Add Worker Form */}
        {isAdding && (
            <div className="bg-white rounded-lg border border-gray-200 p-4">
              <h3 className="font-medium mb-4">Ny ansatt</h3>
              <div className="grid gap-4 md:grid-cols-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Navn</label>
                  <input
                    type="text"
                    value={newWorker.name}
                    onChange={(e) => setNewWorker({ ...newWorker, name: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    placeholder="Skriv navn..."
                    autoFocus
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Rolle</label>
                  <select
                    value={newWorker.role}
                    onChange={(e) => setNewWorker({ ...newWorker, role: e.target.value as WorkerRole })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  >
                    <option value="prosjektleder">Prosjektleder</option>
                    <option value="tømrer">Tømrer</option>
                  </select>
                </div>
                {newWorker.role === 'tømrer' && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Prosjektleder</label>
                    <select
                      value={newWorker.projectLeaderId}
                      onChange={(e) => setNewWorker({ ...newWorker, projectLeaderId: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    >
                      <option value="">Ingen</option>
                      {projectLeaders.map((leader) => (
                        <option key={leader.id} value={leader.id}>
                          {leader.name}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </div>
              <div className="flex gap-2 mt-4">
                <button
                  onClick={handleAdd}
                  className="flex items-center gap-1 px-3 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
                >
                  <Check size={16} />
                  Lagre
                </button>
                <button
                  onClick={() => {
                    setIsAdding(false);
                    setNewWorker({ name: '', role: 'tømrer', projectLeaderId: '' });
                  }}
                  className="flex items-center gap-1 px-3 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors"
                >
                  <X size={16} />
                  Avbryt
                </button>
              </div>
            </div>
          )}

        {/* Workers List */}
        {workers.length === 0 ? (
          <div className="text-center py-12 text-gray-500">
            <Users size={48} className="mx-auto mb-4 opacity-50" />
            <p>Ingen ansatte lagt til ennå.</p>
            <p className="text-sm">Klikk på &quot;Legg til ansatt&quot; for å starte.</p>
          </div>
        ) : (
          <div className="space-y-6">
            {/* Project Leaders with their carpenters */}
            {carpentersByLeader.map(({ leader, carpenters }) => (
              <div key={leader.id} className="bg-white rounded-lg border border-gray-200 overflow-hidden">
                {/* Project Leader Row */}
                <WorkerRow
                  worker={leader}
                  isEditing={editingId === leader.id}
                  editWorker={editWorker}
                  setEditWorker={setEditWorker}
                  projectLeaders={projectLeaders}
                  onEdit={() => handleEdit(leader)}
                  onSave={() => handleSaveEdit(leader.id)}
                  onCancel={() => setEditingId(null)}
                  onDelete={() => deleteWorker(leader.id)}
                  isLeader
                />
                
                {/* Carpenters under this leader */}
                {carpenters.length > 0 && (
                  <div className="border-t border-gray-100">
                    {carpenters.map((carpenter) => (
                      <WorkerRow
                        key={carpenter.id}
                        worker={carpenter}
                        isEditing={editingId === carpenter.id}
                        editWorker={editWorker}
                        setEditWorker={setEditWorker}
                        projectLeaders={projectLeaders}
                        onEdit={() => handleEdit(carpenter)}
                        onSave={() => handleSaveEdit(carpenter.id)}
                        onCancel={() => setEditingId(null)}
                        onDelete={() => deleteWorker(carpenter.id)}
                        indented
                      />
                    ))}
                  </div>
                )}
              </div>
            ))}

            {/* Unassigned Carpenters */}
            {unassignedCarpenters.length > 0 && (
              <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
                <div className="px-4 py-2 bg-gray-50 text-sm font-medium text-gray-500">
                  Uten prosjektleder
                </div>
                {unassignedCarpenters.map((carpenter) => (
                  <WorkerRow
                    key={carpenter.id}
                    worker={carpenter}
                    isEditing={editingId === carpenter.id}
                    editWorker={editWorker}
                    setEditWorker={setEditWorker}
                    projectLeaders={projectLeaders}
                    onEdit={() => handleEdit(carpenter)}
                    onSave={() => handleSaveEdit(carpenter.id)}
                    onCancel={() => setEditingId(null)}
                    onDelete={() => deleteWorker(carpenter.id)}
                  />
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

interface WorkerRowProps {
  worker: Worker;
  isEditing: boolean;
  editWorker: { name: string; role: WorkerRole; projectLeaderId: string };
  setEditWorker: (w: { name: string; role: WorkerRole; projectLeaderId: string }) => void;
  projectLeaders: Worker[];
  onEdit: () => void;
  onSave: () => void;
  onCancel: () => void;
  onDelete: () => void;
  isLeader?: boolean;
  indented?: boolean;
}

function WorkerRow({
  worker,
  isEditing,
  editWorker,
  setEditWorker,
  projectLeaders,
  onEdit,
  onSave,
  onCancel,
  onDelete,
  isLeader,
  indented,
}: WorkerRowProps) {
  if (isEditing) {
    return (
      <div className="p-4 bg-blue-50">
        <div className="grid gap-4 md:grid-cols-3">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Navn</label>
            <input
              type="text"
              value={editWorker.name}
              onChange={(e) => setEditWorker({ ...editWorker, name: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              autoFocus
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Rolle</label>
            <select
              value={editWorker.role}
              onChange={(e) => setEditWorker({ ...editWorker, role: e.target.value as WorkerRole })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="prosjektleder">Prosjektleder</option>
              <option value="tømrer">Tømrer</option>
            </select>
          </div>
          {editWorker.role === 'tømrer' && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Prosjektleder</label>
              <select
                value={editWorker.projectLeaderId}
                onChange={(e) => setEditWorker({ ...editWorker, projectLeaderId: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              >
                <option value="">Ingen</option>
                {projectLeaders.filter(l => l.id !== worker.id).map((leader) => (
                  <option key={leader.id} value={leader.id}>
                    {leader.name}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>
        <div className="flex gap-2 mt-4">
          <button
            onClick={onSave}
            className="flex items-center gap-1 px-3 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
          >
            <Check size={16} />
            Lagre
          </button>
          <button
            onClick={onCancel}
            className="flex items-center gap-1 px-3 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors"
          >
            <X size={16} />
            Avbryt
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={clsx(
      'flex items-center justify-between p-4 hover:bg-gray-50 transition-colors',
      indented && 'border-t border-gray-100'
    )}>
      <div className="flex items-center gap-3">
        <div className={clsx(
          'w-10 h-10 rounded-full flex items-center justify-center text-white font-medium',
          isLeader ? 'bg-blue-600' : 'bg-gray-500'
        )}>
          {worker.name.substring(0, 2).toUpperCase()}
        </div>
        <div>
          <div className="font-medium text-gray-900">{worker.name}</div>
          <div className="text-sm text-gray-500">
            {worker.role === 'prosjektleder' ? 'Prosjektleder' : 'Tømrer'}
          </div>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <button
          onClick={onEdit}
          className="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
        >
          <Edit2 size={18} />
        </button>
        <button
          onClick={onDelete}
          className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
        >
          <Trash2 size={18} />
        </button>
      </div>
    </div>
  );
}
