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
        doc.text(`Artseven Special Force Logistic - Page ${i} of ${totalPages}`, pageWidth / 2, pageHeight - 10, { align: 'center' });
    }

    const fileName = `BOM_${project.projectNumber || project.name || 'Project'}_${new Date().toISOString().split('T')[0]}.pdf`;
    doc.save(fileName);
};

/**
 * Generate a clean Purchase Order (PO) PDF for a project + a chosen supplier.
 * @param {object} project   - The project (name, client, deliveryAddress, needByDate, materials...)
 * @param {object} supplier  - The supplier (name, location, contact, whatsapp)
 * @param {Array}  materials - Optional line items; defaults to project.materials
 */
export const exportPOToPDF = (project, supplier, materials = null) => {
    const doc = new jsPDF();
    const margin = 15;
    const pageWidth = doc.internal.pageSize.width;
    const pageHeight = doc.internal.pageSize.height;
    const contentWidth = pageWidth - (margin * 2);
    let yPos = 20;

    const list = (materials || project.materials || []).filter(m => m?.item);

    const checkNewPage = (needed) => {
        if (yPos + needed > pageHeight - margin) {
            doc.addPage();
            yPos = margin;
            return true;
        }
        return false;
    };

    const poNumber = `PO-${project.projectNumber || project.quotationNumber || String(project.id || project.name).slice(0, 8)}`;
    const today = new Date().toLocaleDateString('en-MY');

    // ── Header band ───────────────────────────────────────────────────────────
    doc.setFillColor(16, 24, 39); // slate-900
    doc.rect(0, 0, pageWidth, 34, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(20);
    doc.text('PURCHASE ORDER', margin, 22);
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.text(`PO No: ${poNumber}`, pageWidth - margin - 5, 16, { align: 'right' });
    doc.text(`Date: ${today}`, pageWidth - margin - 5, 23, { align: 'right' });
    doc.text('Artseven Special Force Logistic', pageWidth - margin - 5, 30, { align: 'right' });

    // ── Parties boxes ─────────────────────────────────────────────────────────
    yPos = 48;

    // Supplier (to) box
    doc.setFillColor(248, 250, 252);
    doc.rect(margin, yPos, contentWidth / 2 - 5, 34, 'F');
    doc.setDrawColor(226, 232, 240);
    doc.rect(margin, yPos, contentWidth / 2 - 5, 34, 'S');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(100, 116, 139);
    doc.text('SUPPLIER', margin + 5, yPos + 8);
    doc.setTextColor(0, 0, 0);
    doc.setFontSize(10);
    doc.text(supplier?.name || 'N/A', margin + 5, yPos + 16);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(71, 85, 105);
    doc.text(supplier?.location || '', margin + 5, yPos + 22);
    doc.text(`Tel: ${supplier?.contact || ''}`, margin + 5, yPos + 27);
    doc.text(`WA: ${supplier?.whatsapp || ''}`, margin + 70, yPos + 27);

    // Project (ship-to) box
    const shipX = margin + contentWidth / 2 + 5;
    doc.setFillColor(239, 246, 255);
    doc.rect(shipX, yPos, contentWidth / 2 - 5, 34, 'F');
    doc.setDrawColor(147, 197, 253);
    doc.rect(shipX, yPos, contentWidth / 2 - 5, 34, 'S');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(37, 99, 235);
    doc.text('SHIP TO', shipX + 5, yPos + 8);
    doc.setTextColor(0, 0, 0);
    doc.setFontSize(10);
    doc.text(project.name || 'Project', shipX + 5, yPos + 16);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(71, 85, 105);
    doc.text(`Client: ${project.client || ''}`, shipX + 5, yPos + 22);
    const lines = doc.splitTextToSize(project.deliveryAddress || project.location || '', contentWidth / 2 - 16);
    doc.text(lines.slice(0, 2), shipX + 5, yPos + 27);
    if (project.needByDate) {
        doc.text(`Need by: ${project.needByDate}`, pageWidth - margin - 5, yPos + 8, { align: 'right' });
    }

    yPos += 48;

    // ── Table header ──────────────────────────────────────────────────────────
    doc.setFillColor(37, 99, 235);
    doc.rect(margin, yPos, contentWidth, 10, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.text('#', margin + 5, yPos + 6.5);
    doc.text('ITEM DESCRIPTION', margin + 15, yPos + 6.5);
    doc.text('QTY', margin + 120, yPos + 6.5, { align: 'right' });
    doc.text('UNIT', margin + 128, yPos + 6.5);
    doc.text('PRICE/UNIT', margin + 165, yPos + 6.5, { align: 'right' });
    doc.text('TOTAL', margin + 190, yPos + 6.5, { align: 'right' });

    yPos += 10;
    doc.setTextColor(0, 0, 0);

    // ── Line items ────────────────────────────────────────────────────────────
    let grandTotal = 0;
    list.forEach((m, i) => {
        const rowH = 10;
        checkNewPage(rowH);

        const pricePerUnit = parseFloat(m.pricePerUnit) || (m.quantity ? (parseFloat(m.total || m.price) || 0) / m.quantity : 0);
        const total = parseFloat(m.price) || parseFloat(m.total) || (pricePerUnit * parseFloat(m.quantity || 0)) || 0;
        grandTotal += total;

        const itemLines = doc.splitTextToSize(String(m.item || ''), 98);
        const actualH = Math.max(rowH, itemLines.length * 5 + 5);
        checkNewPage(actualH);

        doc.setFont('helvetica', 'normal');
        doc.setFontSize(8.5);
        doc.text(String(i + 1), margin + 5, yPos + 7);
        doc.text(String(m.quantity ?? ''), margin + 120, yPos + 7, { align: 'right' });
        doc.text(m.unit || 'pcs', margin + 128, yPos + 7);
        doc.text(pricePerUnit > 0 ? pricePerUnit.toFixed(2) : '', margin + 165, yPos + 7, { align: 'right' });
        doc.text(total > 0 ? total.toFixed(2) : '', margin + 190, yPos + 7, { align: 'right' });
        doc.text(itemLines, margin + 15, yPos + 7);

        yPos += actualH;
        doc.setDrawColor(241, 245, 249);
        doc.line(margin, yPos, margin + contentWidth, yPos);
    });

    // ── Grand total ───────────────────────────────────────────────────────────
    checkNewPage(20);
    yPos += 6;
    doc.setFillColor(239, 246, 255);
    doc.rect(margin + 130, yPos, contentWidth - 130, 14, 'F');
    doc.setDrawColor(37, 99, 235);
    doc.rect(margin + 130, yPos, contentWidth - 130, 14, 'S');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.text('GRAND TOTAL (RM):', margin + 135, yPos + 9.5);
    doc.text(grandTotal.toFixed(2), pageWidth - margin - 5, yPos + 9.5, { align: 'right' });

    // ── Notes + signature ────────────────────────────────────────────────────
    yPos += 40;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.text('Terms & Notes:', margin, yPos);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(71, 85, 105);
    const notes = [
        'Prices are as agreed and quoted for the above project only.',
        'Quantities subject to final site measurement.',
        'Delivery to the project site / address noted above.',
        'Please issue a quotation/invoice for confirmation before delivery.',
    ];
    notes.forEach((n, i) => doc.text(`• ${n}`, margin + 3, yPos + 8 + (i * 5)));

    // Signature line
    const signY = yPos + 45;
    doc.setDrawColor(148, 163, 184);
    doc.line(margin + 60, signY, margin + 130, signY);
    doc.setFontSize(8);
    doc.text('Authorised Signature', margin + 95, signY + 5, { align: 'center' });

    // ── Footer ────────────────────────────────────────────────────────────────
    const totalPages = doc.internal.getNumberOfPages();
    for (let i = 1; i <= totalPages; i++) {
        doc.setPage(i);
        doc.setFont('helvetica', 'italic');
        doc.setFontSize(8);
        doc.setTextColor(148, 163, 184);
        doc.text(`Artseven Special Force Logistic - PO ${poNumber} - Page ${i} of ${totalPages}`, pageWidth / 2, pageHeight - 10, { align: 'center' });
    }

    const fileName = `${poNumber}_${supplier ? supplier.name.replace(/\s+/g, '_') : 'Supplier'}_${new Date().toISOString().split('T')[0]}.pdf`;
    doc.save(fileName);
};
