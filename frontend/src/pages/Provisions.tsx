import { useState, useEffect } from 'react';
import api from '../lib/api';
import { ToggleLeft, ToggleRight, Trash2, Code, Plus, Save, X, Check, AlertCircle, Clock, Eye } from 'lucide-react';

interface ScriptAction {
  type: string;
  path?: string;
  value?: any;
  tag?: string;
  message?: string;
}

interface ScriptExecution {
  id: string;
  deviceId: string;
  status: string;
  error: string | null;
  createdAt: string;
  result?: { action: ScriptAction; status: string; error?: string }[];
}

interface Script {
  id: string;
  name: string;
  type: string;
  channel: string;
  precondition: string | null;
  script: string | null;
  actions: ScriptAction[] | null;
  enabled: boolean;
  executions?: ScriptExecution[];
}

const CHANNEL_COLORS: Record<string, string> = {
  bootstrap: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300',
  default: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
  inform: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300',
};

const STATUS_ICONS: Record<string, { icon: any; color: string }> = {
  COMPLETED: { icon: Check, color: 'text-success' },
  FAILED: { icon: X, color: 'text-danger' },
  PENDING: { icon: Clock, color: 'text-warning' },
};

export default function Provisions() {
  const [scripts, setScripts] = useState<Script[]>([]);
  const [executions, setExecutions] = useState<ScriptExecution[]>([]);
  const [channel, setChannel] = useState('');
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [formName, setFormName] = useState('');
  const [formChannel, setFormChannel] = useState('inform');
  const [formPrecondition, setFormPrecondition] = useState('');
  const [formActions, setFormActions] = useState('');
  const [formEnabled, setFormEnabled] = useState(true);

  const [execModal, setExecModal] = useState<{ script: Script; execution: ScriptExecution } | null>(null);

  const loadScripts = async () => {
    try {
      const { data } = await api.get('/scripts');
      setScripts(data);
    } catch {
      setError('Failed to load provisions');
    }
    setLoading(false);
  };

  useEffect(() => { loadScripts(); }, []);

  const loadExecutions = async (scriptId?: string) => {
    try {
      const params = scriptId ? `?scriptId=${scriptId}` : '';
      const { data } = await api.get(`/scripts/executions${params}`);
      setExecutions(data);
    } catch {
      // silent
    }
  };

  const resetForm = () => {
    setShowForm(false);
    setEditId(null);
    setFormName('');
    setFormChannel('inform');
    setFormPrecondition('');
    setFormActions('');
    setFormEnabled(true);
    setMessage('');
  };

  const openEdit = (s: Script) => {
    setEditId(s.id);
    setFormName(s.name);
    setFormChannel(s.channel);
    setFormPrecondition(s.precondition || '');
    setFormActions(JSON.stringify(s.actions || [], null, 2));
    setFormEnabled(s.enabled);
    setShowForm(true);
    setMessage('');
  };

  const saveScript = async () => {
    if (!formName.trim()) { setMessage('Name is required'); return; }
    let actions: ScriptAction[] = [];
    if (formActions.trim()) {
      try { actions = JSON.parse(formActions); }
      catch { setMessage('Invalid JSON in actions'); return; }
    }

    try {
      if (editId) {
        await api.patch(`/scripts/${editId}`, {
          name: formName, channel: formChannel,
          precondition: formPrecondition || null,
          actions, enabled: formEnabled,
        });
        setMessage('Provision updated');
      } else {
        await api.post('/scripts', {
          name: formName, channel: formChannel,
          precondition: formPrecondition || null,
          actions, enabled: formEnabled,
        });
        setMessage('Provision created');
      }
      resetForm();
      loadScripts();
    } catch (err: any) {
      setMessage(err.response?.data?.message || 'Failed to save');
    }
  };

  const toggleEnabled = async (s: Script) => {
    try {
      await api.patch(`/scripts/${s.id}`, { enabled: !s.enabled });
      setMessage(s.enabled ? 'Provision disabled' : 'Provision enabled');
      loadScripts();
    } catch {
      setMessage('Failed to toggle');
    }
  };

  const deleteScript = async (id: string) => {
    if (!confirm('Delete this provision?')) return;
    try {
      await api.delete(`/scripts/${id}`);
      setMessage('Provision deleted');
      loadScripts();
    } catch {
      setMessage('Failed to delete');
    }
  };

  const viewExecutions = async (s: Script) => {
    try {
      const { data } = await api.get(`/scripts/executions?scriptId=${s.id}&limit=20`);
      if (data.length > 0) {
        setExecModal({ script: s, execution: data[0] });
        setExecutions(data);
      } else {
        setMessage('No executions yet for this provision');
      }
    } catch {
      setMessage('Failed to load executions');
    }
  };

  const channels = ['all', 'bootstrap', 'default', 'inform'];
  const filtered = channel && channel !== 'all'
    ? scripts.filter(s => s.channel === channel)
    : scripts;

  const lastExecStatus = (s: Script) => {
    if (!s.executions || s.executions.length === 0) return null;
    const st = s.executions[0];
    const info = STATUS_ICONS[st.status];
    if (!info) return null;
    return (
      <span className={`inline-flex items-center gap-1 text-xs font-bold ${info.color}`}>
        <info.icon size={12} /> {st.status}
      </span>
    );
  };

  const actionSummary = (actions: ScriptAction[] | null) => {
    if (!actions || actions.length === 0) return <span className="text-slate-400">—</span>;
    return actions.map(a => (
      <span key={a.type + (a.path || '')}
        className="inline-block text-[10px] font-mono bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 px-1.5 py-0.5 rounded mr-1 mb-0.5"
        title={a.path || a.message || a.tag || ''}>
        {a.type}{a.path ? `:${a.path.split('.').pop()}` : ''}
      </span>
    ));
  };

  return (
    <div className="h-full">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-black text-slate-900 dark:text-white">Provisions</h1>
          <p className="text-sm text-slate-500 mt-1">Gerencie os scripts de provisionamento dos dispositivos (baseado no GenieACS)</p>
        </div>
        {!showForm && (
          <button onClick={() => { resetForm(); setShowForm(true); }}
            className="flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-xl text-sm font-bold hover:opacity-90 transition-opacity">
            <Plus size={16} /> New Provision
          </button>
        )}
      </div>

      {error && (
        <div className="mb-4 p-3 bg-danger/10 border border-danger/20 rounded-xl text-sm text-danger font-medium">{error}</div>
      )}

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
            <div className="w-10 h-10 bg-green-500/10 rounded-xl flex items-center justify-center">
              <Code size={20} className="text-green-500" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900 dark:text-white">
                {editId ? 'Edit Provision' : 'New Provision'}
              </h3>
              <p className="text-xs text-slate-500">Define the actions executed when a device connects</p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1">Name</label>
              <input type="text" value={formName} onChange={e => setFormName(e.target.value)}
                placeholder="ex: default"
                className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm font-mono focus:ring-2 focus:ring-primary/20 outline-none" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1">Channel</label>
              <select value={formChannel} onChange={e => setFormChannel(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm focus:ring-2 focus:ring-primary/20 outline-none">
                <option value="bootstrap">bootstrap</option>
                <option value="default">default</option>
                <option value="inform">inform</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1">Precondition</label>
              <input type="text" value={formPrecondition} onChange={e => setFormPrecondition(e.target.value)}
                placeholder='ex: DeviceID.ProductClass = "F670L"'
                className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm font-mono focus:ring-2 focus:ring-primary/20 outline-none" />
            </div>
          </div>

          <div className="mb-4">
            <label className="block text-xs font-semibold text-slate-500 mb-1">
              Actions <span className="font-normal text-slate-400">(JSON array)</span>
            </label>
            <textarea value={formActions} onChange={e => setFormActions(e.target.value)}
              rows={5}
              placeholder='[{"type":"log","message":"Hello"},{"type":"setParameter","path":"Device.ManagementServer.URL","value":"http://acs:7547/cwmp"}]'
              className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-mono focus:ring-2 focus:ring-primary/20 outline-none" />
          </div>

          <div className="flex items-center gap-4 mb-4">
            <label className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400 cursor-pointer">
              <input type="checkbox" checked={formEnabled} onChange={e => setFormEnabled(e.target.checked)}
                className="rounded border-slate-300 text-primary focus:ring-primary/20" />
              Enabled
            </label>
          </div>

          <div className="flex items-center gap-3">
            <button onClick={saveScript}
              className="flex items-center gap-2 px-5 py-2.5 bg-green-500 text-white rounded-xl text-sm font-bold hover:opacity-90 transition-opacity">
              <Save size={16} /> {editId ? 'Update' : 'Create'}
            </button>
            <button onClick={resetForm}
              className="flex items-center gap-2 px-4 py-2.5 text-slate-500 rounded-xl text-sm font-bold hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Channel filter */}
      <div className="flex gap-2 mb-4">
        {channels.map(c => (
          <button key={c} onClick={() => setChannel(c === 'all' ? '' : c)}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${
              (channel === c) || (!channel && c === 'all')
                ? 'bg-primary text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-500 hover:bg-slate-200'
            }`}>
            {c.charAt(0).toUpperCase() + c.slice(1)}
          </button>
        ))}
        <span className="text-xs text-slate-400 self-center ml-auto">{filtered.length} provisions</span>
      </div>

      {/* Table */}
      <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50">
                <th className="text-left py-3 px-4 text-xs font-bold text-slate-400 uppercase">Name</th>
                <th className="text-left py-3 px-4 text-xs font-bold text-slate-400 uppercase">Channel</th>
                <th className="text-left py-3 px-4 text-xs font-bold text-slate-400 uppercase">Precondition</th>
                <th className="text-left py-3 px-4 text-xs font-bold text-slate-400 uppercase">Actions</th>
                <th className="text-center py-3 px-4 text-xs font-bold text-slate-400 uppercase">Last Exec</th>
                <th className="text-center py-3 px-4 text-xs font-bold text-slate-400 uppercase">Enabled</th>
                <th className="text-right py-3 px-4 text-xs font-bold text-slate-400 uppercase">Manage</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {filtered.length === 0 ? (
                <tr><td colSpan={7} className="py-12 text-center text-sm text-slate-400">
                  <AlertCircle size={24} className="mx-auto mb-2 text-slate-300" />
                  No provisions found
                </td></tr>
              ) : filtered.map(s => (
                <tr key={s.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                  <td className="py-3 px-4">
                    <span className="font-bold text-slate-900 dark:text-white">{s.name}</span>
                  </td>
                  <td className="py-3 px-4">
                    <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full ${CHANNEL_COLORS[s.channel] || 'bg-slate-100 text-slate-500'}`}>
                      {s.channel}
                    </span>
                  </td>
                  <td className="py-3 px-4">
                    {s.precondition ? (
                      <span className="text-[10px] font-mono text-slate-500 bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded" title={s.precondition}>
                        {s.precondition.length > 40 ? s.precondition.slice(0, 40) + '...' : s.precondition}
                      </span>
                    ) : (
                      <span className="text-slate-300">—</span>
                    )}
                  </td>
                  <td className="py-3 px-4">
                    <div className="flex flex-wrap gap-0.5 max-w-xs">
                      {actionSummary(s.actions)}
                    </div>
                  </td>
                  <td className="py-3 px-4 text-center">
                    {lastExecStatus(s) ? (
                      <button onClick={() => viewExecutions(s)}
                        className="inline-flex items-center gap-1 hover:opacity-80">
                        {lastExecStatus(s)}
                      </button>
                    ) : (
                      <span className="text-slate-300 text-xs">—</span>
                    )}
                  </td>
                  <td className="py-3 px-4 text-center">
                    <button onClick={() => toggleEnabled(s)}
                      className={`inline-flex items-center gap-1 text-xs font-bold transition-colors ${
                        s.enabled ? 'text-success' : 'text-slate-400'
                      }`}>
                      {s.enabled ? <ToggleRight size={18} /> : <ToggleLeft size={18} />}
                    </button>
                  </td>
                  <td className="py-3 px-4 text-right">
                    <div className="flex items-center justify-end gap-1">
                      <button onClick={() => viewExecutions(s)}
                        title="View executions"
                        className="p-1.5 text-slate-400 hover:text-primary rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800">
                        <Eye size={14} />
                      </button>
                      <button onClick={() => openEdit(s)}
                        className="p-1.5 text-slate-400 hover:text-primary rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800">
                        <Code size={14} />
                      </button>
                      <button onClick={() => deleteScript(s.id)}
                        className="p-1.5 text-slate-400 hover:text-danger rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800">
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Execution Modal */}
      {execModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setExecModal(null)}>
          <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-xl w-full max-w-3xl max-h-[80vh] overflow-hidden mx-4"
            onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between p-6 border-b border-slate-200 dark:border-slate-800">
              <div>
                <h3 className="text-lg font-bold text-slate-900 dark:text-white">
                  Executions: {execModal.script.name}
                </h3>
                <p className="text-xs text-slate-400">Recent execution history</p>
              </div>
              <button onClick={() => setExecModal(null)}
                className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg text-slate-400">
                <X size={18} />
              </button>
            </div>
            <div className="overflow-y-auto p-6 max-h-[60vh]">
              {executions.length === 0 ? (
                <p className="text-center text-slate-400 py-8">No executions recorded yet</p>
              ) : (
                <div className="space-y-4">
                  {executions.map(ex => {
                    const st = STATUS_ICONS[ex.status] || STATUS_ICONS.PENDING;
                    const results = (ex.result || []) as { action: ScriptAction; status: string; error?: string }[];
                    return (
                      <div key={ex.id} className="p-4 rounded-lg border border-slate-200 dark:border-slate-700">
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-2">
                            <st.icon size={16} className={st.color} />
                            <span className={`text-sm font-bold ${st.color}`}>{ex.status}</span>
                          </div>
                          <span className="text-xs text-slate-400">{new Date(ex.createdAt).toLocaleString()}</span>
                        </div>
                        {ex.error && (
                          <p className="text-xs text-danger mb-2">{ex.error}</p>
                        )}
                        {results.length > 0 && (
                          <div className="space-y-1 mt-2">
                            {results.map((r, i) => (
                              <div key={i} className="flex items-center gap-2 text-xs">
                                <span className={`font-bold ${r.status === 'COMPLETED' ? 'text-success' : 'text-danger'}`}>
                                  {r.status === 'COMPLETED' ? '✓' : '✗'}
                                </span>
                                <span className="font-mono text-slate-600 dark:text-slate-400">
                                  {r.action.type}
                                </span>
                                {r.action.path && (
                                  <span className="text-slate-400 truncate max-w-[300px]">{r.action.path}</span>
                                )}
                                {r.error && (
                                  <span className="text-danger ml-1">{r.error}</span>
                                )}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
