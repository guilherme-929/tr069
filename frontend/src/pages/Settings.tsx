import { useState, useEffect } from 'react';
import api from '../lib/api';
import { Save, Wifi } from 'lucide-react';

export default function Settings() {
  const [acsPublicUrl, setAcsPublicUrl] = useState('');
  const [connectionRequestEnabled, setConnectionRequestEnabled] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    api.get('/tenant/settings').then(({ data }) => {
      setAcsPublicUrl(data.acsPublicUrl || '');
      setConnectionRequestEnabled(data.connectionRequestEnabled ?? true);
    }).catch(() => {});
  }, []);

  const save = async () => {
    setSaving(true);
    setMessage('');
    try {
      await api.patch('/tenant/acs-settings', { acsPublicUrl, connectionRequestEnabled });
      setMessage('Settings saved successfully');
    } catch (err: any) {
      setMessage(err.response?.data?.message || 'Failed to save settings');
    }
    setSaving(false);
  };

  return (
    <div className="h-full">
      <div className="mb-6">
        <h1 className="text-2xl font-black text-slate-900 dark:text-white">ACS Settings</h1>
        <p className="text-sm text-slate-500 mt-1">Configure ACS public endpoint and Connection Request settings</p>
      </div>

      <div className="max-w-xl space-y-6">
        <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-6">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 bg-primary/10 rounded-xl flex items-center justify-center">
              <Wifi size={20} className="text-primary" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900 dark:text-white">ACS Connection</h3>
              <p className="text-xs text-slate-500">Public address used by CPEs to reach this ACS</p>
            </div>
          </div>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                ACS Public URL
              </label>
              <input
                type="text"
                value={acsPublicUrl}
                onChange={e => setAcsPublicUrl(e.target.value)}
                placeholder="http://200.100.50.1:7547"
                className="w-full px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm font-mono focus:ring-2 focus:ring-primary/20 outline-none"
              />
              <p className="text-xs text-slate-400 mt-1">
                This URL will be sent to devices as their <code className="font-mono">ConnectionRequestURL</code>
              </p>
            </div>

            <div className="flex items-center justify-between py-3">
              <div>
                <p className="text-sm font-semibold text-slate-900 dark:text-white">Connection Request Enabled</p>
                <p className="text-xs text-slate-500">Allow ACS to send connection requests to CPEs</p>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={connectionRequestEnabled}
                  onChange={e => setConnectionRequestEnabled(e.target.checked)}
                  className="sr-only peer"
                />
                <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-primary/20 rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary"></div>
              </label>
            </div>
          </div>

          <div className="mt-6 flex items-center gap-3">
            <button
              onClick={save}
              disabled={saving}
              className="flex items-center gap-2 px-5 py-2.5 bg-primary text-white rounded-xl text-sm font-bold hover:opacity-90 transition-opacity disabled:opacity-40"
            >
              <Save size={16} /> {saving ? 'Saving...' : 'Save Settings'}
            </button>
            {message && (
              <span className={`text-sm font-medium ${message.includes('success') ? 'text-success' : 'text-danger'}`}>
                {message}
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
