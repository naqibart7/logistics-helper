import React, { useState } from 'react';
import { Trash2, Edit2, Save, X } from 'lucide-react';

const SupplierCard = ({ supplier, onDelete, onUpdate }) => {
    const [isEditing, setIsEditing] = useState(false);
    const [editForm, setEditForm] = useState({
        name: supplier.name,
        categories: supplier.categories.join(', '),
        location: supplier.location,
        contact: supplier.contact,
        whatsapp: supplier.whatsapp || '',
        accountNumber: supplier.accountNumber || '',
        bankName: supplier.bankName || ''
    });

    const handleSave = () => {
        const updated = {
            ...supplier,
            name: editForm.name.trim(),
            categories: editForm.categories.split(',').map(c => c.trim()).filter(Boolean),
            location: editForm.location.trim(),
            contact: editForm.contact.trim(),
            whatsapp: editForm.whatsapp.trim(),
            accountNumber: editForm.accountNumber.trim(),
            bankName: editForm.bankName.trim()
        };
        onUpdate(updated);
        setIsEditing(false);
    };

    const handleCancel = () => {
        setEditForm({
            name: supplier.name,
            categories: supplier.categories.join(', '),
            location: supplier.location,
            contact: supplier.contact,
            whatsapp: supplier.whatsapp || '',
            accountNumber: supplier.accountNumber || '',
            bankName: supplier.bankName || ''
        });
        setIsEditing(false);
    };

    if (isEditing) {
        return (
            <div className="bg-white rounded-xl shadow border-2 border-blue-300 p-5">
                <div className="space-y-4">
                    <input
                        value={editForm.name}
                        onChange={e => setEditForm({ ...editForm, name: e.target.value })}
                        placeholder="Supplier Name *"
                        className="w-full border rounded-lg px-3 py-2 text-lg font-bold focus:ring-2 focus:ring-blue-500"
                    />
                    <input
                        value={editForm.location}
                        onChange={e => setEditForm({ ...editForm, location: e.target.value })}
                        placeholder="Location"
                        className="w-full border rounded-lg px-3 py-2 text-sm"
                    />
                    <div className="grid grid-cols-2 gap-3">
                        <input
                            value={editForm.contact}
                            onChange={e => setEditForm({ ...editForm, contact: e.target.value })}
                            placeholder="Contact Number"
                            className="border rounded-lg px-3 py-2 text-sm"
                        />
                        <input
                            value={editForm.whatsapp}
                            onChange={e => setEditForm({ ...editForm, whatsapp: e.target.value })}
                            placeholder="WhatsApp Number"
                            className="border rounded-lg px-3 py-2 text-sm"
                        />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                        <input
                            value={editForm.accountNumber}
                            onChange={e => setEditForm({ ...editForm, accountNumber: e.target.value })}
                            placeholder="Account Number"
                            className="border rounded-lg px-3 py-2 text-sm font-mono"
                        />
                        <input
                            value={editForm.bankName}
                            onChange={e => setEditForm({ ...editForm, bankName: e.target.value })}
                            placeholder="Bank Name"
                            className="border rounded-lg px-3 py-2 text-sm"
                        />
                    </div>
                    <div>
                        <label className="block text-xs font-medium text-gray-700 mb-1">
                            Categories (comma separated)
                        </label>
                        <input
                            value={editForm.categories}
                            onChange={e => setEditForm({ ...editForm, categories: e.target.value })}
                            placeholder="e.g. Gypsum, Metal Stud, Paint"
                            className="w-full border rounded-lg px-3 py-2 text-sm"
                        />
                    </div>
                    <div className="flex justify-end gap-2 pt-2">
                        <button
                            onClick={handleCancel}
                            className="px-4 py-2 border rounded-lg hover:bg-gray-50 flex items-center gap-2 text-sm"
                        >
                            <X size={16} /> Cancel
                        </button>
                        <button
                            onClick={handleSave}
                            className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 flex items-center gap-2 text-sm"
                        >
                            <Save size={16} /> Save Changes
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="bg-white rounded-xl shadow border border-gray-200 p-5 hover:shadow-md transition-shadow">
            <div className="flex justify-between items-start">
                <div className="flex-1">
                    <h3 className="font-bold text-lg text-gray-900">{supplier.name}</h3>
                    <p className="text-sm text-gray-600 mt-1.5">
                        📍 {supplier.location || '—'} • 📞 {supplier.contact || '—'}
                    </p>
                    {supplier.whatsapp && (
                        <p className="text-sm text-gray-600 mt-1">💬 WA: {supplier.whatsapp}</p>
                    )}
                    {(supplier.accountNumber || supplier.bankName) && (
                        <p className="text-sm text-gray-600 mt-1 font-mono">
                            🏦 {supplier.accountNumber || '—'} {supplier.bankName ? `(${supplier.bankName})` : ''}
                        </p>
                    )}
                    <div className="flex flex-wrap gap-2 mt-4">
                        {supplier.categories.map((cat, idx) => (
                            <span
                                key={idx}
                                className="px-3 py-1 bg-blue-50 text-blue-700 text-sm rounded-full"
                            >
                                {cat}
                            </span>
                        ))}
                    </div>
                </div>
                <div className="flex gap-2">
                    <button
                        onClick={() => setIsEditing(true)}
                        className="text-blue-600 hover:text-blue-800 p-2 transition-colors"
                        aria-label="Edit supplier"
                    >
                        <Edit2 size={20} />
                    </button>
                    <button
                        onClick={onDelete}
                        className="text-red-600 hover:text-red-800 p-2 transition-colors"
                        aria-label="Delete supplier"
                    >
                        <Trash2 size={20} />
                    </button>
                </div>
            </div>
        </div>
    );
};

export default SupplierCard;
