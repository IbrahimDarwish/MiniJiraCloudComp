'use client';
import { useState, useEffect } from 'react';
import { createTask, getTeams, getUsers } from '../utils/api';
import toast from 'react-hot-toast';

export default function CreateTaskModal({ onClose, onCreated }) {
  const [teams, setTeams] = useState([]);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [imageFile, setImageFile] = useState(null);
  const [form, setForm] = useState({
    title: '', description: '', priority: 'Medium', deadline: '', assigneeId: '', teamId: ''
  });

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [teamsRes, usersRes] = await Promise.all([getTeams(), getUsers()]);
        setTeams(teamsRes.data);
        setUsers(usersRes.data);
      } catch (err) { toast.error('Failed to load form data'); }
    };
    fetchData();
  }, []);

  const handleSubmit = async () => {
    if (!form.title || !form.description || !form.deadline || !form.teamId) {
      toast.error('Please fill all required fields');
      return;
    }
    setLoading(true);
    try {
      const formData = new FormData();
      formData.append('title', form.title);
      formData.append('description', form.description);
      formData.append('priority', form.priority);
      formData.append('deadline', form.deadline);
      formData.append('teamId', form.teamId);
      if (form.assigneeId) formData.append('assigneeId', form.assigneeId);
      if (imageFile) formData.append('image', imageFile);
      const res = await createTask(formData);
      onCreated(res.data);
      toast.success('Task created!');
    } catch (err) { toast.error('Failed to create task'); }
    finally { setLoading(false); }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl w-full max-w-lg shadow-2xl">
        <div className="flex justify-between items-center p-6 border-b">
          <h2 className="text-xl font-bold text-gray-800">Create New Task</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-2xl">×</button>
        </div>
        <div className="p-6 space-y-4">
          <div>
            <label className="text-sm font-medium text-gray-700">Title *</label>
            <input className="w-full border border-gray-300 rounded-lg p-2.5 mt-1 focus:outline-none focus:ring-2 focus:ring-blue-400" placeholder="Task title" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
          </div>
          <div>
            <label className="text-sm font-medium text-gray-700">Description *</label>
            <textarea className="w-full border border-gray-300 rounded-lg p-2.5 mt-1 focus:outline-none focus:ring-2 focus:ring-blue-400" rows={3} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium text-gray-700">Priority</label>
              <select className="w-full border border-gray-300 rounded-lg p-2.5 mt-1" value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value })}>
                <option>Low</option><option>Medium</option><option>High</option><option>Critical</option>
              </select>
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700">Deadline *</label>
              <input type="date" className="w-full border border-gray-300 rounded-lg p-2.5 mt-1" value={form.deadline} onChange={(e) => setForm({ ...form, deadline: e.target.value })} />
            </div>
          </div>
          <div>
            <label className="text-sm font-medium text-gray-700">Team *</label>
            <select className="w-full border border-gray-300 rounded-lg p-2.5 mt-1" value={form.teamId} onChange={(e) => setForm({ ...form, teamId: e.target.value })}>
              <option value="">Select a team</option>
              {teams.map(team => <option key={team.teamId} value={team.teamId}>{team.name}</option>)}
            </select>
          </div>
          <div>
            <label className="text-sm font-medium text-gray-700">Assignee</label>
            <select className="w-full border border-gray-300 rounded-lg p-2.5 mt-1" value={form.assigneeId} onChange={(e) => setForm({ ...form, assigneeId: e.target.value })}>
              <option value="">Select assignee</option>
              {users.map(user => <option key={user.userId} value={user.userId}>{user.email || user.userId}</option>)}
            </select>
          </div>
          <div>
            <label className="text-sm font-medium text-gray-700">Image (optional)</label>
            <input type="file" accept="image/*" className="w-full border border-gray-300 rounded-lg p-2 mt-1 text-sm" onChange={(e) => setImageFile(e.target.files[0])} />
          </div>
          <div className="flex gap-3 pt-2">
            <button onClick={handleSubmit} disabled={loading} className="flex-1 bg-blue-500 text-white py-2.5 rounded-lg hover:bg-blue-600 disabled:opacity-50 font-medium">{loading ? 'Creating...' : 'Create Task'}</button>
            <button onClick={onClose} className="flex-1 bg-gray-100 text-gray-700 py-2.5 rounded-lg hover:bg-gray-200">Cancel</button>
          </div>
        </div>
      </div>
    </div>
  );
}