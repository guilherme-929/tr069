import { useState, useEffect } from 'react';
import api from '../lib/api';
import { Plus, Search, Users } from 'lucide-react';

export default function Clients() {
  const [clients, setClients] = useState<any[]>([]);
  const [search, setSearch] = useState('');

  useEffect(() => {
    api.get('/clients', { params: { search } }).then(({ data }) => setClients(data.data)).catch(() => {});
  }, [search]);

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-black text-slate-900 dark:text-white">Clients</h1>
          <p className="text-sm text-slate-500 mt-1">Manage subscribers and contracts</p>
        </div>
        <button className="flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-xl text-sm font-bold hover:opacity-90 transition-opacity shadow-md">
          <Plus size={18} /> New Client
        </button>
      </div>

      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center gap-4">
          <div className="relative flex-1 max-w-md">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input type="text" value={search} onChange={(e) => setSearch(e.target.value)} className="w-full pl-10 pr-4 py-2 bg-slate-50 dark:bg-slate-800 border-none rounded-lg text-sm focus:ring-2 focus:ring-primary/20" placeholder="Search clients..." />
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="bg-slate-50 dark:bg-slate-800/50 text-xs font-bold text-slate-500 uppercase border-b border-slate-200 dark:border-slate-800">
                {['Name', 'Document', 'Contract', 'Email', 'Plan', 'Devices'].map((h) => (
                  <th key={h} className="px-6 py-3 tracking-wider">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {clients.map((c: any) => (
                <tr key={c.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                  <td className="px-6 py-4 font-semibold text-slate-900 dark:text-white">{c.name}</td>
                  <td className="px-6 py-4 font-mono text-sm text-slate-500">{c.document || '-'}</td>
                  <td className="px-6 py-4 text-sm text-slate-500">{c.contract || '-'}</td>
                  <td className="px-6 py-4 text-sm text-slate-500">{c.email || '-'}</td>
                  <td className="px-6 py-4">
                    <span className="px-2 py-0.5 bg-primary/10 text-primary rounded text-xs font-bold">{c.plan || '-'}</span>
                  </td>
                  <td className="px-6 py-4 text-sm text-slate-500">{c._count?.devices || 0}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
