import { useState, useEffect } from 'react';
import api from '../lib/api';
import { Plus, Trash2, Edit3, Save, X, Check, Eye } from 'lucide-react';

interface VirtualParam {
  id: string;
  key: string;
  value: string;
  description: string | null;
  enabled: boolean;
}

interface VpDefinition {
  paths: string[];
  label: string;
  description?: string;
  transform?: 'first' | 'concat' | 'join';
  separator?: string;
}

export default function VirtualParams() {
  const [params, setParams] = useState<VirtualParam[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  // Form state
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [formName, setFormName] = useState('');
  const [formPaths, setFormPaths] = useState('');
  const [formLabel, setFormLabel] = useState('');
  const [formDescription, setFormDescription] = useState('');
  const [formTransform, setFormTransform] = useState('first');

  const loadParams = async () => {
    try {
      const { data } = await api.get('/config?category=virtual');
      setParams(data);
    } catch {
      setError('Failed to load virtual parameters');
    }
    setLoading(false);
  };

  useEffect(() => { loadParams(); }, []);

  const resetForm = () => {
    setShowForm(false);
    setEditId(null);
    setFormName('');
    setFormPaths('');
    setFormLabel('');
    setFormDescription('');
    setFormTransform('first');
    setMessage('');
  };

  const openEdit = (vp: VirtualParam) => {
    let def: VpDefinition = { paths: [], label: '' };
    try { def = JSON.parse(vp.value); } catch {}
    setEditId(vp.id);
    setFormName(vp.key.replace('virtualparam.', ''));
    setFormPaths(def.paths.join('\n'));
    setFormLabel(def.label || '');
    setFormDescription(def.description || '');
    setFormTransform(def.transform || 'first');
    setShowForm(true);
  };

  const saveParam = async () => {
    if (!formName.trim()) { setMessage('Name is required'); return; }
    const paths = formPaths.split('\n').map(p => p.trim()).filter(Boolean);
    if (paths.length === 0) { setMessage('At least one parameter path is required'); return; }

    const def: VpDefinition = {
      paths,
      label: formLabel || formName,
      description: formDescription || undefined,
      transform: formTransform as any,
    };

    const key = `virtualparam.${formName.trim()}`;
    const value = JSON.stringify(def, null, 2);

    try {
      if (editId) {
        const existing = params.find(p => p.id === editId);
        if (existing) {
          await api.patch(`/config/${editId}`, { value, description: formDescription });
        }
        setMessage('Virtual parameter updated');
      } else {
        await api.post('/config', {
          key,
          value,
          category: 'virtual',
          description: formDescription || `Virtual parameter: ${formLabel || formName}`,
        });
        setMessage('Virtual parameter created');
      }
      resetForm();
      loadParams();
    } catch (err: any) {
      setMessage(err.response?.data?.message || 'Failed to save');
    }
  };

  const deleteParam = async (id: string) => {
    if (!confirm('Delete this virtual parameter definition?')) return;
    try {
      await api.delete(`/config/${id}`);
      setMessage('Virtual parameter deleted');
      loadParams();
    } catch {
      setMessage('Failed to delete');
    }
  };

  const parseDef = (vp: VirtualParam): VpDefinition => {
    try { return JSON.parse(vp.value); } catch { return { paths: [vp.value], label: vp.key }; }
  };

  return (
    <div className="h-full">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-black text-slate-900 dark:text-white">Virtual Parameters</h1>
          <p className="text-sm text-slate-500 mt-1">Definições dos parâmetros virtuais computados a partir dos dados brutos do CPE</p>
        </div>
        {!showForm && (
          <button onClick={() => { resetForm(); setShowForm(true); }}
            className="flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-xl text-sm font-bold hover:opacity-90 transition-opacity">
            <Plus size={16} /> New Virtual Param
          </button>
        )}
      </div>

      {error && <div className="mb-4 p-3 bg-danger/10 border border-danger/20 rounded-xl text-sm text-danger font-medium">{error}</div>}

      {message && (
        <div className="mb-4 p-3 bg-slate-50 dark:bg-slate-800 rounded-xl text-sm text-slate-600 dark:text-slate-300 flex items-center justify-between">
          <span>{message}</span>
          <button onClick={() => setMessage('')} className="text-slate-400 hover:text-slate-600"><X size={14} /></button>
        </div>
      )}

      {/* Form */}
      {showForm && (
        <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-6 mb-6">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 bg-purple-500/10 rounded-xl flex items-center justify-center">
              <Eye size={20} className="text-purple-500" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900 dark:text-white">
                {editId ? 'Edit Virtual Parameter' : 'New Virtual Parameter'}
              </h3>
              <p className="text-xs text-slate-500">Define how a virtual parameter is computed from device data</p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1">Name</label>
              <input type="text" value={formName} onChange={e => setFormName(e.target.value)}
                placeholder="ex: vLoginPPPoE"
                className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm font-mono focus:ring-2 focus:ring-primary/20 outline-none" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1">Label (display name)</label>
              <input type="text" value={formLabel} onChange={e => setFormLabel(e.target.value)}
                placeholder="ex: PPPoE Login"
                className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm focus:ring-2 focus:ring-primary/20 outline-none" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1">Transform</label>
              <select value={formTransform} onChange={e => setFormTransform(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm focus:ring-2 focus:ring-primary/20 outline-none">
                <option value="first">First match (first non-empty path)</option>
                <option value="concat">Concatenate all values</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1">Description</label>
              <input type="text" value={formDescription} onChange={e => setFormDescription(e.target.value)}
                placeholder="Descrição opcional"
                className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm focus:ring-2 focus:ring-primary/20 outline-none" />
            </div>
          </div>

          <div className="mb-4">
            <label className="block text-xs font-semibold text-slate-500 mb-1">
              Parameter Paths <span className="font-normal text-slate-400">(one per line, first match wins)</span>
            </label>
            <textarea value={formPaths} onChange={e => setFormPaths(e.target.value)}
              rows={4}
              placeholder="InternetGatewayDevice.WANDevice.1.WANConnectionDevice.1.WANPPPConnection.1.Username"
              className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-mono focus:ring-2 focus:ring-primary/20 outline-none" />
          </div>

          <div className="flex items-center gap-3">
            <button onClick={saveParam}
              className="flex items-center gap-2 px-5 py-2.5 bg-purple-500 text-white rounded-xl text-sm font-bold hover:opacity-90 transition-opacity">
              <Save size={16} /> {editId ? 'Update' : 'Create'}
            </button>
            <button onClick={resetForm}
              className="flex items-center gap-2 px-4 py-2.5 text-slate-500 rounded-xl text-sm font-bold hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Parameters list */}
      {loading ? (
        <div className="text-center py-12 text-sm text-slate-400">Loading...</div>
      ) : params.length === 0 ? (
        <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-12 text-center">
          <Eye size={32} className="mx-auto mb-3 text-slate-300" />
          <p className="text-sm text-slate-500 mb-1">No virtual parameters defined</p>
          <p className="text-xs text-slate-400">Add a new virtual parameter to define how device data is computed</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {params.map(vp => {
            const def = parseDef(vp);
            return (
              <div key={vp.id} className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-5 hover:shadow-md transition-shadow">
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <h3 className="text-base font-bold text-slate-900 dark:text-white">{def.label || vp.key}</h3>
                    <p className="text-xs font-mono text-primary mt-0.5">{vp.key.replace('virtualparam.', '')}</p>
                  </div>
                  <div className="flex gap-1">
                    <button onClick={() => openEdit(vp)}
                      className="p-1.5 text-slate-400 hover:text-primary rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800">
                      <Edit3 size={14} />
                    </button>
                    <button onClick={() => deleteParam(vp.id)}
                      className="p-1.5 text-slate-400 hover:text-danger rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800">
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <div className="text-[10px] font-semibold text-slate-400 uppercase">Paths</div>
                  {def.paths.slice(0, 3).map((p, i) => (
                    <div key={i} className="text-[11px] font-mono text-slate-500 bg-slate-50 dark:bg-slate-800/50 px-2 py-1 rounded truncate" title={p}>
                      {p}
                    </div>
                  ))}
                  {def.paths.length > 3 && (
                    <div className="text-[10px] text-slate-400">+{def.paths.length - 3} more</div>
                  )}
                </div>

                <div className="flex items-center gap-2 mt-3 pt-3 border-t border-slate-100 dark:border-slate-800">
                  <span className="text-[10px] font-bold text-slate-400 bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded">
                    {def.transform || 'first'}
                  </span>
                  {vp.description && (
                    <span className="text-[10px] text-slate-400 truncate">{vp.description}</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
