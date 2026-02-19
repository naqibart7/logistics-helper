import { jsPDF } from 'jspdf';
import { formatCurrency } from './pdfParser';

/**
 * Generate PDF for Bill of Materials (BOM)
 */
export const exportBOMToPDF = (project) => {
    const doc = new jsPDF();
    const margin = 15;
    const pageWidth = doc.internal.pageSize.width;
    const pageHeight = doc.internal.pageSize.height;
    const contentWidth = pageWidth - (margin * 2);
    let yPos = 20;

    // Helper to check for new page
    const checkNewPage = (needed) => {
        if (yPos + needed > pageHeight - margin) {
            doc.addPage();
            yPos = margin;
            return true;
        }
        return false;
    };

    // Header Color Strip
    doc.setFillColor(37, 99, 235); // Blue-600
    doc.rect(0, 0, pageWidth, 40, 'F');

    // Title
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(22);
    doc.text('BILL OF MATERIALS', margin, 20);

    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    const projectTitle = project.name || 'Untitled Project';
    doc.text(projectTitle.toUpperCase(), margin, 30);

    // Status Badge
    const statusText = (project.status || 'DRAFT').toUpperCase();
    const statusWidth = doc.getTextWidth(statusText) + 10;
    doc.setFillColor(255, 255, 255, 0.2);
    doc.roundedRect(pageWidth - margin - statusWidth, 12, statusWidth, 10, 2, 2, 'F');
    doc.text(statusText, pageWidth - margin - statusWidth + 5, 19);

    yPos = 55;
    doc.setTextColor(0, 0, 0);

    // Project Details Box
    doc.setFillColor(248, 250, 252); // Slate-50
    doc.rect(margin, yPos, contentWidth, 35, 'F');
    doc.setDrawColor(226, 232, 240); // Slate-200
    doc.rect(margin, yPos, contentWidth, 35, 'S');

    doc.setFont('helvetica', 'bold');
    doc.text('PROJECT INFO', margin + 5, yPos + 8);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.text(`Client: ${project.client || 'N/A'}`, margin + 5, yPos + 18);
    doc.text(`Project #: ${project.projectNumber || 'N/A'}`, margin + 5, yPos + 26);
    doc.text(`Location: ${project.location || 'N/A'}`, margin + 80, yPos + 18);
    doc.text(`Need By: ${project.needByDate || 'N/A'}`, margin + 80, yPos + 26);

    const today = new Date().toLocaleDateString('en-MY');
    doc.text(`Date Generated: ${today}`, pageWidth - margin - 5, yPos + 8, { align: 'right' });

    yPos += 50;

    // Table Header
    doc.setFillColor(51, 65, 85); // Slate-700
    doc.rect(margin, yPos, contentWidth, 10, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.text('CATEGORY / ITEM', margin + 5, yPos + 6.5);
    doc.text('QTY', margin + 115, yPos + 6.5, { align: 'right' });
    doc.text('UNIT', margin + 120, yPos + 6.5);
    doc.text('PRICE/UNIT', margin + 155, yPos + 6.5, { align: 'right' });
    doc.text('TOTAL', margin + 180, yPos + 6.5, { align: 'right' });

    yPos += 10;
    doc.setTextColor(0, 0, 0);

    // Group items by category
    const grouped = (project.materials || []).reduce((acc, m) => {
        const cat = m.category || 'Other';
        if (!acc[cat]) acc[cat] = [];
        acc[cat].push(m);
        return acc;
    }, {});

    const categories = Object.keys(grouped).sort();
    let totalPrice = 0;

    categories.forEach(cat => {
        // Category Header
        checkNewPage(15);
        doc.setFillColor(241, 245, 249); // Slate-100
        doc.rect(margin, yPos, contentWidth, 8, 'F');
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(8);
        doc.text(cat.toUpperCase(), margin + 5, yPos + 5.5);
        yPos += 8;

        grouped[cat].forEach((m, idx) => {
            const rowHeight = 10;
            checkNewPage(rowHeight);

            doc.setFont('helvetica', 'normal');
            doc.setFontSize(9);

            // Item text wrap
            const itemText = m.item || 'Unnamed Item';
            const itemLines = doc.splitTextToSize(itemText, 100);
            const actualRowHeight = Math.max(rowHeight, itemLines.length * 5 + 4);
            checkNewPage(actualRowHeight);

            doc.text(itemLines, margin + 5, yPos + 6);
            doc.text(String(m.quantity || '0'), margin + 115, yPos + 6, { align: 'right' });
            doc.text(m.unit || 'pcs', margin + 120, yPos + 6);

            const price = parseFloat(m.price) || 0;
            const pricePerUnit = parseFloat(m.pricePerUnit) || 0;
            totalPrice += price;

            doc.text(pricePerUnit > 0 ? formatCurrency(pricePerUnit).replace('RM ', '') : '—', margin + 155, yPos + 6, { align: 'right' });
            doc.text(price > 0 ? formatCurrency(price).replace('RM ', '') : '—', margin + 180, yPos + 6, { align: 'right' });

            yPos += actualRowHeight;

            // Zebra striping/Divider
            doc.setDrawColor(241, 245, 249);
            doc.line(margin, yPos, margin + contentWidth, yPos);
        });
    });

    // Grand Total
    checkNewPage(20);
    yPos += 5;
    doc.setFillColor(239, 246, 255); // Blue-50
    doc.rect(margin + 100, yPos, contentWidth - 100, 15, 'F');
    doc.setDrawColor(37, 99, 235);
    doc.rect(margin + 100, yPos, contentWidth - 100, 15, 'S');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.text('GRAND TOTAL:', margin + 105, yPos + 9.5);
    doc.text(formatCurrency(totalPrice), pageWidth - margin - 5, yPos + 9.5, { align: 'right' });

    // Footer
    const totalPages = doc.internal.getNumberOfPages();
    for (let i = 1; i <= totalPages; i++) {
        doc.setPage(i);
        doc.setFont('helvetica', 'italic');
        doc.setFontSize(8);
        doc.setTextColor(148, 163, 184); // Slate-400
        doc.text(`Construction Logistics Helper - Page ${i} of ${totalPages}`, pageWidth / 2, pageHeight - 10, { align: 'center' });
    }

    const fileName = `BOM_${project.projectNumber || project.name || 'Project'}_${new Date().toISOString().split('T')[0]}.pdf`;
    doc.save(fileName);
};
