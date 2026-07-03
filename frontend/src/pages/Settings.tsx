import { useState, useEffect } from 'react';
import api from '../lib/api';
import { Save, Wifi, Code, Plus, Trash2 } from 'lucide-react';

interface Script {
  name: string;
  params: Record<string, string>;
}

export default function Settings() {
  const [acsPublicUrl, setAcsPublicUrl] = useState('');
  const [connectionRequestEnabled, setConnectionRequestEnabled] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  // Scripts state
  const [scripts, setScripts] = useState<Script[]>([]);
  const [newScriptName, setNewScriptName] = useState('');
  const [newScriptParams, setNewScriptParams] = useState('');
  const [savingScripts, setSavingScripts] = useState(false);
  const [scriptsMessage, setScriptsMessage] = useState('');

  useEffect(() => {
      api.get('/tenant/settings').then(({ data }) => {
        setAcsPublicUrl(data.acsPublicUrl || '');
        setConnectionRequestEnabled(data.connectionRequestEnabled ?? true);
        setScripts(data.defaultScripts || []);
      }).catch((err) => {
        console.error('Failed to load settings:', err);
      });
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

  const saveScripts = async () => {
    setSavingScripts(true);
    setScriptsMessage('');
    try {
      await api.patch('/tenant/default-scripts', { scripts });
      setScriptsMessage('Scripts saved successfully');
    } catch (err: any) {
      setScriptsMessage(err.response?.data?.message || 'Failed to save scripts');
    }
    setSavingScripts(false);
  };

  const addScript = () => {
    if (!newScriptName.trim()) return;
    try {
      const params = newScriptParams ? JSON.parse(newScriptParams) : {};
      setScripts([...scripts, { name: newScriptName, params }]);
      setNewScriptName('');
      setNewScriptParams('');
    } catch {
      alert('Invalid JSON in params');
    }
  };

  const removeScript = (index: number) => {
    setScripts(scripts.filter((_, i) => i !== index));
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

        {/* Default Scripts / TR-069 Params Section */}
        <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-6">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 bg-green-500/10 rounded-xl flex items-center justify-center">
              <Code size={20} className="text-green-500" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900 dark:text-white">Scripts de Parâmetros TR-069</h3>
              <p className="text-xs text-slate-500">Conjuntos de parâmetros TR-069 aplicados durante o provisionamento dos dispositivos</p>
            </div>
          </div>

          <div className="space-y-3">
            {scripts.length === 0 ? (
              <div className="p-4 bg-slate-50 dark:bg-slate-800/50 rounded-lg text-center">
                <p className="text-sm text-slate-400 mb-2">Nenhum script de parâmetros TR-069 configurado</p>
                <p className="text-xs text-slate-400">Adicione scripts como <code className="font-mono font-bold text-primary">tr-069-params</code> com os pares chave=valor dos parâmetros que deseja aplicar nos CPEs durante o provisionamento.</p>
              </div>
            ) : (
              scripts.map((script, index) => (
                <div key={index} className="flex items-start gap-3 p-3 bg-slate-50 dark:bg-slate-800/50 rounded-lg">
                  <div className="flex-1">
                    <div className="text-sm font-bold text-slate-900 dark:text-white">{script.name}</div>
                    <div className="text-xs text-slate-500 font-mono mt-1">
                      {Object.entries(script.params).map(([k, v]) => `${k}: ${v}`).join(', ')}
                    </div>
                  </div>
                  <button
                    onClick={() => removeScript(index)}
                    className="text-red-500 hover:text-red-700 p-1"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              ))
            )}

            <div className="pt-3 border-t border-slate-100 dark:border-slate-700">
              <p className="text-xs font-semibold text-slate-500 mb-2">Adicionar novo script de parâmetros TR-069</p>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={newScriptName}
                  onChange={e => setNewScriptName(e.target.value)}
                  placeholder='Ex: tr-069-params'
                  className="flex-1 px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm focus:ring-2 focus:ring-primary/20 outline-none"
                />
                <input
                  type="text"
                  value={newScriptParams}
                  onChange={e => setNewScriptParams(e.target.value)}
                  placeholder='{"Device.ManagementServer.URL": "http://acs:7547/cwmp"}'
                  className="flex-1 px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm font-mono focus:ring-2 focus:ring-primary/20 outline-none"
                />
                <button
                  onClick={addScript}
                  className="flex items-center gap-1 px-3 py-2 bg-green-500 text-white rounded-lg text-sm font-bold hover:opacity-90"
                >
                  <Plus size={14} /> Add
                </button>
              </div>
            </div>
          </div>

          <div className="mt-6 flex items-center gap-3">
            <button
              onClick={saveScripts}
              disabled={savingScripts}
              className="flex items-center gap-2 px-5 py-2.5 bg-green-500 text-white rounded-xl text-sm font-bold hover:opacity-90 transition-opacity disabled:opacity-40"
            >
              <Save size={16} /> {savingScripts ? 'Saving...' : 'Salvar Scripts'}
            </button>
            {scriptsMessage && (
              <span className={`text-sm font-medium ${scriptsMessage.includes('success') ? 'text-success' : 'text-danger'}`}>
                {scriptsMessage}
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
