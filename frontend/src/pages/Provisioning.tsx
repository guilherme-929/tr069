import { useState, useEffect } from 'react';
import api from '../lib/api';
import { Play, CheckCircle, XCircle, Clock, AlertCircle } from 'lucide-react';

export default function Provisioning() {
  const [tasks, setTasks] = useState<any[]>([]);
  const [stats, setStats] = useState({ pending: 0, completed: 0, failed: 0, inProgress: 0 });

  useEffect(() => {
    api.get('/provisioning/tasks').then(({ data }) => {
      setTasks(data.data);
    }).catch(() => {});
  }, []);

  const statusIcon: Record<string, any> = {
    PENDING: { icon: Clock, color: 'text-warning' },
    IN_PROGRESS: { icon: AlertCircle, color: 'text-primary' },
    COMPLETED: { icon: CheckCircle, color: 'text-success' },
    FAILED: { icon: XCircle, color: 'text-danger' },
    CANCELLED: { icon: XCircle, color: 'text-slate-400' },
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-black text-slate-900 dark:text-white">Provisioning</h1>
        <p className="text-sm text-slate-500 mt-1">Automated device provisioning management</p>
      </div>

      <div className="grid grid-cols-4 gap-4">
        {[
          { label: 'Pending', value: stats.pending, icon: Clock, color: 'text-warning', bg: 'bg-warning/10' },
          { label: 'In Progress', value: stats.inProgress || tasks.filter(t => t.status === 'IN_PROGRESS').length, icon: AlertCircle, color: 'text-primary', bg: 'bg-primary/10' },
          { label: 'Completed', value: stats.completed || tasks.filter(t => t.status === 'COMPLETED').length, icon: CheckCircle, color: 'text-success', bg: 'bg-success/10' },
          { label: 'Failed', value: stats.failed || tasks.filter(t => t.status === 'FAILED').length, icon: XCircle, color: 'text-danger', bg: 'bg-danger/10' },
        ].map((s) => (
          <div key={s.label} className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 shadow-sm">
            <div className="flex items-center gap-3">
              <div className={`p-2 ${s.bg} rounded-lg`}>
                <s.icon size={20} className={s.color} />
              </div>
              <div>
                <p className="text-xs font-bold text-slate-500 uppercase">{s.label}</p>
                <p className="text-2xl font-black text-slate-900 dark:text-white">{s.value}</p>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex justify-between items-center">
          <h3 className="text-lg font-bold text-slate-900 dark:text-white">Provisioning Tasks</h3>
          <button className="flex items-center gap-2 px-4 py-1.5 bg-primary text-white rounded-lg text-xs font-bold hover:opacity-90">
            <Play size={14} /> New Task
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="bg-slate-50 dark:bg-slate-800/50 text-xs font-bold text-slate-500 uppercase border-b border-slate-200 dark:border-slate-800">
                {['Device', 'Type', 'Status', 'Attempts', 'Created', 'Actions'].map((h) => (
                  <th key={h} className="px-6 py-3 tracking-wider">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {tasks.map((task: any) => {
                const st = statusIcon[task.status] || statusIcon.PENDING;
                return (
                  <tr key={task.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                    <td className="px-6 py-4 font-mono text-sm font-semibold text-slate-900 dark:text-white">{task.device?.serial || '-'}</td>
                    <td className="px-6 py-4 text-sm text-slate-500">{task.type}</td>
                    <td className="px-6 py-4">
                      <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold ${st.color} bg-slate-100 dark:bg-slate-800`}>
                        <st.icon size={12} /> {task.status}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm text-slate-500">{task.attempts}/{task.maxAttempts}</td>
                    <td className="px-6 py-4 text-sm text-slate-400">{new Date(task.createdAt).toLocaleString()}</td>
                    <td className="px-6 py-4">
                      <button className="text-xs font-bold text-primary hover:underline">View</button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
