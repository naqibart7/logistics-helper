
import React, { useState } from 'react';
import { Upload, FileText, CheckCircle, AlertCircle } from 'lucide-react';

const FileUploader = ({ onFileSelect }) => {
    const [dragActive, setDragActive] = useState(false);
    const [file, setFile] = useState(null);

    const handleDrag = (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (e.type === 'dragenter' || e.type === 'dragover') {
            setDragActive(true);
        } else {
            setDragActive(false);
        }
    };

    const handleDrop = (e) => {
        e.preventDefault();
        e.stopPropagation();
        setDragActive(false);

        if (e.dataTransfer.files && e.dataTransfer.files[0]) {
            const droppedFile = e.dataTransfer.files[0];
            const fileType = droppedFile.type;
            const fileName = droppedFile.name.toLowerCase();

            const isPDF = fileType === 'application/pdf';
            const isExcel = fileType === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
                fileType === 'application/vnd.ms-excel' ||
                fileName.endsWith('.xlsx') ||
                fileName.endsWith('.xls');

            if (isPDF || isExcel) {
                setFile(droppedFile);
                onFileSelect(droppedFile);
            } else {
                alert('Please upload a PDF or Excel file');
            }
        }
    };

    const handleChange = (e) => {
        e.preventDefault();
        if (e.target.files && e.target.files[0]) {
            setFile(e.target.files[0]);
            onFileSelect(e.target.files[0]);
        }
    };

    return (
        <div
            className={`relative w-full border-2 border-dashed rounded-xl p-8 text-center transition-colors 
        ${dragActive ? 'border-blue-500 bg-blue-50' : 'border-gray-300 hover:border-gray-400 bg-gray-50'}`}
            onDragEnter={handleDrag}
            onDragLeave={handleDrag}
            onDragOver={handleDrag}
            onDrop={handleDrop}
        >
            <input
                type="file"
                accept=".pdf,.xlsx,.xls"
                className="hidden"
                id="file-upload"
                onChange={handleChange}
            />

            <div className="flex flex-col items-center gap-4">
                {file ? (
                    <>
                        <div className="bg-green-100 p-4 rounded-full">
                            <CheckCircle className="text-green-600" size={32} />
                        </div>
                        <div>
                            <p className="font-semibold text-gray-800">{file.name}</p>
                            <p className="text-sm text-gray-500">{(file.size / 1024).toFixed(1)} KB</p>
                        </div>
                        <button
                            onClick={() => {
                                setFile(null);
                                onFileSelect(null);
                                const input = document.getElementById('file-upload');
                                if (input) input.value = '';
                            }}
                            className="text-red-500 text-sm underline mt-2"
                        >
                            Remove
                        </button>
                    </>
                ) : (
                    <>
                        <div className={`p-4 rounded-full ${dragActive ? 'bg-blue-200' : 'bg-gray-200'}`}>
                            <Upload className={`${dragActive ? 'text-blue-600' : 'text-gray-500'}`} size={32} />
                        </div>
                        <div>
                            <p className="text-lg font-medium text-gray-700">
                                Drag & Drop PDF or Excel here
                            </p>
                            <p className="text-sm text-gray-500 mt-1">or</p>
                        </div>
                        <label
                            htmlFor="file-upload"
                            className="bg-blue-600 text-white px-5 py-2 rounded-lg cursor-pointer hover:bg-blue-700 transition"
                        >
                            Browse Files
                        </label>
                        <p className="text-xs text-gray-400 mt-4">
                            Supports Quotation PDFs and Cost Excel sheets (Max 10MB)
                        </p>
                    </>
                )}
            </div>
        </div>
    );
};

export default FileUploader;
