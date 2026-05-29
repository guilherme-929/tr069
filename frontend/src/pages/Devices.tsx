import { useState, useEffect } from 'react';
import api from '../lib/api';
import { Search, Wifi, WifiOff, RefreshCw, Power, Download, Settings } from 'lucide-react';

export default function Devices() {
  const [devices, setDevices] = useState<any[]>([]);
  const [selected, setSelected] = useState<any>(null);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);

  useEffect(() => {
    api.get('/devices', { params: { page, limit: 10, search } }).then(({ data }) => {
      setDevices(data.data);
      setTotal(data.total);
    }).catch(() => {});
  }, [page, search]);

  const selectDevice = async (id: string) => {
    try {
      const { data } = await api.get(`/devices/${id}`);
      setSelected(data);
    } catch {}
  };

  return (
    <div className="h-full flex gap-6">
      <div className="flex-1 flex flex-col gap-6">
        <div className="flex items-end justify-between">
          <div>
            <h1 className="text-2xl font-black text-slate-900 dark:text-white">Device Management</h1>
            <p className="text-sm text-slate-500 mt-1">Monitor and configure CPE inventory</p>
          </div>
          <button className="px-4 py-2 bg-primary text-white rounded-xl text-sm font-bold hover:opacity-90 transition-opacity shadow-md">
            + New Provisioning
          </button>
        </div>

        <div className="grid grid-cols-4 gap-4">
          {['Status', 'Model', 'Firmware', 'Tags'].map((filter) => (
            <div key={filter} className="bg-white dark:bg-slate-900 p-2 rounded-xl border border-slate-200 dark:border-slate-800">
              <label className="text-[10px] font-bold text-slate-400 uppercase px-2 mb-1">{filter}</label>
              <select className="w-full bg-transparent border-none text-sm font-semibold focus:ring-0 cursor-pointer">
                <option>All</option>
                <option>Online</option>
                <option>Offline</option>
              </select>
            </div>
          ))}
        </div>

        <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm flex-1 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead className="sticky top-0 bg-white dark:bg-slate-900 z-10">
                <tr className="border-b border-slate-100 dark:border-slate-800">
                  {['Serial', 'MAC', 'Model', 'Firmware', 'Signal', 'Status', 'Last Contact'].map((h) => (
                    <th key={h} className="px-4 py-3 text-[11px] font-bold text-slate-400 uppercase tracking-widest">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50 dark:divide-slate-800/50">
                {devices.map((d: any) => (
                  <tr
                    key={d.id}
                    onClick={() => selectDevice(d.id)}
                    className={`hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors cursor-pointer ${
                      selected?.id === d.id ? 'bg-blue-50/30 dark:bg-blue-950/20' : ''
                    }`}
                  >
                    <td className="px-4 py-3 text-sm font-mono font-bold text-slate-900 dark:text-white">{d.serial}</td>
                    <td className="px-4 py-3 text-sm font-mono text-slate-500">{d.mac}</td>
                    <td className="px-4 py-3 text-sm text-slate-900 dark:text-white">{d.modelName}</td>
                    <td className="px-4 py-3 text-sm text-slate-500">{d.firmwareVersion || '-'}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-end gap-0.5 h-4">
                        {[1, 2, 3, 4].map((s) => (
                          <div key={s} className={`w-1 ${s <= 3 ? `h-${s}` : 'h-3'} ${d.status === 'ONLINE' ? 'bg-success' : 'bg-slate-200'} rounded-full`} style={{ height: `${s * 5 + 2}px` }}></div>
                        ))}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold ${
                        d.status === 'ONLINE' ? 'bg-success/10 text-success' :
                        d.status === 'OFFLINE' ? 'bg-slate-100 text-slate-400' :
                        d.status === 'CRITICAL' ? 'bg-danger/10 text-danger' : 'bg-warning/10 text-warning'
                      }`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${
                          d.status === 'ONLINE' ? 'bg-success' :
                          d.status === 'OFFLINE' ? 'bg-slate-300' :
                          d.status === 'CRITICAL' ? 'bg-danger' : 'bg-warning'
                        }`}></span>
                        {d.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-400">
                      {d.lastContact ? new Date(d.lastContact).toLocaleString() : '-'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="border-t border-slate-100 dark:border-slate-800 p-4 flex items-center justify-between">
            <span className="text-sm text-slate-500">Showing {devices.length} of {total}</span>
            <div className="flex gap-2">
              <button onClick={() => setPage(p => Math.max(1, p - 1))} className="px-3 py-1 border border-slate-200 rounded text-sm hover:bg-slate-50">Prev</button>
              <button onClick={() => setPage(p => p + 1)} className="px-3 py-1 border border-slate-200 rounded text-sm hover:bg-slate-50">Next</button>
            </div>
          </div>
        </div>
      </div>

      {selected && (
        <div className="w-[400px] bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-lg overflow-hidden flex flex-col">
          <div className="p-5 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/50">
            <div className="flex justify-between items-start mb-4">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 bg-primary rounded-xl flex items-center justify-center text-white">
                  <Wifi size={24} />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-slate-900 dark:text-white">{selected.serial}</h3>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-success uppercase">{selected.status}</span>
                    <span className="text-xs text-slate-400">|</span>
                    <span className="text-xs text-slate-500">{selected.modelName}</span>
                  </div>
                </div>
              </div>
              <button onClick={() => setSelected(null)} className="text-slate-400 hover:text-slate-600">&times;</button>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {[
                { icon: Power, label: 'Reboot', color: 'bg-slate-900 text-white' },
                { icon: RefreshCw, label: 'Provision', color: 'border border-slate-200' },
                { icon: Download, label: 'Update', color: 'border border-slate-200' },
                { icon: Settings, label: 'Reset', color: 'border border-danger/20 text-danger' },
              ].map((btn) => (
                <button key={btn.label} className={`flex items-center justify-center gap-2 py-2 rounded-lg text-xs font-bold hover:opacity-90 transition-colors ${btn.color}`}>
                  <btn.icon size={14} /> {btn.label}
                </button>
              ))}
            </div>
          </div>

          <div className="flex border-b border-slate-100 dark:border-slate-800 px-4">
            {['Overview', 'TR-069 Params', 'Network', 'Logs'].map((tab) => (
              <button key={tab} className={`px-4 py-3 text-[11px] font-bold uppercase border-b-2 ${
                tab === 'Overview' ? 'border-primary text-primary' : 'border-transparent text-slate-400 hover:text-slate-600'
              }`}>{tab}</button>
            ))}
          </div>

          <div className="flex-1 overflow-y-auto p-5 space-y-6">
            <section>
              <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">System Information</h4>
              <div className="space-y-3">
                {[
                  { label: 'Uptime', value: '4 days, 12h 44m' },
                  { label: 'MAC Address', value: selected.mac },
                  { label: 'IP Address', value: selected.ipAddress },
                  { label: 'Firmware', value: selected.firmwareVersion || '-' },
                  { label: 'Last Contact', value: selected.lastContact ? new Date(selected.lastContact).toLocaleString() : '-' },
                ].map((field) => (
                  <div key={field.label} className="flex justify-between items-center py-1 border-b border-slate-50 dark:border-slate-800/50">
                    <span className="text-sm text-slate-500">{field.label}</span>
                    <span className="text-sm font-semibold text-slate-900 dark:text-white">{field.value}</span>
                  </div>
                ))}
              </div>
            </section>

            {selected.parameters && (
              <section>
                <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">TR-069 Parameters</h4>
                <div className="p-3 bg-slate-50 dark:bg-slate-800/50 rounded-lg font-mono text-xs space-y-1 max-h-40 overflow-y-auto">
                  {Object.entries(selected.parameters as Record<string, string>).slice(0, 10).map(([key, val]) => (
                    <p key={key} className="text-slate-600 dark:text-slate-400">
                      <span className="text-primary">{key}</span> = {val}
                    </p>
                  ))}
                </div>
              </section>
            )}

            {selected.events && selected.events.length > 0 && (
              <section>
                <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">Recent Events</h4>
                <div className="space-y-3">
                  {selected.events.slice(0, 5).map((ev: any) => (
                    <div key={ev.id} className="flex gap-3">
                      <div className="w-2 h-2 mt-1.5 bg-success rounded-full"></div>
                      <div>
                        <p className="text-sm font-semibold text-slate-900 dark:text-white">{ev.code}</p>
                        <p className="text-xs text-slate-400">{new Date(ev.createdAt).toLocaleString()}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            )}
          </div>

          <div className="p-4 bg-slate-900 border-t border-slate-800">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-bold text-slate-400 uppercase">Interactive Terminal</span>
              <span className="text-[10px] font-mono text-success">READY &gt;_</span>
            </div>
            <div className="font-mono text-[11px] text-slate-300 bg-slate-950 p-3 rounded border border-slate-800">
              <p className="text-success">$ get_params "Device.ManagementServer.URL"</p>
              <p className="mt-1 text-slate-400">&gt;&gt; http://acs.cloud-net.infra/api/cwmp</p>
              <p className="mt-2 text-success animate-pulse">_</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
