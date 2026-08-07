import React, { useState, useMemo, useRef } from 'react';
import { Upload, Plus, Save, Copy, CheckCircle, FileText, Database, Package, DollarSign, FileUp, Clipboard, Edit2, X, Download, FileSpreadsheet, Trash2, Check, RefreshCw } from 'lucide-react';
import { useLocalStorage } from './hooks/useLocalStorage';
import { generateId, searchFilter } from './utils/helpers';
import { exportBOMToCSV } from './utils/csvExport';
import { exportSuppliersToCSV, importSuppliersFromFile, downloadSupplierTemplate } from './utils/csvSupplier';
import { exportChecklistToPDF } from './utils/pdfChecklist';
import { exportBOMToPDF, exportPOToPDF } from './utils/pdfExport';
import { parseExcelCostFile } from './utils/excelParser';
import { parseExcelV2 } from './utils/excelParser/index.js';
import { formatCurrency } from './utils/pdfParser';
import { smartParse, smartParseTabular } from './utils/advancedParser';
import { extractTabularData } from './utils/pdfExtractor';
import { extractTextSmart } from './utils/ocrClient';
import FileUploader from './components/FileUploader';
import ImportPreview from './components/ImportPreview';
import Modal from './components/Modal';
import { useSyncedState } from './hooks/useSyncedState';
import { useSupabaseProjects, useSupabaseSuppliers } from './hooks/useSupabaseTable';
import Auth from './components/Auth';
import { User, Cloud, CloudOff } from 'lucide-react';
import { STORAGE_KEYS } from './utils/storage';
import SearchBar from './components/SearchBar';
import ProjectCard from './components/ProjectCard';
import SupplierCard from './components/SupplierCard';
import EditableBOMTable from './components/EditableBOMTable';
import SupplierTrackedBOM from './components/SupplierTrackedBOM';
import ChecklistBOM from './components/ChecklistBOM';
import ItemDatabase from './components/ItemDatabase';
import MondayEntryGenerator from './components/MondayEntryGenerator';
import { AutocompleteItemInput } from './components/AutocompleteItemInput';
import { standardCatalog } from './data/standardCatalog';
import SuggestedSuppliers from './components/SuggestedSuppliers';
import { List, ClipboardList } from 'lucide-react';
import PublicDashboard from './components/PublicDashboard';
import CatalogPicker from './components/CatalogPicker';
import QuotesTracker from './components/QuotesTracker';

const generateSafeId = () => {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
};

