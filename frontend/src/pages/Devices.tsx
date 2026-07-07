import { useState, useEffect } from 'react';
import api from '../lib/api';
import { Search, Wifi, WifiOff, RefreshCw, Power, Download, Settings, Terminal, ExternalLink, Eye, EyeOff, Save, Trash2, Radio, RadioTower, Monitor, Signal, SignalHigh, ChevronRight, ChevronDown, Database } from 'lucide-react';

const tabs = ['Overview', 'TR-069 Params', 'Network', 'WiFi', 'Clients', 'Discovery', 'Logs'] as const;
type Tab = typeof tabs[number];

export default function Devices() {
  const [devices, setDevices] = useState<any[]>([]);
  const [selected, setSelected] = useState<any>(null);
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [statusFilter, setStatusFilter] = useState('');
  const [activeTab, setActiveTab] = useState<Tab>('Overview');
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [discoveryStatus, setDiscoveryStatus] = useState<any>(null);
  const [discoveryPolling, setDiscoveryPolling] = useState<any>(null);
  const [virtualParams, setVirtualParams] = useState<any>(null);
  const [connectedDevices, setConnectedDevices] = useState<any[]>([]);
  const [virtualParamsLoading, setVirtualParamsLoading] = useState(false);
  const [connectedDevicesLoading, setConnectedDevicesLoading] = useState(false);
  const [paramSearch, setParamSearch] = useState('');
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set());

  const toggleSection = (path: string) => {
    setExpandedSections(prev => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path); else next.add(path);
      return next;
    });
  };

  useEffect(() => {
    const params: any = { page, limit: 10 };
    if (search) params.search = search;
    if (statusFilter) params.status = statusFilter;
    api.get('/devices', { params }).then(({ data }) => {
      setDevices(data.data);
      setTotal(data.total);
    }).catch(() => {});
  }, [page, search, statusFilter]);

  useEffect(() => {
    if (activeTab === 'WiFi' && selected) {
      const hasWifiParams = selected.parameters?.['InternetGatewayDevice.LANDevice.1.WLANConfiguration.1.SSID']
        || selected.parameters?.['Device.WiFi.SSID.1.SSID'];
      if (!hasWifiParams) {
        (async () => {
          try {
            const { data } = await api.post(`/devices/${selected.id}/wifi/read`);
            if (data.source === 'cache' && data.params) {
              setSelected((prev: any) => ({
                ...prev,
                parameters: { ...prev.parameters, ...data.params },
              }));
            }
          } catch {}
        })();
      }
    }
  }, [activeTab, selected?.id]);

  useEffect(() => {
    if (activeTab === 'Overview' && selected) {
      setVirtualParamsLoading(true);
      setVirtualParams(null);
      api.get(`/devices/${selected.id}/virtual-params`)
        .then(({ data }) => setVirtualParams(data))
        .catch(() => setVirtualParams(null))
        .finally(() => setVirtualParamsLoading(false));
    }
  }, [activeTab, selected?.id]);

  useEffect(() => {
    if ((activeTab === 'Overview' || activeTab === 'Clients') && selected) {
      setConnectedDevicesLoading(true);
      api.get(`/devices/${selected.id}/connected-devices`)
        .then(({ data }) => setConnectedDevices(Array.isArray(data) ? data : []))
        .catch(() => setConnectedDevices([]))
        .finally(() => setConnectedDevicesLoading(false));
    }
  }, [activeTab, selected?.id]);

  const selectDevice = async (id: string) => {
    try {
      const { data } = await api.get(`/devices/${id}`);
      setSelected(data);
      setActiveTab('Overview');
    } catch {}
  };

  const doAction = async (action: string, deviceId: string) => {
    setActionLoading(action);
    try {
      await api.post(`/devices/${deviceId}/${action}`);
      if (action === 'reboot' || action === 'reset') {
        setActionLoading(null);
        return;
      }
    } catch (err: any) {
      alert(err.response?.data?.message || `Failed to ${action}`);
    }
    setActionLoading(null);
  };

  const doProvision = async (deviceId: string) => {
    setActionLoading('provision');
    try {
      await api.post(`/provisioning/device/${deviceId}`, {});
    } catch (err: any) {
      alert(err.response?.data?.message || 'Provisioning failed');
    }
    setActionLoading(null);
  };

  const deleteDevice = async (deviceId: string) => {
    if (!confirm('Are you sure you want to delete this device? This action cannot be undone.')) return;
    setActionLoading('delete');
    try {
      await api.delete(`/devices/${deviceId}`);
      setSelected(null);
      setDevices(devices.filter(d => d.id !== deviceId));
      setTotal(total - 1);
    } catch (err: any) {
      alert(err.response?.data?.message || 'Failed to delete device');
    }
    setActionLoading(null);
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setSearch(searchInput);
    setPage(1);
  };

  const fmt = (ts: string) => ts ? new Date(ts).toLocaleString() : '-';
  const uptime = (s: number) => {
    if (!s) return '-';
    const d = Math.floor(s / 86400);
    const h = Math.floor((s % 86400) / 3600);
    const m = Math.floor((s % 3600) / 60);
    return `${d}d ${h}h ${m}m`;
  };

  return (
    <div className="h-full flex gap-6">
      <div className="flex-1 flex flex-col gap-6">
        <div className="flex items-end justify-between">
          <div>
            <h1 className="text-2xl font-black text-slate-900 dark:text-white">Device Management</h1>
            <p className="text-sm text-slate-500 mt-1">Monitor and configure CPE inventory</p>
          </div>
          <button
            onClick={() => window.location.href = '/provisioning'}
            className="px-4 py-2 bg-primary text-white rounded-xl text-sm font-bold hover:opacity-90 transition-opacity shadow-md"
          >
            + New Provisioning
          </button>
        </div>

        <div className="grid grid-cols-5 gap-4">
          <form onSubmit={handleSearch} className="col-span-2 relative">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Search serial, MAC, model..."
              value={searchInput}
              onChange={e => setSearchInput(e.target.value)}
              className="w-full pl-9 pr-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm focus:ring-2 focus:ring-primary/20 outline-none"
            />
          </form>
          <div className="bg-white dark:bg-slate-900 p-2 rounded-xl border border-slate-200 dark:border-slate-800">
            <label className="text-[10px] font-bold text-slate-400 uppercase px-2 mb-1">Status</label>
            <select
              value={statusFilter}
              onChange={e => { setStatusFilter(e.target.value); setPage(1); }}
              className="w-full bg-transparent border-none text-sm font-semibold focus:ring-0 cursor-pointer outline-none"
            >
              <option value="">All</option>
              <option value="ONLINE">Online</option>
              <option value="OFFLINE">Offline</option>
              <option value="PROVISIONING">Provisioning</option>
              <option value="ERROR">Error</option>
              <option value="CRITICAL">Critical</option>
            </select>
          </div>
          <div className="bg-white dark:bg-slate-900 p-2 rounded-xl border border-slate-200 dark:border-slate-800">
            <label className="text-[10px] font-bold text-slate-400 uppercase px-2 mb-1">Model</label>
            <select disabled className="w-full bg-transparent border-none text-sm font-semibold focus:ring-0 cursor-pointer outline-none text-slate-400">
              <option>All</option>
            </select>
          </div>
          <div className="bg-white dark:bg-slate-900 p-2 rounded-xl border border-slate-200 dark:border-slate-800">
            <label className="text-[10px] font-bold text-slate-400 uppercase px-2 mb-1">Firmware</label>
            <select disabled className="w-full bg-transparent border-none text-sm font-semibold focus:ring-0 cursor-pointer outline-none text-slate-400">
              <option>All</option>
            </select>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm flex-1 overflow-hidden">
          <div className="overflow-x-auto max-h-[calc(100vh-320px)]">
            <table className="w-full text-left">
              <thead className="sticky top-0 bg-white dark:bg-slate-900 z-10">
                <tr className="border-b border-slate-100 dark:border-slate-800">
                  {['Serial', 'MAC', 'Model', 'Firmware', 'Signal', 'Status', 'Last Contact'].map(h => (
                    <th key={h} className="px-4 py-3 text-[11px] font-bold text-slate-400 uppercase tracking-widest">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50 dark:divide-slate-800/50">
                {devices.map(d => (
                  <tr
                    key={d.id}
                    onClick={() => selectDevice(d.id)}
                    className={`hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors cursor-pointer ${selected?.id === d.id ? 'bg-blue-50/30 dark:bg-blue-950/20' : ''}`}
                  >
                    <td className="px-4 py-3 text-sm font-mono font-bold text-slate-900 dark:text-white">{d.serial}</td>
                    <td className="px-4 py-3 text-sm font-mono text-slate-500">{d.mac}</td>
                    <td className="px-4 py-3 text-sm text-slate-900 dark:text-white">{d.modelName}</td>
                    <td className="px-4 py-3 text-sm text-slate-500">{d.firmwareVersion || '-'}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-end gap-0.5 h-4">
                        {[1, 2, 3, 4].map(s => (
                          <div key={s} className={`w-1 rounded-full ${d.status === 'ONLINE' ? 'bg-success' : 'bg-slate-200'}`} style={{ height: `${s * 5 + 2}px` }} />
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
                        }`} />
                        {d.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-400">{fmt(d.lastContact)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="border-t border-slate-100 dark:border-slate-800 p-4 flex items-center justify-between">
            <span className="text-sm text-slate-500">Showing {devices.length} of {total}</span>
            <div className="flex gap-2">
              <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} className="px-3 py-1 border border-slate-200 rounded text-sm hover:bg-slate-50 disabled:opacity-40">Prev</button>
              <button onClick={() => setPage(p => p + 1)} disabled={devices.length < 10} className="px-3 py-1 border border-slate-200 rounded text-sm hover:bg-slate-50 disabled:opacity-40">Next</button>
            </div>
          </div>
        </div>
      </div>

      {selected && (
        <div className="w-[420px] bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-lg overflow-hidden flex flex-col">
          <div className="p-5 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/50">
            <div className="flex justify-between items-start mb-4">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 bg-primary rounded-xl flex items-center justify-center text-white">
                  <Wifi size={24} />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-slate-900 dark:text-white">{selected.serial}</h3>
                  <div className="flex items-center gap-2">
                    <span className={`text-xs font-bold uppercase ${selected.status === 'ONLINE' ? 'text-success' : 'text-slate-400'}`}>{selected.status}</span>
                    <span className="text-xs text-slate-400">|</span>
                    <span className="text-xs text-slate-500">{selected.modelName}</span>
                  </div>
                </div>
              </div>
              <button onClick={() => setSelected(null)} className="text-slate-400 hover:text-slate-600">&times;</button>
            </div>
            <div className="flex flex-col gap-2">
              <div className="grid grid-cols-5 gap-2">
                <button
                  onClick={() => doAction('reboot', selected.id)}
                  disabled={actionLoading === 'reboot'}
                  className="flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-bold bg-slate-900 text-white hover:opacity-90 transition-colors disabled:opacity-40"
                >
                  <Power size={13} /> {actionLoading === 'reboot' ? '...' : 'Reboot'}
                </button>
                <button
                  onClick={() => doProvision(selected.id)}
                  disabled={actionLoading === 'provision'}
                  className="flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-bold border border-slate-200 hover:bg-slate-50 transition-colors disabled:opacity-40"
                >
                  <RefreshCw size={13} /> {actionLoading === 'provision' ? '...' : 'Provision'}
                </button>
                <button
                  onClick={() => doAction('update', selected.id)}
                  disabled={actionLoading === 'update'}
                  className="flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-bold border border-slate-200 hover:bg-slate-50 transition-colors disabled:opacity-40"
                >
                  <Download size={13} /> {actionLoading === 'update' ? '...' : 'Update'}
                </button>
                <button
                  onClick={async () => {
                    try {
                      const { data } = await api.post(`/devices/${selected.id}/connection-request`);
                      alert(data.message);
                    } catch (err: any) {
                      alert(err.response?.data?.message || 'Connection request failed');
                    }
                  }}
                  disabled={!selected.connectionRequestUrl}
                  className="flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-bold border border-primary/30 text-primary hover:bg-primary/5 transition-colors disabled:opacity-40"
                >
                  <ExternalLink size={13} /> CR
                </button>
                <button
                  onClick={() => doAction('reset', selected.id)}
                  disabled={actionLoading === 'reset'}
                  className="flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-bold border border-danger/20 text-danger hover:bg-danger/5 transition-colors disabled:opacity-40"
                >
                  <Settings size={13} /> {actionLoading === 'reset' ? '...' : 'Reset'}
                </button>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={async () => {
                    setActiveTab('WiFi');
                    try {
                      const { data } = await api.post(`/devices/${selected.id}/wifi/read`);
                      if (data.source === 'cache' && data.params) {
                        setSelected((prev: any) => ({
                          ...prev,
                          parameters: { ...prev.parameters, ...data.params },
                        }));
                        const ssid = data.params['InternetGatewayDevice.LANDevice.1.WLANConfiguration.1.SSID']
                          || data.params['Device.WiFi.SSID.1.SSID']
                          || '';
                        const pw = data.params['InternetGatewayDevice.LANDevice.1.WLANConfiguration.1.KeyPassphrase']
                          || data.params['Device.WiFi.AccessPoint.1.Security.KeyPassphrase']
                          || '';
                        setTimeout(() => {
                          const ssidEl = document.getElementById('wifi-ssid') as HTMLInputElement;
                          const pwEl = document.getElementById('wifi-password') as HTMLInputElement;
                          if (ssidEl) ssidEl.value = ssid;
                          if (pwEl) pwEl.value = pw;
                        }, 100);
                        alert('WiFi configuration loaded from CPE');
                      } else if (data.source === 'pending') {
                        alert(data.message + ' Switch to WiFi tab and refresh after CPE responds.');
                      }
                    } catch (err: any) {
                      alert(err.response?.data?.message || 'Failed to read WiFi config');
                    }
                  }}
                  className="flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-bold border border-green-500/30 text-green-600 hover:bg-green-50 transition-colors"
                >
                  <Radio size={13} /> Verificar WiFi
                </button>
                <button
                  onClick={async () => {
                    try {
                      const { data } = await api.post(`/devices/${selected.id}/fetch-all`, { names: ['Device.', 'InternetGatewayDevice.'], connectionRequest: true });
                      alert(data.message + ' Connection request sent to wake up CPE.');
                    } catch (err: any) {
                      alert(err.response?.data?.message || 'Failed to fetch parameters');
                    }
                  }}
                  disabled={actionLoading === 'fetch-all'}
                  className="flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-bold border border-violet-500/30 text-violet-600 hover:bg-violet-50 transition-colors disabled:opacity-40"
                >
                  <Database size={13} /> {actionLoading === 'fetch-all' ? '...' : 'Fetch All'}
                </button>
                <button
                  onClick={() => deleteDevice(selected.id)}
                  disabled={actionLoading === 'delete'}
                  className="flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-bold bg-danger text-white hover:opacity-90 transition-colors disabled:opacity-40"
                >
                  <Trash2 size={13} /> {actionLoading === 'delete' ? '...' : 'Deletar'}
                </button>
              </div>
            </div>
          </div>

          <div className="flex border-b border-slate-100 dark:border-slate-800 px-4">
            {tabs.map(tab => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`px-4 py-3 text-[11px] font-bold uppercase border-b-2 transition-colors ${
                  tab === activeTab ? 'border-primary text-primary' : 'border-transparent text-slate-400 hover:text-slate-600'
                }`}
              >
                {tab}
              </button>
            ))}
          </div>

          <div className="flex-1 overflow-y-auto p-5 space-y-5">
            {activeTab === 'Overview' && (
              <>
                {/* Tags */}
                {selected.tags?.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {selected.tags.map((tag: string) => (
                      <span key={tag} className="text-[10px] font-bold bg-primary/10 text-primary px-2 py-0.5 rounded-full">{tag}</span>
                    ))}
                  </div>
                )}

                {/* Key Metrics Cards */}
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                  {[
                    { label: 'Last Inform', value: fmt(selected.lastInform) },
                    { label: 'vWAN1_IP', value: virtualParams?.vWAN1_IP || '-' },
                    { label: 'Serial', value: selected.serial },
                    { label: 'Product Class', value: (selected.parameters as any)?.['InternetGatewayDevice.DeviceInfo.ProductClass'] || (selected.parameters as any)?.['Device.DeviceInfo.ProductClass'] || '-' },
                    { label: 'OUI', value: selected.oui || (selected.parameters as any)?.['InternetGatewayDevice.DeviceInfo.ManufacturerOUI'] || (selected.parameters as any)?.['Device.DeviceInfo.ManufacturerOUI'] || '-' },
                    { label: 'Fabricante', value: selected.manufacturer || '-' },
                    { label: 'Hardware', value: selected.model?.hwVersion || selected.hardwareVersion || '-' },
                    { label: 'Software', value: selected.firmwareVersion || '-' },
                  ].map(f => (
                    <div key={f.label} className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-3">
                      <div className="text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-1">{f.label}</div>
                      <div className="text-xs font-semibold text-slate-900 dark:text-white font-mono truncate">{f.value}</div>
                    </div>
                  ))}
                </div>

                {/* WiFi Section — only shown when data available */}
                {(() => {
                  const p = selected.parameters as Record<string, string> || {};
                  const hasWifi = virtualParams?.wifiBands?.length > 0
                    || p['InternetGatewayDevice.LANDevice.1.WLANConfiguration.1.SSID']
                    || p['Device.WiFi.SSID.1.SSID'];
                  if (!hasWifi) return null;
                  return (
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                      <section>
                        <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">
                          <Wifi size={13} className="inline mr-1.5 -mt-0.5" />
                          Interface WiFi 2.4GHz
                        </h4>
                        <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-4 space-y-2">
                          {(() => {
                            const wb = virtualParams?.wifiBands?.find((b: any) => b.band.includes('2.4') || b.band === 'WLAN1');
                            const ssid = wb?.ssid || p['InternetGatewayDevice.LANDevice.1.WLANConfiguration.1.SSID'] || '-';
                            const pass = p['InternetGatewayDevice.LANDevice.1.WLANConfiguration.1.KeyPassphrase'] || p['Device.WiFi.AccessPoint.1.Security.KeyPassphrase'] || '-';
                            const ch = wb?.channel || p['InternetGatewayDevice.LANDevice.1.WLANConfiguration.1.Channel'] || '-';
                            const sta = wb?.status || p['InternetGatewayDevice.LANDevice.1.WLANConfiguration.1.Status'] || '-';
                            const assoc = wb?.associations || p['InternetGatewayDevice.LANDevice.1.WLANConfiguration.1.TotalAssociations'] || '0';
                            return (<>
                              <div className="flex justify-between text-xs"><span className="text-slate-500">SSID</span><span className="font-mono font-semibold text-slate-900 dark:text-white">{ssid}</span></div>
                              <div className="flex justify-between text-xs"><span className="text-slate-500">Passphrase</span><span className="font-mono font-semibold text-slate-900 dark:text-white">{pass}</span></div>
                              <div className="flex justify-between text-xs"><span className="text-slate-500">Canal</span><span className="font-mono font-semibold text-slate-900 dark:text-white">{ch}</span></div>
                              <div className="flex justify-between text-xs"><span className="text-slate-500">Status</span><span className="font-mono font-semibold text-slate-900 dark:text-white">{sta}</span></div>
                              <div className="flex justify-between text-xs"><span className="text-slate-500">Clientes Conectados</span><span className="font-mono font-semibold text-slate-900 dark:text-white">{assoc}</span></div>
                            </>);
                          })()}
                        </div>
                      </section>
                      <section>
                        <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">
                          <Wifi size={13} className="inline mr-1.5 -mt-0.5" />
                          Interface WiFi 5GHz
                        </h4>
                        <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-4 space-y-2">
                          {(() => {
                            const wb = virtualParams?.wifiBands?.find((b: any) => b.band.includes('5') || b.band === 'WLAN5');
                            const ssid = wb?.ssid || p['InternetGatewayDevice.LANDevice.1.WLANConfiguration.5.SSID'] || '-';
                            const pass = p['InternetGatewayDevice.LANDevice.1.WLANConfiguration.5.KeyPassphrase'] || '-';
                            const ch = wb?.channel || p['InternetGatewayDevice.LANDevice.1.WLANConfiguration.5.Channel'] || '-';
                            const sta = wb?.status || p['InternetGatewayDevice.LANDevice.1.WLANConfiguration.5.Status'] || '-';
                            const assoc = wb?.associations || p['InternetGatewayDevice.LANDevice.1.WLANConfiguration.5.TotalAssociations'] || '0';
                            return (<>
                              <div className="flex justify-between text-xs"><span className="text-slate-500">SSID</span><span className="font-mono font-semibold text-slate-900 dark:text-white">{ssid}</span></div>
                              <div className="flex justify-between text-xs"><span className="text-slate-500">Passphrase</span><span className="font-mono font-semibold text-slate-900 dark:text-white">{pass}</span></div>
                              <div className="flex justify-between text-xs"><span className="text-slate-500">Canal</span><span className="font-mono font-semibold text-slate-900 dark:text-white">{ch}</span></div>
                              <div className="flex justify-between text-xs"><span className="text-slate-500">Status</span><span className="font-mono font-semibold text-slate-900 dark:text-white">{sta}</span></div>
                              <div className="flex justify-between text-xs"><span className="text-slate-500">Clientes Conectados</span><span className="font-mono font-semibold text-slate-900 dark:text-white">{assoc}</span></div>
                            </>);
                          })()}
                        </div>
                      </section>
                    </div>
                  );
                })()}

                {/* Reported Parameters from Inform */}
                <section>
                  <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">
                    <Database size={13} className="inline mr-1.5 -mt-0.5" />
                    Parameters Reportados pelo CPE
                  </h4>
                  <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-4 font-mono text-xs max-h-64 overflow-y-auto space-y-0.5">
                    {(() => {
                      const p = selected.parameters as Record<string, string> || {};
                      const entries = Object.entries(p).filter(([k]) => !k.startsWith('__'));
                      if (entries.length === 0) return <p className="text-slate-400 italic">Nenhum parameter reportado.</p>;
                      return entries.sort(([a], [b]) => a.localeCompare(b)).map(([key, val]) => (
                        <p key={key} className="break-all">
                          <span className="text-primary">{key}</span>
                          <span className="text-slate-300"> = </span>
                          <span className="text-slate-900 dark:text-white">{String(val)}</span>
                        </p>
                      ));
                    })()}
                  </div>
                </section>

                {/* LAN Hosts */}
                <section>
                  <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">LAN Hosts</h4>
                  <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="bg-slate-50 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-700">
                          <th className="text-left px-3 py-2 font-bold text-slate-500 text-[10px] uppercase">Hostname</th>
                          <th className="text-left px-3 py-2 font-bold text-slate-500 text-[10px] uppercase">IP</th>
                          <th className="text-left px-3 py-2 font-bold text-slate-500 text-[10px] uppercase">MAC</th>
                          <th className="text-left px-3 py-2 font-bold text-slate-500 text-[10px] uppercase">Interface</th>
                          <th className="text-left px-3 py-2 font-bold text-slate-500 text-[10px] uppercase">Active</th>
                        </tr>
                      </thead>
                      <tbody>
                        {connectedDevices.length > 0 ? connectedDevices.map((cd: any, i: number) => (
                          <tr key={i} className="border-b border-slate-100 dark:border-slate-800/50 last:border-0">
                            <td className="px-3 py-2 font-semibold text-slate-900 dark:text-white">{cd.hostname || cd.name || '-'}</td>
                            <td className="px-3 py-2 font-mono text-slate-600 dark:text-slate-400">{cd.ip || '-'}</td>
                            <td className="px-3 py-2 font-mono text-slate-600 dark:text-slate-400">{cd.mac || '-'}</td>
                            <td className="px-3 py-2">{cd.interface || (cd.isWireless !== undefined ? (cd.isWireless ? 'WiFi' : 'LAN') : '-')}</td>
                            <td className="px-3 py-2">
                              <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${cd.active !== false ? 'bg-success/10 text-success' : 'bg-slate-100 text-slate-400'}`}>
                                {cd.active !== false ? 'Active' : 'Inactive'}
                              </span>
                            </td>
                          </tr>
                        )) : (
                          <tr><td colSpan={5} className="px-3 py-4 text-center text-slate-400 italic">
                            {connectedDevicesLoading ? 'Loading...' : 'No LAN hosts found'}
                          </td></tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </section>

                {/* Activity Log */}
                <section>
                  <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">Activity</h4>
                  <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden">
                    <div className="max-h-64 overflow-y-auto">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="bg-slate-50 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-700 sticky top-0">
                            <th className="text-left px-3 py-2 font-bold text-slate-500 text-[10px] uppercase">Channel</th>
                            <th className="text-left px-3 py-2 font-bold text-slate-500 text-[10px] uppercase">Code</th>
                            <th className="text-left px-3 py-2 font-bold text-slate-500 text-[10px] uppercase">Message</th>
                            <th className="text-left px-3 py-2 font-bold text-slate-500 text-[10px] uppercase">Detail</th>
                            <th className="text-center px-3 py-2 font-bold text-slate-500 text-[10px] uppercase">Retries</th>
                            <th className="text-left px-3 py-2 font-bold text-slate-500 text-[10px] uppercase">Timestamp</th>
                          </tr>
                        </thead>
                        <tbody>
                          {(() => {
                            const rows: any[] = [];
                            (selected.tasks || []).slice(0, 20).forEach((t: any) => {
                              rows.push({
                                type: 'task',
                                channel: t.type,
                                code: t.status,
                                message: t.error || t.type,
                                detail: t.result ? (typeof t.result === 'string' ? t.result : JSON.stringify(t.result).slice(0, 60)) : '-',
                                retries: `${t.attempts || 0}/${t.maxAttempts || 3}`,
                                ts: t.createdAt,
                              });
                            });
                            (selected.events || []).slice(0, 20).forEach((e: any) => {
                              rows.push({
                                type: 'event',
                                channel: e.code?.split(' ').slice(0, 2).join(' ') || 'EVENT',
                                code: e.code,
                                message: e.message || '-',
                                detail: e.data ? (typeof e.data === 'string' ? e.data : JSON.stringify(e.data).slice(0, 60)) : '-',
                                retries: '-',
                                ts: e.createdAt,
                              });
                            });
                            rows.sort((a, b) => new Date(b.ts).getTime() - new Date(a.ts).getTime());
                            return rows.slice(0, 30).map((r, i) => (
                              <tr key={`${r.type}-${i}`} className="border-b border-slate-100 dark:border-slate-800/50 last:border-0">
                                <td className="px-3 py-1.5 text-slate-600 dark:text-slate-400 font-semibold">{r.channel}</td>
                                <td className="px-3 py-1.5">
                                  <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                                    r.code === 'COMPLETED' || r.code === '1' ? 'bg-success/10 text-success' :
                                    r.code === 'FAILED' || r.code === '0' ? 'bg-danger/10 text-danger' :
                                    r.code === 'IN_PROGRESS' || r.code === 'M' ? 'bg-warning/10 text-warning' : 'bg-slate-100 dark:bg-slate-700 text-slate-500'
                                  }`}>{r.code}</span>
                                </td>
                                <td className="px-3 py-1.5 text-slate-900 dark:text-white truncate max-w-[160px]">{r.message}</td>
                                <td className="px-3 py-1.5 text-slate-400 font-mono truncate max-w-[120px]">{r.detail}</td>
                                <td className="px-3 py-1.5 text-center font-mono text-slate-500">{r.retries}</td>
                                <td className="px-3 py-1.5 text-slate-400 whitespace-nowrap">{fmt(r.ts)}</td>
                              </tr>
                            ));
                          })()}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </section>
              </>
            )}

            {activeTab === 'TR-069 Params' && (
              <section>
                <div className="flex items-center justify-between mb-3">
                  <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest">All Parameters</h4>
                  {selected.parameters && typeof selected.parameters === 'object' && (
                    <span className="text-[10px] text-slate-400 font-mono">
                      {Object.keys(selected.parameters).filter(k => !k.startsWith('__')).length} params
                    </span>
                  )}
                </div>
                <div className="relative mb-3">
                  <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    placeholder="Filter parameters..."
                    value={paramSearch}
                    onChange={e => setParamSearch(e.target.value)}
                    className="w-full pl-7 pr-3 py-1.5 text-xs font-mono bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-primary/30"
                  />
                </div>
                <div className="bg-slate-50 dark:bg-slate-800/50 rounded-lg font-mono text-xs max-h-[500px] overflow-y-auto">
                  {(() => {
                    const params = selected.parameters && typeof selected.parameters === 'object' && !Array.isArray(selected.parameters)
                      ? (selected.parameters as Record<string, string>) : {};
                    const entries = Object.entries(params).filter(([k]) => !k.startsWith('__'));
                    const filtered = paramSearch
                      ? entries.filter(([k, v]) => k.toLowerCase().includes(paramSearch.toLowerCase()) || String(v).toLowerCase().includes(paramSearch.toLowerCase()))
                      : entries;
                    if (filtered.length === 0) {
                      return <p className="p-3 text-slate-400 italic">
                        {paramSearch ? 'No matching parameters' : 'No parameters available'}
                      </p>;
                    }

                    // Build tree from flat paths
                    interface TreeNode {
                      name: string;
                      path: string;
                      children: Record<string, TreeNode>;
                      value?: string;
                    }
                    const root: Record<string, TreeNode> = {};
                    for (const [key, val] of filtered) {
                      const parts = key.split('.');
                      let level = root;
                      let acc = '';
                      for (let i = 0; i < parts.length; i++) {
                        const part = parts[i];
                        acc += (acc ? '.' : '') + part;
                        if (i === parts.length - 1) {
                          level[part] = { name: part, path: acc, children: {}, value: val };
                        } else {
                          if (!level[part]) level[part] = { name: part, path: acc, children: {} };
                          level = level[part].children;
                        }
                      }
                    }

                    const renderTree = (nodes: Record<string, TreeNode>, depth: number): React.ReactNode[] => {
                      return Object.entries(nodes).sort(([a], [b]) => a.localeCompare(b)).map(([name, node]) => {
                        const hasChildren = Object.keys(node.children).length > 0;
                        const isExpanded = expandedSections.has(node.path);
                        if (hasChildren) {
                          return (
                            <div key={node.path}>
                              <button
                                onClick={() => toggleSection(node.path)}
                                className="flex items-center gap-1 w-full text-left px-3 py-1 hover:bg-slate-100 dark:hover:bg-slate-700/50 transition-colors"
                                style={{ paddingLeft: `${12 + depth * 14}px` }}
                              >
                                {isExpanded ? <ChevronDown size={10} className="text-slate-400 flex-shrink-0" /> : <ChevronRight size={10} className="text-slate-400 flex-shrink-0" />}
                                <span className="text-slate-500 font-semibold">{node.path}</span>
                              </button>
                              {isExpanded && renderTree(node.children, depth + 1)}
                            </div>
                          );
                        }
                        return (
                          <div
                            key={node.path}
                            className="flex items-center gap-2 px-3 py-0.5 hover:bg-slate-100 dark:hover:bg-slate-700/50 transition-colors"
                            style={{ paddingLeft: `${12 + depth * 14}px` }}
                          >
                            <span className="text-primary break-all">{node.path}</span>
                            <span className="text-slate-300 flex-shrink-0">=</span>
                            <span className="text-slate-900 dark:text-white break-all min-w-0">{String(node.value)}</span>
                          </div>
                        );
                      });
                    };

                    return <div className="py-1">{renderTree(root, 0)}</div>;
                  })()}
                </div>
              </section>
            )}

            {activeTab === 'Network' && (
              <section>
                <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">Network Interfaces</h4>
                <div className="space-y-3">
                  <div className="p-3 bg-slate-50 dark:bg-slate-800/50 rounded-lg">
                    <div className="text-sm font-bold text-slate-900 dark:text-white mb-2">Connection Info</div>
                    <div className="space-y-1 text-xs text-slate-600 dark:text-slate-400">
                      <p><span className="text-slate-400">IPv4:</span> {selected.ipAddress || '-'}</p>
                      <p><span className="text-slate-400">WAN:</span> {selected.wanIp || '-'}</p>
                      <p><span className="text-slate-400">MAC:</span> {selected.mac || '-'}</p>
                    </div>
                  </div>

                  <div className="p-3 bg-slate-50 dark:bg-slate-800/50 rounded-lg space-y-3">
                    <div className="text-sm font-bold text-slate-900 dark:text-white">Connection Request</div>

                    <div>
                      <label className="text-[10px] font-bold text-slate-400 uppercase mb-1 block">ACS Public URL (override)</label>
                      <input
                        type="text"
                        defaultValue={selected.acsPublicUrlOverride || ''}
                        placeholder="http://acs.mydomain.com:7547"
                        onBlur={async (e) => {
                          const val = e.target.value.trim() || undefined;
                          try {
                            const { data } = await api.patch(`/devices/${selected.id}/acs-config`, { acsPublicUrlOverride: val });
                            setSelected((prev: any) => ({ ...prev, acsPublicUrlOverride: data.acsPublicUrlOverride }));
                          } catch {}
                        }}
                        className="w-full px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-mono focus:ring-2 focus:ring-primary/20 outline-none"
                      />
                    </div>

                    <div>
                      <label className="text-[10px] font-bold text-slate-400 uppercase mb-1 block">Device ConnectionRequest URL</label>
                      <div className="flex gap-2">
                        <input
                          type="text"
                          defaultValue={selected.connectionRequestUrl || ''}
                          placeholder="http://192.168.1.1:7547/"
                          onBlur={async (e) => {
                            const val = e.target.value.trim() || undefined;
                            try {
                              const { data } = await api.patch(`/devices/${selected.id}/acs-config`, { connectionRequestUrl: val });
                              setSelected((prev: any) => ({ ...prev, connectionRequestUrl: data.connectionRequestUrl }));
                            } catch {}
                          }}
                          className="flex-1 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-mono focus:ring-2 focus:ring-primary/20 outline-none"
                        />
                      </div>
                      <p className="text-[10px] text-slate-400 mt-1">Reported by CPE or configured manually</p>
                    </div>

                    <div>
                      <label className="text-[10px] font-bold text-slate-400 uppercase mb-1 block">Connection Request Username</label>
                      <input
                        type="text"
                        defaultValue={selected.connectionRequestUsername || ''}
                        placeholder={selected.serial || 'serial'}
                        onBlur={async (e) => {
                          const val = e.target.value.trim() || undefined;
                          try {
                            const { data } = await api.patch(`/devices/${selected.id}/acs-config`, { connectionRequestUsername: val });
                            setSelected((prev: any) => ({ ...prev, connectionRequestUsername: data.connectionRequestUsername }));
                          } catch {}
                        }}
                        className="w-full px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-mono focus:ring-2 focus:ring-primary/20 outline-none"
                      />
                      <p className="text-[10px] text-slate-400 mt-1">Default: device serial</p>
                    </div>

                    <div>
                      <label className="text-[10px] font-bold text-slate-400 uppercase mb-1 block">Connection Request Password</label>
                      <input
                        type="password"
                        defaultValue={selected.connectionRequestPassword || ''}
                        placeholder={selected.serial || 'serial'}
                        onBlur={async (e) => {
                          const val = e.target.value.trim() || undefined;
                          try {
                            const { data } = await api.patch(`/devices/${selected.id}/acs-config`, { connectionRequestPassword: val });
                            setSelected((prev: any) => ({ ...prev, connectionRequestPassword: data.connectionRequestPassword }));
                          } catch {}
                        }}
                        className="w-full px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-mono focus:ring-2 focus:ring-primary/20 outline-none"
                      />
                      <p className="text-[10px] text-slate-400 mt-1">Default: device serial</p>
                    </div>

                    <button
                      onClick={async () => {
                        try {
                          const { data } = await api.post(`/devices/${selected.id}/connection-request`);
                          alert(data.message);
                        } catch (err: any) {
                          alert(err.response?.data?.message || 'Connection request failed');
                        }
                      }}
                      disabled={!selected.connectionRequestUrl}
                      className="flex items-center justify-center gap-2 w-full py-2 rounded-lg text-xs font-bold bg-primary text-white hover:opacity-90 transition-opacity disabled:opacity-40"
                    >
                      <ExternalLink size={14} /> Send Connection Request
                    </button>
                  </div>
                </div>
              </section>
            )}

            {activeTab === 'WiFi' && (
              <section>
                <div className="flex items-center justify-between mb-3">
                  <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest">WiFi Configuration</h4>
                  <button
                    onClick={async () => {
                      try {
                        const { data } = await api.post(`/devices/${selected.id}/discover`);
                        alert(data.message + ' Switch to Discovery tab to monitor progress.');
                      } catch (err: any) {
                        alert(err.response?.data?.message || 'Failed to start discovery');
                      }
                    }}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold border border-slate-200 hover:bg-slate-50 transition-colors"
                  >
                    <RadioTower size={13} /> Discover All WiFi Params
                  </button>
                </div>

                {(() => {
                  const p = selected.parameters as Record<string, string> || {};
                  const allParams = { ...p, ...(discoveryStatus?.wifiParams || {}) };

                  // Group WLAN params by instance index
                  const wlanInstances: Record<string, Record<string, string>> = {};
                  Object.entries(allParams).forEach(([key, val]) => {
                    const igdMatch = key.match(/InternetGatewayDevice\.LANDevice\.\d+\.WLANConfiguration\.(\d+)\.(.+)/);
                    const devMatch = key.match(/Device\.WiFi\.(?:SSID|AccessPoint|Radio)\.(\d+)\.(.+)/);
                    const idx = igdMatch?.[1] || devMatch?.[1];
                    const subKey = igdMatch?.[2] || devMatch?.[2] || key;
                    if (idx) {
                      if (!wlanInstances[idx]) wlanInstances[idx] = {};
                      wlanInstances[idx][subKey] = String(val);
                    }
                  });

                  const bandLabels: Record<string, string> = { '1': '2.4 GHz', '2': '2.4 GHz (Guest)', '3': '5 GHz', '4': '5 GHz (Guest)', '5': '2.4 GHz IoT', '6': '5 GHz IoT', '7': '6 GHz', '8': '6 GHz (Guest)' };

                  // Check if we have discoveryStatus for merge
                  const hasDiscoveredWifi = discoveryStatus?.wifiParams && Object.keys(discoveryStatus.wifiParams).length > 0;

                  const instances = Object.entries(wlanInstances).sort(([a], [b]) => Number(a) - Number(b));

                  return (
                    <div className="space-y-3">
                      {instances.length === 0 && (
                        <div className="p-6 text-center">
                          <Wifi size={32} className="mx-auto text-slate-300 mb-2" />
                          <p className="text-sm text-slate-400">No WiFi parameters found. Click "Discover All WiFi Params" to scan.</p>
                        </div>
                      )}

                      {instances.map(([idx, params]) => {
                        const ssid = params['SSID'] || '';
                        const pwdKey = Object.keys(params).find(k => k.toLowerCase().includes('keypassphrase') || k.toLowerCase().includes('presharedkey'));
                        const password = pwdKey ? params[pwdKey] : '';
                        const enabled = params['Enable'] === '1' || params['Enable'] === 'true';
                        const channel = params['Channel'] || '-';
                        const standard = params['Standard'] || params['X_ZTE-COM_Standard'] || '-';
                        const bandwidth = params['X_ZTE-COM_BandWidth'] || params['OperatingStandards'] || '-';
                        const associations = params['TotalAssociations'] || params['X_ZTE-COM_TotalAssociations'] || '-';
                        const freqBand = params['OperatingFrequencyBand'] || params['X_ZTE-COM_OperatingFrequencyBand'] || bandLabels[idx] || `Band ${idx}`;
                        return (
                          <div key={idx} className="p-3 bg-slate-50 dark:bg-slate-800/50 rounded-lg border border-slate-100 dark:border-slate-700/50">
                            <div className="flex items-center justify-between mb-2">
                              <div className="flex items-center gap-2">
                                <div className={`w-2.5 h-2.5 rounded-full ${enabled ? 'bg-success' : 'bg-slate-300'}`} />
                                <span className="text-sm font-bold text-slate-900 dark:text-white">WLAN {idx} — {freqBand}</span>
                              </div>
                              <span className="text-[10px] font-mono text-slate-400">{associations} clients</span>
                            </div>

                            <div className="grid grid-cols-2 gap-2 mb-2">
                              <div>
                                <label className="text-[10px] font-bold text-slate-400 uppercase block">SSID</label>
                                <input
                                  type="text"
                                  defaultValue={ssid}
                                  id={`wifi-ssid-${idx}`}
                                  className="w-full px-2 py-1 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-mono focus:ring-2 focus:ring-primary/20 outline-none"
                                />
                              </div>
                              <div>
                                <label className="text-[10px] font-bold text-slate-400 uppercase block">Password</label>
                                <div className="relative">
                                  <input
                                    type={showPassword ? 'text' : 'password'}
                                    defaultValue={password}
                                    id={`wifi-password-${idx}`}
                                    className="w-full pr-7 px-2 py-1 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-mono focus:ring-2 focus:ring-primary/20 outline-none"
                                  />
                                </div>
                              </div>
                            </div>

                            <div className="flex flex-wrap gap-3 text-[10px] font-mono text-slate-500">
                              <span>Ch: <strong className="text-slate-700 dark:text-slate-300">{channel}</strong></span>
                              <span>Std: <strong className="text-slate-700 dark:text-slate-300">{standard}</strong></span>
                              <span>BW: <strong className="text-slate-700 dark:text-slate-300">{bandwidth}</strong></span>
                            </div>

                            <div className="mt-2 flex gap-1.5">
                              <button
                                onClick={async () => {
                                  const sid = (document.getElementById(`wifi-ssid-${idx}`) as HTMLInputElement).value;
                                  const pw = (document.getElementById(`wifi-password-${idx}`) as HTMLInputElement).value;
                                  if (!sid || !pw) { alert('Fill in both SSID and password'); return; }
                                  try {
                                    const { data } = await api.post(`/devices/${selected.id}/wifi`, { ssid: sid, password: pw, instance: Number(idx) });
                                    alert(data.message);
                                    selectDevice(selected.id);
                                  } catch (err: any) {
                                    alert(err.response?.data?.message || 'Failed to save WiFi config');
                                  }
                                }}
                                className="flex items-center gap-1 px-2.5 py-1 rounded text-[10px] font-bold bg-primary text-white hover:opacity-90"
                              >
                                <Save size={10} /> Save
                              </button>
                              <button
                                onClick={async () => {
                                  try {
                                    const { data } = await api.post(`/devices/${selected.id}/wifi/read`, { instance: Number(idx) });
                                    if (data.source === 'cache' && data.params) {
                                      const merged = { ...allParams, ...data.params };
                                      // Refresh the view by forcing re-render with merged params
                                      setSelected((prev: any) => ({
                                        ...prev,
                                        parameters: { ...prev.parameters, ...merged },
                                      }));
                                      alert('WiFi parameters loaded');
                                    } else {
                                      alert(data.message + ' Refresh after CPE connects.');
                                    }
                                  } catch (err: any) {
                                    alert(err.response?.data?.message || 'Failed to read WiFi config');
                                  }
                                }}
                                className="flex items-center gap-1 px-2.5 py-1 rounded text-[10px] font-bold border border-slate-200 hover:bg-slate-50"
                              >
                                <RefreshCw size={10} /> Read
                              </button>
                            </div>
                          </div>
                        );
                      })}

                      {hasDiscoveredWifi && (
                        <div className="p-3 bg-slate-50 dark:bg-slate-800/50 rounded-lg">
                          <div className="text-sm font-bold text-slate-900 dark:text-white mb-2">Raw Discovered WiFi Params</div>
                          <div className="max-h-40 overflow-y-auto space-y-0.5 font-mono text-[10px]">
                            {Object.entries(discoveryStatus.wifiParams as Record<string, string>).map(([key, val]) => (
                              <p key={key} className="text-slate-500 break-all">
                                <span className="text-primary">{key}</span> = <span className="text-slate-700 dark:text-slate-300">{String(val)}</span>
                              </p>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })()}
              </section>
            )}

            {activeTab === 'Discovery' && (
              <section>
                <div className="flex items-center justify-between mb-3">
                  <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Parameter Discovery</h4>
                  <button
                    onClick={async () => {
                      try {
                        const { data } = await api.post(`/devices/${selected.id}/discover`);
                        alert(data.message);
                        // Start polling
                        if (discoveryPolling) clearInterval(discoveryPolling);
                        const interval = setInterval(async () => {
                          try {
                            const { data: status } = await api.get(`/devices/${selected.id}/discover/status`);
                            setDiscoveryStatus(status);
                            if (status.status === 'complete') clearInterval(interval);
                          } catch {}
                        }, 3000);
                        setDiscoveryPolling(interval);
                      } catch (err: any) {
                        alert(err.response?.data?.message || 'Failed to start discovery');
                      }
                    }}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-primary text-white hover:opacity-90 transition-opacity"
                  >
                    <RadioTower size={13} /> Scan All Parameters
                  </button>
                </div>

                {discoveryStatus && (
                  <div className="space-y-3 mb-4">
                    <div className="grid grid-cols-4 gap-2">
                      <div className="p-3 bg-slate-50 dark:bg-slate-800/50 rounded-lg text-center">
                        <div className="text-lg font-black text-slate-900 dark:text-white">{discoveryStatus.objects}</div>
                        <div className="text-[10px] font-bold text-slate-400 uppercase">Objects</div>
                      </div>
                      <div className="p-3 bg-slate-50 dark:bg-slate-800/50 rounded-lg text-center">
                        <div className="text-lg font-black text-slate-900 dark:text-white">{discoveryStatus.leaves}</div>
                        <div className="text-[10px] font-bold text-slate-400 uppercase">Parameters</div>
                      </div>
                      <div className="p-3 bg-slate-50 dark:bg-slate-800/50 rounded-lg text-center">
                        <div className="text-lg font-black text-slate-900 dark:text-white">{discoveryStatus.fetched}</div>
                        <div className="text-[10px] font-bold text-slate-400 uppercase">Fetched</div>
                      </div>
                      <div className="p-3 bg-slate-50 dark:bg-slate-800/50 rounded-lg text-center">
                        <div className="text-lg font-black text-slate-900 dark:text-white">{discoveryStatus.progress}%</div>
                        <div className="text-[10px] font-bold text-slate-400 uppercase">Progress</div>
                      </div>
                    </div>

                    <div className="w-full bg-slate-100 dark:bg-slate-800 rounded-full h-2">
                      <div
                        className="bg-primary h-2 rounded-full transition-all duration-500"
                        style={{ width: `${discoveryStatus.progress}%` }}
                      />
                    </div>

                    {discoveryStatus.status === 'scanning' && (
                      <p className="text-xs text-warning font-semibold">Scanning in progress... Waiting for CPE responses.</p>
                    )}
                  </div>
                )}

                {discoveryStatus?.wifiParams && Object.keys(discoveryStatus.wifiParams).length > 0 && (
                  <div className="mt-4">
                    <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Discovered WiFi Parameters</h4>
                    <div className="p-3 bg-slate-50 dark:bg-slate-800/50 rounded-lg font-mono text-xs max-h-80 overflow-y-auto space-y-1">
                      {Object.entries(discoveryStatus.wifiParams as Record<string, string>).map(([key, val]) => (
                        <p key={key} className="text-slate-600 dark:text-slate-400 break-all">
                          <span className="text-green-600 dark:text-green-400">{key}</span>
                          <span className="text-slate-300"> = </span>
                          <span className="text-slate-900 dark:text-white">{String(val)}</span>
                        </p>
                      ))}
                    </div>
                  </div>
                )}

                {discoveryStatus?.parameters && (
                  <div className="mt-4">
                    <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">All Discovered Parameters ({Object.keys(discoveryStatus.parameters).length})</h4>
                    <div className="p-3 bg-slate-50 dark:bg-slate-800/50 rounded-lg font-mono text-xs max-h-80 overflow-y-auto space-y-1">
                      {Object.entries(discoveryStatus.parameters as Record<string, string>).sort().map(([key, val]) => (
                        <p key={key} className="text-slate-600 dark:bg-slate-800/50 break-all">
                          <span className="text-primary">{key}</span>
                          <span className="text-slate-300"> = </span>
                          <span className="text-slate-900 dark:text-white">{String(val)}</span>
                        </p>
                      ))}
                    </div>
                  </div>
                )}

                {!discoveryStatus && (
                  <div className="p-6 text-center">
                    <RadioTower size={32} className="mx-auto text-slate-300 mb-2" />
                    <p className="text-sm text-slate-400">Click "Scan All Parameters" to discover all TR-069 parameters available on this device.</p>
                    <p className="text-xs text-slate-400 mt-1">The scan runs recursively and fetches values for each parameter.</p>
                    <p className="text-xs text-warning mt-2 font-semibold">Nota: Alguns modelos de CPE (ex: ZTE) podem rejeitar GetParameterNames/GetParameterValues com Fault 9005. Os parameters do Inform jah estao disponiveis na aba Overview.</p>
                  </div>
                )}
              </section>
            )}

            {activeTab === 'Clients' && (
              <section>
                <div className="flex items-center justify-between mb-3">
                  <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Connected Clients</h4>
                  <button
                    onClick={async () => {
                      try {
                        const { data } = await api.post(`/devices/${selected.id}/discover`);
                        alert(data.message + ' Switch to Discovery tab to monitor progress.');
                      } catch (err: any) {
                        alert(err.response?.data?.message || 'Failed to start discovery');
                      }
                    }}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold border border-slate-200 hover:bg-slate-50"
                  >
                    <RadioTower size={13} /> Discover All
                  </button>
                </div>
                {connectedDevicesLoading ? (
                  <p className="text-sm text-slate-400 italic">Loading...</p>
                ) : connectedDevices.length === 0 ? (
                  <div className="p-6 text-center">
                    <Monitor size={32} className="mx-auto text-slate-300 mb-2" />
                    <p className="text-sm text-slate-400">No connected clients found.</p>
                    <p className="text-xs text-slate-400 mt-1">Run a discovery scan to detect associated devices.</p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left">
                      <thead>
                        <tr className="border-b border-slate-100 dark:border-slate-800">
                          {['MAC', 'Signal (RSSI)', 'SNR', 'Noise', 'TX Rate', 'RX Rate', 'IP', 'Last Seen'].map(h => (
                            <th key={h} className="px-2 py-2 text-[10px] font-bold text-slate-400 uppercase whitespace-nowrap">{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-50 dark:divide-slate-800/50">
                        {connectedDevices.map((client: any, i: number) => (
                          <tr key={client.mac || i} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                            <td className="px-2 py-2 text-xs font-mono font-bold text-slate-900 dark:text-white">{client.mac || client.MACAddress || '-'}</td>
                            <td className="px-2 py-2">
                              <div className="flex items-center gap-1.5">
                                {client.rssi || client.RSSI ? <Signal size={12} className={Number(client.rssi || client.RSSI) > -60 ? 'text-success' : Number(client.rssi || client.RSSI) > -75 ? 'text-warning' : 'text-danger'} /> : null}
                                <span className="text-xs font-mono text-slate-600 dark:text-slate-400">{client.rssi || client.RSSI || '-'}</span>
                              </div>
                            </td>
                            <td className="px-2 py-2 text-xs font-mono text-slate-500">{client.snr || client.SNR || '-'}</td>
                            <td className="px-2 py-2 text-xs font-mono text-slate-500">{client.noise || client.Noise || '-'}</td>
                            <td className="px-2 py-2 text-xs font-mono text-slate-500">{client.txRate || client.TXRate || client['X_ZTE-COM_TransmitRate'] || '-'}</td>
                            <td className="px-2 py-2 text-xs font-mono text-slate-500">{client.rxRate || client.RXRate || client['X_ZTE-COM_ReceiveRate'] || '-'}</td>
                            <td className="px-2 py-2 text-xs font-mono text-slate-500">{client.ip || client.IPAddress || '-'}</td>
                            <td className="px-2 py-2 text-xs text-slate-400">{client.lastSeen || client.LastSeen || '-'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>
            )}

            {activeTab === 'Logs' && (
              <section>
                <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">Activity Log</h4>
                <div className="space-y-2 max-h-[500px] overflow-y-auto">
                  {selected.events && selected.events.length > 0
                    ? selected.events.slice(0, 20).map((ev: any) => (
                        <div key={ev.id} className="flex items-start gap-3 text-sm">
                          <div className="w-1.5 h-1.5 mt-1.5 bg-primary rounded-full flex-shrink-0" />
                          <div className="min-w-0">
                            <p className="font-semibold text-slate-900 dark:text-white">{ev.code}</p>
                            {ev.message && <p className="text-xs text-slate-500 truncate">{ev.message}</p>}
                            <p className="text-[10px] text-slate-400">{fmt(ev.createdAt)}</p>
                          </div>
                        </div>
                      ))
                    : <p className="text-sm text-slate-400 italic">No logs recorded yet</p>
                  }
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
              <p className="mt-1 text-slate-400">&gt;&gt; http://{window.location.hostname}:7547/cwmp</p>
              <p className="mt-2 text-success animate-pulse">_</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
