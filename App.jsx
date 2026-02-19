import React, { useState, useMemo } from 'react';
import { Upload, Plus, Save, Copy, CheckCircle, FileText, Database, Package, DollarSign, FileUp, Clipboard } from 'lucide-react';
import { useLocalStorage } from './hooks/useLocalStorage';
import { generateId, searchFilter } from './utils/helpers';
import { exportBOMToCSV } from './utils/csvExport';
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
        return searchFilter(projects, projectSearch, ['name', 'client', 'location', 'quotationNumber']);
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
            const text = await convertPDFToText(file);
            const result = smartParse(text);
            setPreviewData({ ...result, rawText: text }); // Pass raw layout
            setImportMode('preview');
        } catch (error) {
            console.error('PDF Extraction Error:', error);
            const msg = error.message || 'Unknown error';
            alert(`Failed to parse PDF (${msg}).\n\nPlease try:\n1. Copy-pasting text instead (works best)\n2. Checking if PDF is scanned image`);
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
        setProjects([...projects, newProject]);
        setShowNewProject(false);
        setProjectForm({
            name: '', client: '', location: '', deliveryAddress: '',
            contactPerson: '', contactPhone: '', needByDate: '',
            quotationNumber: '', materials: [], status: 'Draft'
        });
        setPdfText('');
        setParseMessage('');
        setImportMode('text');
        setPreviewData(null);
    };

    const updateProjectStatus = (projectId, newStatus) => {
        const updatedProjects = projects.map(p =>
            p.id === projectId ? { ...p, status: newStatus } : p
        );
        setProjects(updatedProjects);
        if (selectedProject?.id === projectId) {
            setSelectedProject({ ...selectedProject, status: newStatus });
        }
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

        let msg = `🟦 ${project.quotationNumber || project.name || 'PROJECT'}\n`;
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
        setSuppliers([...suppliers, newSupplier]);
        setShowSupplierForm(false);
        setSupplierForm({ name: '', categories: '', location: '', contact: '', whatsapp: '' });
    };

    const deleteSupplier = (id) => {
        if (!window.confirm('Delete this supplier?')) return;
        setSuppliers(suppliers.filter(s => s.id !== id));
    };

    const suggestedSuppliers = useMemo(() => {
        return selectedProject ? getSuggestedSuppliers(selectedProject.materials) : [];
    }, [selectedProject, suppliers]);

    return (
        <div className="min-h-screen bg-gray-50">
            <div className="bg-blue-700 text-white p-6 shadow">
                <h1 className="text-3xl font-bold">Site Logistics Helper</h1>
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
                                    <p className="text-sm text-gray-600">
                                        {selectedProject.client || '—'} • {selectedProject.location || '—'}
                                    </p>

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
                                            <button
                                                onClick={() => exportBOMToCSV(selectedProject)}
                                                className="bg-purple-600 text-white px-5 py-2 rounded-lg hover:bg-purple-700 flex items-center gap-2 text-sm"
                                            >
                                                <FileText size={18} /> Export CSV
                                            </button>
                                        </div>
                                        <BOMTable materials={selectedProject.materials} editable={false} />
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
                                <button
                                    onClick={() => setShowSupplierForm(true)}
                                    className="bg-blue-700 text-white px-5 py-2.5 rounded-lg hover:bg-blue-800 flex items-center gap-2 shadow-sm transition-colors"
                                >
                                    <Plus size={18} /> Add Supplier
                                </button>
                            </div>
                        </div>

                        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
                            {filteredSuppliers.map(supplier => (
                                <SupplierCard
                                    key={supplier.id}
                                    supplier={supplier}
                                    onDelete={() => deleteSupplier(supplier.id)}
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
                    </>
                )}
            </div>
        </div>
    );
};

export default LogisticsSystem;
