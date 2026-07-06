import { useState, useEffect } from 'react';
import api from '../lib/api';
import { Save, Plus, Trash2, Edit3, X, Check, Settings as SettingsIcon } from 'lucide-react';

interface ConfigEntry {
  id: string;
  key: string;
  value: string;
  category: string;
  description: string | null;
  enabled: boolean;
}

export default function SystemConfig() {
  const [configs, setConfigs] = useState<ConfigEntry[]>([]);
  const [category, setCategory] = useState('');
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');

  // New config form
  const [newKey, setNewKey] = useState('');
  const [newValue, setNewValue] = useState('');
  const [newCategory, setNewCategory] = useState('general');
  const [newDescription, setNewDescription] = useState('');

  // Edit state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');

  const loadConfigs = async () => {
    try {
      const params = category ? `?category=${category}` : '';
      const { data } = await api.get(`/config${params}`);
      setConfigs(data);
    } catch (err: any) {
      setMessage('Failed to load configs');
    }
    setLoading(false);
  };

  useEffect(() => { loadConfigs(); }, [category]);

  const addConfig = async () => {
    if (!newKey.trim()) return;
    try {
      await api.post('/config', { key: newKey, value: newValue, category: newCategory, description: newDescription });
      setMessage('Config created');
      setNewKey(''); setNewValue(''); setNewDescription('');
      loadConfigs();
    } catch (err: any) {
      setMessage(err.response?.data?.message || 'Failed to create config');
    }
  };

  const updateConfig = async (id: string) => {
    try {
      await api.patch(`/config/${id}`, { value: editValue });
      setMessage('Config updated');
      setEditingId(null);
      loadConfigs();
    } catch (err: any) {
      setMessage(err.response?.data?.message || 'Failed to update config');
    }
  };

  const deleteConfig = async (id: string) => {
    if (!confirm('Delete this config entry?')) return;
    try {
      await api.delete(`/config/${id}`);
      setMessage('Config deleted');
      loadConfigs();
    } catch (err: any) {
      setMessage(err.response?.data?.message || 'Failed to delete config');
    }
  };

  const categories = ['all', 'general', 'cwmp', 'device', 'ui'];
  const filtered = category && category !== 'all' ? configs : configs;

  return (
    <div className="h-full">
      <div className="mb-6">
        <h1 className="text-2xl font-black text-slate-900 dark:text-white">Configurações do Sistema</h1>
        <p className="text-sm text-slate-500 mt-1">Gerencie as configurações de chave/valor do sistema (baseado no GenieACS Config)</p>
      </div>

      <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-6 mb-6">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 bg-primary/10 rounded-xl flex items-center justify-center">
            <SettingsIcon size={20} className="text-primary" />
          </div>
          <div>
            <h3 className="text-base font-bold text-slate-900 dark:text-white">System Config</h3>
            <p className="text-xs text-slate-500">Key-value store for system-wide configuration</p>
          </div>
        </div>

        {/* Category filter */}
        <div className="flex gap-2 mb-4">
          {categories.map(c => (
            <button key={c} onClick={() => setCategory(c === 'all' ? '' : c)}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${
                (category === c) || (!category && c === 'all')
                  ? 'bg-primary text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-500 hover:bg-slate-200'
              }`}
            >
              {c.charAt(0).toUpperCase() + c.slice(1)}
            </button>
          ))}
        </div>

        {message && (
          <div className="mb-4 p-3 bg-slate-50 dark:bg-slate-800 rounded-lg text-sm text-slate-600 dark:text-slate-300">
            {message}
          </div>
        )}

        {/* Config table */}
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-700">
                <th className="text-left py-3 px-2 text-xs font-bold text-slate-400 uppercase">Key</th>
                <th className="text-left py-3 px-2 text-xs font-bold text-slate-400 uppercase">Value</th>
                <th className="text-left py-3 px-2 text-xs font-bold text-slate-400 uppercase">Category</th>
                <th className="text-right py-3 px-2 text-xs font-bold text-slate-400 uppercase">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr><td colSpan={4} className="py-8 text-center text-sm text-slate-400">No config entries found. Add one below.</td></tr>
              ) : filtered.map(cfg => (
                <tr key={cfg.id} className="border-b border-slate-100 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/50">
                  <td className="py-3 px-2 font-mono text-xs text-slate-800 dark:text-slate-200">{cfg.key}</td>
                  <td className="py-3 px-2">
                    {editingId === cfg.id ? (
                      <div className="flex gap-2">
                        <input
                          type="text" value={editValue}
                          onChange={e => setEditValue(e.target.value)}
                          className="flex-1 px-2 py-1 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-mono"
                        />
                        <button onClick={() => updateConfig(cfg.id)} className="text-green-500 hover:text-green-700"><Check size={14} /></button>
                        <button onClick={() => setEditingId(null)} className="text-red-500 hover:text-red-700"><X size={14} /></button>
                      </div>
                    ) : (
                      <span className="text-xs font-mono text-slate-600 dark:text-slate-400 break-all">{cfg.value}</span>
                    )}
                  </td>
                  <td className="py-3 px-2">
                    <span className="text-[10px] font-bold uppercase text-slate-400 bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded">{cfg.category}</span>
                  </td>
                  <td className="py-3 px-2 text-right">
                    <div className="flex items-center justify-end gap-1">
                      <button onClick={() => { setEditingId(cfg.id); setEditValue(cfg.value); }}
                        className="p-1.5 text-slate-400 hover:text-primary rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800">
                        <Edit3 size={14} />
                      </button>
                      <button onClick={() => deleteConfig(cfg.id)}
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

      {/* Add new config */}
      <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-6">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 bg-green-500/10 rounded-xl flex items-center justify-center">
            <Plus size={20} className="text-green-500" />
          </div>
          <div>
            <h3 className="text-base font-bold text-slate-900 dark:text-white">Nova Configuração</h3>
            <p className="text-xs text-slate-500">Adicione uma nova chave/valor ao sistema</p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <div>
            <label className="block text-xs font-semibold text-slate-500 mb-1">Key</label>
            <input type="text" value={newKey} onChange={e => setNewKey(e.target.value)}
              placeholder="ex: acs.default.username"
              className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm font-mono focus:ring-2 focus:ring-primary/20 outline-none" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-500 mb-1">Value</label>
            <input type="text" value={newValue} onChange={e => setNewValue(e.target.value)}
              placeholder="ex: alemnet"
              className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm font-mono focus:ring-2 focus:ring-primary/20 outline-none" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-500 mb-1">Category</label>
            <select value={newCategory} onChange={e => setNewCategory(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm focus:ring-2 focus:ring-primary/20 outline-none">
              <option value="general">general</option>
              <option value="cwmp">cwmp</option>
              <option value="device">device</option>
              <option value="ui">ui</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-500 mb-1">Description</label>
            <input type="text" value={newDescription} onChange={e => setNewDescription(e.target.value)}
              placeholder="Descrição opcional"
              className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm focus:ring-2 focus:ring-primary/20 outline-none" />
          </div>
        </div>

        <div className="mt-6 flex items-center gap-3">
          <button onClick={addConfig}
            className="flex items-center gap-2 px-5 py-2.5 bg-green-500 text-white rounded-xl text-sm font-bold hover:opacity-90 transition-opacity">
            <Plus size={16} /> Adicionar Config
          </button>
        </div>
      </div>
    </div>
  );
}
