import React, { useState, useRef } from 'react';
import {
  Shield, Upload, CheckCircle, Clock, XCircle,
  FileText, Store, Phone, MapPin, AlertCircle,
  ChevronRight, Camera, X, Info
} from 'lucide-react';
import { writeLocalStorage, readLocalStorage } from '../../hooks/useLocalStorage';

/* ─── STATUS BADGE ─── */
const StatusBadge = ({ status }) => {
  const map = {
    pending:  { label: 'Pendiente de revisión', color: 'bg-amber-100 text-amber-700',  icon: Clock },
    approved: { label: 'Negocio verificado ✓',  color: 'bg-green-100 text-green-700',  icon: CheckCircle },
    rejected: { label: 'Documentos rechazados', color: 'bg-red-100 text-red-700',      icon: XCircle },
    draft:    { label: 'Sin enviar',             color: 'bg-gray-100 text-gray-600',    icon: FileText },
  };
  const s = map[status] || map.draft;
  const Icon = s.icon;
  return (
    <span className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold ${s.color}`}>
      <Icon size={13} /> {s.label}
    </span>
  );
};

/* ─── DOCUMENT UPLOAD CARD ─── */
const DocCard = ({ id, label, description, required, file, onUpload, onRemove }) => {
  const inputRef = useRef(null);

  const handleFile = (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    if (f.size > 8 * 1024 * 1024) { alert('El archivo debe ser menor a 8 MB'); return; }
    const reader = new FileReader();
    reader.onload = ev => onUpload(id, { name: f.name, data: ev.target.result, type: f.type });
    reader.readAsDataURL(f);
  };

  return (
    <div className={`border-2 rounded-2xl p-4 transition-all ${file ? 'border-green-400 bg-green-50' : 'border-gray-200 bg-white'}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-1">
            <p className="font-semibold text-gray-900 text-sm">{label}</p>
            {required && <span className="text-xs text-red-500 font-bold">*obligatorio</span>}
          </div>
          <p className="text-xs text-gray-500">{description}</p>
        </div>
        {file ? (
          <div className="flex items-center gap-2 shrink-0">
            <CheckCircle size={20} className="text-green-500" />
            <button onClick={() => onRemove(id)} className="p-1 hover:bg-red-100 rounded-full">
              <X size={16} className="text-red-400" />
            </button>
          </div>
        ) : null}
      </div>

      {file ? (
        <div className="mt-3 flex items-center gap-2 bg-white rounded-xl px-3 py-2 border border-green-200">
          <FileText size={16} className="text-green-600 shrink-0" />
          <span className="text-xs text-gray-700 truncate flex-1">{file.name}</span>
          <button onClick={() => inputRef.current?.click()} className="text-xs text-blue-600 font-semibold shrink-0">
            Cambiar
          </button>
        </div>
      ) : (
        <button onClick={() => inputRef.current?.click()}
          className="mt-3 w-full border-2 border-dashed border-gray-300 rounded-xl py-3 flex items-center justify-center gap-2 text-sm font-semibold text-gray-500 hover:border-green-400 hover:text-green-600 hover:bg-green-50 transition-all">
          <Upload size={16} /> Subir documento
        </button>
      )}
      <input ref={inputRef} type="file" accept="image/*,.pdf" className="hidden" onChange={handleFile} />
    </div>
  );
};

