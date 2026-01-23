'use client';

import { useState } from 'react';
import { useAuthStore } from '@/store/useAuthStore';
import { User, Palette, Lock, Check, X, AlertCircle, Eye, EyeOff } from 'lucide-react';

const PROFILE_COLORS = [
  '#3B82F6', // Blue
  '#10B981', // Green
  '#8B5CF6', // Purple
  '#F59E0B', // Amber
  '#EF4444', // Red
  '#EC4899', // Pink
  '#06B6D4', // Cyan
  '#6366F1', // Indigo
  '#84CC16', // Lime
  '#F97316', // Orange
];

interface ProfileSettingsProps {
  onClose: () => void;
}

export default function ProfileSettings({ onClose }: ProfileSettingsProps) {
  const { user, updateProfile, changePassword, error } = useAuthStore();
  const [selectedColor, setSelectedColor] = useState(user?.profileColor || '#3B82F6');
  const [showPasswordForm, setShowPasswordForm] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [passwordSuccess, setPasswordSuccess] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  if (!user) return null;

  const handleColorChange = async (color: string) => {
    setSelectedColor(color);
    await updateProfile({ profileColor: color });
  };

  const handlePasswordChange = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordError(null);
    setPasswordSuccess(false);

    if (newPassword !== confirmPassword) {
      setPasswordError('Passordene stemmer ikke overens');
      return;
    }

    if (newPassword.length < 4) {
      setPasswordError('Passord må være minst 4 tegn');
      return;
    }

    setIsSaving(true);
    const success = await changePassword(currentPassword, newPassword);
    setIsSaving(false);

    if (success) {
      setPasswordSuccess(true);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setTimeout(() => setShowPasswordForm(false), 1500);
    } else {
      setPasswordError(error || 'Kunne ikke endre passord');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900">Kontoinnstillinger</h2>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6 overflow-y-auto">
          {/* User Info */}
          <div className="flex items-center gap-4">
            <div
              className="w-16 h-16 rounded-full flex items-center justify-center text-white text-xl font-bold"
              style={{ backgroundColor: selectedColor }}
            >
              {user.username.substring(0, 2).toUpperCase()}
            </div>
            <div>
              <div className="font-semibold text-gray-900">{user.username}</div>
              <div className="text-sm text-gray-500 capitalize">
                {user.role === 'admin' ? 'Administrator' : 'Prosjektleder'}
              </div>
            </div>
          </div>

          {/* Profile Color */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <Palette size={18} className="text-gray-500" />
              <span className="font-medium text-gray-900">Profilfarge</span>
            </div>
            <div className="flex flex-wrap gap-2">
              {PROFILE_COLORS.map((color) => (
                <button
                  key={color}
                  onClick={() => handleColorChange(color)}
                  className="w-10 h-10 rounded-full border-2 transition-all flex items-center justify-center"
                  style={{
                    backgroundColor: color,
                    borderColor: selectedColor === color ? '#1F2937' : 'transparent',
                  }}
                >
                  {selectedColor === color && <Check size={18} className="text-white" />}
                </button>
              ))}
            </div>
          </div>

          {/* Change Password */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <Lock size={18} className="text-gray-500" />
              <span className="font-medium text-gray-900">Endre passord</span>
            </div>

            {!showPasswordForm ? (
              <button
                onClick={() => setShowPasswordForm(true)}
                className="px-4 py-2 text-sm bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
              >
                Endre passord
              </button>
            ) : (
              <form onSubmit={handlePasswordChange} className="space-y-3">
                {passwordError && (
                  <div className="p-2 bg-red-50 border border-red-200 rounded-lg flex items-center gap-2 text-red-700 text-sm">
                    <AlertCircle size={16} />
                    {passwordError}
                  </div>
                )}

                {passwordSuccess && (
                  <div className="p-2 bg-green-50 border border-green-200 rounded-lg flex items-center gap-2 text-green-700 text-sm">
                    <Check size={16} />
                    Passord er endret!
                  </div>
                )}

                <div className="relative">
                  <input
                    type={showCurrentPassword ? 'text' : 'password'}
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    placeholder="Nåværende passord"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowCurrentPassword(!showCurrentPassword)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400"
                  >
                    {showCurrentPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>

                <div className="relative">
                  <input
                    type={showNewPassword ? 'text' : 'password'}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="Nytt passord"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowNewPassword(!showNewPassword)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400"
                  >
                    {showNewPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>

                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Bekreft nytt passord"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                />

                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setShowPasswordForm(false);
                      setPasswordError(null);
                      setCurrentPassword('');
                      setNewPassword('');
                      setConfirmPassword('');
                    }}
                    className="flex-1 py-2 text-sm bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
                  >
                    Avbryt
                  </button>
                  <button
                    type="submit"
                    disabled={isSaving || !currentPassword || !newPassword || !confirmPassword}
                    className="flex-1 py-2 text-sm bg-blue-600 text-white hover:bg-blue-700 rounded-lg transition-colors disabled:opacity-50"
                  >
                    {isSaving ? 'Lagrer...' : 'Lagre'}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
