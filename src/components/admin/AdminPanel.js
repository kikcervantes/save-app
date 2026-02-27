import React, { useState, useEffect } from 'react';
import {
  Shield, CheckCircle, XCircle, Clock, LogOut,
  Store, FileText, Phone, MapPin, Mail, ChevronDown,
  ChevronUp, AlertCircle, Search, Eye, Download, Image, X
} from 'lucide-react';
import { readLocalStorage, writeLocalStorage } from '../../hooks/useLocalStorage';

/* ─── Helpers ─── */
const timeAgo = (iso) => {
  const diff = Date.now() - new Date(iso).getTime();
  const h = Math.floor(diff / 3600000);
  const d = Math.floor(h / 24);
  if (d > 0) return `hace ${d} día${d > 1 ? 's' : ''}`;
  if (h > 0) return `hace ${h} hora${h > 1 ? 's' : ''}`;
  return 'hace un momento';
};

const StatusChip = ({ status }) => {
  const map = {
    pending:  { label: 'Pendiente', bg: 'bg-amber-100 text-amber-700' },
    approved: { label: 'Aprobado',  bg: 'bg-green-100 text-green-700' },
    rejected: { label: 'Rechazado', bg: 'bg-red-100 text-red-600'     },
  };
  const s = map[status] || map.pending;
  return <span className={`px-2.5 py-1 rounded-full text-xs font-bold ${s.bg}`}>{s.label}</span>;
};

const EMOJI = { Panadería:'🥐', Restaurante:'🍽️', Cafetería:'☕', Supermercado:'🛒' };

const DOC_LABELS = {
  rfc:       'RFC / Constancia fiscal',
  acta:      'Acta / Identificación oficial',
  domicilio: 'Comprobante de domicilio',
  local:     'Foto del local',
  permiso:   'Permiso de funcionamiento',
};

