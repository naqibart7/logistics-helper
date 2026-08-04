export const exportToCSV = (data, headers, filename) => {
    const csvHeaders = headers.join(',') + '\n';
    const csvRows = data.map(row =>
        headers.map(header => {
            const value = row[header] || '';
            const escaped = String(value).replace(/"/g, '""');
            return `"${escaped}"`;
        }).join(',')
    ).join('\n');

    const csv = csvHeaders + csvRows;
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
};

export const exportBOMToCSV = (project) => {
    const formattedData = project.materials.map(m => ({
        Category: m.category,
        Item: m.item,
        Quantity: m.quantity,
        Unit: m.unit || '',
        'Price Per Unit': m.pricePerUnit || '',
        'Total Price': m.price || ''
    }));

    const filename = `${project.name.replace(/\s+/g, '_') || 'BOM'}_export.csv`;
    exportToCSV(formattedData, ['Category', 'Item', 'Quantity', 'Unit', 'Price Per Unit', 'Total Price'], filename);
};
