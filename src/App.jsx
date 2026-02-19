import React, { useState, useMemo } from 'react';
import { Upload, Plus, Save, Copy, CheckCircle, FileText, Database, Package, DollarSign, FileUp, Clipboard, Edit2, X, Download, FileSpreadsheet, Trash2 } from 'lucide-react';
import { useLocalStorage } from './hooks/useLocalStorage';
import { generateId, searchFilter } from './utils/helpers';
import { exportBOMToCSV } from './utils/csvExport';
import { exportSuppliersToCSV, importSuppliersFromFile, downloadSupplierTemplate } from './utils/csvSupplier';
import { exportChecklistToPDF } from './utils/pdfChecklist';
import { parseExcelCostFile } from './utils/excelParser';
import { parseDocument, formatCurrency } from './utils/pdfParser';
import { smartParse } from './utils/advancedParser';
import { convertPDFToText } from './utils/pdfExtractor';
import FileUploader from './components/FileUploader';
import ImportPreview from './components/ImportPreview';
import { STORAGE_KEYS } from './utils/storage';
import { INITIAL_SUPPLIERS, CATEGORY_KEYWORDS } from './data/initialData';
import SearchBar from './components/SearchBar';
import ProjectCard from './components/ProjectCard';
import SupplierCard from './components/SupplierCard';
import BOMTable from './components/BOMTable';
import EditableBOMTable from './components/EditableBOMTable';
import SupplierTrackedBOM from './components/SupplierTrackedBOM';
import ChecklistBOM from './components/ChecklistBOM';
import Modal from './components/Modal';

