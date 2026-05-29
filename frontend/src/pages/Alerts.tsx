import { useState, useEffect } from 'react';
import api from '../lib/api';
import { Bell, CheckCircle, AlertTriangle, WifiOff, AlertCircle } from 'lucide-react';

const alertIcons: Record<string, any> = {
  DEVICE_OFFLINE: WifiOff,
  OLD_FIRMWARE: AlertTriangle,
  PROVISIONING_FAILURE: AlertCircle,
  ACS_SESSION_LOST: WifiOff,
  EXCESSIVE_REBOOT: AlertTriangle,
};

export default function Alerts() {
  const [alerts, setAlerts] = useState<any[]>([]);
  const [filter, setFilter] = useState('false');

  useEffect(() => {
    api.get('/alerts', { params: { resolved: filter } }).then(({ data }) => setAlerts(data.data)).catch(() => {});
  }, [filter]);

  const resolveAlert = async (id: string) => {
    try {
      await api.post(`/alerts/${id}/resolve`);
      setAlerts(alerts.filter(a => a.id !== id));
    } catch {}
  };

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-black text-slate-900 dark:text-white">Alerts</h1>
          <p className="text-sm text-slate-500 mt-1">System alerts and notifications</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setFilter('false')} className={`px-4 py-2 rounded-xl text-sm font-bold transition-colors ${filter === 'false' ? 'bg-primary text-white' : 'bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700'}`}>Active</button>
          <button onClick={() => setFilter('true')} className={`px-4 py-2 rounded-xl text-sm font-bold transition-colors ${filter === 'true' ? 'bg-primary text-white' : 'bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700'}`}>Resolved</button>
          <button onClick={() => setFilter('')} className={`px-4 py-2 rounded-xl text-sm font-bold transition-colors ${filter === '' ? 'bg-primary text-white' : 'bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700'}`}>All</button>
        </div>
      </div>

      <div className="space-y-4">
        {alerts.map((alert: any) => {
          const Icon = alertIcons[alert.type] || Bell;
          const severityColor = alert.severity === 'CRITICAL' ? 'text-danger border-danger bg-danger/10' :
            alert.severity === 'WARNING' ? 'text-warning border-warning bg-warning/10' : 'text-primary border-primary bg-primary/10';
          return (
            <div key={alert.id} className={`flex items-start gap-4 p-4 rounded-xl border-l-4 ${severityColor} bg-white dark:bg-slate-900 shadow-sm`}>
              <Icon size={20} className={severityColor.split(' ')[0]} />
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <h4 className="font-bold text-slate-900 dark:text-white">{alert.title}</h4>
                  <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                    alert.severity === 'CRITICAL' ? 'bg-danger/10 text-danger' :
                    alert.severity === 'WARNING' ? 'bg-warning/10 text-warning' : 'bg-primary/10 text-primary'
                  }`}>{alert.severity}</span>
                </div>
                {alert.message && <p className="text-sm text-slate-500 mt-1">{alert.message}</p>}
                <div className="flex items-center gap-4 mt-2">
                  <span className="text-xs text-slate-400">{new Date(alert.createdAt).toLocaleString()}</span>
                  {alert.device && <span className="text-xs font-mono text-slate-400">{alert.device.serial}</span>}
                </div>
              </div>
              {!alert.resolved && (
                <button onClick={() => resolveAlert(alert.id)} className="p-2 hover:bg-success/10 rounded-lg transition-colors" title="Resolve">
                  <CheckCircle size={18} className="text-success" />
                </button>
              )}
            </div>
          );
        })}
        {alerts.length === 0 && (
          <div className="text-center py-12 text-sm text-slate-400">No alerts found</div>
        )}
      </div>
    </div>
  );
}
