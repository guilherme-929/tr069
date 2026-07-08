import { useState, useEffect } from 'react';
import api from '../lib/api';
import { Play, CheckCircle, XCircle, Clock, AlertCircle, Eye, X } from 'lucide-react';

interface ScriptExecution {
  id: string;
  scriptId: string;
  scriptName: string;
  deviceId: string;
  status: string;
  error: string | null;
  result: any;
  createdAt: string;
  device: { serial: string; modelName: string };
  script: { name: string; channel: string };
}

export default function Provisioning() {
  const [tasks, setTasks] = useState<any[]>([]);
  const [executions, setExecutions] = useState<ScriptExecution[]>([]);
  const [tab, setTab] = useState<'tasks' | 'executions'>('tasks');
  const [execDetail, setExecDetail] = useState<ScriptExecution | null>(null);

  useEffect(() => {
    api.get('/provisioning/tasks').then(({ data }) => {
      setTasks(data.data || []);
    }).catch(() => {});
    api.get('/scripts/executions?limit=50').then(({ data }) => {
      setExecutions(data);
    }).catch(() => {});
  }, []);

  const statusIcon: Record<string, { icon: any; color: string }> = {
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
          { label: 'Pending', value: tasks.filter(t => t.status === 'PENDING').length, icon: Clock, color: 'text-warning', bg: 'bg-warning/10' },
          { label: 'In Progress', value: tasks.filter(t => t.status === 'IN_PROGRESS').length, icon: AlertCircle, color: 'text-primary', bg: 'bg-primary/10' },
          { label: 'Completed', value: tasks.filter(t => t.status === 'COMPLETED').length, icon: CheckCircle, color: 'text-success', bg: 'bg-success/10' },
          { label: 'Failed', value: tasks.filter(t => t.status === 'FAILED').length, icon: XCircle, color: 'text-danger', bg: 'bg-danger/10' },
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

      {/* Tab selector */}
      <div className="flex gap-2 mb-2">
        {(['tasks', 'executions'] as const).map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-4 py-2 rounded-lg text-sm font-bold transition-colors ${
              tab === t ? 'bg-primary text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-500'
            }`}>
            {t === 'tasks' ? 'Tasks (CWMP commands)' : 'Script Executions'}
          </button>
        ))}
      </div>

      {tab === 'tasks' ? (
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
                  {['Device', 'Type', 'Status', 'Attempts', 'Error', 'Created'].map((h) => (
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
                      <td className="px-6 py-4 text-sm text-danger max-w-[200px] truncate">{task.error || '-'}</td>
                      <td className="px-6 py-4 text-sm text-slate-400">{new Date(task.createdAt).toLocaleString()}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800">
            <h3 className="text-lg font-bold text-slate-900 dark:text-white">Script Execution History</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="bg-slate-50 dark:bg-slate-800/50 text-xs font-bold text-slate-500 uppercase border-b border-slate-200 dark:border-slate-800">
                  {['Device', 'Script', 'Channel', 'Status', 'Error', 'When', 'Actions'].map((h) => (
                    <th key={h} className="px-6 py-3 tracking-wider">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {executions.length === 0 ? (
                  <tr><td colSpan={7} className="py-12 text-center text-sm text-slate-400">No executions recorded yet</td></tr>
                ) : executions.map((ex) => {
                  const st = statusIcon[ex.status] || statusIcon.PENDING;
                  return (
                    <tr key={ex.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                      <td className="px-6 py-4 font-mono text-sm font-semibold text-slate-900 dark:text-white">{ex.device?.serial || '-'}</td>
                      <td className="px-6 py-4 text-sm text-slate-500">{ex.script?.name || ex.scriptName}</td>
                      <td className="px-6 py-4">
                        <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-500">
                          {ex.script?.channel || '-'}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold ${st.color} bg-slate-100 dark:bg-slate-800`}>
                          <st.icon size={12} /> {ex.status}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-sm text-danger max-w-[200px] truncate">{ex.error || '-'}</td>
                      <td className="px-6 py-4 text-sm text-slate-400">{new Date(ex.createdAt).toLocaleString()}</td>
                      <td className="px-6 py-4">
                        <button onClick={() => setExecDetail(ex)}
                          className="inline-flex items-center gap-1 text-xs font-bold text-primary hover:underline">
                          <Eye size={12} /> Details
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Execution Detail Modal */}
      {execDetail && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setExecDetail(null)}>
          <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-xl w-full max-w-2xl max-h-[80vh] overflow-hidden mx-4"
            onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between p-6 border-b border-slate-200 dark:border-slate-800">
              <div>
                <h3 className="text-lg font-bold text-slate-900 dark:text-white">
                  {execDetail.script?.name || execDetail.scriptName}
                </h3>
                <p className="text-xs text-slate-400">
                  Device: {execDetail.device?.serial} | {new Date(execDetail.createdAt).toLocaleString()}
                </p>
              </div>
              <button onClick={() => setExecDetail(null)}
                className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg text-slate-400">
                <X size={18} />
              </button>
            </div>
            <div className="p-6 overflow-y-auto max-h-[60vh]">
              <div className="flex items-center gap-2 mb-4">
                <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold ${
                  execDetail.status === 'COMPLETED' ? 'text-success bg-success/10' : 'text-danger bg-danger/10'
                }`}>
                  {execDetail.status === 'COMPLETED' ? <CheckCircle size={14} /> : <XCircle size={14} />}
                  {execDetail.status}
                </span>
                {execDetail.error && <span className="text-xs text-danger">{execDetail.error}</span>}
              </div>

              {execDetail.result && Array.isArray(execDetail.result) && (
                <div className="space-y-2">
                  <h4 className="text-sm font-bold text-slate-700 dark:text-slate-300">Actions</h4>
                  {execDetail.result.map((r: any, i: number) => (
                    <div key={i} className="flex items-start gap-3 p-3 rounded-lg border border-slate-100 dark:border-slate-800">
                      <span className={`mt-0.5 text-sm font-bold ${r.status === 'COMPLETED' ? 'text-success' : 'text-danger'}`}>
                        {r.status === 'COMPLETED' ? '✓' : '✗'}
                      </span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-mono font-bold text-slate-900 dark:text-white">{r.action?.type}</span>
                          {r.action?.path && (
                            <span className="text-xs font-mono text-slate-500 truncate">{r.action.path}</span>
                          )}
                        </div>
                        {r.action?.value !== undefined && (
                          <p className="text-xs text-slate-400 mt-0.5">Value: {String(r.action.value)}</p>
                        )}
                        {r.error && <p className="text-xs text-danger mt-1">{r.error}</p>}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
