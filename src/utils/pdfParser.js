
import { smartParse } from './advancedParser';

/**
 * Format currency for display
 */
export const formatCurrency = (amount) => {
    if (amount === null || amount === undefined) return '—';
    return `RM ${amount.toLocaleString('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

/**
 * Main parser function that delegates to advancedParser
 */
export const parseDocument = (text) => {
    if (!text || !text.trim()) {
        return {
            success: false,
            format: 'unknown',
            materials: [],
            metadata: {},
            errors: ['Empty text provided']
        };
    }

    try {
        // Delegate parsing to the robust smartParse
        const smartResult = smartParse(text);
        const { materials, format, metadata } = smartResult;

        // Calculate additional stats for UI consumption
        const totalQuantity = materials.reduce((sum, m) => sum + (parseFloat(m.quantity) || 0), 0);
        const totalPrice = materials.reduce((sum, m) => sum + (m.price || 0), 0);
        const itemsWithPrice = materials.filter(m => m.price !== null && m.price > 0).length;

        // Group by category for debug/stats if needed
        const byCategory = materials.reduce((acc, m) => {
            if (!acc[m.category]) acc[m.category] = { count: 0, total: 0 };
            acc[m.category].count++;
            acc[m.category].total += m.price || 0;
            return acc;
        }, {});

        // Return standardized structure expected by App.jsx
        return {
            success: materials.length > 0, // Considered success if we found anything
            format: format,
            materials: materials,
            metadata: {
                ...metadata, // Include project metadata (client, date, etc)
                totalItems: materials.length,
                totalQuantity: totalQuantity,
                totalPrice: totalPrice,
                itemsWithPrice: itemsWithPrice,
                priceDetectionRate: materials.length > 0 ? ((itemsWithPrice / materials.length) * 100).toFixed(1) : 0,
                categories: Object.keys(byCategory).length,
                categoryBreakdown: byCategory
            },
            errors: []
        };
    } catch (error) {
        console.error("Parsing error:", error);
        return {
            success: false,
            format: 'error',
            materials: [],
            metadata: {},
            errors: [error.message]
        };
    }
};
