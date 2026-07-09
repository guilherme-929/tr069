import { useState, useEffect } from 'react';
import api from '../lib/api';
import { Search, Wifi, WifiOff, RefreshCw, Power, Download, Settings, Terminal, ExternalLink, Eye, EyeOff, Save, Trash2, Radio, RadioTower, Monitor, Signal, SignalHigh, ChevronRight, ChevronDown, Database } from 'lucide-react';

const tabs = ['Visão Geral', 'Parâmetros', 'Rede', 'WiFi', 'Clientes', 'Descoberta', 'Logs'] as const;
type Tab = typeof tabs[number];

export default function Devices() {
  const [devices, setDevices] = useState<any[]>([]);
  const [selected, setSelected] = useState<any>(null);
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [statusFilter, setStatusFilter] = useState('');
  const [activeTab, setActiveTab] = useState<Tab>('Visão Geral');
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
  const [wifiSaving, setWifiSaving] = useState<string | null>(null); // instance index being saved
  const [wifiSaveMsg, setWifiSaveMsg] = useState<string | null>(null);

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
    if (activeTab !== 'WiFi' || !selected) return;
    const params = (selected.parameters as Record<string, string>) || {};
    const hasAnyWifiSsid = Object.keys(params).some(k =>
      (k.startsWith('InternetGatewayDevice.LANDevice.') && k.includes('.WLANConfiguration.') && k.endsWith('.SSID')) ||
      (k.startsWith('Device.WiFi.SSID.') && k.endsWith('.SSID'))
    );
    if (hasAnyWifiSsid) return;

    let cancelled = false;
    (async () => {
      try {
        const { data } = await api.post(`/devices/${selected.id}/wifi/read`);
        if (cancelled) return;
        if (data.source === 'cache' && data.params) {
          setSelected((prev: any) => ({
            ...prev,
            parameters: { ...prev?.parameters, ...data.params },
          }));
        }
      } catch {}
    })();
    return () => { cancelled = true; };
  }, [activeTab, selected?.id, selected?.parameters]);

  useEffect(() => {
    if (activeTab === 'Visão Geral' && selected) {
      setVirtualParamsLoading(true);
      setVirtualParams(null);
      api.get(`/devices/${selected.id}/virtual-params`)
        .then(({ data }) => setVirtualParams(data))
        .catch(() => setVirtualParams(null))
        .finally(() => setVirtualParamsLoading(false));
    }
  }, [activeTab, selected?.id]);

  useEffect(() => {
    if ((activeTab === 'Visão Geral' || activeTab === 'Clientes') && selected) {
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
      setActiveTab('Visão Geral');
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
                  <Power size={13} /> {actionLoading === 'reboot' ? '...' : 'Reiniciar'}
                </button>
                <button
                  onClick={() => doProvision(selected.id)}
                  disabled={actionLoading === 'provision'}
                  className="flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-bold border border-slate-200 hover:bg-slate-50 transition-colors disabled:opacity-40"
                >
                  <Settings size={13} /> {actionLoading === 'provision' ? '...' : 'Provisionar'}
                </button>
                <button
                  onClick={() => doAction('update', selected.id)}
                  disabled={actionLoading === 'update'}
                  className="flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-bold border border-slate-200 hover:bg-slate-50 transition-colors disabled:opacity-40"
                >
                  <Download size={13} /> {actionLoading === 'update' ? '...' : 'Atualizar'}
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
                  <RefreshCw size={13} /> {actionLoading === 'reset' ? '...' : 'Reset'}
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
                      setActionLoading('fetch-all');
                      const { data } = await api.post(`/devices/${selected.id}/fetch-all`, { names: ['Device.', 'InternetGatewayDevice.'], connectionRequest: true });
                      alert(data.message);
                    } catch (err: any) {
                      alert(err.response?.data?.message || 'Failed to fetch parameters');
                    } finally { setActionLoading(null); }
                  }}
                  disabled={actionLoading === 'fetch-all'}
                  className="flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-bold border border-violet-500/30 text-violet-600 hover:bg-violet-50 transition-colors disabled:opacity-40"
                >
                  <Database size={13} /> {actionLoading === 'fetch-all' ? '...' : 'Buscar Tudo'}
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
            {activeTab === 'Visão Geral' && (
              <>
                {/* Tags */}
                {selected.tags?.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {selected.tags.map((tag: string) => (
                      <span key={String(tag)} className="text-[10px] font-bold bg-primary/10 text-primary px-2 py-0.5 rounded-full">{String(tag)}</span>
                    ))}
                  </div>
                )}

                {/* Key Metrics Cards */}
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                  {[
                    { label: 'Last Inform', value: fmt(selected.lastInform) },
                    ...(virtualParams ? Object.entries(virtualParams).map(([key, val]) => ({
                      label: key,
                      value: String(val ?? '-'),
                    })) : []),
                    { label: 'Serial', value: selected.serial },
                    { label: 'Product Class', value: String((selected.parameters as any)?.['InternetGatewayDevice.DeviceInfo.ProductClass'] || (selected.parameters as any)?.['Device.DeviceInfo.ProductClass'] || '-') },
                    { label: 'OUI', value: String(selected.oui || (selected.parameters as any)?.['InternetGatewayDevice.DeviceInfo.ManufacturerOUI'] || (selected.parameters as any)?.['Device.DeviceInfo.ManufacturerOUI'] || '-') },
                    { label: 'Fabricante', value: String(selected.manufacturer || '-') },
                    { label: 'Hardware', value: String(selected.model?.hwVersion || selected.hardwareVersion || '-') },
                    { label: 'Software', value: String(selected.firmwareVersion || '-') },
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
                   // Discover every WiFi instance the CPE actually exposes, by
                   // scanning all namespaces (TR-098 WLANConfiguration.*, TR-181
                   // Device.WiFi.SSID.* and the ZTE WIFI.* variant). Mirrors the
                   // GenieACS behaviour of listing all radios with their state
                   // (active/disabled) instead of only fixed instances 1 and 5.
                   const instances = new Set<number>();
                   const addInst = (prefix: string) => {
                     Object.keys(p).forEach((k) => {
                       const m = k.match(new RegExp('^' + prefix.replace(/[.*]/g, '\\$&') + '\\.(\\d+)\\.SSID$'));
                       if (m) instances.add(parseInt(m[1], 10));
                     });
                   };
                   addInst('InternetGatewayDevice.LANDevice.1.WLANConfiguration');
                   addInst('InternetGatewayDevice.LANDevice.1.WIFI.SSID');
                   addInst('Device.WiFi.SSID');
                   if (instances.size === 0) return null;
                   const sorted = Array.from(instances).sort((a, b) => a - b);
                   const bandFor = (i: number): string => {
                     const std = p[`InternetGatewayDevice.LANDevice.1.WLANConfiguration.${i}.Standard`]
                       || p[`InternetGatewayDevice.LANDevice.1.WIFI.SSID.${i}.Standard`] || '';
                     const freq = p[`InternetGatewayDevice.LANDevice.1.WLANConfiguration.${i}.X_ZTE-COM_OperatingFrequencyBand`]
                       || p[`InternetGatewayDevice.LANDevice.1.WIFI.SSID.${i}.X_ZTE-COM_OperatingFrequencyBand`] || '';
                     if (/5|ac|ax/.test(std) || /5\.?GHz/i.test(freq)) return '5GHz';
                     if (/2\.?4/.test(freq) || /b,g|n/.test(std)) return '2.4GHz';
                     return i === 1 ? '2.4GHz' : `${i}`;
                   };
                   const get = (i: number, ...keys: string[]) => {
                     for (const k of keys) if (p[k] !== undefined && p[k] !== '') return p[k];
                     return '-';
                   };
                    return (
                      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                        {sorted.map((i) => {
                          const enable = String(
                            p[`InternetGatewayDevice.LANDevice.1.WLANConfiguration.${i}.Enable`]
                            ?? p[`InternetGatewayDevice.LANDevice.1.WIFI.SSID.${i}.Enable`]
                            ?? p[`Device.WiFi.SSID.${i}.Enable`]
                            ?? ''
                          );
                          const active = enable === '1' || enable.toLowerCase() === 'true';
                          // Overview only shows active WiFi interfaces.
                          if (!active) return null;
                          const ssid = get(i,
                           `InternetGatewayDevice.LANDevice.1.WLANConfiguration.${i}.SSID`,
                           `InternetGatewayDevice.LANDevice.1.WIFI.SSID.${i}.SSID`,
                           `InternetGatewayDevice.LANDevice.1.WIFI.AccessPoint.${i}.SSID`,
                           `Device.WiFi.SSID.${i}.SSID`);
                         const pass = get(i,
                           `InternetGatewayDevice.LANDevice.1.WLANConfiguration.${i}.KeyPassphrase`,
                           `InternetGatewayDevice.LANDevice.1.WIFI.AccessPoint.${i}.Security.KeyPassphrase`,
                           `Device.WiFi.AccessPoint.${i}.Security.KeyPassphrase`);
                         const ch = get(i,
                           `InternetGatewayDevice.LANDevice.1.WLANConfiguration.${i}.Channel`,
                           `InternetGatewayDevice.LANDevice.1.WIFI.SSID.${i}.Channel`);
                         const sta = get(i,
                           `InternetGatewayDevice.LANDevice.1.WLANConfiguration.${i}.Status`,
                           `InternetGatewayDevice.LANDevice.1.WIFI.SSID.${i}.Status`);
                         const assoc = get(i,
                           `InternetGatewayDevice.LANDevice.1.WLANConfiguration.${i}.TotalAssociations`);
                         return (
                           <section key={i}>
                             <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">
                               <Wifi size={13} className="inline mr-1.5 -mt-0.5" />
                               Interface WiFi {bandFor(i)} (instância {i})
                               <span className={`ml-2 px-1.5 py-0.5 rounded text-[9px] font-bold ${active ? 'bg-success/15 text-success' : 'bg-slate-200 text-slate-500'}`}>
                                 {active ? 'ATIVO' : 'DESATIVADO'}
                               </span>
                             </h4>
                             <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-4 space-y-2">
                               <div className="flex justify-between text-xs"><span className="text-slate-500">SSID</span><span className="font-mono font-semibold text-slate-900 dark:text-white">{ssid}</span></div>
                               <div className="flex justify-between text-xs"><span className="text-slate-500">Passphrase</span><span className="font-mono font-semibold text-slate-900 dark:text-white">{pass}</span></div>
                               <div className="flex justify-between text-xs"><span className="text-slate-500">Canal</span><span className="font-mono font-semibold text-slate-900 dark:text-white">{ch}</span></div>
                               <div className="flex justify-between text-xs"><span className="text-slate-500">Status</span><span className="font-mono font-semibold text-slate-900 dark:text-white">{sta}</span></div>
                               <div className="flex justify-between text-xs"><span className="text-slate-500">Clientes Conectados</span><span className="font-mono font-semibold text-slate-900 dark:text-white">{assoc}</span></div>
                             </div>
                           </section>
                         );
                       })}
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
                          <th className="text-left px-3 py-2 font-bold text-slate-500 text-[10px] uppercase">Nome</th>
                          <th className="text-left px-3 py-2 font-bold text-slate-500 text-[10px] uppercase">IP</th>
                          <th className="text-left px-3 py-2 font-bold text-slate-500 text-[10px] uppercase">MAC</th>
                          <th className="text-left px-3 py-2 font-bold text-slate-500 text-[10px] uppercase">Interface</th>
                          <th className="text-left px-3 py-2 font-bold text-slate-500 text-[10px] uppercase">Ativo</th>
                        </tr>
                      </thead>
                      <tbody>
                        {connectedDevices.length > 0 ? connectedDevices.map((cd: any, i: number) => (
                          <tr key={i} className="border-b border-slate-100 dark:border-slate-800/50 last:border-0">
                            <td className="px-3 py-2 font-semibold text-slate-900 dark:text-white">{String(cd.hostname || cd.name || '-')}</td>
                            <td className="px-3 py-2 font-mono text-slate-600 dark:text-slate-400">{String(cd.ip || '-')}</td>
                            <td className="px-3 py-2 font-mono text-slate-600 dark:text-slate-400">{String(cd.mac || '-')}</td>
                            <td className="px-3 py-2">{String(cd.interface || (cd.isWireless !== undefined ? (cd.isWireless ? 'WiFi' : 'LAN') : '-'))}</td>
                            <td className="px-3 py-2">
                              <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${cd.active !== false ? 'bg-success/10 text-success' : 'bg-slate-100 text-slate-400'}`}>
                                {cd.active !== false ? 'Ativo' : 'Inativo'}
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
                                <td className="px-3 py-1.5 text-slate-600 dark:text-slate-400 font-semibold">{String(r.channel)}</td>
                                <td className="px-3 py-1.5">
                                  <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                                    r.code === 'COMPLETED' || r.code === '1' ? 'bg-success/10 text-success' :
                                    r.code === 'FAILED' || r.code === '0' ? 'bg-danger/10 text-danger' :
                                    r.code === 'IN_PROGRESS' || r.code === 'M' ? 'bg-warning/10 text-warning' : 'bg-slate-100 dark:bg-slate-700 text-slate-500'
                                  }`}>{r.code}</span>
                                </td>
                                <td className="px-3 py-1.5 text-slate-900 dark:text-white truncate max-w-[160px]">{String(r.message)}</td>
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

            {activeTab === 'Parâmetros' && (
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

            {activeTab === 'Rede' && (
              <section>
                <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">Configuração de Rede</h4>
                <div className="space-y-3">
                  {(() => {
                    const p = selected.parameters as Record<string, string> || {};
                    const g = (path: string) => {
                      const v = p[path];
                      if (!v) return '-';
                      if (typeof v === 'object') return '';
                      return String(v);
                    };

                    const wanLink = g('InternetGatewayDevice.WANDevice.1.WANCommonInterfaceConfig.PhysicalLinkStatus');
                    const wanType = g('InternetGatewayDevice.WANDevice.1.WANCommonInterfaceConfig.WANAccessType');
                    const wanExtIp = g('InternetGatewayDevice.WANDevice.1.WANConnectionDevice.1.WANPPPConnection.1.ExternalIPAddress');
                    const wanEnabled = g('InternetGatewayDevice.WANDevice.1.WANCommonInterfaceConfig.EnabledForInternet');

                    const rxPower = g('InternetGatewayDevice.WANDevice.2.X_ZTE-COM_WANPONInterfaceConfig.RXPower');
                    const txPower = g('InternetGatewayDevice.WANDevice.2.X_ZTE-COM_WANPONInterfaceConfig.TXPower');
                    const temp = g('InternetGatewayDevice.WANDevice.2.X_ZTE-COM_WANPONInterfaceConfig.TransceiverTemperature');
                    const volt = g('InternetGatewayDevice.WANDevice.2.X_ZTE-COM_WANPONInterfaceConfig.SupplyVoltage');
                    const bias = g('InternetGatewayDevice.WANDevice.2.X_ZTE-COM_WANPONInterfaceConfig.BiasCurrent');

                    const lanGw = g('InternetGatewayDevice.LANDevice.1.LANHostConfigManagement.IPRouters');
                    const lanSubnet = g('InternetGatewayDevice.LANDevice.1.LANHostConfigManagement.SubnetMask');
                    const lanDhcp = g('InternetGatewayDevice.LANDevice.1.LANHostConfigManagement.DHCPServerEnable');
                    const lanDns = g('InternetGatewayDevice.LANDevice.1.LANHostConfigManagement.DNSServers');
                    const lanMac = g('InternetGatewayDevice.LANDevice.1.LANHostConfigManagement.MACAddress');
                    const dhcpMin = g('InternetGatewayDevice.LANDevice.1.LANHostConfigManagement.MinAddress');
                    const dhcpMax = g('InternetGatewayDevice.LANDevice.1.LANHostConfigManagement.MaxAddress');
                    const dhcpLease = g('InternetGatewayDevice.LANDevice.1.LANHostConfigManagement.DHCPLeaseTime');

                    const acsUrl = g('InternetGatewayDevice.ManagementServer.URL');
                    const crUrl = g('InternetGatewayDevice.ManagementServer.ConnectionRequestURL');
                    const informInt = g('InternetGatewayDevice.ManagementServer.PeriodicInformInterval');
                    const informEn = g('InternetGatewayDevice.ManagementServer.PeriodicInformEnable');
                    const acsUser = g('InternetGatewayDevice.ManagementServer.Username');

                    const txBytes = g('InternetGatewayDevice.WANDevice.1.WANCommonInterfaceConfig.TotalBytesSent');
                    const rxBytes = g('InternetGatewayDevice.WANDevice.1.WANCommonInterfaceConfig.TotalBytesReceived');
                    const txPkts = g('InternetGatewayDevice.WANDevice.1.WANCommonInterfaceConfig.TotalPacketsSent');
                    const rxPkts = g('InternetGatewayDevice.WANDevice.1.WANCommonInterfaceConfig.TotalPacketsReceived');

                    const fmtBytes = (b: string) => {
                      const n = parseInt(b);
                      if (!n) return b;
                      if (n > 1073741824) return (n / 1073741824).toFixed(1) + ' GB';
                      if (n > 1048576) return (n / 1048576).toFixed(1) + ' MB';
                      if (n > 1024) return (n / 1024).toFixed(1) + ' KB';
                      return n + ' B';
                    };

                    return (
                      <>
                        <div className="grid grid-cols-2 gap-3">
                          <div className="p-3 bg-slate-50 dark:bg-slate-800/50 rounded-lg">
                            <div className="text-sm font-bold text-slate-900 dark:text-white mb-2">WAN</div>
                            <div className="space-y-1 text-xs">
                              <p><span className="text-slate-400">Tipo:</span> <strong className="text-slate-700 dark:text-slate-300">{wanType}</strong></p>
                              <p><span className="text-slate-400">Link:</span> <span className={`font-bold ${wanLink === 'Up' ? 'text-success' : 'text-danger'}`}>{wanLink}</span></p>
                              <p><span className="text-slate-400">IP Externo:</span> <strong className="font-mono text-slate-700 dark:text-slate-300">{wanExtIp}</strong></p>
                              <p><span className="text-slate-400">Internet:</span> {wanEnabled === '1' ? '✓' : '✗'}</p>
                            </div>
                          </div>
                          <div className="p-3 bg-slate-50 dark:bg-slate-800/50 rounded-lg">
                            <div className="text-sm font-bold text-slate-900 dark:text-white mb-2">GPON Óptico</div>
                            <div className="space-y-1 text-xs">
                              <p><span className="text-slate-400">RX:</span> <strong className="font-mono text-slate-700 dark:text-slate-300">{rxPower}</strong> <span className="text-slate-400">dBm</span></p>
                              <p><span className="text-slate-400">TX:</span> <strong className="font-mono text-slate-700 dark:text-slate-300">{txPower}</strong> <span className="text-slate-400">dBm</span></p>
                              <p><span className="text-slate-400">Temp:</span> <strong className="font-mono text-slate-700 dark:text-slate-300">{temp}</strong> <span className="text-slate-400">°C</span></p>
                              <p><span className="text-slate-400">Tensão:</span> <strong className="font-mono text-slate-700 dark:text-slate-300">{volt}</strong> <span className="text-slate-400">mV</span></p>
                              <p><span className="text-slate-400">Corrente:</span> <strong className="font-mono text-slate-700 dark:text-slate-300">{bias}</strong> <span className="text-slate-400">mA</span></p>
                            </div>
                          </div>
                        </div>

                        <div className="grid grid-cols-2 gap-3">
                          <div className="p-3 bg-slate-50 dark:bg-slate-800/50 rounded-lg">
                            <div className="text-sm font-bold text-slate-900 dark:text-white mb-2">LAN</div>
                            <div className="space-y-1 text-xs">
                              <p><span className="text-slate-400">Gateway:</span> <strong className="font-mono text-slate-700 dark:text-slate-300">{lanGw}</strong></p>
                              <p><span className="text-slate-400">Subnet:</span> <strong className="font-mono text-slate-700 dark:text-slate-300">{lanSubnet}</strong></p>
                              <p><span className="text-slate-400">MAC:</span> <strong className="font-mono text-slate-700 dark:text-slate-300">{lanMac}</strong></p>
                              <p><span className="text-slate-400">DNS:</span> <strong className="font-mono text-slate-700 dark:text-slate-300">{lanDns}</strong></p>
                              <p><span className="text-slate-400">DHCP:</span> {lanDhcp === '1' ? <span className="text-success font-bold">Ativo</span> : <span className="text-slate-400">Inativo</span>} ({dhcpMin} - {dhcpMax}, {dhcpLease}s)</p>
                            </div>
                          </div>
                          <div className="p-3 bg-slate-50 dark:bg-slate-800/50 rounded-lg">
                            <div className="text-sm font-bold text-slate-900 dark:text-white mb-2">TR-069</div>
                            <div className="space-y-1 text-xs">
                              <p><span className="text-slate-400">ACS URL:</span> <strong className="font-mono text-slate-700 dark:text-slate-300 text-[10px] break-all">{acsUrl}</strong></p>
                              <p><span className="text-slate-400">CR URL:</span> <strong className="font-mono text-slate-700 dark:text-slate-300 text-[10px] break-all">{crUrl}</strong></p>
                              <p><span className="text-slate-400">Inform:</span> <strong className="text-slate-700 dark:text-slate-300">{informInt}s</strong> (ativado: {informEn === 'true' || informEn === '1' ? '✓' : '✗'})</p>
                              <p><span className="text-slate-400">Usuário:</span> <strong className="font-mono text-slate-700 dark:text-slate-300">{acsUser}</strong></p>
                            </div>
                          </div>
                        </div>

                        <div className="p-3 bg-slate-50 dark:bg-slate-800/50 rounded-lg">
                          <div className="text-sm font-bold text-slate-900 dark:text-white mb-2">Tráfego WAN</div>
                          <div className="grid grid-cols-2 gap-3 text-xs">
                            <div>
                              <p className="text-slate-400">Enviado</p>
                              <p className="font-mono font-bold text-slate-700 dark:text-slate-300">{fmtBytes(txBytes)}</p>
                              <p className="text-[10px] text-slate-400">{txPkts} pacotes</p>
                            </div>
                            <div>
                              <p className="text-slate-400">Recebido</p>
                              <p className="font-mono font-bold text-slate-700 dark:text-slate-300">{fmtBytes(rxBytes)}</p>
                              <p className="text-[10px] text-slate-400">{rxPkts} pacotes</p>
                            </div>
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
                      </>
                    );
                  })()}
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
                    // Device.WiFi can expose SSID.{i}, AccessPoint.{i}, Radio.{i}, EndPoint.{i}
                    const devMatch = key.match(/^Device\.WiFi\.(SSID|AccessPoint|Radio|EndPoint)\.(\d+)\.(.+)/);
                    // ZTE (TR-098 variant) exposes WIFI.SSID.{i}, WIFI.AccessPoint.{i}, WIFI.Radio.{i}
                    const zteMatch = key.match(/^InternetGatewayDevice\.LANDevice\.\d+\.WIFI\.(SSID|AccessPoint|Radio)\.(\d+)\.(.+)/);
                    const idx = igdMatch?.[1] || devMatch?.[2] || zteMatch?.[2];
                    let subKey: string = key;
                    if (igdMatch?.[2]) subKey = igdMatch[2];
                    else if (devMatch?.[3]) subKey = devMatch[3];
                    else if (zteMatch) subKey = `${zteMatch[1]}.${zteMatch[3]}`;
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
                         const ssid = params['SSID'] || params['SSID.SSID'] || '';
                         const pwdKey = Object.keys(params).find(k => k.toLowerCase().includes('keypassphrase') || k.toLowerCase().includes('presharedkey'));
                         const password = pwdKey ? params[pwdKey] : '';
                         const enabled = params['Enable'] === '1' || params['Enable'] === 'true' || params['SSID.Enable'] === '1' || params['AccessPoint.Enable'] === '1';
                         const channel = params['Channel'] || '-';
                         const standard = params['Standard'] || params['X_ZTE-COM_Standard'] || '-';
                         const bandwidth = params['X_ZTE-COM_BandWidth'] || params['OperatingStandards'] || '-';
                         const associations = params['TotalAssociations'] || params['X_ZTE-COM_TotalAssociations'] || '-';
                         const freqBand = params['OperatingFrequencyBand'] || params['X_ZTE-COM_OperatingFrequencyBand'] || params['SSID.X_ZTE-COM_OperatingFrequencyBand'] || bandLabels[idx] || `Band ${idx}`;
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

                            <div className="mt-2 flex gap-1.5 items-center">
                              <button
                                onClick={async () => {
                                  const sid = (document.getElementById(`wifi-ssid-${idx}`) as HTMLInputElement).value;
                                  const pw = (document.getElementById(`wifi-password-${idx}`) as HTMLInputElement).value;
                                  if (!sid || !pw) { alert('Fill in both SSID and password'); return; }
                                  setWifiSaving(idx);
                                  setWifiSaveMsg(null);
                                  try {
                                    const { data } = await api.post(`/devices/${selected.id}/wifi`, { ssid: sid, password: pw, instance: Number(idx) });
                                    setWifiSaveMsg('Salvo! Aguardando CPE aplicar...');
                                    // Poll task status
                                    const taskId = data.task?.id;
                                    if (taskId) {
                                      let attempts = 0;
                                      const poll = setInterval(async () => {
                                        try {
                                          const { data: t } = await api.get(`/tasks/${taskId}`);
                                          if (t.status === 'COMPLETED') {
                                            setWifiSaveMsg('Aplicado com sucesso!');
                                            clearInterval(poll);
                                            setWifiSaving(null);
                                            selectDevice(selected.id);
                                          } else if (t.status === 'FAILED') {
                                            setWifiSaveMsg('Falhou: ' + (t.error || 'erro desconhecido'));
                                            clearInterval(poll);
                                            setWifiSaving(null);
                                          } else {
                                            setWifiSaveMsg(`Fila: ${t.status} (tentativa ${t.attempts || 0}/${t.maxAttempts || 3})`);
                                          }
                                        } catch { clearInterval(poll); setWifiSaving(null); }
                                        if (++attempts > 30) { clearInterval(poll); setWifiSaving(null); setWifiSaveMsg('Timeout'); }
                                      }, 3000);
                                    } else {
                                      setTimeout(() => { setWifiSaving(null); selectDevice(selected.id); }, 2000);
                                    }
                                  } catch (err: any) {
                                    setWifiSaveMsg('Erro: ' + (err.response?.data?.message || err.message));
                                    setTimeout(() => setWifiSaving(null), 3000);
                                  }
                                }}
                                disabled={wifiSaving === idx}
                                className="flex items-center gap-1 px-2.5 py-1 rounded text-[10px] font-bold bg-primary text-white hover:opacity-90 disabled:opacity-40"
                              >
                                <Save size={10} /> {wifiSaving === idx ? 'Salvando...' : 'Salvar'}
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
                              {wifiSaving === idx && wifiSaveMsg && (
                                <span className="text-[10px] text-warning font-semibold ml-2">{wifiSaveMsg}</span>
                              )}
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

            {activeTab === 'Descoberta' && (
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

            {activeTab === 'Clientes' && (
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
                          {['Hostname', 'MAC', 'Signal (RSSI)', 'SNR', 'TX Rate', 'RX Rate', 'IP', 'Last Seen'].map(h => (
                            <th key={h} className="px-2 py-2 text-[10px] font-bold text-slate-400 uppercase whitespace-nowrap">{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-50 dark:divide-slate-800/50">
                        {connectedDevices.map((client: any, i: number) => (
                          <tr key={client.mac || i} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                            <td className="px-2 py-2 text-xs font-semibold text-slate-900 dark:text-white truncate max-w-[120px]">{client.name || client.hostname || '-'}</td>
                            <td className="px-2 py-2 text-xs font-mono font-bold text-slate-900 dark:text-white">{client.mac || client.MACAddress || '-'}</td>
                            <td className="px-2 py-2">
                              <div className="flex items-center gap-1.5">
                                {client.rssi || client.RSSI ? <Signal size={12} className={Number(client.rssi || client.RSSI) > -60 ? 'text-success' : Number(client.rssi || client.RSSI) > -75 ? 'text-warning' : 'text-danger'} /> : null}
                                <span className="text-xs font-mono text-slate-600 dark:text-slate-400">{client.rssi || client.RSSI || '-'}</span>
                              </div>
                            </td>
                            <td className="px-2 py-2 text-xs font-mono text-slate-500">{client.snr || client.SNR || '-'}</td>
                            <td className="px-2 py-2 text-xs font-mono text-slate-500">{client.txRate || client.TXRate || '-'}</td>
                            <td className="px-2 py-2 text-xs font-mono text-slate-500">{client.rxRate || client.RXRate || '-'}</td>
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
                            {ev.message && <p className="text-xs text-slate-500 truncate">{String(ev.message)}</p>}
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
