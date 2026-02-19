import React from 'react';
import { Trash2, Edit2 } from 'lucide-react';
import { formatDate } from '../utils/helpers';

const STATUS_COLORS = {
    'Draft': 'bg-gray-100 text-gray-700',
    'Quotes Requested': 'bg-blue-100 text-blue-700',
    'Quotes Received': 'bg-purple-100 text-purple-700',
    'Orders Placed': 'bg-orange-100 text-orange-700',
    'Delivered': 'bg-green-100 text-green-700',
    'Completed': 'bg-emerald-100 text-emerald-700'
};

const ProjectCard = ({ project, onView, onEdit, onDelete }) => {
    return (
        <div className="bg-white rounded-xl shadow border border-gray-200 p-5 hover:shadow-md transition-shadow group">
            <div className="flex justify-between items-start">
                <div className="flex-1">
                    <h3 className="font-bold text-lg text-gray-900 group-hover:text-blue-600 transition-colors cursor-pointer" onClick={onView}>
                        {project.name}
                    </h3>
                    <p className="text-sm text-gray-600 mt-1">
                        {project.projectNumber && <span className="font-semibold text-blue-700 mr-2">[{project.projectNumber}]</span>}
                        {project.client || '—'} • {project.location || '—'}
                    </p>
                    <div className="flex gap-4 mt-3 text-sm text-gray-500">
                        <span>📦 {project.materials.length} items</span>
                        <span>📅 {formatDate(project.needByDate)}</span>
                    </div>
                    <div className="mt-3">
                        <span className={`inline-block px-3 py-1 text-xs font-medium rounded-full ${STATUS_COLORS[project.status] || STATUS_COLORS['Draft']}`}>
                            {project.status}
                        </span>
                    </div>
                </div>
                <div className="flex flex-col gap-2">
                    <button
                        onClick={onEdit}
                        className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 text-sm font-medium transition-colors flex items-center gap-2 justify-center"
                    >
                        <Edit2 size={16} /> Edit
                    </button>
                    <button
                        onClick={(e) => {
                            e.stopPropagation();
                            onDelete();
                        }}
                        className="bg-red-50 text-red-600 p-2 rounded hover:bg-red-100 transition-colors flex items-center justify-center border border-red-100"
                        title="Delete Project"
                    >
                        <Trash2 size={16} />
                    </button>
                </div>
            </div>
        </div>
    );
};

export default ProjectCard;
