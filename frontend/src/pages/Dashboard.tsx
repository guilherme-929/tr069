import { useState, useEffect } from 'react';
import api from '../lib/api';
import { Wifi, WifiOff, Cpu, HardDrive, Activity, AlertTriangle } from 'lucide-react';
import {
  AreaChart, Area, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell,
} from 'recharts';

const COLORS = ['#22c55e', '#ef4444', '#f59e0b', '#4e9fff'];

export default function Dashboard() {
  const [stats, setStats] = useState({
    online: 0, offline: 0, totalDevices: 0,
    totalModels: 0, totalFirmwares: 0, provisionedToday: 0,
    alerts: [],
  });
  const [recentDevices, setRecentDevices] = useState<any[]>([]);
  const [models, setModels] = useState<any[]>([]);

  useEffect(() => {
    api.get('/acs/stats').then(({ data }) => setStats(data)).catch(() => {});
    api.get('/devices', { params: { limit: 5 } }).then(({ data }) => setRecentDevices(data.data || [])).catch(() => {});
    api.get('/models').then(({ data }) => {
      const items = data.data || data || [];
      setModels(items.slice(0, 8));
    }).catch(() => {});
  }, []);

  const cards = [
    { label: 'Online Devices', value: stats.online.toLocaleString(), icon: Wifi, color: 'text-success', bg: 'bg-success/10', change: '+2%' },
    { label: 'Offline Devices', value: stats.offline.toLocaleString(), icon: WifiOff, color: 'text-danger', bg: 'bg-danger/10', change: '-0.4%' },
    { label: 'Registered Models', value: stats.totalModels, icon: Cpu, color: 'text-primary', bg: 'bg-primary/10' },
    { label: 'Firmware Available', value: stats.totalFirmwares, icon: HardDrive, color: 'text-warning', bg: 'bg-warning/10', tag: 'NEW UPDATES' },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-black text-slate-900 dark:text-white">Dashboard</h1>
        <p className="text-sm text-slate-500 mt-1">Network infrastructure overview</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {cards.map((card) => (
          <div key={card.label} className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 rounded-xl shadow-sm relative overflow-hidden group">
            <div className="absolute top-3 right-3">
              <card.icon size={24} className={`${card.color} opacity-40 group-hover:opacity-100 transition-opacity`} />
            </div>
            <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">{card.label}</p>
            <div className="flex items-baseline gap-2 mt-2">
              <h2 className="text-3xl font-black text-slate-900 dark:text-white">{card.value}</h2>
              {card.change && (
                <span className={`text-[10px] font-bold ${card.change.startsWith('+') ? 'text-success' : 'text-danger'} bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded`}>
                  {card.change}
                </span>
              )}
              {card.tag && (
                <span className="text-[10px] font-bold text-primary bg-primary/10 px-1.5 py-0.5 rounded">{card.tag}</span>
              )}
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 shadow-sm">
          <div className="flex justify-between items-center mb-6">
            <div>
              <h3 className="text-lg font-bold text-slate-900 dark:text-white">Network Availability</h3>
              <p className="text-xs text-slate-500">Last 24 hours</p>
            </div>
          </div>
          <div className="h-[300px] flex items-center justify-center">
            <p className="text-sm text-slate-400">Timeline data will appear here once devices start reporting</p>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 shadow-sm flex flex-col">
          <div className="flex justify-between items-center mb-6">
            <h3 className="text-lg font-bold text-slate-900 dark:text-white">Active Alerts</h3>
            <span className="bg-danger/10 text-danger text-[10px] font-bold px-2 py-0.5 rounded-full">
              {stats.alerts?.length || 0} CRITICAL
            </span>
          </div>
          <div className="space-y-4 flex-1">
            {(stats.alerts?.length ? stats.alerts : []).map((alert: any, i: number) => (
              <div key={i} className="flex gap-4 p-3 rounded-lg bg-danger/10 border-l-4 border-danger">
                <AlertTriangle size={18} className="text-danger" />
                <div>
                  <p className="text-sm font-semibold text-slate-900 dark:text-white">{alert.title || alert.message || 'Alert'}</p>
                  <p className="text-xs text-slate-500">{alert.description || alert.detail || ''}</p>
                  <p className="text-[10px] font-medium text-slate-400 mt-1 uppercase">
                    {alert.createdAt ? new Date(alert.createdAt).toLocaleString() : ''}
                  </p>
                </div>
              </div>
            ))}
            {(!stats.alerts || stats.alerts.length === 0) && (
              <div className="flex items-center justify-center h-full py-8">
                <p className="text-sm text-slate-400">No active alerts</p>
              </div>
            )}
          </div>
          <button className="mt-4 w-full py-2 bg-slate-50 dark:bg-slate-800 text-xs font-bold text-slate-500 hover:text-slate-900 transition-colors uppercase rounded-lg">
            View All Alerts
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 shadow-sm">
          <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-4">Provisioning per Hour</h3>
          <div className="h-[250px] flex items-center justify-center">
            <p className="text-sm text-slate-400">Provisioning data will appear once devices are provisioned</p>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 shadow-sm">
          <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-4">Models Distribution</h3>
          <div className="h-[250px] flex items-center justify-center">
            {models.length > 0 ? (
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={models.map((m: any) => ({ name: m.name, value: m._count?.devices || 1 }))}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={90}
                  paddingAngle={5}
                  dataKey="value"
                  label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                >
                  {models.map((_: any, i: number) => (
                    <Cell key={i} fill={COLORS[i % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
            ) : (
              <p className="text-sm text-slate-400">No models data</p>
            )}
          </div>
        </div>
      </div>

      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex justify-between items-center">
          <h3 className="text-lg font-bold text-slate-900 dark:text-white">Recent Devices</h3>
          <button className="px-4 py-1.5 bg-primary text-white rounded-lg text-xs font-bold hover:opacity-90 transition-opacity">
            + Add Device
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="bg-slate-50 dark:bg-slate-800/50">
                {['Status', 'Model', 'Serial', 'IP', 'Last Inform', 'Firmware'].map((h) => (
                  <th key={h} className="px-6 py-3 text-[11px] font-bold text-slate-500 uppercase tracking-wider">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {(recentDevices.length ? recentDevices : []).map((row: any, i: number) => (
                <tr key={row.id || i} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                  <td className="px-6 py-4">
                    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-bold uppercase ${
                      row.status === 'ONLINE' ? 'bg-success/10 text-success' : 'bg-danger/10 text-danger'
                    }`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${row.status === 'ONLINE' ? 'bg-success' : 'bg-danger'}`}></span>
                      {row.status}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-sm font-semibold text-slate-900 dark:text-white">{row.modelName || row.model?.name || '-'}</td>
                  <td className="px-6 py-4 text-sm font-mono text-slate-500">{row.serial}</td>
                  <td className="px-6 py-4 text-sm text-slate-500">{row.ipAddress || row.wanIp || '-'}</td>
                  <td className="px-6 py-4 text-sm text-slate-400">
                    {row.lastInform ? new Date(row.lastInform).toLocaleString() : '-'}
                  </td>
                  <td className="px-6 py-4 text-sm font-mono text-slate-500">{row.firmwareVersion || '-'}</td>
                </tr>
              ))}
              {recentDevices.length === 0 && (
                <tr><td colSpan={6} className="px-6 py-12 text-center text-sm text-slate-400">No devices registered</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="bg-slate-950 text-white rounded-xl shadow-2xl overflow-hidden">
        <div className="px-4 py-2 bg-slate-900 border-b border-slate-800 flex justify-between items-center">
          <div className="flex items-center gap-2">
            <div className="flex gap-1.5">
              <div className="w-3 h-3 rounded-full bg-red-500/50"></div>
              <div className="w-3 h-3 rounded-full bg-amber-500/50"></div>
              <div className="w-3 h-3 rounded-full bg-green-500/50"></div>
            </div>
            <span className="font-mono text-[11px] text-slate-400 ml-4">SYSTEM LOGS - LIVE STREAM</span>
          </div>
          <span className="flex items-center gap-2 text-[10px] text-green-500 uppercase font-bold">
            <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse"></span> Connected
          </span>
        </div>
        <div className="p-4 font-mono text-[13px] leading-6 max-h-[160px] overflow-y-auto space-y-1">
          {[
            '[2024-10-24 14:22:01] INFO  CWMP worker started on thread #14',
            '[2024-10-24 14:22:05] AUTH  Device ZTEGC0A1B2C3 authenticated successfully',
            '[2024-10-24 14:22:08] WARN  HTTP session timeout for IP 10.24.12.5',
            '[2024-10-24 14:22:15] ERROR Provisioning script "Default_F660" failed at step 4: XML_PARSE_ERROR',
            '[2024-10-24 14:22:20] INFO  Periodic Inform received from MAC: 00:25:96:AA:BB:CC',
          ].map((line, i) => (
            <p key={i}>
              <span className="text-slate-500">{line.split(' ').slice(0, 2).join(' ')}</span>{' '}
              <span className={
                line.includes('ERROR') ? 'text-red-400' :
                line.includes('AUTH') ? 'text-green-400' :
                line.includes('WARN') ? 'text-amber-400' : 'text-blue-400'
              }>{line.split(' ').slice(2, 3).join(' ')}</span>{' '}
              {line.split(' ').slice(3).join(' ')}
            </p>
          ))}
        </div>
      </div>
    </div>
  );
}
