'use client';
/* eslint-disable react-hooks/set-state-in-effect */

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import toast, { Toaster } from 'react-hot-toast';
import LoadingSpinner from '../../components/LoadingSpinner';
import { getCurrentUser, logoutUser } from '../../utils/auth';
import { createProject, deleteProject, getProject, getProjects, updateProject } from '../../utils/api';

export default function ProjectsPage() {
    const router = useRouter();
    const [currentUser, setCurrentUser] = useState(null);
    const [hydrated, setHydrated] = useState(false);
    const [loading, setLoading] = useState(true);
    const [projects, setProjects] = useState([]);
    const [selectedProject, setSelectedProject] = useState(null);
    const [form, setForm] = useState({ name: '', description: '' });
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        setCurrentUser(getCurrentUser());
        setHydrated(true);
    }, []);

    useEffect(() => {
        if (!hydrated) return;
        if (!currentUser) { router.push('/login'); return; }

        const loadProjects = async () => {
            setLoading(true);
            try {
                const res = await getProjects();
                setProjects(res.data);
            } catch {
                toast.error('Failed to load projects');
            } finally {
                setLoading(false);
            }
        };

        loadProjects();
    }, [hydrated, currentUser, router]);

    const isManager = currentUser?.role === 'Manager' || currentUser?.role === 'Admin';

    const resetForm = () => {
        setForm({ name: '', description: '' });
        setSelectedProject(null);
    };

    const openEditor = async (projectId) => {
        try {
            const res = await getProject(projectId);
            setSelectedProject(res.data);
            setForm({ name: res.data.name || '', description: res.data.description || '' });
        } catch {
            toast.error('Failed to load project details');
        }
    };

    const handleSave = async (e) => {
        e.preventDefault();
        if (!form.name.trim()) return toast.error('Project name is required');

        setSaving(true);
        try {
            if (selectedProject) {
                const res = await updateProject(selectedProject.projectId, form.name, form.description);
                setProjects((prev) => prev.map((project) => (project.projectId === selectedProject.projectId ? { ...project, ...res.data } : project)));
                toast.success('Project updated');
            } else {
                const res = await createProject(form.name, form.description);
                setProjects((prev) => [res.data, ...prev]);
                toast.success('Project created');
            }
            resetForm();
        } catch {
            toast.error('Failed to save project');
        } finally {
            setSaving(false);
        }
    };

    const handleDelete = async (projectId) => {
        if (!confirm('Delete this project?')) return;
        try {
            await deleteProject(projectId);
            setProjects((prev) => prev.filter((project) => project.projectId !== projectId));
            if (selectedProject?.projectId === projectId) resetForm();
            toast.success('Project deleted');
        } catch {
            toast.error('Failed to delete project');
        }
    };

    if (!hydrated || loading) {
        return <LoadingSpinner />;
    }

    return (
        <div className="min-h-screen bg-[radial-gradient(circle_at_top,_#eff6ff_0%,_#f8fafc_42%,_#eef2ff_100%)] dark:bg-slate-950 dark:bg-none">
            <Toaster position="top-right" />
            <div className="bg-white/90 backdrop-blur border-b border-white/70 shadow-sm px-6 py-4 flex items-center justify-between sticky top-0 z-20 dark:bg-slate-900/90 dark:border-slate-800">
                <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.2em] text-blue-600">Mini-Jira</p>
                    <h1 className="text-xl font-bold text-gray-900">Projects</h1>
                </div>
                <div className="flex items-center gap-3">
                    <button
                        onClick={() => router.push('/board')}
                        className="rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-600 hover:bg-gray-50 hover:text-gray-900 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-slate-50"
                    >
                        Back to Board
                    </button>
                    <button
                        onClick={() => { logoutUser(); router.push('/login'); }}
                        className="rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-600 hover:bg-gray-50 hover:text-gray-900 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-slate-50"
                    >
                        Logout
                    </button>
                </div>
            </div>

            <div className="px-6 py-6 grid gap-6 lg:grid-cols-[360px_minmax(0,1fr)]">
                {isManager && (
                    <form onSubmit={handleSave} className="rounded-3xl border border-white/70 bg-white/90 p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900/90">
                        <div className="mb-4">
                            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-blue-600">{selectedProject ? 'Edit project' : 'New project'}</p>
                            <h2 className="text-lg font-semibold text-gray-900 dark:text-slate-50">{selectedProject ? selectedProject.name : 'Create a project'}</h2>
                        </div>
                        <label className="block text-sm font-medium text-gray-700 mb-2 dark:text-slate-200">Project name</label>
                        <input
                            value={form.name}
                            onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
                            className="w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-50"
                            placeholder="Frontend Launch"
                        />
                        <label className="block text-sm font-medium text-gray-700 mb-2 mt-4 dark:text-slate-200">Description</label>
                        <textarea
                            value={form.description}
                            onChange={(e) => setForm((prev) => ({ ...prev, description: e.target.value }))}
                            rows={5}
                            className="w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-50"
                            placeholder="Short project summary"
                        />
                        <div className="mt-4 flex gap-2">
                            <button
                                type="submit"
                                disabled={saving}
                                className="rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 px-4 py-2.5 text-sm font-medium text-white shadow-sm disabled:opacity-60"
                            >
                                {saving ? 'Saving...' : selectedProject ? 'Update Project' : 'Create Project'}
                            </button>
                            {selectedProject && (
                                <button
                                    type="button"
                                    onClick={resetForm}
                                    className="rounded-xl border border-gray-200 px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                                >
                                    Cancel
                                </button>
                            )}
                        </div>
                    </form>
                )}

                <div className="rounded-3xl border border-white/70 bg-white/90 p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900/90">
                    <div className="flex items-center justify-between mb-4">
                        <div>
                            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-500">All projects</p>
                            <h2 className="text-lg font-semibold text-gray-900 dark:text-slate-50">{projects.length} total</h2>
                        </div>
                        {!isManager && (
                            <p className="text-sm text-gray-500 dark:text-slate-400">Read-only view for employees</p>
                        )}
                    </div>

                    {projects.length === 0 ? (
                        <div className="rounded-2xl border border-dashed border-gray-200 bg-gray-50 p-8 text-center text-gray-500 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-400">
                            No projects yet.
                        </div>
                    ) : (
                        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                            {projects.map((project) => (
                                <div key={project.projectId} className="rounded-2xl border border-gray-200 bg-gradient-to-b from-white to-gray-50 p-4 shadow-sm dark:border-slate-800 dark:from-slate-900 dark:to-slate-950">
                                    <div className="flex items-start justify-between gap-3">
                                        <div>
                                            <h3 className="text-base font-semibold text-gray-900 dark:text-slate-50">{project.name}</h3>
                                            <p className="mt-1 text-sm text-gray-600 whitespace-pre-wrap dark:text-slate-300">{project.description || 'No description'}</p>
                                        </div>
                                        <span className="rounded-full bg-blue-50 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-blue-700 dark:bg-blue-950 dark:text-blue-200">
                                            Project
                                        </span>
                                    </div>
                                    <p className="mt-4 text-xs text-gray-400 dark:text-slate-500">
                                        Created {project.createdAt ? new Date(project.createdAt).toLocaleDateString() : 'unknown'}
                                    </p>

                                    {isManager && (
                                        <div className="mt-4 flex gap-2">
                                            <button
                                                onClick={() => openEditor(project.projectId)}
                                                className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-xs font-medium text-blue-700 hover:bg-blue-100 dark:border-blue-900 dark:bg-blue-950 dark:text-blue-200 dark:hover:bg-blue-900"
                                            >
                                                Edit
                                            </button>
                                            <button
                                                onClick={() => handleDelete(project.projectId)}
                                                className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-medium text-red-700 hover:bg-red-100 dark:border-red-900 dark:bg-red-950 dark:text-red-200 dark:hover:bg-red-900"
                                            >
                                                Delete
                                            </button>
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}