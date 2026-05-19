'use client';
import { useState, useEffect } from 'react';
import Image from 'next/image';
import { getTask, deleteTask, updateTaskImage } from '../utils/api';
import { getCurrentUser } from '../utils/auth';
import Comments from './Comments';
import toast from 'react-hot-toast';

const priorityColors = {
  'Critical': 'bg-red-100 text-red-800',
  'High': 'bg-orange-100 text-orange-800',
  'Medium': 'bg-yellow-100 text-yellow-800',
  'Low': 'bg-green-100 text-green-800',
};

const statusColors = {
  'To Do': 'bg-gray-100 text-gray-800',
  'In Progress': 'bg-blue-100 text-blue-800',
  'In Review': 'bg-purple-100 text-purple-800',
  'Done': 'bg-green-100 text-green-800',
};

export default function TaskModal({ taskId, onClose, onDelete }) {
  const [task, setTask] = useState(null);
  const [loading, setLoading] = useState(true);
  const [uploadingImage, setUploadingImage] = useState(false);
  const currentUser = getCurrentUser();

  useEffect(() => {
    let active = true;

    const loadTask = async () => {
      setLoading(true);
      try {
        const res = await getTask(taskId);
        if (active) setTask(res.data);
      } catch {
        if (active) toast.error('Failed to load task');
      } finally {
        if (active) setLoading(false);
      }
    };

    loadTask();

    return () => {
      active = false;
    };
  }, [taskId]);

  const handleDelete = async () => {
    if (!confirm('Delete this task?')) return;
    try {
      await deleteTask(taskId);
      toast.success('Task deleted');
      onDelete(taskId);
      onClose();
    } catch { toast.error('Failed to delete task'); }
  };

  const handleImageUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const formData = new FormData();
    formData.append('image', file);
    setUploadingImage(true);
    try {
      const res = await updateTaskImage(taskId, formData);
      setTask({ ...task, imageUrl: res.data.imageUrl });
      toast.success('Image updated');
    } catch { toast.error('Failed to upload image'); }
    finally { setUploadingImage(false); }
  };

  if (loading) return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-8">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500 mx-auto"></div>
        <p className="text-center text-gray-500 mt-3">Loading task...</p>
      </div>
    </div>
  );

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl w-full max-w-2xl max-h-screen overflow-y-auto shadow-2xl">

        {/* Header */}
        <div className="flex justify-between items-start p-6 border-b sticky top-0 bg-white">
          <div className="flex-1 pr-4">
            <h2 className="text-xl font-bold text-gray-800">{task?.title}</h2>
            <div className="flex gap-2 mt-2">
              <span className={`text-xs px-2 py-1 rounded-full font-medium ${priorityColors[task?.priority]}`}>
                {task?.priority}
              </span>
              <span className={`text-xs px-2 py-1 rounded-full font-medium ${statusColors[task?.status]}`}>
                {task?.status}
              </span>
            </div>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-2xl">x</button>
        </div>

        <div className="p-6">
          {/* Task Details */}
          <div className="grid grid-cols-2 gap-4 mb-6">
            <div className="bg-gray-50 p-3 rounded-lg">
              <p className="text-xs text-gray-500">Deadline</p>
              <p className="font-medium text-gray-800 mt-1">{task?.deadline || 'Not set'}</p>
            </div>
            <div className="bg-gray-50 p-3 rounded-lg">
              <p className="text-xs text-gray-500">Team</p>
              <p className="font-medium text-gray-800 mt-1">{task?.teamId || 'Not set'}</p>
            </div>
            <div className="bg-gray-50 p-3 rounded-lg">
              <p className="text-xs text-gray-500">Assignee</p>
              <p className="font-medium text-gray-800 mt-1">{task?.assigneeId || 'Unassigned'}</p>
            </div>
            <div className="bg-gray-50 p-3 rounded-lg">
              <p className="text-xs text-gray-500">Created</p>
              <p className="font-medium text-gray-800 mt-1">
                {task?.createdAt ? new Date(task.createdAt).toLocaleDateString() : 'Unknown'}
              </p>
            </div>
          </div>

          {/* Description */}
          <div className="mb-6">
            <p className="text-xs text-gray-500 mb-2">Description</p>
            <p className="text-gray-700 bg-gray-50 p-3 rounded-lg">{task?.description}</p>
          </div>

          {/* Image from S3 */}
          <div className="mb-6">
            <p className="text-xs text-gray-500 mb-2">Image</p>
            {task?.imageUrl ? (
              <Image
                src={task.imageUrl}
                alt="Task"
                width={960}
                height={384}
                sizes="(max-width: 768px) 100vw, 768px"
                className="w-full max-h-48 object-cover rounded-lg border mb-2"
              />
            ) : (
              <p className="text-gray-400 text-sm bg-gray-50 p-3 rounded-lg">No image attached</p>
            )}
            <label className="cursor-pointer bg-gray-100 hover:bg-gray-200 text-gray-700 text-sm px-4 py-2 rounded-lg inline-block mt-2">
              {uploadingImage ? 'Uploading...' : task?.imageUrl ? 'Replace Image' : 'Upload Image'}
              <input type="file" accept="image/*" className="hidden" onChange={handleImageUpload} disabled={uploadingImage} />
            </label>
          </div>

          {/* Audit Log */}
          {task?.auditLog && task.auditLog.length > 0 && (
            <div className="mb-6">
              <p className="text-xs text-gray-500 mb-2">Activity Log</p>
              <div className="space-y-2 max-h-40 overflow-y-auto">
                {task.auditLog.map((entry, i) => (
                  <div key={i} className="flex items-start gap-2 text-sm">
                    <div className="w-2 h-2 rounded-full bg-blue-400 mt-1.5 flex-shrink-0"></div>
                    <div>
                      <span className="font-medium text-gray-700">{entry.user}</span>
                      <span className="text-gray-500"> - {entry.action}</span>
                      <span className="text-gray-400 text-xs ml-2">
                        {new Date(entry.timestamp).toLocaleString()}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Delete — Manager only */}
          {currentUser?.role === 'Manager' && (
            <div className="mb-6 pb-6 border-b">
              <button onClick={handleDelete} className="bg-red-500 text-white px-4 py-2 rounded-lg hover:bg-red-600 text-sm">
                Delete Task
              </button>
            </div>
          )}

          {/* Comments */}
          <Comments taskId={taskId} />
        </div>
      </div>
    </div>
  );
}