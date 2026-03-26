import React, { useState, useEffect, useMemo } from 'react';
import { Copy, CheckCircle, Calendar, ClipboardList, ChevronDown, FileUp, X, Sparkles, Loader2, Zap, Monitor, Info } from 'lucide-react';
import { convertPDFToText } from '../utils/pdfExtractor';
import { smartParse } from '../utils/advancedParser';

const MondayEntryGenerator = ({ projects, suppliers }) => {
    // Form state
    const [selectedProjectId, setSelectedProjectId] = useState('');
    const [selectedSupplierId, setSelectedSupplierId] = useState('');
    const [form, setForm] = useState({
        date: '',
        projectName: '',
        projectNumber: '',
        companyAccountName: '',
        accountNumber: '',
        bankName: '',
        detailPayment: '',
        amountInvoice: '',
        invoiceNumber: '',
        requesterName: 'NAQIB IKHWAN'
    });
    const [copiedField, setCopiedField] = useState(null);
    const [invoiceFile, setInvoiceFile] = useState(null);
    const [isParsing, setIsParsing] = useState(false);
    const [showScriptModal, setShowScriptModal] = useState(false);

    // Load defaults from localStorage
    useEffect(() => {
        try {
            const defaults = JSON.parse(localStorage.getItem('mondayDefaults') || '{}');
            if (defaults.requesterName) {
                setForm(prev => ({ ...prev, requesterName: defaults.requesterName }));
            }
        } catch (e) { /* ignore */ }
    }, []);

    // Save requester name as default when it changes
    useEffect(() => {
        if (form.requesterName.trim()) {
            try {
                const defaults = JSON.parse(localStorage.getItem('mondayDefaults') || '{}');
                defaults.requesterName = form.requesterName;
                localStorage.setItem('mondayDefaults', JSON.stringify(defaults));
            } catch (e) { /* ignore */ }
        }
    }, [form.requesterName]);

    // Auto-fill from selected project
    useEffect(() => {
        if (!selectedProjectId) return;
        const project = projects.find(p => p.id === selectedProjectId);
        if (project) {
            const cats = [...new Set((project.materials || []).map(m => (m.category || '').toUpperCase()))].filter(Boolean);
            const catStr = cats.join(' / ');
            setForm(prev => ({
                ...prev,
                projectName: project.name || '',
                projectNumber: project.projectNumber || '',
                detailPayment: prev.detailPayment || `FULL PAYMENT - ${catStr || 'MATERIALS'} - ${project.name || ''}`
            }));
        }
    }, [selectedProjectId, projects]);

    // Auto-fill from selected supplier
    useEffect(() => {
        if (!selectedSupplierId) return;
        const supplier = suppliers.find(s => s.id === selectedSupplierId);
        if (supplier) {
            setForm(prev => ({
                ...prev,
                companyAccountName: supplier.name || '',
                accountNumber: supplier.accountNumber || prev.accountNumber,
                bankName: supplier.bankName || prev.bankName
            }));
        }
    }, [selectedSupplierId, suppliers]);

    // Handle PDF Extraction
    const handleInvoiceUpload = async (file) => {
        if (!file) return;
        setInvoiceFile(file);

        if (file.type === 'application/pdf') {
            setIsParsing(true);
            try {
                const text = await convertPDFToText(file);
                const result = smartParse(text);

                if (result && result.metadata) {
                    const meta = result.metadata;
                    setForm(prev => ({
                        ...prev,
                        projectName: meta.projectName || prev.projectName,
                        projectNumber: meta.projectNumber || prev.projectNumber,
                        invoiceNumber: meta.invoiceNumber || prev.invoiceNumber,
                        amountInvoice: meta.totalProject ? `RM${meta.totalProject}` : prev.amountInvoice,
                        date: meta.date ? formatExtractDate(meta.date) : prev.date
                    }));
                }
            } catch (err) {
                console.error("PDF Parsing failed:", err);
            } finally {
                setIsParsing(false);
            }
        }
    };

    const formatExtractDate = (dateStr) => {
        try {
            if (dateStr.includes('/')) {
                const parts = dateStr.split('/');
                if (parts[2].length === 2) parts[2] = `20${parts[2]}`;
                return `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
            }
            return dateStr;
        } catch { return dateStr; }
    };

    const copyField = (fieldName, value) => {
        navigator.clipboard.writeText(value).then(() => {
            setCopiedField(fieldName);
            setTimeout(() => setCopiedField(null), 1500);
        });
    };

    // Solution B: Copy as "Magic JSON" for the automation script
    const copyMagicData = () => {
        const payload = {
            type: "MONDAY_AUTOFILL_V1",
            payload: {
                "Date Needed": formattedDate,
                "Project Name": form.projectName,
                "Project Number": form.projectNumber,
                "Company Account Name": form.companyAccountName,
                "Account Number": form.accountNumber,
                "Bank Name": form.bankName,
                "Detail Payment": form.detailPayment,
                "Amount Invoice": form.amountInvoice,
                "Invoice Number": form.invoiceNumber,
                "Requester Name": form.requesterName
            }
        };

        navigator.clipboard.writeText(JSON.stringify(payload)).then(() => {
            setCopiedField('__magic__');
            setTimeout(() => setCopiedField(null), 1800);
        });
    };

    const magicScriptCode = `
/* MONDAY MAGIC FILLER V1 */
(function() {
    console.log("%c Magic Filler Active! %c Press Alt+V in Monday to autofill selected row.", 
                "background: #1e1b4b; color: #818cf8; font-weight: bold; padding: 4px; border-radius: 4px;", "");
    
    document.addEventListener('keydown', async (e) => {
        if (e.altKey && (e.key === 'v' || e.key === 'V')) {
            try {
                const clipText = await navigator.clipboard.readText();
                const packet = JSON.parse(clipText);
                if (packet.type !== "MONDAY_AUTOFILL_V1") return;
                
                console.log("Magic packet detected! Filling row...", packet.payload);
                fillMondayRow(packet.payload);
            } catch (err) {}
        }
    });

    function fillMondayRow(data) {
        const activeCell = document.querySelector('.tableCell_93cf93856a:focus-within') || 
                           document.activeElement.closest('.tableCell_93cf93856a');
        if (!activeCell) {
            alert("Please click on a cell in the row you want to fill first.");
            return;
        }

        const row = activeCell.closest('.tableRow_2fd7fa2184');
        const board = row.closest('.table_7f7c83c1e0');
        const headers = Array.from(board.querySelectorAll('.tableHeaderCell_298f71f8db'));
        const colMap = {};
        headers.forEach((h, i) => {
            const name = h.innerText.trim().replace(/\\n/g, ' ');
            colMap[name] = i;
        });

        const cells = Array.from(row.querySelectorAll('.tableCell_93cf93856a'));
        
        for (const [key, value] of Object.entries(data)) {
            const colIndex = findBestColumn(key, colMap);
            if (colIndex !== undefined && cells[colIndex]) {
                const cell = cells[colIndex];
                simulateTextInput(cell, value);
            }
        }
    }

    function findBestColumn(target, map) {
        target = target.toLowerCase();
        for (const [name, index] of Object.entries(map)) {
            const n = name.toLowerCase();
            if (n.includes(target) || target.includes(n)) return index;
        }
        if (target.includes("needed")) return map["Date"] || map["Date needed"];
        return undefined;
    }

    async function simulateTextInput(cell, text) {
        cell.click();
        await new Promise(r => setTimeout(r, 80));
        const input = cell.querySelector('input, textarea') || cell;
        
        const event = new InputEvent('input', { bubbles: true, cancelable: true });
        if (input.value !== undefined) {
             input.value = text;
        } else {
             input.innerText = text;
        }
        input.dispatchEvent(event);
        input.blur();
    }
})();`.trim();

    const resetForm = () => {
        setSelectedProjectId('');
        setSelectedSupplierId('');
        setForm(prev => ({
            date: '',
            projectName: '',
            projectNumber: '',
            companyAccountName: '',
            accountNumber: '',
            bankName: '',
            detailPayment: '',
            amountInvoice: '',
            invoiceNumber: '',
            requesterName: prev.requesterName
        }));
        setInvoiceFile(null);
    };

    const formattedDate = useMemo(() => {
        if (!form.date) return '';
        try {
            const d = new Date(form.date);
            return `${d.getDate()}/${d.getMonth() + 1}/${String(d.getFullYear()).slice(-2)}`;
        } catch { return form.date; }
    }, [form.date]);

    const outputFields = [
        { key: 'date', label: 'Date Item Needed', value: formattedDate },
        { key: 'projectName', label: 'Project Name', value: form.projectName },
        { key: 'projectNumber', label: 'Project Number', value: form.projectNumber },
        { key: 'companyAccountName', label: 'Company Account Name', value: form.companyAccountName },
        { key: 'accountNumber', label: 'Account Number', value: form.accountNumber },
        { key: 'bankName', label: 'Bank Name', value: form.bankName },
        { key: 'detailPayment', label: 'Detail Payment', value: form.detailPayment },
        { key: 'amountInvoice', label: 'Amount Invoice', value: form.amountInvoice },
        { key: 'invoiceNumber', label: 'Invoice Number', value: form.invoiceNumber },
        { key: 'requesterName', label: 'Requester Name', value: form.requesterName },
    ];

    const hasOutput = outputFields.some(f => f.value.trim());

    return (
        <div className="space-y-6">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <div>
                    <h2 className="text-2xl font-bold text-gray-800">Monday.com Magic Entry</h2>
                    <p className="text-sm text-gray-500 mt-1">Solution B: Auto-fills your monday.com board instantly.</p>
                </div>
                <div className="flex items-center gap-2">
                    <button
                        onClick={() => setShowScriptModal(true)}
                        className="text-xs bg-gray-100 text-gray-700 font-bold px-3 py-2 rounded-lg hover:bg-gray-200 flex items-center gap-1.5 transition-all"
                    >
                        <Monitor size={14} /> Setup Magic Script
                    </button>
                    <button
                        onClick={resetForm}
                        className="text-xs text-gray-500 hover:text-red-600 px-3 py-2 rounded-lg border border-transparent hover:border-red-100 transition-all font-medium"
                    >
                        <X size={14} /> Clear
                    </button>
                    {hasOutput && (
                        <button
                            onClick={copyMagicData}
                            className={`flex items-center gap-2 text-sm px-6 py-2.5 rounded-xl font-black transition-all shadow-md transform active:scale-95 ${copiedField === '__magic__'
                                ? 'bg-green-500 text-white translate-y-[-2px] shadow-lg'
                                : 'bg-indigo-600 text-white hover:bg-indigo-700 shadow-indigo-200'
                                }`}
                        >
                            {copiedField === '__magic__' ? (
                                <><CheckCircle size={18} /> Ready to Fill!</>
                            ) : (
                                <><Zap size={18} fill="currentColor" /> Copy for Magic Fill</>
                            )}
                        </button>
                    )}
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="space-y-4">
                    <div className="bg-white rounded-2xl shadow-sm border p-6 space-y-4">
                        <div className="flex items-center justify-between">
                            <h3 className="font-bold text-gray-800 flex items-center gap-2 uppercase text-xs tracking-wider">
                                <ClipboardList size={18} className="text-blue-600" /> Form Inputs
                            </h3>
                            {isParsing && (
                                <div className="flex items-center gap-2 text-blue-600 animate-pulse text-xs font-bold">
                                    <Loader2 size={14} className="animate-spin" /> Extracting AI...
                                </div>
                            )}
                        </div>

                        {!invoiceFile ? (
                            <div className="relative group">
                                <div className="absolute inset-0 bg-gradient-to-r from-blue-400 to-indigo-500 rounded-xl blur opacity-10 group-hover:opacity-20 transition-opacity"></div>
                                <label className="relative flex flex-col items-center justify-center h-28 border-2 border-blue-200 border-dashed rounded-xl cursor-pointer bg-blue-50/30 hover:bg-blue-50 transition-all">
                                    <Sparkles size={24} className="text-blue-500 mb-2" />
                                    <p className="text-xs text-blue-800 font-bold uppercase tracking-tight text-center px-4">Drag Invoice PDF here to Auto-fill Project</p>
                                    <input type="file" className="hidden" accept=".pdf" onChange={e => handleInvoiceUpload(e.target.files?.[0])} />
                                </label>
                            </div>
                        ) : (
                            <div className="flex items-center gap-3 bg-blue-50 p-3 rounded-xl border border-blue-100">
                                <FileUp size={20} className="text-blue-600 flex-shrink-0" />
                                <span className="text-xs font-bold text-blue-800 truncate flex-1">{invoiceFile.name}</span>
                                <button onClick={() => setInvoiceFile(null)} className="p-1 hover:bg-blue-100 rounded-full text-blue-400">
                                    <X size={16} />
                                </button>
                            </div>
                        )}

                        <div className="grid grid-cols-2 gap-4 pt-2">
                            <div className="space-y-1">
                                <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wide ms-1">Project Name</label>
                                <input value={form.projectName} onChange={e => setForm({ ...form, projectName: e.target.value })} className="w-full bg-gray-50 border-0 focus:ring-2 focus:ring-blue-500 rounded-lg px-3 py-2 text-sm" />
                            </div>
                            <div className="space-y-1">
                                <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wide ms-1">Project Number</label>
                                <input value={form.projectNumber} onChange={e => setForm({ ...form, projectNumber: e.target.value })} className="w-full bg-gray-50 border-0 focus:ring-2 focus:ring-blue-500 rounded-lg px-3 py-2 text-sm" />
                            </div>
                        </div>

                        <div className="space-y-1">
                            <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wide ms-1">Supplier Link</label>
                            <select value={selectedSupplierId} onChange={e => setSelectedSupplierId(e.target.value)} className="w-full bg-blue-50/50 border-0 focus:ring-2 focus:ring-blue-500 rounded-lg px-3 py-2.5 text-sm font-medium">
                                <option value="">— Link to Supplier DB —</option>
                                {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                            </select>
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-1">
                                <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wide ms-1">Account Number</label>
                                <input value={form.accountNumber} onChange={e => setForm({ ...form, accountNumber: e.target.value })} className="w-full bg-gray-50 border-0 focus:ring-2 focus:ring-blue-500 rounded-lg px-3 py-2 text-sm font-mono" />
                            </div>
                            <div className="space-y-1">
                                <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wide ms-1">Bank Name</label>
                                <input value={form.bankName} onChange={e => setForm({ ...form, bankName: e.target.value })} className="w-full bg-gray-50 border-0 focus:ring-2 focus:ring-blue-500 rounded-lg px-3 py-2 text-sm" />
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-1">
                                <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wide ms-1">Amount</label>
                                <input value={form.amountInvoice} onChange={e => setForm({ ...form, amountInvoice: e.target.value })} placeholder="RM0.00" className="w-full bg-gray-50 border-0 focus:ring-2 focus:ring-blue-500 rounded-lg px-3 py-2 text-sm font-bold" />
                            </div>
                            <div className="space-y-1">
                                <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wide ms-1">Invoice #</label>
                                <input value={form.invoiceNumber} onChange={e => setForm({ ...form, invoiceNumber: e.target.value })} className="w-full bg-gray-50 border-0 focus:ring-2 focus:ring-blue-500 rounded-lg px-3 py-2 text-sm font-mono" />
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-1">
                                <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wide ms-1">Date Needed</label>
                                <input type="date" value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} className="w-full bg-gray-50 border-0 focus:ring-2 focus:ring-blue-500 rounded-lg px-3 py-2 text-sm" />
                            </div>
                            <div className="space-y-1">
                                <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wide ms-1">Requester</label>
                                <input value={form.requesterName} onChange={e => setForm({ ...form, requesterName: e.target.value })} className="w-full bg-gray-50 border-0 focus:ring-2 focus:ring-blue-500 rounded-lg px-3 py-2 text-sm" />
                            </div>
                        </div>

                        <div className="space-y-1">
                            <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wide ms-1">Detail Payment</label>
                            <textarea rows="2" value={form.detailPayment} onChange={e => setForm({ ...form, detailPayment: e.target.value })} className="w-full bg-gray-50 border-0 focus:ring-2 focus:ring-blue-500 rounded-xl px-3 py-2 text-xs" />
                        </div>
                    </div>
                </div>

                <div className="space-y-4">
                    <div className="bg-white rounded-2xl shadow-sm border overflow-hidden">
                        <div className="px-6 py-4 bg-gray-50 border-b flex justify-between items-center">
                            <h3 className="font-bold text-gray-900 flex items-center gap-2 text-sm uppercase tracking-tight">
                                <Zap size={16} fill="#FACC15" color="#FACC15" /> Magic Fill Data
                            </h3>
                            <button onClick={copyMagicData} className="text-xs text-blue-600 font-bold hover:underline">Copy Magic Data</button>
                        </div>

                        {!hasOutput ? (
                            <div className="py-20 text-center flex flex-col items-center justify-center opacity-30">
                                <ClipboardList size={60} className="mb-4" />
                                <p className="font-bold uppercase tracking-widest text-xs">Awaiting Inputs</p>
                            </div>
                        ) : (
                            <div className="p-1">
                                <div className="grid grid-cols-1 divide-y divide-gray-50">
                                    {outputFields.map(f => (
                                        <div key={f.key} className="flex items-center justify-between px-5 py-3 group hover:bg-gray-50 transition-colors">
                                            <div className="min-w-0">
                                                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">{f.label}</p>
                                                <p className="text-sm font-semibold text-gray-800 truncate mt-0.5">{f.value || '—'}</p>
                                            </div>
                                            {f.value && (
                                                <button onClick={() => copyField(f.key, f.value)} className={`p-2 rounded-lg transition-all ${copiedField === f.key ? 'bg-green-100 text-green-600' : 'text-gray-300 hover:text-blue-600 group-hover:opacity-100 opacity-0'}`}>
                                                    {copiedField === f.key ? <CheckCircle size={16} /> : <Copy size={16} />}
                                                </button>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>

                    <div className="bg-indigo-900 rounded-2xl p-6 text-white shadow-xl shadow-indigo-100 border border-indigo-700">
                        <h4 className="font-black text-indigo-300 uppercase text-xs tracking-[0.2em] mb-4 flex items-center gap-2">
                            <Monitor size={16} /> How Solution B Works
                        </h4>
                        <ol className="space-y-4 text-sm font-medium">
                            <li className="flex gap-3">
                                <span className="flex-shrink-0 w-6 h-6 rounded-full bg-indigo-700 flex items-center justify-center text-xs">1</span>
                                <p className="opacity-90">Open your **Monday.com** board tab.</p>
                            </li>
                            <li className="flex gap-3">
                                <span className="flex-shrink-0 w-6 h-6 rounded-full bg-indigo-700 flex items-center justify-center text-xs">2</span>
                                <p className="opacity-90">Paste my **Magic Script** into the Console (one-time setup).</p>
                            </li>
                            <li className="flex gap-3">
                                <span className="flex-shrink-0 w-6 h-6 rounded-full bg-indigo-700 flex items-center justify-center text-xs">3</span>
                                <p className="opacity-90">Click **"Copy for Magic Fill"** in this app.</p>
                            </li>
                            <li className="flex gap-3">
                                <span className="flex-shrink-0 w-6 h-6 rounded-full bg-indigo-700 flex items-center justify-center text-xs">4</span>
                                <p className="opacity-90 font-black text-indigo-200 uppercase tracking-wide">Select your row in Monday & press **Alt + V**.</p>
                            </li>
                        </ol>
                    </div>
                </div>
            </div>

            {showScriptModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-indigo-950/80 backdrop-blur-sm">
                    <div className="bg-white rounded-2xl w-full max-w-2xl shadow-2xl overflow-hidden border border-indigo-200">
                        <div className="px-6 py-4 bg-gradient-to-r from-indigo-600 to-blue-700 text-white flex justify-between items-center">
                            <h3 className="font-black uppercase tracking-widest text-sm flex items-center gap-2">
                                <Monitor size={18} /> Setup Magic Automation
                            </h3>
                            <button onClick={() => setShowScriptModal(false)} className="text-white/70 hover:text-white transition-colors"><X size={20} /></button>
                        </div>
                        <div className="p-6 space-y-4">
                            <div className="bg-blue-50 p-4 rounded-xl flex items-start gap-4 border border-blue-100">
                                <Info size={18} className="text-blue-600 mt-1" />
                                <div className="text-sm">
                                    <p className="font-bold text-blue-900">One-Time Setup Required</p>
                                    <p className="text-blue-700 mt-1">Copy the script below, go to your Monday.com board tab, press <b>F12</b>, click the <b>Console</b> tab, paste it, and press <b>Enter</b>.</p>
                                </div>
                            </div>

                            <div className="relative">
                                <div className="absolute top-3 right-3">
                                    <button
                                        onClick={() => {
                                            navigator.clipboard.writeText(magicScriptCode);
                                            setCopiedField('__magic_script__');
                                            setTimeout(() => setCopiedField(null), 2000);
                                        }}
                                        className={`flex items-center gap-2 text-xs font-bold px-4 py-2 rounded-lg shadow-sm transition-all ${copiedField === '__magic_script__' ? 'bg-green-500 text-white' : 'bg-gray-800 text-white'
                                            }`}
                                    >
                                        {copiedField === '__magic_script__' ? <><CheckCircle size={14} /> Copied!</> : <><Copy size={14} /> Copy Script</>}
                                    </button>
                                </div>
                                <div className="bg-gray-900 rounded-xl p-4 pt-14 max-h-60 overflow-y-auto font-mono text-[10px] text-gray-400 border-x border-b border-gray-800">
                                    <pre>{magicScriptCode}</pre>
                                </div>
                            </div>

                            <div className="flex justify-end pt-2">
                                <button onClick={() => setShowScriptModal(false)} className="bg-indigo-600 text-white font-bold px-8 py-3 rounded-xl hover:bg-indigo-700 transition-all shadow-md">
                                    Close & Continue
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default MondayEntryGenerator;
