'use client';

import { useState } from 'react';
import { useStore } from '@/store/useStore';
import { Worker, WorkerRole } from '@/types';
import { Plus, Trash2, Edit2, Check, X, Users } from 'lucide-react';
import clsx from 'clsx';

export default function WorkersView() {
  const { workers, addWorker, updateWorker, deleteWorker } = useStore();
  const [isAdding, setIsAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [newWorker, setNewWorker] = useState({ name: '', role: 'tømrer' as WorkerRole, projectLeaderId: '' });
  const [editWorker, setEditWorker] = useState({ name: '', role: 'tømrer' as WorkerRole, projectLeaderId: '' });

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
        {/* Add Worker Button */}
        <div className="mb-6">
          {!isAdding ? (
            <button
              onClick={() => setIsAdding(true)}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              <Plus size={20} />
              Legg til ansatt
            </button>
          ) : (
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
        </div>

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
      <div className={clsx('p-4 bg-blue-50', indented && 'pl-8')}>
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
      indented && 'pl-8 border-t border-gray-100'
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
