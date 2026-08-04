import React from 'react';
import { Trash2 } from 'lucide-react';
import { formatCurrency } from '../utils/pdfParser';

const BOMTable = ({ materials, onRemove, editable = false, showPrices = true }) => {
    if (materials.length === 0) {
        return (
            <p className="text-center text-gray-400 py-8">
                {editable ? 'No materials yet — parse or add manually' : 'No materials in this project'}
            </p>
        );
    }

    // Calculate totals
    const totalPrice = materials.reduce((sum, m) => sum + (m.price || 0), 0);
    const itemsWithPrice = materials.filter(m => m.price).length;

    return (
        <div className="space-y-4">
            <div className="overflow-x-auto border rounded-lg">
                <table className="w-full text-sm">
                    <thead className="bg-gray-100">
                        <tr>
                            <th className="px-4 py-3 text-left font-medium">Category</th>
                            <th className="px-4 py-3 text-left font-medium">Item</th>
                            <th className="px-4 py-3 text-right font-medium">Quantity</th>
                            <th className="px-4 py-3 text-left font-medium">Unit</th>
                            {showPrices && (
                                <>
                                    <th className="px-4 py-3 text-right font-medium">Price/Unit</th>
                                    <th className="px-4 py-3 text-right font-medium">Total Price</th>
                                </>
                            )}
                            {editable && <th className="px-4 py-3 w-10"></th>}
                        </tr>
                    </thead>
                    <tbody>
                        {materials.map((m, i) => (
                            <tr key={m.id || i} className="border-t hover:bg-gray-50">
                                <td className="px-4 py-3">{m.category}</td>
                                <td className="px-4 py-3">{m.item}</td>
                                <td className="px-4 py-3 text-right font-mono">{m.quantity}</td>
                                <td className="px-4 py-3">{m.unit}</td>
                                {showPrices && (
                                    <>
                                        <td className="px-4 py-3 text-right font-mono text-gray-600">
                                            {m.pricePerUnit ? formatCurrency(m.pricePerUnit) : '—'}
                                        </td>
                                        <td className="px-4 py-3 text-right font-mono font-medium">
                                            {m.price ? formatCurrency(m.price) : '—'}
                                        </td>
                                    </>
                                )}
                                {editable && (
                                    <td className="px-4 py-3">
                                        <button
                                            onClick={() => onRemove(m.id)}
                                            className="text-red-600 hover:text-red-800"
                                            aria-label="Remove material"
                                        >
                                            <Trash2 size={18} />
                                        </button>
                                    </td>
                                )}
                            </tr>
                        ))}
                    </tbody>
                    {showPrices && totalPrice > 0 && (
                        <tfoot className="bg-gray-50 border-t-2">
                            <tr>
                                <td colSpan={editable ? 5 : 4} className="px-4 py-3 text-right font-semibold">
                                    Total ({itemsWithPrice}/{materials.length} items with prices):
                                </td>
                                <td className="px-4 py-3 text-right font-mono font-bold text-lg">
                                    {formatCurrency(totalPrice)}
                                </td>
                                {editable && <td></td>}
                            </tr>
                        </tfoot>
                    )}
                </table>
            </div>

            {showPrices && itemsWithPrice < materials.length && (
                <div className="text-sm text-amber-600 bg-amber-50 border border-amber-200 rounded-lg p-3">
                    ⚠️ {materials.length - itemsWithPrice} item(s) without price information
                </div>
            )}
        </div>
    );
};

export default BOMTable;