const LogisticsSystem = () => {
    const [activeTab, setActiveTab] = useState('projects');
    const [projects, setProjects, user, projectsSync] = useSupabaseProjects();
    const [suppliers, setSuppliers] = useSupabaseSuppliers();
    const [itemCatalog, setItemCatalog] = useSyncedState(STORAGE_KEYS.ITEM_CATALOG, standardCatalog);
    const [showAuth, setShowAuth] = useState(false);

    // Migration: Ensure all projects have IDs
    React.useEffect(() => {
        if (projects.length > 0) {
            const hasMissingIds = projects.some(p => !p.id);
            if (hasMissingIds) {
                setProjects(prev => prev.map(p => p.id ? p : { ...p, id: generateSafeId() }));
            }
        }
    }, [projects.length]); // Only run when count changes

    // ─── Backup: export / import projects + suppliers as a JSON file ─────────
    // Browser localStorage is per-origin, so the live site can't see data saved
    // on localhost. This lets you move data between origins (and make real backups).
    const backupFileRef = useRef(null);

    const exportBackup = () => {
        const payload = {
            app: 'artseven-special-force-logistic',
            version: 1,
            exportedAt: new Date().toISOString(),
            projects: projects || [],
            suppliers: suppliers || [],
            itemCatalog: itemCatalog || [],
        };
        const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `logistics-backup-${new Date().toISOString().slice(0, 10)}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    };

    const importBackup = (file) => {
        if (!file) return;
        const reader = new FileReader();
        reader.onload = () => {
            try {
                const data = JSON.parse(reader.result);
                const incomingProjects = Array.isArray(data.projects) ? data.projects : [];
                const incomingSuppliers = Array.isArray(data.suppliers) ? data.suppliers : [];
                const incomingCatalog = Array.isArray(data.itemCatalog) ? data.itemCatalog : null;

                if (incomingProjects.length === 0 && incomingSuppliers.length === 0) {
                    window.alert('This backup contains no projects or suppliers.');
                    return;
                }

                const replace = window.confirm('Replace current data, or merge?\n\nOK = Replace everything\nCancel = Merge (keeps existing entries, adds any new ones)');

                if (replace) {
                    setProjects(incomingProjects);
                    setSuppliers(incomingSuppliers.length ? incomingSuppliers : suppliers);
                    if (incomingCatalog) setItemCatalog(incomingCatalog);
                } else {
                    const byId = (list, idKey) => new Set((list || []).map(x => x[idKey]));
                    const knownProjects = byId(projects, 'id');
                    const knownSuppliers = byId(suppliers, 'id');
                    setProjects(prev => [...prev, ...incomingProjects.filter(p => !knownProjects.has(p.id))]);
                    setSuppliers(prev => [...prev, ...incomingSuppliers.filter(s => !knownSuppliers.has(s.id))]);
                    if (incomingCatalog) setItemCatalog(incomingCatalog);
                }

                window.alert(`Backup imported: ${incomingProjects.length} project(s), ${incomingSuppliers.length} supplier(s).`);
            } catch (error) {
                console.error('Backup import error:', error);
                window.alert('Could not read that file. Make sure it is a backup JSON exported from this app.');
            }
        };
        reader.readAsText(file);
    };

    const [selectedProject, setSelectedProject] = useState(null);
    const [showNewProject, setShowNewProject] = useState(false);
    const [showSupplierForm, setShowSupplierForm] = useState(false);
    const [copiedMessage, setCopiedMessage] = useState(false);
    const [pdfText, setPdfText] = useState('');
    const [parseMessage, setParseMessage] = useState('');
    const [parseMetadata, setParseMetadata] = useState(null);
    const [importMode, setImportMode] = useState('text'); // 'text' | 'file'
    const [isProcessing, setIsProcessing] = useState(false);
    const [processingStep, setProcessingStep] = useState('');
    const [previewData, setPreviewData] = useState(null);
    const [isEditingProject, setIsEditingProject] = useState(false);
    const [editedProject, setEditedProject] = useState(null);
    const [showSupplierImport, setShowSupplierImport] = useState(false);
    const [importResult, setImportResult] = useState(null);
    const [showCatalog, setShowCatalog] = useState(false);

    const [projectSearch, setProjectSearch] = useState('');
    const [supplierSearch, setSupplierSearch] = useState('');

    const [projectForm, setProjectForm] = useState({
        name: '',
        client: '',
        location: '',
        deliveryAddress: '',
        contactPerson: '',
        contactPhone: '',
        needByDate: '',
        quotationNumber: '',
        projectNumber: '',
        materials: [],
        status: 'Draft'
    });

    const [materialForm, setMaterialForm] = useState({
        category: '',
        item: '',
        quantity: '',
        unit: '',
        price: '',
        pricePerUnit: ''
    });

    const [supplierForm, setSupplierForm] = useState({
        name: '',
        categories: '',
        location: '',
        contact: '',
        whatsapp: '',
        accountNumber: '',
        bankName: ''
    });

    // Removal of old storage error logs

    const filteredProjects = useMemo(() => {
        return searchFilter(projects, projectSearch, ['name', 'client', 'location', 'quotationNumber', 'projectNumber']);
    }, [projects, projectSearch]);

    const filteredSuppliers = useMemo(() => {
        return searchFilter(suppliers, supplierSearch, ['name', 'location', 'contact']);
    }, [suppliers, supplierSearch]);

    const parseMaterialCost = (text) => {
        const materials = [];
        const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
        let currentCategory = 'Other';

        lines.forEach(line => {
            if (line.startsWith('REQUEST:') || line.startsWith('📍') || line.startsWith('📅') || line.startsWith('👤')) return;

            if (
                line.match(/^(Wall|Electrical|Paint|Fastener|Ceiling|New|PVC|GYPSUM|LIGHTING|HARDWARE)/i) ||
                (line.endsWith(':') && line.length < 80) ||
                (line.includes('(') && line.includes(')') && line.length < 100)
            ) {
                currentCategory = line.replace(/:$/, '').trim();
                return;
            }

            const numbered = line.match(/^\d+\.?\s*(.+?)(?:\s*-\s*)?(\d+(?:\.\d+)?)?\s*(pcs|rolls|bags|sets|sheets|box|boxes|bundle|bundles|roll|rolls|m|pair|set|etc)?$/i);
            if (numbered && numbered[1]?.trim()) {
                materials.push({
                    id: generateId(),
                    category: currentCategory,
                    item: numbered[1].trim(),
                    quantity: numbered[2] ? parseFloat(numbered[2]) : '?',
                    unit: numbered[3] || 'pcs'
                });
                return;
            }

            const fallback = line.match(/(.+?)\s*-?\s*(\d+(?:\.\d+)?)\s*(pcs|rolls|bags|sets|sheets|box|boxes|bundle|bundles|roll|rolls|m|pair|set|etc)?$/i);
            if (fallback && fallback[2]) {
                materials.push({
                    id: generateId(),
                    category: currentCategory,
                    item: fallback[1].trim(),
                    quantity: parseFloat(fallback[2]),
                    unit: fallback[3] || ''
                });
            }
        });

        return materials;
    };

    const handlePdfParse = () => {
        if (!pdfText.trim()) {
            setParseMessage('Please paste some text first');
            setParseMetadata(null);
            return;
        }

        // Use smartParse directly for consistency with file upload
        const result = smartParse(pdfText);

        if (result.materials.length > 0) {
            setPreviewData({ ...result, rawText: pdfText });
            setImportMode('preview');
            setParseMessage('');
            setParseMetadata(result.metadata);
        } else {
            setParseMessage('❌ No items found. Please check if text matches Job Cost or Material Cost format.');
            setParseMetadata(null);
        }
    };

    const handleFileUpload = async (file) => {
        if (!file) return;

        setIsProcessing(true);
        try {
            const fileName = file.name.toLowerCase();
            let result;

            if (fileName.endsWith('.xlsx') || fileName.endsWith('.xls')) {
                // Excel → V2 interpreter: adaptive layout/header/columns/sections,
                // confidence scoring, and catalog recognition. Falls back to the
                // legacy highlighted-RM template parser when nothing matches.
                setProcessingStep('Analysing workbook layout...');
                result = await parseExcelV2(file, { catalog: itemCatalog || [], ai: true });
                if (!result.success && result.lowConfidence?.length === 0) {
                    setProcessingStep('Falling back to template parser...');
                    result = await parseExcelCostFile(file);
                }
                result.rawText = result.rawText || `Excel Import: ${file.name}`;
                result.ocrMethod = 'excel';
            } else {
                // PDF → smart path: fast pdfjs detection first, then OCR backend for scanned docs
                const extracted = await extractTextSmart(file, { onStatus: setProcessingStep });

                if (extracted.method === 'pdfjs') {
                    // Text PDF → layout-aware tabular extraction for best column quality
                    setProcessingStep('Parsing structure...');
                    const tabularData = await extractTabularData(file);
                    const text = tabularData.map(p =>
                        p.tables.map(tableGrid => tableGrid.map(row => row.join('    ')).join('\n')).join('\n\n--- NEXT TABLE ZONE ---\n\n')
                    ).join('\n--- PAGE BREAK ---\n');

                    result = smartParseTabular(tabularData, text);
                    result.rawText = text;
                    result.ocrMethod = 'pdfjs';
                } else {
                    // Scanned PDF → OCR text, then structure parser
                    setProcessingStep('Parsing structure...');
                    result = smartParse(extracted.text);
                    result.rawText = extracted.text;
                    result.ocrMethod = extracted.method;
                    result.ocrPages = extracted.pages;
                }
            }

            setPreviewData(result);
            setImportMode('preview');
            setParseMetadata(result.metadata);
        } catch (error) {
            console.error('File Processing Error:', error);
            const msg = error.message || 'Unknown error';
            alert(`Failed to parse file (${msg}).\nPlease check the file format.`);
        }
        setIsProcessing(false);
        setProcessingStep('');
    };

    const confirmImport = (data) => {
        const { metadata, materials } = data;
        setProjectForm(prev => ({
            ...prev,
            // Fill available metadata
            name: metadata.projectName || prev.name,
            client: metadata.client || prev.client,
            projectNumber: metadata.projectNumber || prev.projectNumber,
            quotationNumber: metadata.quotationNumber || prev.quotationNumber,
            materials: materials
        }));
        setPreviewData(null);
        setImportMode('text'); // Return to default view but populated
        setParseMessage(`✅ Imported ${materials.length} items from file`);
    };

    const cancelImport = () => {
        setPreviewData(null);
        setImportMode('file');
    };

    const addMaterial = () => {
        if (!materialForm.item.trim()) return;
        setProjectForm(prev => ({
            ...prev,
            materials: [...prev.materials, { ...materialForm, id: generateSafeId() }]
        }));
        setMaterialForm({ category: '', item: '', quantity: '', unit: '' });
    };

    const removeMaterial = (id) => {
        setProjectForm(prev => ({
            ...prev,
            materials: prev.materials.filter(m => m.id !== id)
        }));
    };

    const saveProject = () => {
        if (!projectForm.name.trim() || projectForm.materials.length === 0) {
            alert('Project name and at least one material required');
            return;
        }
        const newProject = {
            ...projectForm,
            id: generateSafeId(),
            createdAt: new Date().toISOString()
        };
        setProjects(prev => [...prev, newProject]);

        setShowNewProject(false);
        setProjectForm({
            name: '', client: '', location: '', deliveryAddress: '',
            contactPerson: '', contactPhone: '', needByDate: '',
            quotationNumber: '', projectNumber: '', materials: [], status: 'Draft'
        });
        setPreviewData(null);
        setParseMetadata(null);
    };

    const discardNewProject = () => {
        if (window.confirm('Discard this draft project?')) {
            setShowNewProject(false);
            setProjectForm({
                name: '', client: '', location: '', deliveryAddress: '',
                contactPerson: '', contactPhone: '', needByDate: '',
                quotationNumber: '', projectNumber: '', materials: [], status: 'Draft'
            });
            setPreviewData(null);
            setParseMetadata(null);
        }
    };

    const updateProjectStatus = (projectId, newStatus) => {
        setProjects(prev => prev.map(p =>
            p.id === projectId ? { ...p, status: newStatus } : p
        ));
        if (selectedProject?.id === projectId) {
            setSelectedProject({ ...selectedProject, status: newStatus });

            if (isEditingProject && editedProject?.id === projectId) {
                setEditedProject({ ...editedProject, status: newStatus });
            }
        }
    };

    const updateProjectQuotes = (projectId, quotes) => {
        setProjects(prev => prev.map(p =>
            p.id === projectId ? { ...p, quotes } : p
        ));
        if (selectedProject?.id === projectId) {
            setSelectedProject({ ...selectedProject, quotes });

            if (isEditingProject && editedProject?.id === projectId) {
                setEditedProject({ ...editedProject, quotes });
            }
        }
    };

    const updateProjectMaterial = (projectId, materialId, updates) => {
        setProjects(prev => prev.map(p => {
            if (p.id === projectId) {
                return {
                    ...p,
                    materials: p.materials.map(m => m.id === materialId ? { ...m, ...updates } : m)
                };
            }
            return p;
        }));
        if (selectedProject?.id === projectId) {
            const updatedMaterials = selectedProject.materials.map(m => m.id === materialId ? { ...m, ...updates } : m);
            setSelectedProject({
                ...selectedProject,
                materials: updatedMaterials
            });

            if (isEditingProject && editedProject?.id === projectId) {
                setEditedProject({
                    ...editedProject,
                    materials: updatedMaterials
                });
            }
        }
    };

    const bulkUpdateProjectMaterials = (projectId, updateList) => {
        // updateList is an array of { id, updates }
        setProjects(prev => prev.map(p => {
            if (p.id === projectId) {
                const updatedMaterials = p.materials.map(m => {
                    const update = updateList.find(u => u.id === m.id);
                    return update ? { ...m, ...update.updates } : m;
                });
                return { ...p, materials: updatedMaterials };
            }
            return p;
        }));

        if (selectedProject?.id === projectId) {
            const updatedMaterials = selectedProject.materials.map(m => {
                const update = updateList.find(u => u.id === m.id);
                return update ? { ...m, ...update.updates } : m;
            });
            setSelectedProject({ ...selectedProject, materials: updatedMaterials });

            if (isEditingProject && editedProject?.id === projectId) {
                setEditedProject({ ...editedProject, materials: updatedMaterials });
            }
        }
    };

    const removeProjectMaterial = (projectId, materialId) => {
        setProjects(prev => prev.map(p => {
            if (p.id === projectId) {
                return {
                    ...p,
                    materials: p.materials.filter(m => m.id !== materialId)
                };
            }
            return p;
        }));
        if (selectedProject?.id === projectId) {
            const updatedMaterials = selectedProject.materials.filter(m => m.id !== materialId);
            setSelectedProject({
                ...selectedProject,
                materials: updatedMaterials
            });

            if (isEditingProject && editedProject?.id === projectId) {
                setEditedProject({
                    ...editedProject,
                    materials: updatedMaterials
                });
            }
        }
    };

    const upsertMaterials = (list, material, merge) => {
        const base = Array.isArray(list) ? list : [];
        if (!merge) return [...base, material];

        const idx = base.findIndex(m =>
            m && String(m.item || '').trim().toLowerCase() === String(material.item || '').trim().toLowerCase()
        );
        if (idx === -1) return [...base, material];

        const existing = base[idx];
        const quantity = (Number(existing.quantity) || 0) + (Number(material.quantity) || 0);
        const unit = existing.pricePerUnit ?? material.pricePerUnit ?? null;
        const total = Math.isFinite(Number(unit))
            ? quantity * Number(unit)
            : (Number(existing.total) || 0) + (Number(material.total) || 0);
        const next = [...base];
        next[idx] = { ...existing, quantity, pricePerUnit: unit, price: total, total };
        return next;
    };

    const addProjectMaterial = (projectId, material, merge = false) => {
        setProjects(prev => prev.map(p => {
            if (p.id === projectId) {
                return { ...p, materials: upsertMaterials(p.materials, material, merge) };
            }
            return p;
        }));
        if (selectedProject?.id === projectId) {
            const updatedMaterials = upsertMaterials(selectedProject.materials, material, merge);
            setSelectedProject({
                ...selectedProject,
                materials: updatedMaterials
            });

            if (isEditingProject && editedProject?.id === projectId) {
                setEditedProject({
                    ...editedProject,
                    materials: updatedMaterials
                });
            }
        }
    };

    const deleteProject = (id) => {
        if (!window.confirm('Are you sure you want to delete this project? This action cannot be undone.')) return;
        setProjects(prev => prev.filter(p => p.id !== id));
        if (selectedProject?.id === id) {
            closeProjectModal();
        }
    };

    const startEditingProject = () => {
        setIsEditingProject(true);
        // Create a deep copy to avoid shared references for materials
        setEditedProject(JSON.parse(JSON.stringify(selectedProject)));
    };

    const cancelEditingProject = () => {
        setIsEditingProject(false);
        setEditedProject(null);
    };

    const saveProjectEdits = () => {
        if (!editedProject) return;
        setProjects(prev => prev.map(p =>
            p.id === editedProject.id ? editedProject : p
        ));
        setSelectedProject(JSON.parse(JSON.stringify(editedProject)));
        setIsEditingProject(false);
        setEditedProject(null);
    };

    const closeProjectModal = () => {
        setSelectedProject(null);
        setIsEditingProject(false);
        setEditedProject(null);
    };

    const copyToClipboard = (text) => {
        navigator.clipboard.writeText(text).then(() => {
            setCopiedMessage(true);
            setTimeout(() => setCopiedMessage(false), 1800);
        });
    };

    const addSupplier = () => {
        if (!supplierForm.name.trim()) return;
        const newSupplier = {
            id: generateId(),
            name: supplierForm.name.trim(),
            categories: supplierForm.categories.split(',').map(c => c.trim()).filter(Boolean),
            location: supplierForm.location.trim(),
            contact: supplierForm.contact.trim(),
            whatsapp: supplierForm.whatsapp.trim(),
            accountNumber: supplierForm.accountNumber.trim(),
            bankName: supplierForm.bankName.trim()
        };
        setSuppliers(prev => [...prev, newSupplier]);
        setShowSupplierForm(false);
        setSupplierForm({ name: '', categories: '', location: '', contact: '', whatsapp: '', accountNumber: '', bankName: '' });
    };

    const deleteSupplier = (id) => {
        if (!window.confirm('Delete this supplier? All associated data will be removed.')) return;
        setSuppliers(prev => prev.filter(s => String(s.id) !== String(id)));
    };

    const mergeSuppliers = (existing, incoming) => {
        const merged = [...existing];
        incoming.forEach(newSup => {
            const existingIndex = merged.findIndex(s => s.name.toLowerCase() === newSup.name.toLowerCase());
            if (existingIndex !== -1) {
                const existingSup = merged[existingIndex];
                const categorySet = new Set([...existingSup.categories, ...newSup.categories]);
                merged[existingIndex] = {
                    ...existingSup,
                    categories: Array.from(categorySet).sort(),
                    location: existingSup.location || newSup.location,
                    contact: existingSup.contact || newSup.contact,
                    whatsapp: existingSup.whatsapp || newSup.whatsapp,
                    accountNumber: existingSup.accountNumber || newSup.accountNumber,
                    bankName: existingSup.bankName || newSup.bankName
                };
            } else {
                merged.push(newSup);
            }
        });
        return merged;
    };

    const handleSupplierImport = async (file) => {
        try {
            const result = await importSuppliersFromFile(file);
            setImportResult(result);

            if (result.errors.length === 0) {
                // No errors, merge all suppliers
                setSuppliers(prev => mergeSuppliers(prev, result.suppliers));
                alert(`Successfully processed ${result.suppliers.length} supplier(s)`);
                setShowSupplierImport(false);
                setImportResult(null);
            }
        } catch (error) {
            alert(`Import failed: ${error.message}`);
        }
    };

    const confirmImportWithErrors = () => {
        if (importResult && importResult.suppliers.length > 0) {
            setSuppliers(prev => mergeSuppliers(prev, importResult.suppliers));
            alert(`Processed ${importResult.suppliers.length} supplier(s) with ${importResult.errors.length} error(s) skipped`);
            setShowSupplierImport(false);
            setImportResult(null);
        }
    };

    const updateSupplier = (updatedSupplier) => {
        setSuppliers(prev => prev.map(s =>
            s.id === updatedSupplier.id ? updatedSupplier : s
        ));
    };

    const generatePO = (project) => {
        const acceptedQuote = (project.quotes || []).find(q => q.status === 'Accepted');
        const supplier = acceptedQuote
            ? suppliers.find(s => String(s.id) === String(acceptedQuote.supplierId))
            : suppliers[0];
        if (!supplier) {
            alert('Add a supplier first (Suppliers tab) before generating a PO.');
            return;
        }
        exportPOToPDF(project, supplier);
    };

    return (
        <div className={`min-h-screen ${!user ? 'bg-[#0a0a0f]' : 'bg-gray-50'}`}>
            <div className={`${!user ? 'bg-[#0a0a0f] border-b border-white/10' : 'bg-blue-700'} text-white p-6 shadow flex justify-between items-center relative z-50`}>
                <div>
                    <h1 className="text-3xl font-bold">Artseven Special Force Logistic</h1>
                    <p className="text-blue-100 mt-1 flex items-center gap-2 text-sm">
                        <Cloud size={14} className={user ? "text-green-400" : "text-blue-300"} />
                        {user ? (
                            <span className="font-semibold text-green-400">Cloud Sync Active • {user.email}</span>
                        ) : (
                            <span className="text-blue-200">Cloud Backup Active (Anonymous)</span>
                        )}
                    </p>
                </div>
                <div className="relative">
                    {!user ? (
                        <button
                            id="auth-toggle-button"
                            onClick={() => setShowAuth(!showAuth)}
                            className={`bg-white/10 hover:bg-white/20 text-white px-4 py-2 rounded-xl flex items-center gap-2 font-semibold transition-all backdrop-blur-md border border-white/20 ${showAuth ? 'ring-2 ring-white/50 bg-white/20' : ''}`}
                        >
                            <User size={18} /> Sign In to Sync
                        </button>
                    ) : (
                        <Auth user={user} onSignOut={() => setShowAuth(false)} />
                    )}

                    {showAuth && !user && (
                        <div className="absolute right-0 top-full mt-4 z-[100] animate-in fade-in slide-in-from-top-2 duration-200">
                            <Auth user={user} onClose={() => setShowAuth(false)} />
                        </div>
                    )}
                </div>
            </div>

            {!user ? (
                <PublicDashboard projects={projects} onSignInRequest={() => setShowAuth(true)} />
            ) : (
                <>
                    <div className="bg-white border-b shadow-sm">
                        <div className="max-w-7xl mx-auto px-6">
                            <div className="flex space-x-10">
                        <button
                            onClick={() => setActiveTab('projects')}
                            className={`py-4 px-3 font-medium flex items-center gap-2 border-b-2 transition-colors ${activeTab === 'projects' ? 'border-blue-700 text-blue-700' : 'border-transparent text-gray-600 hover:text-gray-800'
                                }`}
                        >
                            <Package size={20} /> Projects
                        </button>
                        <button
                            onClick={() => setActiveTab('suppliers')}
                            className={`py-4 px-3 font-medium flex items-center gap-2 border-b-2 transition-colors ${activeTab === 'suppliers' ? 'border-blue-700 text-blue-700' : 'border-transparent text-gray-600 hover:text-gray-800'
                                }`}
                        >
                            <Database size={20} /> Suppliers
                        </button>
                        <button
                            onClick={() => setActiveTab('items')}
                            className={`py-4 px-3 font-medium flex items-center gap-2 border-b-2 transition-colors ${activeTab === 'items' ? 'border-blue-700 text-blue-700' : 'border-transparent text-gray-600 hover:text-gray-800'
                                }`}
                        >
                            <List size={20} /> Items
                        </button>
                        <button
                            onClick={() => setActiveTab('monday')}
                            className={`py-4 px-3 font-medium flex items-center gap-2 border-b-2 transition-colors ${activeTab === 'monday' ? 'border-blue-700 text-blue-700' : 'border-transparent text-gray-600 hover:text-gray-800'
                                }`}
                        >
                            <ClipboardList size={20} /> Monday
                        </button>
                    </div>
                </div>
            </div>

            <div className="max-w-7xl mx-auto p-6">
                {activeTab === 'projects' && (
                    <>
                        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
                            <h2 className="text-2xl font-bold text-gray-800">Projects</h2>
                            <div className="flex flex-col sm:flex-row gap-4 w-full sm:w-auto">
                                <div className="w-full sm:w-64">
                                    <SearchBar
                                        value={projectSearch}
                                        onChange={setProjectSearch}
                                        placeholder="Search projects..."
                                    />
                                </div>
                                <div className="flex gap-2">
                                    <input
                                        ref={backupFileRef}
                                        type="file"
                                        accept=".json,application/json"
                                        className="hidden"
                                        onChange={(e) => {
                                            importBackup(e.target.files[0]);
                                            e.target.value = '';
                                        }}
                                    />
                                    <button
                                        onClick={() => backupFileRef.current?.click()}
                                        title="Import a backup JSON (e.g. exported from a local copy)"
                                        className="border border-gray-300 text-gray-700 px-4 py-2.5 rounded-lg hover:bg-gray-50 flex items-center gap-2 font-medium transition-colors"
                                    >
                                        <Upload size={16} /> Import
                                    </button>
                                    <button
                                        onClick={exportBackup}
                                        title="Download all projects and suppliers as a JSON backup"
                                        className="border border-gray-300 text-gray-700 px-4 py-2.5 rounded-lg hover:bg-gray-50 flex items-center gap-2 font-medium transition-colors"
                                    >
                                        <Download size={16} /> Export
                                    </button>
                                    <button
                                        onClick={() => projectsSync?.restoreFromCloud?.()}
                                        disabled={!user || !projectsSync?.online}
                                        title={user ? 'Pull latest from the cloud (merges with local data)' : 'Sign in to restore from the cloud'}
                                        className="border border-gray-300 text-gray-700 px-4 py-2.5 rounded-lg hover:bg-gray-50 flex items-center gap-2 font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                                    >
                                        <RefreshCw size={16} /> Restore
                                    </button>
                                    <button
                                        onClick={() => setShowNewProject(true)}
                                        className="bg-blue-700 text-white px-5 py-2.5 rounded-lg hover:bg-blue-800 flex items-center gap-2 shadow-sm transition-colors"
                                    >
                                        <Plus size={18} /> New Project
                                    </button>
                                </div>
                            </div>
                        </div>

                        {user ? (
                            <div className="mb-4 flex flex-wrap items-center gap-2 text-xs text-gray-500">
                                {projectsSync.syncError ? (
                                    <>
                                        <CloudOff size={14} className="text-red-500" />
                                        <span className="text-red-600 font-medium">
                                            Cloud sync issue: {projectsSync.syncError}
                                        </span>
                                        <button
                                            onClick={() => projectsSync.restoreFromCloud()}
                                            className="text-blue-600 hover:underline font-medium"
                                        >
                                            Retry
                                        </button>
                                    </>
                                ) : projectsSync.online ? (
                                    <>
                                        <Cloud size={14} className="text-green-600" />
                                        <span>Cloud sync active</span>
                                        {projectsSync.lastSyncedAt && (
                                            <span>· Last synced {projectsSync.lastSyncedAt.toLocaleTimeString()}</span>
                                        )}
                                    </>
                                ) : (
                                    <>
                                        <CloudOff size={14} className="text-amber-500" />
                                        <span>Offline — showing local data only</span>
                                    </>
                                )}
                            </div>
                        ) : (
                            <div className="mb-4 flex items-center gap-2 text-xs text-gray-500">
                                <CloudOff size={14} className="text-amber-500" />
                                <span>Not signed in — sign in to sync projects to the cloud</span>
                            </div>
                        )}

                        {filteredProjects.length === 0 ? (
                            <div className="bg-white rounded-xl shadow p-12 text-center border border-gray-200">
                                <FileText size={64} className="text-gray-300 mx-auto mb-4" />
                                <p className="text-gray-600 text-lg">
                                    {projectSearch ? 'No projects match your search.' : 'No projects yet.'}<br />
                                    {!projectSearch && 'Create your first one to get started.'}
                                </p>
                            </div>
                        ) : (
                            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
                                {filteredProjects.map(project => (
                                    <ProjectCard
                                        key={project.id}
                                        project={project}
                                        onView={() => {
                                            setSelectedProject(project);
                                            setIsEditingProject(false);
                                            setEditedProject(null);
                                        }}
                                        onEdit={() => {
                                            setSelectedProject(project);
                                            setIsEditingProject(true);
                                            setEditedProject(JSON.parse(JSON.stringify(project)));
                                        }}
                                        onDelete={() => deleteProject(project.id)}
                                    />
                                ))}
                            </div>
                        )}

                        <Modal
                            isOpen={showNewProject}
                            onClose={() => setShowNewProject(false)}
                            title="Create New Project"
                        >
                            <div className="space-y-8">
                                {/* Import Method Tabs */}
                                {!previewData && (
                                    <div className="flex gap-4 border-b">
                                        <button
                                            onClick={() => setImportMode('text')}
                                            className={`pb-3 px-2 font-medium flex items-center gap-2 ${importMode === 'text'
                                                ? 'border-b-2 border-blue-600 text-blue-600'
                                                : 'text-gray-500 hover:text-gray-700'
                                                }`}
                                        >
                                            <Clipboard size={18} /> Paste Text
                                        </button>
                                        <button
                                            onClick={() => setImportMode('file')}
                                            className={`pb-3 px-2 font-medium flex items-center gap-2 ${importMode === 'file'
                                                ? 'border-b-2 border-blue-600 text-blue-600'
                                                : 'text-gray-500 hover:text-gray-700'
                                                }`}
                                        >
                                            <FileUp size={18} /> Upload PDF
                                        </button>
                                    </div>
                                )}

                                {importMode === 'preview' && previewData ? (
                                    <ImportPreview
                                        data={previewData}
                                        onConfirm={(data) => {
                                            confirmImport(data);
                                            // Auto-populate form
                                            setProjectForm(prev => ({
                                                ...prev,
                                                name: data.metadata.projectName || prev.name,
                                                client: data.metadata.client || prev.client,
                                                projectNumber: data.metadata.projectNumber || prev.projectNumber,
                                                quotationNumber: data.metadata.quotationNumber || prev.quotationNumber,
                                                materials: data.materials
                                            }));
                                            setImportMode('text'); // Go back to main form view
                                        }}
                                        onCancel={cancelImport}
                                    />
                                ) : (
                                    <div className="border rounded-xl p-5 bg-gray-50">
                                        <h4 className="font-semibold mb-3">
                                            {importMode === 'file' ? '1. Upload Quotation PDF' : '1. Paste Material Cost Text'}
                                        </h4>

                                        {importMode === 'file' ? (
                                            isProcessing ? (
                                                <div className="h-40 flex flex-col items-center justify-center text-gray-500">
                                                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mb-2"></div>
                                                    <p className="font-medium text-blue-700">{processingStep || 'Analyzing PDF structure...'}</p>
                                                    {processingStep.includes('OCR') && (
                                                        <p className="text-xs text-gray-400 mt-2 italic">This uses a vision model for scanned documents</p>
                                                    )}
                                                </div>
                                            ) : (
                                                <FileUploader onFileSelect={(file) => handleFileUpload(file)} />
                                            )
                                        ) : (
                                            <>
                                                <textarea
                                                    value={pdfText}
                                                    onChange={e => setPdfText(e.target.value)}
                                                    placeholder="Paste the text from your PDF here (Ctrl+A → Ctrl+C in PDF viewer)"
                                                    className="w-full h-40 border rounded-lg p-3 text-sm font-mono resize-y"
                                                />
                                                <div className="mt-3 flex items-center gap-4">
                                                    <button
                                                        onClick={handlePdfParse}
                                                        className="bg-green-600 text-white px-5 py-2.5 rounded-lg hover:bg-green-700 flex items-center gap-2"
                                                    >
                                                        <Upload size={18} /> Parse Text
                                                    </button>
                                                    {parseMessage && (
                                                        <span className={`text-sm ${parseMessage.includes('✅') ? 'text-green-600' : 'text-amber-600'}`}>
                                                            {parseMessage}
                                                        </span>
                                                    )}
                                                </div>
                                            </>
                                        )}
                                    </div>
                                )}

                                {!previewData && (
                                    <>
                                        <div className="border rounded-xl p-5">
                                            <h4 className="font-semibold mb-4">2. Project Details</h4>
                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                                <input
                                                    placeholder="Project Name *"
                                                    value={projectForm.name}
                                                    onChange={e => setProjectForm({ ...projectForm, name: e.target.value })}
                                                    className="border rounded-lg px-4 py-2.5 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                                />
                                                <input
                                                    placeholder="Project Number"
                                                    value={projectForm.projectNumber}
                                                    onChange={e => setProjectForm({ ...projectForm, projectNumber: e.target.value })}
                                                    className="border rounded-lg px-4 py-2.5"
                                                />
                                                <input
                                                    placeholder="Client Name"
                                                    value={projectForm.client}
                                                    onChange={e => setProjectForm({ ...projectForm, client: e.target.value })}
                                                    className="border rounded-lg px-4 py-2.5"
                                                />
                                                <input
                                                    placeholder="Location / Site"
                                                    value={projectForm.location}
                                                    onChange={e => setProjectForm({ ...projectForm, location: e.target.value })}
                                                    className="border rounded-lg px-4 py-2.5"
                                                />
                                                <input
                                                    placeholder="Quotation Number"
                                                    value={projectForm.quotationNumber}
                                                    onChange={e => setProjectForm({ ...projectForm, quotationNumber: e.target.value })}
                                                    className="border rounded-lg px-4 py-2.5"
                                                />
                                                <input
                                                    type="date"
                                                    value={projectForm.needByDate}
                                                    onChange={e => setProjectForm({ ...projectForm, needByDate: e.target.value })}
                                                    className="border rounded-lg px-4 py-2.5"
                                                />
                                                <input
                                                    placeholder="Contact Person"
                                                    value={projectForm.contactPerson}
                                                    onChange={e => setProjectForm({ ...projectForm, contactPerson: e.target.value })}
                                                    className="border rounded-lg px-4 py-2.5"
                                                />
                                                <input
                                                    placeholder="Contact Phone"
                                                    value={projectForm.contactPhone}
                                                    onChange={e => setProjectForm({ ...projectForm, contactPhone: e.target.value })}
                                                    className="border rounded-lg px-4 py-2.5"
                                                />
                                                <textarea
                                                    placeholder="Full Delivery Address"
                                                    value={projectForm.deliveryAddress}
                                                    onChange={e => setProjectForm({ ...projectForm, deliveryAddress: e.target.value })}
                                                    className="border rounded-lg px-4 py-2.5 col-span-2"
                                                    rows={2}
                                                />
                                            </div>
                                        </div>

                                        <div className="border rounded-xl p-5">
                                            <h4 className="font-semibold mb-4">3. Materials (edit if needed)</h4>

                                            <div className="grid grid-cols-5 gap-3 mb-5">
                                                <input
                                                    placeholder="Category"
                                                    value={materialForm.category}
                                                    onChange={e => setMaterialForm({ ...materialForm, category: e.target.value })}
                                                    className="border rounded-lg px-3 py-2 text-sm"
                                                />
                                                <div className="col-span-2">
                                                    <AutocompleteItemInput
                                                        placeholder="Item *"
                                                        value={materialForm.item}
                                                        onChange={val => setMaterialForm({ ...materialForm, item: val })}
                                                        onSelect={item => {
                                                            const qty = parseFloat(materialForm.quantity) || 0;
                                                            setMaterialForm({
                                                                ...materialForm,
                                                                item: item.name,
                                                                category: item.category,
                                                                pricePerUnit: item.price,
                                                                price: qty && item.price ? (qty * item.price).toFixed(2) : ''
                                                            });
                                                        }}
                                                        className="border rounded-lg px-3 py-2 text-sm w-full"
                                                        catalog={itemCatalog}
                                                    />
                                                </div>
                                                <input
                                                    placeholder="Qty"
                                                    value={materialForm.quantity}
                                                    onChange={e => setMaterialForm({ ...materialForm, quantity: e.target.value })}
                                                    className="border rounded-lg px-3 py-2 text-sm"
                                                />
                                                <input
                                                    placeholder="Unit"
                                                    value={materialForm.unit}
                                                    onChange={e => setMaterialForm({ ...materialForm, unit: e.target.value })}
                                                    className="border rounded-lg px-3 py-2 text-sm"
                                                />
                                                <button
                                                    onClick={addMaterial}
                                                    className="bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center justify-center"
                                                >
                                                    <Plus size={20} />
                                                </button>
                                            </div>

                                            <EditableBOMTable
                                                materials={projectForm.materials}
                                                onUpdate={(id, updates) => {
                                                    setProjectForm(prev => ({
                                                        ...prev,
                                                        materials: prev.materials.map(m => m.id === id ? { ...m, ...updates } : m)
                                                    }));
                                                }}
                                                onRemove={removeMaterial}
                                                onAdd={(material) => {
                                                    setProjectForm(prev => ({
                                                        ...prev,
                                                        materials: [...prev.materials, { ...material, id: generateSafeId() }]
                                                    }));
                                                }}
                                                showPrices={true}
                                                catalog={itemCatalog}
                                            />
                                        </div>

                                        <div className="flex justify-end gap-3 pt-6 border-t mt-8">
                                            <button
                                                onClick={discardNewProject}
                                                className="px-6 py-2.5 border border-gray-300 rounded-lg hover:bg-gray-50 text-red-600 font-medium transition-colors"
                                            >
                                                Discard Draft
                                            </button>
                                            <button
                                                onClick={saveProject}
                                                className="bg-blue-600 text-white px-8 py-2.5 rounded-lg hover:bg-blue-700 font-medium flex items-center gap-2 shadow-sm"
                                            >
                                                <Save size={18} /> Create Project
                                            </button>
                                        </div>
                                    </>
                                )}
                            </div>
                        </Modal>

                        <Modal
                            isOpen={!!selectedProject}
                            onClose={closeProjectModal}
                            title={selectedProject?.name || ''}
                            maxWidth="max-w-5xl"
                        >
                            {selectedProject && (
                                <div className="space-y-8">
                                    {isEditingProject ? (
                                        <div className="space-y-4 border rounded-xl p-5 bg-gray-50">
                                            <div className="flex justify-between items-center mb-4">
                                                <h4 className="font-semibold text-lg">Edit Project Details</h4>
                                                <div className="flex gap-2">
                                                    <button
                                                        onClick={cancelEditingProject}
                                                        className="px-4 py-2 border rounded-lg hover:bg-gray-100 flex items-center gap-2 text-sm"
                                                    >
                                                        <X size={16} /> Cancel
                                                    </button>
                                                    <button
                                                        onClick={saveProjectEdits}
                                                        className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 flex items-center gap-2 text-sm"
                                                    >
                                                        <Save size={16} /> Save Changes
                                                    </button>
                                                </div>
                                            </div>
                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                                <input
                                                    placeholder="Project Name *"
                                                    value={editedProject.name}
                                                    onChange={e => setEditedProject({ ...editedProject, name: e.target.value })}
                                                    className="border rounded-lg px-4 py-2.5"
                                                />
                                                <input
                                                    placeholder="Project Number"
                                                    value={editedProject.projectNumber || ''}
                                                    onChange={e => setEditedProject({ ...editedProject, projectNumber: e.target.value })}
                                                    className="border rounded-lg px-4 py-2.5"
                                                />
                                                <input
                                                    placeholder="Client Name"
                                                    value={editedProject.client || ''}
                                                    onChange={e => setEditedProject({ ...editedProject, client: e.target.value })}
                                                    className="border rounded-lg px-4 py-2.5"
                                                />
                                                <input
                                                    placeholder="Location / Site"
                                                    value={editedProject.location || ''}
                                                    onChange={e => setEditedProject({ ...editedProject, location: e.target.value })}
                                                    className="border rounded-lg px-4 py-2.5"
                                                />
                                                <input
                                                    placeholder="Quotation Number"
                                                    value={editedProject.quotationNumber || ''}
                                                    onChange={e => setEditedProject({ ...editedProject, quotationNumber: e.target.value })}
                                                    className="border rounded-lg px-4 py-2.5"
                                                />
                                                <input
                                                    type="date"
                                                    value={editedProject.needByDate || ''}
                                                    onChange={e => setEditedProject({ ...editedProject, needByDate: e.target.value })}
                                                    className="border rounded-lg px-4 py-2.5"
                                                />
                                                <input
                                                    placeholder="Contact Person"
                                                    value={editedProject.contactPerson || ''}
                                                    onChange={e => setEditedProject({ ...editedProject, contactPerson: e.target.value })}
                                                    className="border rounded-lg px-4 py-2.5"
                                                />
                                                <input
                                                    placeholder="Contact Phone"
                                                    value={editedProject.contactPhone || ''}
                                                    onChange={e => setEditedProject({ ...editedProject, contactPhone: e.target.value })}
                                                    className="border rounded-lg px-4 py-2.5"
                                                />
                                                <textarea
                                                    placeholder="Full Delivery Address"
                                                    value={editedProject.deliveryAddress || ''}
                                                    onChange={e => setEditedProject({ ...editedProject, deliveryAddress: e.target.value })}
                                                    className="border rounded-lg px-4 py-2.5 col-span-2"
                                                    rows={2}
                                                />
                                            </div>
                                        </div>
                                    ) : (
                                        <div className="flex justify-between items-start">
                                            <p className="text-sm text-gray-600">
                                                {selectedProject.projectNumber && <span className="font-semibold text-blue-700 mr-2">[{selectedProject.projectNumber}]</span>}
                                                {selectedProject.client || '—'} • {selectedProject.location || '—'}
                                            </p>
                                            <div className="flex gap-4">
                                                <button
                                                    onClick={startEditingProject}
                                                    className="text-blue-600 hover:text-blue-700 flex items-center gap-1 text-sm font-medium"
                                                >
                                                    <Edit2 size={16} /> Edit Details
                                                </button>
                                                <button
                                                    onClick={() => deleteProject(selectedProject.id)}
                                                    className="text-red-600 hover:text-red-700 flex items-center gap-1 text-sm font-medium"
                                                >
                                                    <Trash2 size={16} /> Delete Project
                                                </button>
                                            </div>
                                        </div>
                                    )}

                                    <div className="flex items-center gap-4">
                                        <label className="font-medium">Project Status:</label>
                                        <select
                                            value={selectedProject.status}
                                            onChange={e => updateProjectStatus(selectedProject.id, e.target.value)}
                                            className="border rounded-lg px-4 py-2.5 bg-white"
                                        >
                                            <option>Draft</option>
                                            <option>Quotes Requested</option>
                                            <option>Quotes Received</option>
                                            <option>Orders Placed</option>
                                            <option>Delivered</option>
                                            <option>Completed</option>
                                        </select>
                                    </div>

                                    <div>
                                        <div className="flex justify-between items-center mb-4">
                                            <h4 className="font-semibold text-lg">Bill of Materials</h4>
                                            {selectedProject.status === 'Delivered' ? (
                                                <button
                                                    onClick={() => exportChecklistToPDF(selectedProject, selectedProject.materials)}
                                                    className="bg-red-600 text-white px-5 py-2 rounded-lg hover:bg-red-700 flex items-center gap-2 text-sm shadow-sm transition-all active:scale-95"
                                                >
                                                    <FileText size={18} /> Download PDF Checklist
                                                </button>
                                            ) : (
                                                <div className="flex gap-2">
                                                    <button
                                                        onClick={() => setShowCatalog(true)}
                                                        className="bg-teal-600 text-white px-5 py-2 rounded-lg hover:bg-teal-700 flex items-center gap-2 text-sm shadow-sm transition-all active:scale-95"
                                                    >
                                                        <Package size={18} /> Add from Catalog
                                                    </button>
                                                    <button
                                                        onClick={() => exportBOMToCSV(selectedProject)}
                                                        className="bg-purple-600 text-white px-5 py-2 rounded-lg hover:bg-purple-700 flex items-center gap-2 text-sm shadow-sm transition-all active:scale-95"
                                                    >
                                                        <FileSpreadsheet size={18} /> Export CSV
                                                    </button>
                                                    <button
                                                        onClick={() => exportBOMToPDF(selectedProject)}
                                                        className="bg-red-600 text-white px-5 py-2 rounded-lg hover:bg-red-700 flex items-center gap-2 text-sm shadow-sm transition-all active:scale-95"
                                                    >
                                                        <FileText size={18} /> Download PDF
                                                    </button>
                                                    <button
                                                        onClick={() => generatePO(selectedProject)}
                                                        className="bg-slate-800 text-white px-5 py-2 rounded-lg hover:bg-slate-900 flex items-center gap-2 text-sm shadow-sm transition-all active:scale-95"
                                                        title="Generate a Purchase Order PDF (uses accepted-quote supplier, else first supplier)"
                                                    >
                                                        <DollarSign size={18} /> Generate PO
                                                    </button>
                                                </div>
                                            )}
                                        </div>

                                        {/* Conditional BOM View based on Project Status */}
                                        {selectedProject.status === 'Delivered' ? (
                                            <ChecklistBOM
                                                materials={selectedProject.materials}
                                                suppliers={suppliers}
                                                onUpdate={(id, updates) => updateProjectMaterial(selectedProject.id, id, updates)}
                                                onRemove={(id) => removeProjectMaterial(selectedProject.id, id)}
                                                showPrices={true}
                                                projectName={selectedProject.name}
                                            />
                                        ) : ['Quotes Received', 'Orders Placed', 'Completed'].includes(selectedProject.status) ? (
                                            <SupplierTrackedBOM
                                                materials={selectedProject.materials}
                                                suppliers={suppliers}
                                                onUpdate={(id, updates) => updateProjectMaterial(selectedProject.id, id, updates)}
                                                onRemove={(id) => removeProjectMaterial(selectedProject.id, id)}
                                                onBulkUpdate={(updates) => bulkUpdateProjectMaterials(selectedProject.id, updates)}
                                                showPrices={true}
                                            />
                                        ) : (
                                            <EditableBOMTable
                                                materials={selectedProject.materials}
                                                onUpdate={(id, updates) => updateProjectMaterial(selectedProject.id, id, updates)}
                                                onRemove={(id) => removeProjectMaterial(selectedProject.id, id)}
                                                onAdd={(material) => addProjectMaterial(selectedProject.id, material)}
                                                showPrices={true}
                                                catalog={itemCatalog}
                                            />
                                        )}
                                    </div>

                                    <div className="border rounded-xl p-4 bg-gray-50">
                                        <QuotesTracker
                                            quotes={selectedProject.quotes || []}
                                            suppliers={suppliers}
                                            onChange={(quotes) => updateProjectQuotes(selectedProject.id, quotes)}
                                        />
                                    </div>

                                    <div className="mb-6">
                                        <SuggestedSuppliers project={selectedProject} suppliers={suppliers} />
                                    </div>

                                    <Modal
                                        isOpen={showCatalog}
                                        onClose={() => setShowCatalog(false)}
                                        title="Add from Catalog"
                                        maxWidth="max-w-5xl"
                                    >
                                        <CatalogPicker
                                            catalog={itemCatalog}
                                            onAdd={(material) => addProjectMaterial(selectedProject.id, material, true)}
                                        />
                                    </Modal>

                                    <div className="pt-8 border-t flex justify-end">
                                        <button
                                            onClick={() => deleteProject(selectedProject.id)}
                                            className="bg-red-50 text-red-600 px-6 py-2.5 rounded-lg hover:bg-red-100 flex items-center gap-2 font-medium transition-colors"
                                        >
                                            <Trash2 size={18} /> Delete Project
                                        </button>
                                    </div>
                                </div>
                            )}
                        </Modal>
                    </>
                )}

                {activeTab === 'suppliers' && (
                    <>
                        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
                            <h2 className="text-2xl font-bold text-gray-800">Supplier Database</h2>
                            <div className="flex flex-col sm:flex-row gap-4 w-full sm:w-auto">
                                <div className="w-full sm:w-64">
                                    <SearchBar
                                        value={supplierSearch}
                                        onChange={setSupplierSearch}
                                        placeholder="Search suppliers..."
                                    />
                                </div>
                                <div className="flex gap-2">
                                    <button
                                        onClick={() => downloadSupplierTemplate()}
                                        className="bg-gray-600 text-white px-4 py-2.5 rounded-lg hover:bg-gray-700 flex items-center gap-2 shadow-sm transition-colors text-sm"
                                        title="Download CSV Template"
                                    >
                                        <Download size={18} /> Template
                                    </button>
                                    <button
                                        onClick={() => setShowSupplierImport(true)}
                                        className="bg-green-600 text-white px-4 py-2.5 rounded-lg hover:bg-green-700 flex items-center gap-2 shadow-sm transition-colors text-sm"
                                    >
                                        <FileUp size={18} /> Import CSV
                                    </button>
                                    <button
                                        onClick={() => exportSuppliersToCSV(suppliers)}
                                        className="bg-purple-600 text-white px-4 py-2.5 rounded-lg hover:bg-purple-700 flex items-center gap-2 shadow-sm transition-colors text-sm"
                                    >
                                        <FileSpreadsheet size={18} /> Export CSV
                                    </button>
                                    <button
                                        onClick={() => setShowSupplierForm(true)}
                                        className="bg-blue-700 text-white px-5 py-2.5 rounded-lg hover:bg-blue-800 flex items-center gap-2 shadow-sm transition-colors"
                                    >
                                        <Plus size={18} /> Add Supplier
                                    </button>
                                </div>
                            </div>
                        </div>

                        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
                            {filteredSuppliers.map(supplier => (
                                <SupplierCard
                                    key={supplier.id}
                                    supplier={supplier}
                                    onDelete={() => deleteSupplier(supplier.id)}
                                    onUpdate={updateSupplier}
                                />
                            ))}
                        </div>

                        <Modal
                            isOpen={showSupplierForm}
                            onClose={() => setShowSupplierForm(false)}
                            title="Add New Supplier"
                            maxWidth="max-w-lg"
                        >
                            <div className="space-y-5">
                                <input
                                    placeholder="Supplier Name *"
                                    value={supplierForm.name}
                                    onChange={e => setSupplierForm({ ...supplierForm, name: e.target.value })}
                                    className="w-full border rounded-lg px-4 py-2.5 focus:ring-2 focus:ring-blue-500"
                                />
                                <input
                                    placeholder="Categories (comma separated)"
                                    value={supplierForm.categories}
                                    onChange={e => setSupplierForm({ ...supplierForm, categories: e.target.value })}
                                    className="w-full border rounded-lg px-4 py-2.5"
                                />
                                <input
                                    placeholder="Location"
                                    value={supplierForm.location}
                                    onChange={e => setSupplierForm({ ...supplierForm, location: e.target.value })}
                                    className="w-full border rounded-lg px-4 py-2.5"
                                />
                                <input
                                    placeholder="Contact Number"
                                    value={supplierForm.contact}
                                    onChange={e => setSupplierForm({ ...supplierForm, contact: e.target.value })}
                                    className="w-full border rounded-lg px-4 py-2.5"
                                />
                                <input
                                    placeholder="WhatsApp Number"
                                    value={supplierForm.whatsapp}
                                    onChange={e => setSupplierForm({ ...supplierForm, whatsapp: e.target.value })}
                                    className="w-full border rounded-lg px-4 py-2.5"
                                />
                                <div className="grid grid-cols-2 gap-3">
                                    <input
                                        placeholder="Account Number"
                                        value={supplierForm.accountNumber}
                                        onChange={e => setSupplierForm({ ...supplierForm, accountNumber: e.target.value })}
                                        className="w-full border rounded-lg px-4 py-2.5 font-mono"
                                    />
                                    <input
                                        placeholder="Bank Name"
                                        value={supplierForm.bankName}
                                        onChange={e => setSupplierForm({ ...supplierForm, bankName: e.target.value })}
                                        className="w-full border rounded-lg px-4 py-2.5"
                                    />
                                </div>

                                <div className="flex justify-end gap-4 pt-4">
                                    <button
                                        onClick={() => setShowSupplierForm(false)}
                                        className="px-6 py-2.5 border rounded-lg hover:bg-gray-50"
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        onClick={addSupplier}
                                        className="bg-blue-700 text-white px-8 py-2.5 rounded-lg hover:bg-blue-800 flex items-center gap-2"
                                    >
                                        <Save size={18} /> Add Supplier
                                    </button>
                                </div>
                            </div>
                        </Modal>

                        <Modal
                            isOpen={showSupplierImport}
                            onClose={() => {
                                setShowSupplierImport(false);
                                setImportResult(null);
                            }}
                            title="Import Suppliers from CSV"
                            maxWidth="max-w-2xl"
                        >
                            <div className="space-y-5">
                                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                                    <h4 className="font-semibold text-blue-900 mb-2">CSV Format Instructions</h4>
                                    <p className="text-sm text-blue-800 mb-2">
                                        Your CSV file should have the following columns:
                                    </p>
                                    <code className="text-xs bg-white px-2 py-1 rounded block mb-2">
                                        Name,Categories,Location,Contact,WhatsApp
                                    </code>
                                    <ul className="text-sm text-blue-800 list-disc list-inside space-y-1">
                                        <li>Use semicolon (;) to separate multiple categories</li>
                                        <li>Example: "Gypsum;Metal Stud;Paint"</li>
                                        <li>Contact and WhatsApp are optional</li>
                                    </ul>
                                    <button
                                        onClick={downloadSupplierTemplate}
                                        className="mt-3 text-blue-700 hover:text-blue-900 text-sm font-medium underline"
                                    >
                                        Download Template CSV
                                    </button>
                                </div>

                                {!importResult ? (
                                    <div className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center">
                                        <FileSpreadsheet size={48} className="text-gray-400 mx-auto mb-4" />
                                        <p className="text-gray-600 mb-4">Choose a CSV file to import</p>
                                        <input
                                            type="file"
                                            accept=".csv"
                                            onChange={e => {
                                                const file = e.target.files?.[0];
                                                if (file) handleSupplierImport(file);
                                            }}
                                            className="block mx-auto"
                                        />
                                    </div>
                                ) : (
                                    <div className="space-y-4">
                                        {importResult.suppliers.length > 0 && (
                                            <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                                                <div className="flex items-center gap-2 mb-2">
                                                    <CheckCircle size={20} className="text-green-600" />
                                                    <h4 className="font-semibold text-green-900">
                                                        {importResult.suppliers.length} Supplier(s) Ready to Import
                                                    </h4>
                                                </div>
                                                <div className="max-h-40 overflow-y-auto">
                                                    {importResult.suppliers.map((s, i) => (
                                                        <div key={i} className="text-sm text-green-800 py-1">
                                                            ✓ {s.name} - {s.categories.join(', ')}
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        )}

                                        {importResult.errors.length > 0 && (
                                            <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
                                                <div className="flex items-center gap-2 mb-2">
                                                    <X size={20} className="text-amber-600" />
                                                    <h4 className="font-semibold text-amber-900">
                                                        {importResult.errors.length} Error(s) Found
                                                    </h4>
                                                </div>
                                                <div className="max-h-40 overflow-y-auto">
                                                    {importResult.errors.map((error, i) => (
                                                        <div key={i} className="text-sm text-amber-800 py-1">
                                                            • {error}
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        )}

                                        <div className="flex justify-end gap-3 pt-4 border-t">
                                            <button
                                                onClick={() => {
                                                    setShowSupplierImport(false);
                                                    setImportResult(null);
                                                }}
                                                className="px-6 py-2.5 border rounded-lg hover:bg-gray-50"
                                            >
                                                Cancel
                                            </button>
                                            {importResult.suppliers.length > 0 && (
                                                <button
                                                    onClick={confirmImportWithErrors}
                                                    className="bg-blue-600 text-white px-6 py-2.5 rounded-lg hover:bg-blue-700 flex items-center gap-2"
                                                >
                                                    <Save size={18} />
                                                    Import {importResult.suppliers.length} Supplier(s)
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                )}
                            </div>
                        </Modal>
                    </>
                )}

                {activeTab === 'items' && (
                    <ItemDatabase catalog={itemCatalog} setCatalog={setItemCatalog} />
                )}

                {activeTab === 'monday' && (
                    <MondayEntryGenerator
                        projects={projects}
                        suppliers={suppliers}
                        onUpdateSupplier={updateSupplier}
                    />
                )}
            </div>
                </>
            )}
        </div>
    );
};

export default LogisticsSystem;
