import axios from 'axios';

const api = axios.create({
  baseURL: process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost',
});

// Add AccessToken to every request automatically
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('accessToken');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// TASKS
export const getTasks = (filters = {}) =>
  api.get('/api/tasks', { params: filters });
export const getTask = (taskId) =>
  api.get(`/api/tasks/${taskId}`);
export const createTask = (formData) =>
  api.post('/api/tasks', formData, { headers: { 'Content-Type': 'multipart/form-data' } });
// PUT not PATCH — matches backend route exactly
export const updateTaskStatus = (taskId, status) =>
  api.put(`/api/tasks/${taskId}/status`, { status });
export const updateTaskImage = (taskId, formData) =>
  api.put(`/api/tasks/${taskId}/image`, formData, { headers: { 'Content-Type': 'multipart/form-data' } });
export const deleteTask = (taskId) =>
  api.delete(`/api/tasks/${taskId}`);
export const assignTask = (taskId, assigneeId, teamId) =>
  api.post(`/api/tasks/${taskId}/assign`, { assigneeId, teamId });

// COMMENTS
export const getComments = (taskId) =>
  api.get(`/api/comments/${taskId}`);
export const createComment = (taskId, text) =>
  api.post('/api/comments', { taskId, text });
export const deleteComment = (commentId) =>
  api.delete(`/api/comments/${commentId}`);

// TEAMS
export const getTeams = () => api.get('/api/teams');
export const createTeam = (name, description) =>
  api.post('/api/teams', { name, description });

// USERS
export const getUsers = () => api.get('/api/users');
export const getMe = () => api.get('/api/users/me');

// PROJECTS
export const getProjects = () => api.get('/api/projects');
export const getProject = (projectId) => api.get(`/api/projects/${projectId}`);
export const createProject = (name, description) =>
  api.post('/api/projects', { name, description });
export const updateProject = (projectId, name, description) =>
  api.put(`/api/projects/${projectId}`, { name, description });
export const deleteProject = (projectId) =>
  api.delete(`/api/projects/${projectId}`);

// COMMENT UPDATE
export const updateComment = (commentId, text) =>
  api.put(`/api/comments/${commentId}`, { text });

export default api;