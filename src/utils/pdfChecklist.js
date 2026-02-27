import { jsPDF } from 'jspdf';

/**
 * Generate PDF for Delivery Checklist
 */
export const exportChecklistToPDF = (project, materials) => {
    const doc = new jsPDF();

    // Page settings
    const pageWidth = doc.internal.pageSize.width;
    const pageHeight = doc.internal.pageSize.height;
    const margin = 15;
    const contentWidth = pageWidth - (margin * 2);
    let yPos = margin;

    // Helper function to check if we need a new page
    const checkNewPage = (requiredSpace = 10) => {
        if (yPos + requiredSpace > pageHeight - margin) {
            doc.addPage();
            yPos = margin;
            return true;
        }
        return false;
    };

    // Helper function to add text with wrap
    const addText = (text, x, y, options = {}) => {
        const { size = 10, style = 'normal', align = 'left', maxWidth = contentWidth } = options;
        doc.setFontSize(size);
        doc.setFont('helvetica', style);

        const lines = doc.splitTextToSize(text, maxWidth);
        lines.forEach((line, i) => {
            if (i > 0) {
                checkNewPage();
            }
            if (align === 'center') {
                doc.text(line, pageWidth / 2, y + (i * size * 0.5), { align: 'center' });
            } else if (align === 'right') {
                doc.text(line, pageWidth - margin, y + (i * size * 0.5), { align: 'right' });
            } else {
                doc.text(line, x, y + (i * size * 0.5));
            }
        });
        return lines.length;
    };

    // Title
    doc.setFillColor(37, 99, 235); // Blue
    doc.rect(0, 0, pageWidth, 35, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(20);
    doc.setFont('helvetica', 'bold');
    doc.text('DELIVERY CHECKLIST', pageWidth / 2, 15, { align: 'center' });
    doc.setFontSize(12);
    doc.setFont('helvetica', 'normal');
    doc.text(project.name || 'Untitled Project', pageWidth / 2, 25, { align: 'center' });

    yPos = 45;
    doc.setTextColor(0, 0, 0);

    // Project Information
    doc.setFillColor(245, 245, 245);
    doc.rect(margin, yPos, contentWidth, 35, 'F');

    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.text(`Project #: ${project.projectNumber || 'N/A'}`, margin + 5, yPos + 8);
    doc.text(`Client: ${project.client || 'N/A'}`, margin + 5, yPos + 16);
    doc.text(`Location: ${project.location || 'N/A'}`, margin + 5, yPos + 24);

    const today = new Date().toLocaleDateString();
    doc.text(`Checklist Date: ${today}`, pageWidth - margin - 5, yPos + 8, { align: 'right' });
    doc.text(`Status: ${project.status}`, pageWidth - margin - 5, yPos + 16, { align: 'right' });

    yPos += 45;

    // Statistics
    const totalItems = materials.length;
    const checkedItems = materials.filter(m => m.deliveryChecked).length;
    const percentage = totalItems > 0 ? Math.round((checkedItems / totalItems) * 100) : 0;

    checkNewPage(25);
    doc.setFillColor(220, 252, 231); // Light green
    doc.rect(margin, yPos, contentWidth / 3 - 2, 20, 'F');
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.text('TOTAL ITEMS', margin + (contentWidth / 6), yPos + 8, { align: 'center' });
    doc.setFontSize(16);
    doc.setFont('helvetica', 'bold');
    doc.text(String(totalItems), margin + (contentWidth / 6), yPos + 16, { align: 'center' });

    doc.setFillColor(187, 247, 208); // Green
    doc.rect(margin + (contentWidth / 3) + 2, yPos, contentWidth / 3 - 4, 20, 'F');
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.text('VERIFIED', margin + (contentWidth / 2), yPos + 8, { align: 'center' });
    doc.setFontSize(16);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(22, 163, 74);
    doc.text(String(checkedItems), margin + (contentWidth / 2), yPos + 16, { align: 'center' });
    doc.setTextColor(0, 0, 0);

    doc.setFillColor(254, 243, 199); // Amber
    doc.rect(margin + (contentWidth * 2 / 3) + 2, yPos, contentWidth / 3 - 2, 20, 'F');
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.text('COMPLETION', margin + (contentWidth * 5 / 6), yPos + 8, { align: 'center' });
    doc.setFontSize(16);
    doc.setFont('helvetica', 'bold');
    doc.text(`${percentage}%`, margin + (contentWidth * 5 / 6), yPos + 16, { align: 'center' });

    yPos += 30;

    // Group materials by supplier
    const groupedMaterials = {};
    const unassigned = [];

    materials.forEach(m => {
        if (m.assignedSupplier) {
            const supplierId = m.assignedSupplier.id;
            if (!groupedMaterials[supplierId]) {
                groupedMaterials[supplierId] = {
                    supplier: m.assignedSupplier,
                    materials: []
                };
            }
            groupedMaterials[supplierId].materials.push(m);
        } else {
            unassigned.push(m);
        }
    });

    // Render materials by supplier
    Object.values(groupedMaterials).forEach(({ supplier, materials: supplierMaterials }) => {
        checkNewPage(30);

        // Supplier header
        doc.setFillColor(239, 246, 255); // Light blue
        doc.rect(margin, yPos, contentWidth, 15, 'F');
        doc.setFontSize(11);
        doc.setFont('helvetica', 'bold');
        doc.text(supplier.name, margin + 5, yPos + 6);
        doc.setFontSize(8);
        doc.setFont('helvetica', 'normal');
        doc.text(`${supplier.location} • ${supplier.contact}`, margin + 5, yPos + 11);

        const supplierChecked = supplierMaterials.filter(m => m.deliveryChecked).length;
        doc.text(`${supplierChecked}/${supplierMaterials.length} verified`, pageWidth - margin - 5, yPos + 9, { align: 'right' });

        yPos += 20;

        // Materials list
        supplierMaterials.forEach((material, index) => {
            checkNewPage(15);

            const isChecked = material.deliveryChecked;

            // Checkbox
            doc.setDrawColor(100, 100, 100);
            doc.rect(margin, yPos, 4, 4);
            if (isChecked) {
                doc.setFillColor(34, 197, 94); // Green
                doc.rect(margin + 0.5, yPos + 0.5, 3, 3, 'F');
            }

            // Item details
            doc.setFontSize(9);
            doc.setFont('helvetica', isChecked ? 'normal' : 'bold');
            doc.setTextColor(isChecked ? 150 : 0, isChecked ? 150 : 0, isChecked ? 150 : 0);

            const itemText = `${material.item}`;
            doc.text(itemText, margin + 7, yPos + 3);

            doc.setFontSize(8);
            doc.setFont('helvetica', 'normal');
            const qtyText = `${material.quantity} ${material.unit || ''}`;
            doc.text(qtyText, margin + 7, yPos + 8);

            // Price
            if (material.price) {
                const priceText = `RM ${material.price.toFixed(2)}`;
                doc.text(priceText, pageWidth - margin - 5, yPos + 5, { align: 'right' });
            }

            // Checked date
            if (isChecked && material.checkedDate) {
                doc.setFontSize(7);
                doc.setTextColor(100, 100, 100);
                const checkedDate = new Date(material.checkedDate).toLocaleString();
                doc.text(`✓ ${checkedDate}`, margin + 7, yPos + 12);
            }

            doc.setTextColor(0, 0, 0);
            yPos += 16;

            // Divider line
            if (index < supplierMaterials.length - 1) {
                doc.setDrawColor(230, 230, 230);
                doc.line(margin + 5, yPos - 2, pageWidth - margin - 5, yPos - 2);
            }
        });

        yPos += 5;
    });

    // Unassigned materials
    if (unassigned.length > 0) {
        checkNewPage(30);

        doc.setFillColor(250, 250, 250);
        doc.rect(margin, yPos, contentWidth, 15, 'F');
        doc.setFontSize(11);
        doc.setFont('helvetica', 'bold');
        doc.text('Unassigned Materials', margin + 5, yPos + 9);

        yPos += 20;

        unassigned.forEach((material, index) => {
            checkNewPage(15);

            const isChecked = material.deliveryChecked;

            doc.setDrawColor(100, 100, 100);
            doc.rect(margin, yPos, 4, 4);
            if (isChecked) {
                doc.setFillColor(34, 197, 94);
                doc.rect(margin + 0.5, yPos + 0.5, 3, 3, 'F');
            }

            doc.setFontSize(9);
            doc.setFont('helvetica', isChecked ? 'normal' : 'bold');
            doc.setTextColor(isChecked ? 150 : 0, isChecked ? 150 : 0, isChecked ? 150 : 0);
            doc.text(material.item, margin + 7, yPos + 3);

            doc.setFontSize(8);
            doc.setFont('helvetica', 'normal');
            doc.text(`${material.quantity} ${material.unit || ''}`, margin + 7, yPos + 8);

            if (material.price) {
                doc.text(`RM ${material.price.toFixed(2)}`, pageWidth - margin - 5, yPos + 5, { align: 'right' });
            }

            doc.setTextColor(0, 0, 0);
            yPos += 16;
        });
    }

    // Footer on last page
    yPos = pageHeight - 20;
    doc.setDrawColor(200, 200, 200);
    doc.line(margin, yPos, pageWidth - margin, yPos);
    doc.setFontSize(8);
    doc.setFont('helvetica', 'italic');
    doc.setTextColor(100, 100, 100);
    doc.text('Generated by Artseven Special Force Logistic', margin, yPos + 6);
    doc.text(today, pageWidth - margin, yPos + 6, { align: 'right' });

    // Save PDF
    const fileName = `Checklist_${project.projectNumber || project.name || 'Project'}_${new Date().toISOString().split('T')[0]}.pdf`;
    doc.save(fileName);
};