const LogisticsSystem = () => {
    const [activeTab, setActiveTab] = useState('projects');
    const [projects, setProjects, projectsError] = useLocalStorage(STORAGE_KEYS.PROJECTS, []);
    const [suppliers, setSuppliers, suppliersError] = useLocalStorage(STORAGE_KEYS.SUPPLIERS, INITIAL_SUPPLIERS);

    const [selectedProject, setSelectedProject] = useState(null);
    const [showNewProject, setShowNewProject] = useState(false);
    const [showSupplierForm, setShowSupplierForm] = useState(false);
    const [copiedMessage, setCopiedMessage] = useState(false);
    const [pdfText, setPdfText] = useState('');
    const [parseMessage, setParseMessage] = useState('');
    const [parseMetadata, setParseMetadata] = useState(null);
    const [importMode, setImportMode] = useState('text'); // 'text' | 'file'
    const [isProcessing, setIsProcessing] = useState(false);
    const [previewData, setPreviewData] = useState(null);
    const [isEditingProject, setIsEditingProject] = useState(false);
    const [editedProject, setEditedProject] = useState(null);
    const [showSupplierImport, setShowSupplierImport] = useState(false);
    const [importResult, setImportResult] = useState(null);

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
        whatsapp: ''
    });

    if (projectsError || suppliersError) {
        console.error('Storage error:', projectsError || suppliersError);
    }

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
                // Handle Excel import
                result = await parseExcelCostFile(file);
                // For Excel, we might not have raw text in the same way, 
                // but we can generate a previewable summary
                result.rawText = `Excel Import: ${file.name}\nSheets Processed: ${result.metadata.totalItems} items found.`;
            } else {
                // Default to PDF/Text handling
                const text = await convertPDFToText(file);
                result = smartParse(text);
                result.rawText = text;
            }

            setPreviewData(result);
            setImportMode('preview');
        } catch (error) {
            console.error('File Processing Error:', error);
            const msg = error.message || 'Unknown error';
            alert(`Failed to parse file (${msg}).\nPlease check the file format.`);
        }
        setIsProcessing(false);
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
            materials: [...prev.materials, { ...materialForm, id: generateId() }]
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
        const newProject = { ...projectForm, id: generateId(), createdAt: new Date().toISOString() };
        setProjects(prev => [...prev, newProject]);
        setShowNewProject(false);
        setProjectForm({
            name: '', client: '', location: '', deliveryAddress: '',
            contactPerson: '', contactPhone: '', needByDate: '',
            quotationNumber: '', projectNumber: '', materials: [], status: 'Draft'
        });
        setPdfText('');
        setParseMessage('');
        setImportMode('text');
        setPreviewData(null);
    };

    const updateProjectStatus = (projectId, newStatus) => {
        setProjects(prev => prev.map(p =>
            p.id === projectId ? { ...p, status: newStatus } : p
        ));
        if (selectedProject?.id === projectId) {
            setSelectedProject({ ...selectedProject, status: newStatus });
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
            setSelectedProject({
                ...selectedProject,
                materials: selectedProject.materials.map(m => m.id === materialId ? { ...m, ...updates } : m)
            });
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
            setSelectedProject({
                ...selectedProject,
                materials: selectedProject.materials.filter(m => m.id !== materialId)
            });
        }
    };

    const addProjectMaterial = (projectId, material) => {
        setProjects(prev => prev.map(p => {
            if (p.id === projectId) {
                return {
                    ...p,
                    materials: [...p.materials, material]
                };
            }
            return p;
        }));
        if (selectedProject?.id === projectId) {
            setSelectedProject({
                ...selectedProject,
                materials: [...selectedProject.materials, material]
            });
        }
    };

    const deleteProject = (id) => {
        if (!window.confirm('Are you sure you want to delete this project? This action cannot be undone.')) return;
        setProjects(prev => prev.filter(p => p.id !== id));
        if (selectedProject?.id === id) {
            setSelectedProject(null);
        }
    };

    const startEditingProject = () => {
        setIsEditingProject(true);
        setEditedProject({ ...selectedProject });
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
        setSelectedProject(editedProject);
        setIsEditingProject(false);
        setEditedProject(null);
    };

    const getSuggestedSuppliers = (materials) => {
        const matches = {};
        materials.forEach(m => {
            const text = (m.item + ' ' + m.category).toLowerCase();
            suppliers.forEach(sup => {
                sup.categories.forEach(cat => {
                    const keywords = CATEGORY_KEYWORDS[cat] || [cat.toLowerCase()];
                    if (keywords.some(k => text.includes(k))) {
                        if (!matches[sup.id]) matches[sup.id] = { supplier: sup, matches: [] };
                        matches[sup.id].matches.push(m.item);
                    }
                });
            });
        });
        return Object.values(matches).sort((a, b) => b.matches.length - a.matches.length);
    };

    const generateWhatsAppMessage = (project, supplier) => {
        const supplierMaterials = project.materials.filter(m => {
            const text = (m.item + ' ' + m.category).toLowerCase();
            return supplier.categories.some(cat => {
                const keywords = CATEGORY_KEYWORDS[cat] || [cat.toLowerCase()];
                return keywords.some(k => text.includes(k));
            });
        });

        if (supplierMaterials.length === 0) return '';

        const grouped = {};
        supplierMaterials.forEach(m => {
            if (!grouped[m.category]) grouped[m.category] = [];
            grouped[m.category].push(m);
        });

        let msg = `🟦 ${project.projectNumber || project.quotationNumber || project.name || 'PROJECT'}\n`;
        msg += 'Hi,\nNak order item ni ya:\n\n';

        Object.entries(grouped).forEach(([cat, items]) => {
            msg += `${cat}:\n`;
            items.forEach((item, i) => {
                msg += `${i + 1}. ${item.item}`;
                if (item.quantity !== '?') msg += ` - ${item.quantity} ${item.unit || ''}`;
                msg += '\n';
            });
            msg += '\n';
        });

        if (project.deliveryAddress) msg += `📍 Delivery: ${project.deliveryAddress}\n`;
        if (project.needByDate) msg += `📅 Need by: ${project.needByDate}\n`;
        if (project.contactPerson) {
            msg += `👤 Contact: ${project.contactPerson}`;
            if (project.contactPhone) msg += ` (${project.contactPhone})`;
            msg += '\n';
        }

        msg += '\nREQUEST:\n✅ Ada stock item?\n✅ Boleh hantar ke site?\n✅ Minta bil harga / Quotation (PDF) ya 🙏\nTerima kasih 👍🏻';

        return msg;
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
            whatsapp: supplierForm.whatsapp.trim()
        };
        setSuppliers(prev => [...prev, newSupplier]);
        setShowSupplierForm(false);
        setSupplierForm({ name: '', categories: '', location: '', contact: '', whatsapp: '' });
    };

    const deleteSupplier = (id) => {
        if (!window.confirm('Delete this supplier?')) return;
        setSuppliers(prev => prev.filter(s => s.id !== id));
    };

    const handleSupplierImport = async (file) => {
        try {
            const result = await importSuppliersFromFile(file);
            setImportResult(result);

            if (result.errors.length === 0) {
                // No errors, add all suppliers
                setSuppliers(prev => [...prev, ...result.suppliers]);
                alert(`Successfully imported ${result.suppliers.length} supplier(s)`);
                setShowSupplierImport(false);
                setImportResult(null);
            }
        } catch (error) {
            alert(`Import failed: ${error.message}`);
        }
    };

    const confirmImportWithErrors = () => {
        if (importResult && importResult.suppliers.length > 0) {
            setSuppliers([...suppliers, ...importResult.suppliers]);
            alert(`Imported ${importResult.suppliers.length} supplier(s) with ${importResult.errors.length} error(s) skipped`);
            setShowSupplierImport(false);
            setImportResult(null);
        }
    };

    const updateSupplier = (updatedSupplier) => {
        setSuppliers(prev => prev.map(s =>
            s.id === updatedSupplier.id ? updatedSupplier : s
        ));
    };

    const suggestedSuppliers = useMemo(() => {
        return selectedProject ? getSuggestedSuppliers(selectedProject.materials) : [];
    }, [selectedProject, suppliers]);

    return (
        <div className="min-h-screen bg-gray-50">
            <div className="bg-blue-700 text-white p-6 shadow">
                <h1 className="text-3xl font-bold">Construction Logistics Helper</h1>
                <p className="text-blue-100 mt-1">Material Cost → BOM → Suppliers → WhatsApp</p>
            </div>

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
                                <button
                                    onClick={() => setShowNewProject(true)}
                                    className="bg-blue-700 text-white px-5 py-2.5 rounded-lg hover:bg-blue-800 flex items-center gap-2 shadow-sm transition-colors"
                                >
                                    <Plus size={18} /> New Project
                                </button>
                            </div>
                        </div>

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
                                        onView={() => setSelectedProject(project)}
                                        onEdit={() => {
                                            setSelectedProject(project);
                                            setIsEditingProject(true);
                                            setEditedProject({ ...project });
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
                                                    <p>Analyzing PDF structure...</p>
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
                                                <input
                                                    placeholder="Item *"
                                                    value={materialForm.item}
                                                    onChange={e => setMaterialForm({ ...materialForm, item: e.target.value })}
                                                    className="border rounded-lg px-3 py-2 text-sm col-span-2"
                                                />
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

                                            <BOMTable
                                                materials={projectForm.materials}
                                                onRemove={removeMaterial}
                                                editable={true}
                                            />
                                        </div>

                                        <div className="flex justify-end gap-4 pt-4">
                                            <button
                                                onClick={() => setShowNewProject(false)}
                                                className="px-6 py-2.5 border rounded-lg hover:bg-gray-50"
                                            >
                                                Cancel
                                            </button>
                                            <button
                                                onClick={saveProject}
                                                className="bg-blue-700 text-white px-8 py-2.5 rounded-lg hover:bg-blue-800 flex items-center gap-2 shadow-sm"
                                            >
                                                <Save size={18} /> Save Project
                                            </button>
                                        </div>
                                    </>
                                )}
                            </div>
                        </Modal>

                        <Modal
                            isOpen={!!selectedProject}
                            onClose={() => setSelectedProject(null)}
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
                                            <button
                                                onClick={startEditingProject}
                                                className="text-blue-600 hover:text-blue-700 flex items-center gap-1 text-sm font-medium"
                                            >
                                                <Edit2 size={16} /> Edit Details
                                            </button>
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
                                                    className="bg-red-600 text-white px-5 py-2 rounded-lg hover:bg-red-700 flex items-center gap-2 text-sm"
                                                >
                                                    <FileText size={18} /> Download PDF Checklist
                                                </button>
                                            ) : (
                                                <button
                                                    onClick={() => exportBOMToCSV(selectedProject)}
                                                    className="bg-purple-600 text-white px-5 py-2 rounded-lg hover:bg-purple-700 flex items-center gap-2 text-sm"
                                                >
                                                    <FileText size={18} /> Export CSV
                                                </button>
                                            )}
                                        </div>

                                        {/* Conditional BOM View based on Project Status */}
                                        {selectedProject.status === 'Delivered' ? (
                                            <ChecklistBOM
                                                materials={selectedProject.materials}
                                                suppliers={suppliers}
                                                onUpdate={(id, updates) => updateProjectMaterial(selectedProject.id, id, updates)}
                                                showPrices={true}
                                            />
                                        ) : ['Quotes Received', 'Orders Placed', 'Completed'].includes(selectedProject.status) ? (
                                            <SupplierTrackedBOM
                                                materials={selectedProject.materials}
                                                suppliers={suppliers}
                                                onUpdate={(id, updates) => updateProjectMaterial(selectedProject.id, id, updates)}
                                                showPrices={true}
                                            />
                                        ) : (
                                            <EditableBOMTable
                                                materials={selectedProject.materials}
                                                onUpdate={(id, updates) => updateProjectMaterial(selectedProject.id, id, updates)}
                                                onRemove={(id) => removeProjectMaterial(selectedProject.id, id)}
                                                onAdd={(material) => addProjectMaterial(selectedProject.id, material)}
                                                showPrices={true}
                                            />
                                        )}
                                    </div>

                                    <div>
                                        <h4 className="font-semibold text-lg mb-4">Suggested Suppliers & Messages</h4>
                                        {suggestedSuppliers.length > 0 ? (
                                            <div className="space-y-4">
                                                {suggestedSuppliers.map(({ supplier, matches }) => (
                                                    <div key={supplier.id} className="border rounded-xl p-5 hover:shadow-md transition-shadow">
                                                        <div className="flex justify-between items-start gap-4">
                                                            <div className="flex-1">
                                                                <h5 className="font-bold text-lg">{supplier.name}</h5>
                                                                <p className="text-sm text-gray-600 mt-1">
                                                                    {supplier.location} • {supplier.contact}
                                                                    {supplier.whatsapp && ` • WA: ${supplier.whatsapp}`}
                                                                </p>
                                                                <div className="flex flex-wrap gap-2 mt-3">
                                                                    {supplier.categories.map((cat, idx) => (
                                                                        <span key={idx} className="px-3 py-1 bg-blue-50 text-blue-700 text-xs rounded-full">
                                                                            {cat}
                                                                        </span>
                                                                    ))}
                                                                </div>
                                                                <p className="text-xs text-gray-500 mt-3">
                                                                    Matches: {matches.slice(0, 6).join(', ')}
                                                                    {matches.length > 6 && ` +${matches.length - 6} more`}
                                                                </p>
                                                            </div>

                                                            <button
                                                                onClick={() => copyToClipboard(generateWhatsAppMessage(selectedProject, supplier))}
                                                                className="bg-green-600 text-white px-5 py-2.5 rounded-lg hover:bg-green-700 flex items-center gap-2 whitespace-nowrap"
                                                            >
                                                                {copiedMessage ? (
                                                                    <>
                                                                        <CheckCircle size={18} /> Copied!
                                                                    </>
                                                                ) : (
                                                                    <>
                                                                        <Copy size={18} /> Copy WA Message
                                                                    </>
                                                                )}
                                                            </button>
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        ) : (
                                            <p className="text-gray-500 text-center py-8">
                                                No matching suppliers found for the current materials.
                                            </p>
                                        )}
                                    </div>

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
            </div>
        </div>
    );
};

export default LogisticsSystem;
