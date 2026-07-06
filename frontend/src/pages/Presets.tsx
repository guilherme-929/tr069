import { useState, useEffect } from 'react';
import api from '../lib/api';
import { Plus, Trash2, Edit3, Save, X, ToggleLeft, ToggleRight, GitBranch } from 'lucide-react';

interface Preset {
  id: string;
  name: string;
  channel: string;
  precondition: string | null;
  script: string | null;
  type: string;
  enabled: boolean;
}

const CHANNEL_COLORS: Record<string, string> = {
  bootstrap: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300',
  default: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
  inform: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300',
};

export default function Presets() {
  const [presets, setPresets] = useState<Preset[]>([]);
  const [provisions, setProvisions] = useState<Preset[]>([]);
  const [channel, setChannel] = useState('');
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');

  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [formName, setFormName] = useState('');
  const [formChannel, setFormChannel] = useState('inform');
  const [formPrecondition, setFormPrecondition] = useState('');
  const [formProvision, setFormProvision] = useState('');
  const [formEnabled, setFormEnabled] = useState(true);

  const loadData = async () => {
    try {
      const { data: all } = await api.get('/scripts');
      setPresets(all.filter((s: Preset) => s.type === 'preset'));
      setProvisions(all.filter((s: Preset) => s.type === 'provision'));
    } catch {
      setMessage('Failed to load');
    }
    setLoading(false);
  };

  useEffect(() => { loadData(); }, []);

  const resetForm = () => {
    setShowForm(false); setEditId(null); setFormName(''); setFormChannel('inform');
    setFormPrecondition(''); setFormProvision(''); setFormEnabled(true); setMessage('');
  };

  const openEdit = (p: Preset) => {
    setEditId(p.id); setFormName(p.name); setFormChannel(p.channel);
    setFormPrecondition(p.precondition || ''); setFormProvision(p.script || '');
    setFormEnabled(p.enabled); setShowForm(true); setMessage('');
  };

  const savePreset = async () => {
    if (!formName.trim()) { setMessage('Name is required'); return; }
    if (!formProvision.trim()) { setMessage('Provision target is required'); return; }

    const body = {
      name: formName, channel: formChannel, type: 'preset',
      precondition: formPrecondition || null,
      script: formProvision, actions: null,
      enabled: formEnabled,
    };

    try {
      if (editId) {
        await api.patch(`/scripts/${editId}`, body);
        setMessage('Preset updated');
      } else {
        await api.post('/scripts', body);
        setMessage('Preset created');
      }
      resetForm(); loadData();
    } catch (err: any) {
      setMessage(err.response?.data?.message || 'Failed to save');
    }
  };

  const toggleEnabled = async (p: Preset) => {
    try {
      await api.patch(`/scripts/${p.id}`, { enabled: !p.enabled });
      setMessage(p.enabled ? 'Preset disabled' : 'Preset enabled');
      loadData();
    } catch { setMessage('Failed to toggle'); }
  };

  const deletePreset = async (id: string) => {
    if (!confirm('Delete this preset?')) return;
    try { await api.delete(`/scripts/${id}`); setMessage('Preset deleted'); loadData(); }
    catch { setMessage('Failed to delete'); }
  };

  const channels = ['all', 'bootstrap', 'default', 'inform'];
  const filtered = channel && channel !== 'all'
    ? presets.filter(p => p.channel === channel) : presets;

  return (
    <div className="h-full">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-black text-slate-900 dark:text-white">Presets</h1>
          <p className="text-sm text-slate-500 mt-1">Regras de mapeamento que vinculam condições a scripts de provisionamento</p>
        </div>
        {!showForm && (
          <button onClick={() => { resetForm(); setShowForm(true); }}
            className="flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-xl text-sm font-bold hover:opacity-90">
            <Plus size={16} /> New Preset
          </button>
        )}
      </div>

      {message && (
        <div className="mb-4 p-3 bg-slate-50 dark:bg-slate-800 rounded-xl text-sm text-slate-600 dark:text-slate-300 flex items-center justify-between">
          <span>{message}</span>
          <button onClick={() => setMessage('')} className="text-slate-400 hover:text-slate-600"><X size={14} /></button>
        </div>
      )}

      {showForm && (
        <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-6 mb-6">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 bg-amber-500/10 rounded-xl flex items-center justify-center">
              <GitBranch size={20} className="text-amber-500" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900 dark:text-white">{editId ? 'Edit Preset' : 'New Preset'}</h3>
              <p className="text-xs text-slate-500">A preset links a precondition + channel to a provision script</p>
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1">Name</label>
              <input type="text" value={formName} onChange={e => setFormName(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm font-mono focus:ring-2 focus:ring-primary/20 outline-none" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1">Channel</label>
              <select value={formChannel} onChange={e => setFormChannel(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm">
                <option value="bootstrap">bootstrap</option>
                <option value="default">default</option>
                <option value="inform">inform</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1">Provision Target</label>
              <select value={formProvision} onChange={e => setFormProvision(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm">
                {provisions.map(p => <option key={p.id} value={p.name}>{p.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1">
                <input type="checkbox" checked={formEnabled} onChange={e => setFormEnabled(e.target.checked)}
                  className="mr-2 rounded border-slate-300 text-primary" />
                Enabled
              </label>
            </div>
          </div>
          <div className="mb-4">
            <label className="block text-xs font-semibold text-slate-500 mb-1">Precondition</label>
            <textarea value={formPrecondition} onChange={e => setFormPrecondition(e.target.value)} rows={3}
              placeholder='DeviceID.ProductClass = "F670L" AND InternetGatewayDevice.DeviceInfo.SoftwareVersion <> "V1.0"'
              className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-mono" />
          </div>
          <div className="flex items-center gap-3">
            <button onClick={savePreset}
              className="flex items-center gap-2 px-5 py-2.5 bg-amber-500 text-white rounded-xl text-sm font-bold hover:opacity-90">
              <Save size={16} /> {editId ? 'Update' : 'Create'}
            </button>
            <button onClick={resetForm}
              className="px-4 py-2.5 text-slate-500 rounded-xl text-sm font-bold hover:bg-slate-100 dark:hover:bg-slate-800">Cancel</button>
          </div>
        </div>
      )}

      <div className="flex gap-2 mb-4">
        {channels.map(c => (
          <button key={c} onClick={() => setChannel(c === 'all' ? '' : c)}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold ${(channel === c) || (!channel && c === 'all') ? 'bg-primary text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-500 hover:bg-slate-200'}`}>
            {c.charAt(0).toUpperCase() + c.slice(1)}
          </button>
        ))}
        <span className="text-xs text-slate-400 self-center ml-auto">{filtered.length} presets</span>
      </div>

      <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50">
              <th className="text-left py-3 px-4 text-xs font-bold text-slate-400 uppercase">Preset</th>
              <th className="text-left py-3 px-4 text-xs font-bold text-slate-400 uppercase">Channel</th>
              <th className="text-left py-3 px-4 text-xs font-bold text-slate-400 uppercase">→ Provision</th>
              <th className="text-left py-3 px-4 text-xs font-bold text-slate-400 uppercase">Precondition</th>
              <th className="text-center py-3 px-4 text-xs font-bold text-slate-400 uppercase">Enabled</th>
              <th className="text-right py-3 px-4 text-xs font-bold text-slate-400 uppercase">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {filtered.length === 0 ? (
              <tr><td colSpan={6} className="py-12 text-center text-sm text-slate-400">No presets defined</td></tr>
            ) : filtered.map(p => (
              <tr key={p.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                <td className="py-3 px-4 font-bold text-slate-900 dark:text-white">{p.name}</td>
                <td className="py-3 px-4">
                  <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full ${CHANNEL_COLORS[p.channel]}`}>{p.channel}</span>
                </td>
                <td className="py-3 px-4">
                  <span className="text-xs font-mono text-primary font-bold">{p.script}</span>
                </td>
                <td className="py-3 px-4 max-w-xs truncate">
                  {p.precondition ? (
                    <span className="text-[10px] font-mono text-slate-500 bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded">{p.precondition}</span>
                  ) : <span className="text-slate-300">—</span>}
                </td>
                <td className="py-3 px-4 text-center">
                  <button onClick={() => toggleEnabled(p)}
                    className={`${p.enabled ? 'text-success' : 'text-slate-400'}`}>
                    {p.enabled ? <ToggleRight size={18} /> : <ToggleLeft size={18} />}
                  </button>
                </td>
                <td className="py-3 px-4 text-right">
                  <button onClick={() => openEdit(p)} className="p-1.5 text-slate-400 hover:text-primary rounded-lg hover:bg-slate-100"><Edit3 size={14} /></button>
                  <button onClick={() => deletePreset(p.id)} className="p-1.5 text-slate-400 hover:text-danger rounded-lg hover:bg-slate-100"><Trash2 size={14} /></button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