/* ─── MAIN VERIFICATION FLOW ─── */
export const VerificationFlow = ({ merchant, onClose }) => {
  const saved   = readLocalStorage('save-verification') || {};
  const [step, setStep]   = useState(saved.status === 'pending' || saved.status === 'approved' ? 'status' : 'intro');
  const [docs,  setDocs]  = useState(saved.docs  || {});
  const [info,  setInfo]  = useState(saved.info  || { contactName: '', contactPhone: '', taxId: '', website: '' });
  const [submitting, setSubmitting] = useState(false);

  const DOCUMENTS = [
    { id: 'rfc',      label: 'RFC / Constancia fiscal',      description: 'Constancia de situación fiscal o RFC del negocio',            required: true  },
    { id: 'acta',     label: 'Acta constitutiva / ID oficial', description: 'Acta de la empresa o identificación oficial del responsable', required: true  },
    { id: 'domicilio',label: 'Comprobante de domicilio',      description: 'Comprobante de domicilio del negocio (máx. 3 meses)',          required: true  },
    { id: 'local',    label: 'Foto del local',                description: 'Foto exterior e interior del establecimiento',                 required: false },
    { id: 'permiso',  label: 'Permiso de funcionamiento',     description: 'Licencia municipal o permiso sanitario (si aplica)',          required: false },
  ];

  const requiredDocs  = DOCUMENTS.filter(d => d.required);
  const allRequiredOk = requiredDocs.every(d => docs[d.id]);
  const infoOk        = info.contactName.trim() && info.contactPhone.trim() && info.taxId.trim();
  const canSubmit     = allRequiredOk && infoOk;

  const handleUpload = (id, file) => setDocs(prev => ({ ...prev, [id]: file }));
  const handleRemove = (id)       => setDocs(prev => { const n = { ...prev }; delete n[id]; return n; });

  const handleSubmit = async () => {
    setSubmitting(true);
    await new Promise(r => setTimeout(r, 1200)); // simulate upload
    const verif = { status: 'pending', docs, info, submittedAt: new Date().toISOString() };
    writeLocalStorage('save-verification', verif);
    // Mark merchant as pending
    const biz = readLocalStorage('save-merchant');
    if (biz) { writeLocalStorage('save-merchant', { ...biz, verificationStatus: 'pending' }); }
    setSubmitting(false);
    setStep('status');
  };

  const status = saved.status || 'draft';

  /* ── INTRO SCREEN ── */
  if (step === 'intro') return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[60] flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="bg-white w-full max-w-lg rounded-t-3xl sm:rounded-3xl overflow-hidden">
        <div className="bg-gradient-to-br from-blue-600 to-indigo-600 p-8 text-white text-center relative overflow-hidden">
          <div className="absolute inset-0 opacity-10">
            <div className="absolute top-0 right-0 w-48 h-48 bg-white rounded-full translate-x-20 -translate-y-20" />
          </div>
          <div className="relative z-10">
            <div className="w-16 h-16 bg-white/20 rounded-2xl mx-auto mb-4 flex items-center justify-center">
              <Shield size={32} className="text-white" />
            </div>
            <h2 className="text-2xl font-bold mb-2">Verificación de negocio</h2>
            <p className="text-blue-100 text-sm">Para proteger a los clientes y a tu negocio, verificamos que todos los negocios en Save sean legítimos</p>
          </div>
        </div>

        <div className="p-6 space-y-4">
          <p className="text-sm font-bold text-gray-700">¿Cómo funciona?</p>
          {[
            { icon: '📋', title: 'Envías tus documentos', desc: 'RFC, identificación y comprobante de domicilio' },
            { icon: '🔍', title: 'Revisamos en 24-48 horas', desc: 'Nuestro equipo verifica la autenticidad de tu negocio' },
            { icon: '✅', title: 'Negocio verificado', desc: 'Aparece el sello ✓ en tu perfil, generando más confianza' },
          ].map(s => (
            <div key={s.title} className="flex items-start gap-3">
              <div className="w-10 h-10 bg-blue-50 rounded-xl flex items-center justify-center text-xl shrink-0">{s.icon}</div>
              <div>
                <p className="font-semibold text-gray-900 text-sm">{s.title}</p>
                <p className="text-xs text-gray-500">{s.desc}</p>
              </div>
            </div>
          ))}

          <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 flex gap-2">
            <Info size={16} className="text-amber-600 shrink-0 mt-0.5" />
            <p className="text-xs text-amber-700">Mientras tu negocio no esté verificado, aparecerá con la etiqueta "Pendiente" y puede tener menor visibilidad.</p>
          </div>

          <div className="flex gap-3 pt-2">
            <button onClick={onClose} className="flex-1 py-3 border-2 border-gray-200 rounded-2xl font-bold text-gray-600 hover:bg-gray-50">
              Ahora no
            </button>
            <button onClick={() => setStep('documents')}
              className="flex-1 py-3 bg-blue-600 text-white rounded-2xl font-bold shadow-lg shadow-blue-600/30 hover:bg-blue-700 flex items-center justify-center gap-2">
              Comenzar <ChevronRight size={18} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );

  /* ── STATUS SCREEN ── */
  if (step === 'status') return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[60] flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="bg-white w-full max-w-lg rounded-t-3xl sm:rounded-3xl p-6">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-xl font-bold text-gray-900">Estado de verificación</h2>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-full"><X size={20} /></button>
        </div>

        <div className="text-center py-4">
          {status === 'pending' && <>
            <div className="w-20 h-20 bg-amber-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <Clock size={40} className="text-amber-500" />
            </div>
            <h3 className="text-xl font-bold text-gray-900 mb-2">En revisión</h3>
            <p className="text-gray-500 text-sm mb-4">Recibimos tus documentos. Los revisaremos en las próximas 24-48 horas hábiles. Te notificaremos por email.</p>
            <StatusBadge status="pending" />
          </>}
          {status === 'approved' && <>
            <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <CheckCircle size={40} className="text-green-500" />
            </div>
            <h3 className="text-xl font-bold text-gray-900 mb-2">¡Negocio verificado!</h3>
            <p className="text-gray-500 text-sm mb-4">Tu negocio ha sido verificado. Ahora apareces con el sello ✓ y tienes mayor visibilidad en la app.</p>
            <StatusBadge status="approved" />
          </>}
          {status === 'rejected' && <>
            <div className="w-20 h-20 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <XCircle size={40} className="text-red-500" />
            </div>
            <h3 className="text-xl font-bold text-gray-900 mb-2">Documentos no aprobados</h3>
            <p className="text-gray-500 text-sm mb-4">{saved.rejectionReason || 'Algunos documentos no pudieron verificarse. Por favor sube documentos más claros o actualizados.'}</p>
            <button onClick={() => setStep('documents')}
              className="mt-3 w-full bg-blue-600 text-white py-3 rounded-2xl font-bold hover:bg-blue-700">
              Volver a enviar documentos
            </button>
          </>}
        </div>

        <button onClick={onClose} className="w-full mt-4 py-3 border-2 border-gray-200 rounded-2xl font-bold text-gray-600 hover:bg-gray-50">
          Cerrar
        </button>
      </div>
    </div>
  );

  /* ── DOCUMENTS FORM ── */
  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[60] flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="bg-white w-full max-w-lg max-h-[92vh] overflow-y-auto rounded-t-3xl sm:rounded-3xl">
        {/* Header */}
        <div className="sticky top-0 bg-white border-b border-gray-100 px-6 py-4 flex items-center justify-between z-10 rounded-t-3xl">
          <div>
            <h2 className="text-lg font-bold text-gray-900">Documentos del negocio</h2>
            <p className="text-xs text-gray-500">Todos los documentos se guardan de forma segura</p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-full"><X size={20} /></button>
        </div>

        <div className="p-6 space-y-5">
          {/* Progress */}
          <div className="flex items-center gap-2">
            {requiredDocs.map((d, i) => (
              <div key={d.id} className={`flex-1 h-2 rounded-full transition-all ${docs[d.id] ? 'bg-green-500' : 'bg-gray-200'}`} />
            ))}
            <span className="text-xs font-bold text-gray-600 shrink-0">
              {requiredDocs.filter(d => docs[d.id]).length}/{requiredDocs.length}
            </span>
          </div>

          {/* Contact info */}
          <div className="bg-gray-50 rounded-2xl p-4 space-y-3">
            <p className="font-bold text-gray-800 text-sm">📋 Información de contacto</p>
            {[
              { key: 'contactName',  placeholder: 'Nombre del responsable del negocio', icon: Store },
              { key: 'contactPhone', placeholder: 'Teléfono directo (10 dígitos)',       icon: Phone },
              { key: 'taxId',        placeholder: 'RFC del negocio (ej. ABC123456XYZ)',  icon: FileText },
              { key: 'website',      placeholder: 'Sitio web o Instagram (opcional)',    icon: MapPin },
            ].map(f => {
              const Icon = f.icon;
              return (
                <div key={f.key} className="relative">
                  <Icon className="absolute left-3 top-3 text-gray-400" size={16} />
                  <input
                    type="text"
                    placeholder={f.placeholder}
                    value={info[f.key]}
                    onChange={e => setInfo(prev => ({ ...prev, [f.key]: e.target.value }))}
                    className="w-full pl-10 pr-4 py-2.5 bg-white border-2 border-gray-200 rounded-xl text-sm focus:border-blue-500 focus:outline-none transition-all"
                  />
                </div>
              );
            })}
          </div>

          {/* Document uploads */}
          <div>
            <p className="font-bold text-gray-800 text-sm mb-3">📎 Documentos requeridos</p>
            <div className="space-y-3">
              {DOCUMENTS.map(doc => (
                <DocCard key={doc.id} {...doc}
                  file={docs[doc.id]}
                  onUpload={handleUpload}
                  onRemove={handleRemove}
                />
              ))}
            </div>
          </div>

          {/* Validation checklist */}
          <div className="bg-blue-50 border border-blue-100 rounded-2xl p-4">
            <p className="font-bold text-blue-800 text-sm mb-2 flex items-center gap-2">
              <Shield size={15} /> Lo que verificamos
            </p>
            <ul className="space-y-1.5">
              {[
                'Que el negocio sea un establecimiento real y activo',
                'Que los datos fiscales sean válidos y correspondan al negocio',
                'Que el domicilio registrado coincida con la ubicación en la app',
                'Que no haya historial de fraude o quejas previas',
              ].map(item => (
                <li key={item} className="flex items-start gap-2 text-xs text-blue-700">
                  <CheckCircle size={12} className="text-blue-500 mt-0.5 shrink-0" />{item}
                </li>
              ))}
            </ul>
          </div>

          {!canSubmit && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 flex gap-2">
              <AlertCircle size={15} className="text-amber-600 shrink-0 mt-0.5" />
              <p className="text-xs text-amber-700">
                {!infoOk ? 'Completa los campos de nombre, teléfono y RFC.' : 'Sube los 3 documentos obligatorios para continuar.'}
              </p>
            </div>
          )}

          <div className="flex gap-3 pt-2 pb-2">
            <button onClick={onClose} className="flex-1 py-3.5 border-2 border-gray-200 rounded-2xl font-bold text-gray-600 hover:bg-gray-50">
              Cancelar
            </button>
            <button onClick={handleSubmit} disabled={!canSubmit || submitting}
              className="flex-1 py-3.5 bg-blue-600 text-white rounded-2xl font-bold shadow-lg shadow-blue-600/30 hover:bg-blue-700 disabled:opacity-40 transition-all flex items-center justify-center gap-2">
              {submitting ? <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> Enviando...</> : <><Shield size={16} /> Enviar para revisión</>}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
