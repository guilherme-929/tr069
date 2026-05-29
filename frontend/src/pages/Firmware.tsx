import { useState, useEffect } from 'react';
import api from '../lib/api';
import { Upload, FolderArchive, HardDrive } from 'lucide-react';

export default function Firmware() {
  const [firmwares, setFirmwares] = useState<any[]>([]);
  const [tab, setTab] = useState<'firmware' | 'models'>('firmware');

  useEffect(() => {
    api.get('/firmware').then(({ data }) => setFirmwares(data.data)).catch(() => {});
  }, []);

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-black text-slate-900 dark:text-white">Firmware</h1>
          <p className="text-sm text-slate-500 mt-1">Manage firmware versions and distribution</p>
        </div>
        <button className="flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-xl text-sm font-bold hover:opacity-90 transition-opacity shadow-md">
          <Upload size={18} /> Upload Firmware
        </button>
      </div>

      <div className="flex gap-4 border-b border-slate-200 dark:border-slate-800">
        {[
          { id: 'firmware', label: 'Firmware', icon: HardDrive },
          { id: 'models', label: 'Models', icon: FolderArchive },
        ].map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id as any)}
            className={`px-4 py-3 border-b-2 text-sm font-bold flex items-center gap-2 transition-all ${
              tab === t.id ? 'border-primary text-primary' : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            <t.icon size={18} /> {t.label}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {firmwares.map((fw: any) => (
          <div key={fw.id} className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 hover:border-primary transition-colors cursor-pointer group">
            <div className="flex justify-between items-start mb-4">
              <div className="p-2 bg-slate-100 dark:bg-slate-800 rounded-lg group-hover:bg-primary group-hover:text-white transition-colors">
                <FolderArchive size={20} />
              </div>
              <span className={`px-2 py-1 text-[10px] font-black rounded ${
                fw.status === 'LATEST' ? 'bg-success/10 text-success' :
                fw.status === 'STABLE' ? 'bg-primary/10 text-primary' : 'bg-warning/10 text-warning'
              }`}>{fw.status}</span>
            </div>
            <h5 className="font-bold text-slate-900 dark:text-white">{fw.version}</h5>
            <p className="text-xs text-slate-500 mb-4 line-clamp-2">{fw.changelog || 'No description'}</p>
            <div className="flex items-center justify-between pt-4 border-t border-slate-100 dark:border-slate-800">
              <span className="text-[10px] text-slate-400 font-medium">{new Date(fw.createdAt).toLocaleDateString()}</span>
              <span className="text-[10px] text-slate-400 font-mono">{fw.fileName || ''}</span>
            </div>
          </div>
        ))}

        <div className="border-2 border-dashed border-slate-200 dark:border-slate-700 rounded-xl p-5 flex flex-col items-center justify-center gap-2 text-slate-400 hover:text-primary hover:border-primary transition-all cursor-pointer">
          <Upload size={48} />
          <span className="text-xs font-bold uppercase tracking-wider">Upload New Image</span>
        </div>
      </div>
    </div>
  );
}