/* ─── Document viewer modal ─── */
const DocViewer = ({ doc, label, onClose }) => {
  if (!doc?.data) return null;
  const isImage = doc.type?.startsWith('image/') || doc.data.startsWith('data:image');
  const isPDF   = doc.type === 'application/pdf' || doc.data.startsWith('data:application/pdf');

  const handleDownload = () => {
    const a = document.createElement('a');
    a.href     = doc.data;
    a.download = doc.name || 'documento';
    a.click();
  };

  return (
    <div className="fixed inset-0 bg-black/80 z-[100] flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl overflow-hidden max-w-2xl w-full max-h-[90vh] flex flex-col"
        onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <div>
            <p className="font-bold text-gray-900 text-sm">{label}</p>
            <p className="text-xs text-gray-500">{doc.name}</p>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={handleDownload}
              className="flex items-center gap-1.5 px-3 py-2 bg-blue-600 text-white rounded-xl text-xs font-bold hover:bg-blue-700">
              <Download size={13} /> Descargar
            </button>
            <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-full">
              <X size={18} />
            </button>
          </div>
        </div>
        {/* Content */}
        <div className="flex-1 overflow-auto bg-gray-50 flex items-center justify-center p-4 min-h-[300px]">
          {isImage ? (
            <img src={doc.data} alt={label} className="max-w-full max-h-[60vh] object-contain rounded-xl shadow-lg" />
          ) : isPDF ? (
            <iframe src={doc.data} title={label} className="w-full h-[60vh] rounded-xl" />
          ) : (
            <div className="text-center">
              <FileText size={48} className="text-gray-300 mx-auto mb-3" />
              <p className="text-gray-500 text-sm mb-3">Vista previa no disponible</p>
              <button onClick={handleDownload}
                className="flex items-center gap-2 mx-auto px-4 py-2 bg-blue-600 text-white rounded-xl text-sm font-bold hover:bg-blue-700">
                <Download size={15} /> Descargar para ver
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

/* ─── Document row with preview button ─── */
const DocRow = ({ docKey, doc, label }) => {
  const [viewing, setViewing] = useState(false);
  const hasData = !!doc?.data;
  const isImage = doc?.type?.startsWith('image/') || doc?.data?.startsWith('data:image');

  return (
    <>
      <div className={`flex items-center gap-3 px-3 py-2.5 rounded-xl border ${doc ? 'border-green-200 bg-green-50' : 'border-gray-100 bg-gray-50'}`}>
        {doc
          ? <CheckCircle size={15} className="text-green-500 shrink-0" />
          : <AlertCircle size={15} className="text-gray-300 shrink-0" />
        }
        <div className="flex-1 min-w-0">
          <p className="text-xs font-semibold text-gray-700">{label}</p>
          {doc && <p className="text-xs text-gray-400 truncate">{doc.name}</p>}
          {doc && !hasData && (
            <p className="text-xs text-amber-600">⚠️ Archivo no disponible en esta sesión</p>
          )}
        </div>
        {doc && (
          <div className="flex items-center gap-1.5 shrink-0">
            {isImage && hasData && (
              /* Thumbnail preview */
              <div className="w-8 h-8 rounded-lg overflow-hidden border border-green-200 shrink-0 cursor-pointer"
                onClick={() => setViewing(true)}>
                <img src={doc.data} alt={label} className="w-full h-full object-cover" />
              </div>
            )}
            {hasData ? (
              <button onClick={() => setViewing(true)}
                className="flex items-center gap-1 text-xs bg-white border border-green-300 text-green-700 px-2 py-1 rounded-lg font-bold hover:bg-green-50 transition-colors">
                <Eye size={12} /> Ver
              </button>
            ) : (
              <span className="text-xs bg-white border border-gray-200 text-gray-400 px-2 py-1 rounded-lg">
                Sin datos
              </span>
            )}
          </div>
        )}
      </div>
      {viewing && <DocViewer doc={doc} label={label} onClose={() => setViewing(false)} />}
    </>
  );
};

/* ─── Application card ─── */
const AppCard = ({ app, onApprove, onReject }) => {
  const [expanded,      setExpanded]      = useState(false);
  const [rejectReason,  setRejectReason]  = useState('');
  const [showRejectBox, setShowRejectBox] = useState(false);

  const docsWithData = app.docs || {};

  return (
    <div className={`bg-white rounded-2xl border-2 shadow-sm transition-all ${
      app.status === 'pending'  ? 'border-amber-200' :
      app.status === 'approved' ? 'border-green-200' : 'border-red-200'
    }`}>
      {/* Summary row */}
      <div className="p-4 flex items-center gap-3 cursor-pointer select-none" onClick={() => setExpanded(e => !e)}>
        <div className={`w-12 h-12 rounded-xl flex items-center justify-center text-2xl shrink-0 ${
          app.status === 'pending'  ? 'bg-amber-50' :
          app.status === 'approved' ? 'bg-green-50' : 'bg-red-50'
        }`}>
          {EMOJI[app.businessType] || '🏪'}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="font-bold text-gray-900 text-sm">{app.businessName}</h3>
            <StatusChip status={app.status} />
          </div>
          <p className="text-xs text-gray-500">{app.ownerName} · {timeAgo(app.submittedAt)}</p>
        </div>
        {expanded
          ? <ChevronUp size={18} className="text-gray-400 shrink-0" />
          : <ChevronDown size={18} className="text-gray-400 shrink-0" />
        }
      </div>

      {expanded && (
        <div className="border-t border-gray-100 p-4 space-y-4">

          {/* Contact info grid */}
          <div className="grid grid-cols-2 gap-2">
            {[
              { icon: Mail,     label: 'Email',     value: app.email },
              { icon: Phone,    label: 'Teléfono',  value: app.phone },
              { icon: FileText, label: 'RFC',        value: app.taxId },
              { icon: MapPin,   label: 'Dirección',  value: app.address },
              { icon: Store,    label: 'Tipo',       value: app.businessType },
              { icon: Store,    label: 'Web/Redes',  value: app.website || '—' },
            ].map(({ icon: Icon, label, value }) => (
              <div key={label} className="bg-gray-50 rounded-xl p-3">
                <div className="flex items-center gap-1 mb-0.5">
                  <Icon size={11} className="text-gray-400" />
                  <p className="text-xs text-gray-400">{label}</p>
                </div>
                <p className="text-sm font-semibold text-gray-800 break-all">{value}</p>
              </div>
            ))}
          </div>

          {/* RFC quick-check link */}
          {app.taxId && app.taxId !== '—' && (
            <a href={`https://siat.sat.gob.mx/app/qr/faces/pages/mobile/validadorqr.jsf`}
              target="_blank" rel="noopener noreferrer"
              className="flex items-center gap-2 px-4 py-2.5 bg-blue-50 border border-blue-200 rounded-xl text-sm font-semibold text-blue-700 hover:bg-blue-100 transition-colors">
              <Shield size={15} /> Verificar RFC en SAT →
            </a>
          )}

          {/* Documents with real preview */}
          <div>
            <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-2">
              Documentos enviados
            </p>
            <div className="space-y-2">
              {Object.entries(DOC_LABELS).map(([key, label]) => (
                <DocRow key={key} docKey={key} doc={docsWithData[key]} label={label} />
              ))}
            </div>
          </div>

          {/* Verification checklist */}
          <div className="bg-blue-50 rounded-xl p-3">
            <p className="text-xs font-bold text-blue-700 mb-2">✅ Lista de verificación manual</p>
            <div className="space-y-1.5">
              {[
                'RFC verificado en sat.gob.mx',
                'Negocio encontrado en Google Maps o redes sociales',
                'La dirección coincide con la ubicación en la app',
                'Documentos legibles y vigentes',
                'Sin reportes previos de fraude o queja',
              ].map(item => (
                <label key={item} className="flex items-start gap-2 cursor-pointer">
                  <input type="checkbox" className="mt-0.5 accent-blue-600 shrink-0" />
                  <span className="text-xs text-blue-800">{item}</span>
                </label>
              ))}
            </div>
          </div>

          {/* Action buttons */}
          {app.status === 'pending' && (
            <div className="space-y-2">
              {showRejectBox ? (
                <>
                  <textarea
                    value={rejectReason}
                    onChange={e => setRejectReason(e.target.value)}
                    placeholder="Explica el motivo del rechazo al negocio (ej: 'El RFC no coincide con el nombre. Envía la constancia fiscal actualizada.')"
                    rows={3}
                    className="w-full px-3 py-2.5 border-2 border-red-200 rounded-xl text-sm focus:border-red-400 focus:outline-none resize-none"
                  />
                  <div className="flex gap-2">
                    <button onClick={() => setShowRejectBox(false)}
                      className="flex-1 py-2.5 border-2 border-gray-200 rounded-xl text-sm font-bold text-gray-600 hover:bg-gray-50">
                      Cancelar
                    </button>
                    <button onClick={() => onReject(app.id, rejectReason)} disabled={!rejectReason.trim()}
                      className="flex-1 py-2.5 bg-red-500 text-white rounded-xl text-sm font-bold hover:bg-red-600 disabled:opacity-40 flex items-center justify-center gap-1.5">
                      <XCircle size={14} /> Confirmar rechazo
                    </button>
                  </div>
                </>
              ) : (
                <div className="flex gap-3">
                  <button onClick={() => setShowRejectBox(true)}
                    className="flex-1 py-3 border-2 border-red-200 text-red-500 rounded-xl font-bold text-sm hover:bg-red-50 flex items-center justify-center gap-2">
                    <XCircle size={16} /> Rechazar
                  </button>
                  <button onClick={() => onApprove(app.id)}
                    className="flex-1 py-3 bg-green-600 text-white rounded-xl font-bold text-sm hover:bg-green-700 shadow-lg shadow-green-600/25 flex items-center justify-center gap-2">
                    <CheckCircle size={16} /> Aprobar ✓
                  </button>
                </div>
              )}
            </div>
          )}

          {app.status === 'approved' && (
            <div className="flex items-center gap-2 bg-green-50 border border-green-200 rounded-xl px-4 py-3">
              <CheckCircle size={18} className="text-green-500" />
              <p className="text-sm font-semibold text-green-700">
                Aprobado {app.approvedAt ? timeAgo(app.approvedAt) : ''}
              </p>
            </div>
          )}
          {app.status === 'rejected' && (
            <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3">
              <p className="text-sm font-semibold text-red-700 flex items-center gap-2 mb-1">
                <XCircle size={15} /> Rechazado
              </p>
              {app.rejectionReason && (
                <p className="text-xs text-red-600 ml-5">{app.rejectionReason}</p>
              )}
              <button onClick={() => { setShowRejectBox(false); onApprove(app.id); }}
                className="mt-2 ml-5 text-xs text-green-600 font-bold hover:underline">
                Aprobar de todas formas →
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

/* ─── MAIN ADMIN PANEL ─── */
export const AdminPanel = ({ onLogout }) => {
  const [applications, setApplications] = useState([]);
  const [filter,  setFilter]  = useState('pending');
  const [search,  setSearch]  = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setTimeout(() => {
      // Load the live merchant submission with FULL doc data (base64 included)
      const verif    = readLocalStorage('save-verification');
      const merchant = readLocalStorage('save-merchant');

      // Seed mock applications (without real doc data — for demo only)
      let apps = readLocalStorage('save-admin-applications-v2') || [
        {
          id: 'app_demo_1',
          businessName: 'Panadería El Trigo Dorado',
          ownerName: 'María García López',
          email: 'maria@trigodorado.mx',
          phone: '5512345678',
          taxId: 'GLP980412AB3',
          address: 'Calle Reforma 456, Col. Centro, CDMX',
          businessType: 'Panadería',
          website: 'instagram.com/trigodorado',
          submittedAt: new Date(Date.now() - 2 * 3600000).toISOString(),
          status: 'pending',
          docs: {
            rfc:       { name: 'constancia_fiscal.pdf',      data: null },
            acta:      { name: 'identificacion_oficial.jpg', data: null },
            domicilio: { name: 'comprobante_domicilio.pdf',  data: null },
            local:     null,
            permiso:   null,
          },
        },
        {
          id: 'app_demo_2',
          businessName: 'Café Aroma',
          ownerName: 'Ana Torres',
          email: 'ana@cafearoma.mx',
          phone: '5523456789',
          taxId: 'TAA900315EF5',
          address: 'Calle Orizaba 23, Col. Roma Norte, CDMX',
          businessType: 'Cafetería',
          website: 'cafearoma.mx',
          submittedAt: new Date(Date.now() - 3 * 24 * 3600000).toISOString(),
          status: 'approved',
          approvedAt: new Date(Date.now() - 2 * 24 * 3600000).toISOString(),
          docs: {
            rfc:       { name: 'constancia.pdf',  data: null },
            acta:      { name: 'ife_ana.jpg',     data: null },
            domicilio: { name: 'cfe_octubre.pdf', data: null },
            local:     null,
            permiso:   null,
          },
        },
      ];

      // Inject live merchant submission WITH REAL DOC DATA
      if (verif?.status === 'pending' && merchant) {
        const existingIdx = apps.findIndex(a => a.id === 'app_live');
        const liveApp = {
          id:           'app_live',
          businessName: merchant.name                   || 'Negocio sin nombre',
          ownerName:    verif.info?.contactName         || merchant.email || '—',
          email:        merchant.email                  || '—',
          phone:        verif.info?.contactPhone        || merchant.phone || '—',
          taxId:        verif.info?.taxId               || '—',
          address:      merchant.address                || '—',
          businessType: merchant.type                   || '—',
          website:      verif.info?.website             || '—',
          submittedAt:  verif.submittedAt               || new Date().toISOString(),
          status:       'pending',
          // ← HERE: keep full doc object including base64 data
          docs: verif.docs || {},
        };
        if (existingIdx >= 0) apps[existingIdx] = liveApp;
        else apps.unshift(liveApp);
      }

      setApplications(apps);
      setLoading(false);
    }, 400);
  }, []);

  const handleApprove = (id) => {
    const updated = applications.map(a =>
      a.id === id ? { ...a, status: 'approved', approvedAt: new Date().toISOString() } : a
    );
    setApplications(updated);
    // Save without base64 to avoid bloating localStorage
    const lean = updated.map(a => ({
      ...a,
      docs: Object.fromEntries(
        Object.entries(a.docs || {}).map(([k, v]) => [k, v ? { name: v.name, hasFile: true } : null])
      )
    }));
    writeLocalStorage('save-admin-applications-v2', lean);

    if (id === 'app_live') {
      const v = readLocalStorage('save-verification');
      if (v) writeLocalStorage('save-verification', { ...v, status: 'approved' });
      const b = readLocalStorage('save-merchant');
      if (b) writeLocalStorage('save-merchant', { ...b, verified: true, verificationStatus: 'approved' });
    }
  };

  const handleReject = (id, reason) => {
    const updated = applications.map(a =>
      a.id === id ? { ...a, status: 'rejected', rejectionReason: reason } : a
    );
    setApplications(updated);
    const lean = updated.map(a => ({
      ...a,
      docs: Object.fromEntries(
        Object.entries(a.docs || {}).map(([k, v]) => [k, v ? { name: v.name, hasFile: true } : null])
      )
    }));
    writeLocalStorage('save-admin-applications-v2', lean);

    if (id === 'app_live') {
      const v = readLocalStorage('save-verification');
      if (v) writeLocalStorage('save-verification', { ...v, status: 'rejected', rejectionReason: reason });
    }
  };

  const filtered = applications.filter(a => {
    const matchFilter = filter === 'all' || a.status === filter;
    const matchSearch = !search ||
      a.businessName.toLowerCase().includes(search.toLowerCase()) ||
      a.ownerName.toLowerCase().includes(search.toLowerCase());
    return matchFilter && matchSearch;
  });

  const counts = {
    all:      applications.length,
    pending:  applications.filter(a => a.status === 'pending').length,
    approved: applications.filter(a => a.status === 'approved').length,
    rejected: applications.filter(a => a.status === 'rejected').length,
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-gradient-to-r from-slate-800 to-slate-900 text-white px-6 py-4 shadow-xl">
        <div className="max-w-3xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-green-500 rounded-xl flex items-center justify-center text-xl font-bold">S</div>
            <div>
              <h1 className="text-lg font-bold">Save · Admin</h1>
              <p className="text-xs text-slate-400">Panel de verificación de negocios</p>
            </div>
          </div>
          <button onClick={onLogout}
            className="flex items-center gap-2 px-3 py-2 bg-white/10 hover:bg-white/20 rounded-xl text-sm font-semibold transition-colors">
            <LogOut size={16} /> Salir
          </button>
        </div>
      </div>

      <div className="max-w-3xl mx-auto p-4 space-y-4">

        {/* Stats */}
        <div className="grid grid-cols-4 gap-3">
          {[
            { label: 'Total',      value: counts.all,      color: 'bg-slate-600', icon: Store       },
            { label: 'Pendientes', value: counts.pending,  color: 'bg-amber-500', icon: Clock       },
            { label: 'Aprobados',  value: counts.approved, color: 'bg-green-500', icon: CheckCircle },
            { label: 'Rechazados', value: counts.rejected, color: 'bg-red-500',   icon: XCircle     },
          ].map(s => {
            const Icon = s.icon;
            return (
              <div key={s.label} className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100 text-center">
                <div className={`w-8 h-8 ${s.color} rounded-lg flex items-center justify-center mx-auto mb-2`}>
                  <Icon size={15} className="text-white" />
                </div>
                <p className="text-2xl font-black text-gray-900">{s.value}</p>
                <p className="text-xs text-gray-500">{s.label}</p>
              </div>
            );
          })}
        </div>

        {/* Search + filters */}
        <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100 space-y-3">
          <div className="relative">
            <Search size={15} className="absolute left-3 top-3 text-gray-400" />
            <input type="text" placeholder="Buscar negocio u dueño..." value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-slate-400" />
          </div>
          <div className="flex gap-2 flex-wrap">
            {[
              { id: 'pending',  label: `⏳ Pendientes (${counts.pending})`  },
              { id: 'approved', label: `✅ Aprobados (${counts.approved})`  },
              { id: 'rejected', label: `❌ Rechazados (${counts.rejected})` },
              { id: 'all',      label: `📋 Todos (${counts.all})`           },
            ].map(f => (
              <button key={f.id} onClick={() => setFilter(f.id)}
                className={`px-3 py-2 rounded-xl text-xs font-bold transition-all ${filter === f.id ? 'bg-slate-800 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
                {f.label}
              </button>
            ))}
          </div>
        </div>

        {/* Applications */}
        {loading ? (
          <div className="text-center py-16">
            <div className="w-10 h-10 border-4 border-slate-600 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
            <p className="text-gray-500 text-sm">Cargando solicitudes...</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16 bg-white rounded-2xl border border-gray-100">
            <p className="text-4xl mb-3">📋</p>
            <p className="text-gray-600 font-semibold">
              {filter === 'pending' ? 'No hay negocios pendientes' : 'Sin resultados'}
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {filtered.map(app => (
              <AppCard key={app.id} app={app} onApprove={handleApprove} onReject={handleReject} />
            ))}
          </div>
        )}

        {/* Guide */}
        <div className="bg-slate-800 text-white rounded-2xl p-5">
          <p className="font-bold mb-3 flex items-center gap-2">
            <Shield size={16} className="text-green-400" /> Proceso de verificación
          </p>
          <ol className="space-y-2 text-sm text-slate-300">
            {[
              'El negocio sube documentos desde la app → aparece aquí como "Pendiente"',
              'Haz clic en la tarjeta para expandir y ver todos sus documentos',
              'Toca "Ver" en cada documento para abrirlo o descargarlo',
              'Verifica el RFC en: sat.gob.mx → Trámites → Consulta de RFC',
              'Busca el negocio en Google Maps para confirmar que existe físicamente',
              'Marca la lista de verificación y presiona Aprobar o Rechazar',
              'El negocio recibe el resultado automáticamente en su app',
            ].map((step, i) => (
              <li key={i} className="flex items-start gap-3">
                <span className="w-5 h-5 bg-slate-600 rounded-full flex items-center justify-center text-xs font-bold shrink-0 mt-0.5">
                  {i + 1}
                </span>
                {step}
              </li>
            ))}
          </ol>
        </div>
      </div>
    </div>
  );
};
