'use client';

import { useState } from 'react';
import { useStore } from '@/store/useStore';
import { formatCurrency } from '@/utils/dates';
import { Edit2, Check, X, DollarSign, TrendingUp, FileText, Trash2 } from 'lucide-react';
import clsx from 'clsx';

export default function FinanceView() {
  const { projects, updateProject, deleteProject, getProjectFinance, getTotalOrdrereserve } = useStore();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editField, setEditField] = useState<'akonto' | 'amount' | null>(null);
  const [editValue, setEditValue] = useState<number>(0);

  const activeProjects = projects.filter(p => p.status === 'active');
  const completedProjects = projects.filter(p => p.status === 'completed');

  const totalOrdrereserve = getTotalOrdrereserve();
  const totalFakturert = activeProjects.reduce((sum, p) => {
    const { fakturert } = getProjectFinance(p.id);
    return sum + fakturert;
  }, 0);
  const totalAmount = activeProjects.reduce((sum, p) => sum + p.amount, 0);

  const handleEdit = (projectId: string, field: 'akonto' | 'amount', currentValue: number) => {
    setEditingId(projectId);
    setEditField(field);
    setEditValue(currentValue);
  };

  const handleSave = (projectId: string) => {
    if (editField === 'akonto') {
      updateProject(projectId, { aKontoPercent: Math.min(100, Math.max(0, editValue)) });
    } else if (editField === 'amount') {
      updateProject(projectId, { amount: Math.max(0, editValue) });
    }
    setEditingId(null);
    setEditField(null);
  };

  const handleCancel = () => {
    setEditingId(null);
    setEditField(null);
  };

  return (
    <div className="p-4 md:p-6 overflow-auto h-full pb-24 md:pb-6">
      <div className="max-w-6xl mx-auto">
        {/* Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <div className="flex items-center gap-3 mb-2">
              <div className="p-2 bg-blue-100 rounded-lg">
                <DollarSign className="text-blue-600" size={24} />
              </div>
              <span className="text-sm font-medium text-gray-500">Total prosjektverdi</span>
            </div>
            <div className="text-2xl font-bold text-gray-900">
              {formatCurrency(totalAmount)}
            </div>
          </div>

          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <div className="flex items-center gap-3 mb-2">
              <div className="p-2 bg-green-100 rounded-lg">
                <FileText className="text-green-600" size={24} />
              </div>
              <span className="text-sm font-medium text-gray-500">Fakturert</span>
            </div>
            <div className="text-2xl font-bold text-green-600">
              {formatCurrency(totalFakturert)}
            </div>
          </div>

          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <div className="flex items-center gap-3 mb-2">
              <div className="p-2 bg-orange-100 rounded-lg">
                <TrendingUp className="text-orange-600" size={24} />
              </div>
              <span className="text-sm font-medium text-gray-500">Ordrereserve</span>
            </div>
            <div className="text-2xl font-bold text-orange-600">
              {formatCurrency(totalOrdrereserve)}
            </div>
          </div>
        </div>

        {/* Active Projects Table */}
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden mb-8">
          <div className="px-6 py-4 border-b border-gray-200">
            <h2 className="text-lg font-semibold text-gray-900">Aktive prosjekter</h2>
          </div>
          
          {activeProjects.length === 0 ? (
            <div className="text-center py-12 text-gray-500">
              <DollarSign size={48} className="mx-auto mb-4 opacity-50" />
              <p>Ingen aktive prosjekter.</p>
              <p className="text-sm">Opprett prosjekter i kalenderen for å se dem her.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="bg-gray-50">
                    <th className="text-left px-6 py-3 text-sm font-medium text-gray-500">Prosjekt</th>
                    <th className="text-right px-6 py-3 text-sm font-medium text-gray-500">Beløp</th>
                    <th className="text-right px-6 py-3 text-sm font-medium text-gray-500">A konto %</th>
                    <th className="text-right px-6 py-3 text-sm font-medium text-gray-500">Fakturert</th>
                    <th className="text-right px-6 py-3 text-sm font-medium text-gray-500">Ordrereserve</th>
                    <th className="text-center px-6 py-3 text-sm font-medium text-gray-500">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {activeProjects.map((project) => {
                    const { fakturert, ordrereserve } = getProjectFinance(project.id);
                    const isEditing = editingId === project.id;

                    return (
                      <tr key={project.id} className="hover:bg-gray-50">
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-3">
                            <div
                              className="w-4 h-4 rounded-full flex-shrink-0"
                              style={{ backgroundColor: project.color }}
                            />
                            <div>
                              <div className="font-medium text-gray-900">{project.name}</div>
                              {project.description && (
                                <div className="text-sm text-gray-500 truncate max-w-xs">
                                  {project.description}
                                </div>
                              )}
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4 text-right">
                          {isEditing && editField === 'amount' ? (
                            <div className="flex items-center justify-end gap-2">
                              <input
                                type="number"
                                value={editValue}
                                onChange={(e) => setEditValue(Number(e.target.value))}
                                min={0}
                                className="w-32 px-2 py-1 border border-gray-300 rounded text-right focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                autoFocus
                              />
                              <button
                                onClick={() => handleSave(project.id)}
                                className="p-1 text-green-600 hover:bg-green-50 rounded"
                              >
                                <Check size={16} />
                              </button>
                              <button
                                onClick={handleCancel}
                                className="p-1 text-gray-400 hover:bg-gray-100 rounded"
                              >
                                <X size={16} />
                              </button>
                            </div>
                          ) : (
                            <div className="flex items-center justify-end gap-2">
                              <span className="font-medium text-gray-900">{formatCurrency(project.amount)}</span>
                              <button
                                onClick={() => handleEdit(project.id, 'amount', project.amount)}
                                className="p-1 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded"
                              >
                                <Edit2 size={14} />
                              </button>
                            </div>
                          )}
                        </td>
                        <td className="px-6 py-4 text-right">
                          {isEditing && editField === 'akonto' ? (
                            <div className="flex items-center justify-end gap-2">
                              <input
                                type="number"
                                value={editValue}
                                onChange={(e) => setEditValue(Number(e.target.value))}
                                min={0}
                                max={100}
                                className="w-20 px-2 py-1 border border-gray-300 rounded text-right focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                autoFocus
                              />
                              <span>%</span>
                              <button
                                onClick={() => handleSave(project.id)}
                                className="p-1 text-green-600 hover:bg-green-50 rounded"
                              >
                                <Check size={16} />
                              </button>
                              <button
                                onClick={handleCancel}
                                className="p-1 text-gray-400 hover:bg-gray-100 rounded"
                              >
                                <X size={16} />
                              </button>
                            </div>
                          ) : (
                            <div className="flex items-center justify-end gap-2">
                              <span className="font-medium">{project.aKontoPercent}%</span>
                              <button
                                onClick={() => handleEdit(project.id, 'akonto', project.aKontoPercent)}
                                className="p-1 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded"
                              >
                                <Edit2 size={14} />
                              </button>
                            </div>
                          )}
                        </td>
                        <td className="px-6 py-4 text-right font-medium text-green-600">
                          {formatCurrency(fakturert)}
                        </td>
                        <td className="px-6 py-4 text-right font-medium text-orange-600">
                          {formatCurrency(ordrereserve)}
                        </td>
                        <td className="px-6 py-4 text-center">
                          <div className="flex items-center justify-center gap-2">
                            <button
                              onClick={() => updateProject(project.id, { status: 'completed' })}
                              className="px-3 py-1 text-xs font-medium bg-gray-100 text-gray-600 rounded-full hover:bg-green-100 hover:text-green-700 transition-colors"
                            >
                              Fullført
                            </button>
                            <button
                              onClick={() => {
                                if (confirm('Er du sikker på at du vil slette dette prosjektet?')) {
                                  deleteProject(project.id);
                                }
                              }}
                              className="p-1 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
                              title="Slett prosjekt"
                            >
                              <Trash2 size={16} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Completed Projects */}
        {completedProjects.length > 0 && (
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-200">
              <h2 className="text-lg font-semibold text-gray-500">Fullførte prosjekter</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="bg-gray-50">
                    <th className="text-left px-6 py-3 text-sm font-medium text-gray-500">Prosjekt</th>
                    <th className="text-right px-6 py-3 text-sm font-medium text-gray-500">Beløp</th>
                    <th className="text-right px-6 py-3 text-sm font-medium text-gray-500">Fakturert</th>
                    <th className="text-center px-6 py-3 text-sm font-medium text-gray-500">Handling</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {completedProjects.map((project) => {
                    const { fakturert } = getProjectFinance(project.id);

                    return (
                      <tr key={project.id} className="hover:bg-gray-50 opacity-60">
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-3">
                            <div
                              className="w-4 h-4 rounded-full flex-shrink-0"
                              style={{ backgroundColor: project.color }}
                            />
                            <span className="font-medium text-gray-900">{project.name}</span>
                          </div>
                        </td>
                        <td className="px-6 py-4 text-right font-medium text-gray-900">
                          {formatCurrency(project.amount)}
                        </td>
                        <td className="px-6 py-4 text-right font-medium text-green-600">
                          {formatCurrency(fakturert)}
                        </td>
                        <td className="px-6 py-4 text-center">
                          <button
                            onClick={() => updateProject(project.id, { status: 'active' })}
                            className="px-3 py-1 text-xs font-medium bg-blue-100 text-blue-600 rounded-full hover:bg-blue-200 transition-colors"
                          >
                            Gjenåpne
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
