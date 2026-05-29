import { useState, useEffect } from 'react';
import api from '../lib/api';
import { Search, Download, Terminal } from 'lucide-react';

export default function Logs() {
  const [logs, setLogs] = useState<any[]>([]);
  const [filter, setFilter] = useState('');

  useEffect(() => {
    api.get('/logs', { params: { search: filter } }).then(({ data }) => setLogs(data.data)).catch(() => {});
  }, [filter]);

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-black text-slate-900 dark:text-white">Logs & Events</h1>
          <p className="text-sm text-slate-500 mt-1">Complete system audit trail</p>
        </div>
        <button className="flex items-center gap-2 px-4 py-2 border border-slate-200 dark:border-slate-700 rounded-xl text-sm font-bold hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors">
          <Download size={18} /> Export
        </button>
      </div>

      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center gap-4">
          <div className="relative flex-1 max-w-md">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              className="w-full pl-10 pr-4 py-2 bg-slate-50 dark:bg-slate-800 border-none rounded-lg text-sm focus:ring-2 focus:ring-primary/20"
              placeholder="Search logs..."
            />
          </div>
          <select className="bg-slate-50 dark:bg-slate-800 border-none rounded-lg text-sm px-3 py-2 focus:ring-2 focus:ring-primary/20">
            <option>All Actions</option>
            <option>LOGIN</option>
            <option>REBOOT</option>
            <option>PROVISION</option>
            <option>FIRMWARE</option>
          </select>
        </div>
        <div className="divide-y divide-slate-100 dark:divide-slate-800 max-h-[600px] overflow-y-auto">
          {logs.map((log: any) => (
            <div key={log.id} className="px-6 py-3 flex items-start gap-4 hover:bg-slate-50 dark:hover:bg-slate-800/50">
              <Terminal size={16} className="mt-0.5 text-slate-400" />
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <span className={`text-[11px] font-bold px-1.5 py-0.5 rounded ${
                    log.action === 'ERROR' ? 'bg-danger/10 text-danger' :
                    log.action === 'LOGIN' ? 'bg-success/10 text-success' : 'bg-primary/10 text-primary'
                  }`}>{log.action}</span>
                  <span className="text-xs text-slate-400">{new Date(log.createdAt).toLocaleString()}</span>
                </div>
                <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">{log.detail}</p>
                {log.user && <p className="text-[10px] text-slate-400 mt-0.5">by {log.user.name}</p>}
              </div>
            </div>
          ))}
          {logs.length === 0 && (
            <div className="px-6 py-12 text-center text-sm text-slate-400">No logs found</div>
          )}
        </div>
      </div>
    </div>
  );
}
