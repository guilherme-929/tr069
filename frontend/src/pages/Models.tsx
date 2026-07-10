import { useState, useEffect } from 'react';
import api from '../lib/api';
import { Plus, Edit2, Trash2, Cpu } from 'lucide-react';

export default function Models() {
  const [models, setModels] = useState<any[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({ manufacturer: '', name: '', hwVersion: '', dataModel: 'TR-181' });

  useEffect(() => {
    api.get('/models').then(({ data }) => setModels(data.data)).catch(() => {});
  }, []);

  const openEdit = (m: any) => {
    setForm({ manufacturer: m.manufacturer || '', name: m.name || '', hwVersion: m.hwVersion || '', dataModel: m.dataModel || 'TR-181' });
    setEditingId(m.id);
    setShowForm(true);
  };

  const submitModel = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (editingId) {
        const { data } = await api.put(`/models/${editingId}`, form);
        setModels(models.map(m => m.id === editingId ? data : m));
      } else {
        const { data } = await api.post('/models', form);
        setModels([data, ...models]);
      }
      setShowForm(false);
      setEditingId(null);
      setForm({ manufacturer: '', name: '', hwVersion: '', dataModel: 'TR-181' });
    } catch {}
  };

  const deleteModel = async (id: string) => {
    if (!confirm('Delete this model? This cannot be undone.')) return;
    try {
      await api.delete(`/models/${id}`);
      setModels(models.filter(m => m.id !== id));
    } catch {}
  };

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-black text-slate-900 dark:text-white">Models & Firmware</h1>
          <p className="text-sm text-slate-500 mt-1">Manage device definitions and software distribution</p>
        </div>
        <button onClick={() => { setShowForm(!showForm); setEditingId(null); setForm({ manufacturer: '', name: '', hwVersion: '', dataModel: 'TR-181' }); }} className="flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-xl text-sm font-bold hover:opacity-90 transition-opacity shadow-md">
          <Plus size={18} /> New Resource
        </button>
      </div>

      <div className="flex gap-6">
        <div className="flex-1 space-y-6">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-sm overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/50">
              <h3 className="text-lg font-bold text-slate-900 dark:text-white">Registered Device Models</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="bg-slate-50 dark:bg-slate-800/50 text-xs font-bold text-slate-500 uppercase border-b border-slate-200 dark:border-slate-800">
                    {['Manufacturer / Name', 'HW Version', 'Latest Firmware', 'Status', 'Actions'].map((h) => (
                      <th key={h} className="px-6 py-3 tracking-wider">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {models.map((m: any) => (
                    <tr key={m.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors group">
                      <td className="px-6 py-4">
                        <div className="font-semibold text-slate-900 dark:text-white">{m.name}</div>
                        <div className="text-xs text-slate-500">{m.manufacturer}</div>
                      </td>
                      <td className="px-6 py-4 font-mono text-sm text-slate-500">{m.hwVersion || '-'}</td>
                      <td className="px-6 py-4">
                        <span className="px-2 py-0.5 bg-slate-100 dark:bg-slate-800 rounded text-xs font-medium text-primary border border-slate-200 dark:border-slate-700">
                          v1.0.0
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-success/10 text-success rounded-full text-[10px] font-bold uppercase">Active</span>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button onClick={() => openEdit(m)} className="p-1.5 hover:bg-slate-200 dark:hover:bg-slate-700 rounded"><Edit2 size={16} /></button>
                          <button onClick={() => deleteModel(m.id)} className="p-1.5 hover:bg-danger/10 text-danger rounded"><Trash2 size={16} /></button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="px-6 py-3 bg-slate-50 dark:bg-slate-800/50 border-t border-slate-200 dark:border-slate-800 flex justify-between items-center">
              <span className="text-xs text-slate-500 font-medium">Showing {models.length} models</span>
            </div>
          </div>

          <div className="bg-primary text-white rounded-xl p-6 shadow-lg">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-white/20 rounded-lg"><Cpu size={24} /></div>
                <div>
                  <h4 className="text-lg font-bold">Parameter Schema</h4>
                  <p className="text-xs text-white/70">Default Object Mapping for TR-069 Inform</p>
                </div>
              </div>
              <button className="text-xs font-bold uppercase tracking-wider text-success hover:underline">Edit Tree</button>
            </div>
            <div className="bg-slate-900 rounded-lg p-4 font-mono text-xs max-h-48 overflow-y-auto">
              {['Device.ManagementServer.URL', 'Device.DeviceInfo.SoftwareVersion', 'Device.WiFi.Radio.1.Status', 'Device.IP.Interface.1.IPv4Address'].map((param, i) => (
                <div key={i} className="flex gap-4 mb-2">
                  <span className="text-white/30">{String(i + 1).padStart(2, '0')}</span>
                  <span className="text-success">{param}</span>
                  <span className="text-slate-500">// {['Read-Write', 'Read-Only', 'Periodic Inform', 'Boot Inform'][i]}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {showForm && (
          <div className="w-96 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 shadow-sm h-fit">
            <h3 className="text-lg font-bold mb-4 flex items-center gap-2">
              <Cpu size={20} className="text-primary" /> {editingId ? 'Edit Model' : 'Add New Model'}
            </h3>
            <form onSubmit={submitModel} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Manufacturer</label>
                <input type="text" value={form.manufacturer} onChange={(e) => setForm({ ...form, manufacturer: e.target.value })} className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-primary/20 outline-none" placeholder="e.g. ZTE" required />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Model Name</label>
                <input type="text" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-primary/20 outline-none" placeholder="e.g. F660v8" required />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase mb-1">HW Version</label>
                  <input type="text" value={form.hwVersion} onChange={(e) => setForm({ ...form, hwVersion: e.target.value })} className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-primary/20 outline-none" placeholder="v1.0" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Data Model</label>
                  <select value={form.dataModel} onChange={(e) => setForm({ ...form, dataModel: e.target.value })} className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-primary/20 outline-none">
                    <option>TR-181</option>
                    <option>TR-098</option>
                  </select>
                </div>
              </div>
              <button type="submit" className="w-full bg-primary text-white py-2.5 rounded-lg font-bold text-sm hover:shadow-lg transition-all">
                {editingId ? 'Update Model' : 'Register Device Model'}
              </button>
            </form>
          </div>
        )}
      </div>
    </div>
  );
}
