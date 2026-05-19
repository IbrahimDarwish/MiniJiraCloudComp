'use client';
/* eslint-disable react-hooks/set-state-in-effect */
import { useState, useEffect } from 'react';
import Image from 'next/image';
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd';
import { getTasks, updateTaskStatus, getTeams } from '../../utils/api';
import { getCurrentUser, logoutUser } from '../../utils/auth';
import TaskModal from '../../components/TaskModal';
import CreateTaskModal from '../../components/CreateTaskModal';
import LoadingSpinner from '../../components/LoadingSpinner';
import { Toaster } from 'react-hot-toast';
import toast from 'react-hot-toast';
import { useRouter } from 'next/navigation';

const COLUMNS = ['To Do', 'In Progress', 'In Review', 'Done'];

const priorityColors = {
  'Critical': 'bg-red-100 text-red-700 border border-red-200',
  'High': 'bg-orange-100 text-orange-700 border border-orange-200',
  'Medium': 'bg-yellow-100 text-yellow-700 border border-yellow-200',
  'Low': 'bg-green-100 text-green-700 border border-green-200',
};

const columnAccents = {
  'To Do': 'from-slate-50 to-slate-100 border-slate-200',
  'In Progress': 'from-blue-50 to-blue-100 border-blue-200',
  'In Review': 'from-violet-50 to-violet-100 border-violet-200',
  'Done': 'from-emerald-50 to-emerald-100 border-emerald-200',
};

export default function BoardPage() {
  const router = useRouter();
  const [tasks, setTasks] = useState([]);
  const [teams, setTeams] = useState([]);
  const [loading, setLoading] = useState(true);
  const [hydrated, setHydrated] = useState(false);
  const [selectedTaskId, setSelectedTaskId] = useState(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [selectedTeamFilter, setSelectedTeamFilter] = useState('');
  const [currentUser, setCurrentUser] = useState(null);

  useEffect(() => {
    setCurrentUser(getCurrentUser());
    setHydrated(true);
  }, []);

  const fetchTasks = async (teamId = '') => {
    setLoading(true);
    try {
      const res = await getTasks(teamId ? { teamId } : {});
      setTasks(res.data);
    } catch { toast.error('Failed to load tasks'); }
    finally { setLoading(false); }
  };

  const fetchTeams = async () => {
    try {
      const res = await getTeams();
      setTeams(res.data);
    } catch { console.error('Failed to load teams'); }
  };

  useEffect(() => {
    if (!hydrated) return;
    if (!currentUser) { router.push('/login'); return; }
    fetchTasks();
    if (currentUser.role === 'Manager') fetchTeams();
  }, [router, currentUser, hydrated]);

  const isManager = currentUser?.role === 'Manager';
  const canEmployeeTransition = (fromStatus, toStatus) => {
    return (
      (fromStatus === 'To Do' && toStatus === 'In Progress') ||
      (fromStatus === 'In Progress' && toStatus === 'To Do') ||
      (fromStatus === 'In Progress' && toStatus === 'In Review')
    );
  };

  const isTaskDraggable = (task) => {
    if (isManager) return true;
    return task.status === 'To Do' || task.status === 'In Progress';
  };

  const allowedEmployeeMoves = [
    'To Do → In Progress',
    'In Progress → To Do',
    'In Progress → In Review',
  ];

  const handleDragEnd = async (result) => {
    if (!result.destination) return;
    if (result.destination.droppableId === result.source.droppableId) return;

    const taskId = result.draggableId;
    const newStatus = result.destination.droppableId;
    const task = tasks.find((t) => t.taskId === taskId);
    if (!task) return;

    if (!isManager && !canEmployeeTransition(task.status, newStatus)) {
      toast.error('Employees can move tasks only: To Do <-> In Progress, and In Progress -> In Review');
      return;
    }

    setTasks(prev => prev.map(t => t.taskId === taskId ? { ...t, status: newStatus } : t));
    try {
      await updateTaskStatus(taskId, newStatus);
      toast.success(`Moved to ${newStatus}`);
    } catch {
      toast.error('Failed to update status');
      fetchTasks(selectedTeamFilter);
    }
  };

  const getTasksByStatus = (status) => tasks.filter(t => t.status === status);

  if (!hydrated) {
    return <LoadingSpinner />;
  }

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,_#eff6ff_0%,_#f8fafc_42%,_#eef2ff_100%)] dark:bg-slate-950 dark:bg-none">
      <Toaster position="top-right" />
      <div className="bg-white/90 backdrop-blur border-b border-white/70 shadow-sm px-6 py-4 flex justify-between items-center sticky top-0 z-20 dark:bg-slate-900/90 dark:border-slate-800">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-gradient-to-br from-blue-600 to-indigo-600 rounded-lg flex items-center justify-center shadow-md shadow-blue-200">
            <span className="text-white text-sm font-bold">J</span>
          </div>
          <h1 className="text-lg font-bold text-gray-800">Mini-Jira</h1>
        </div>
        <div className="flex items-center gap-3">
          {currentUser?.role === 'Manager' && (
            <select
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
              value={selectedTeamFilter}
              onChange={(e) => { setSelectedTeamFilter(e.target.value); fetchTasks(e.target.value); }}
            >
              <option value="">All Teams</option>
              {teams.map(team => (
                <option key={team.teamId} value={team.teamId}>{team.name}</option>
              ))}
            </select>
          )}
          {currentUser?.role === 'Manager' && (
            <button
              onClick={() => setShowCreateModal(true)}
              className="bg-blue-500 text-white px-4 py-2 rounded-lg hover:bg-blue-600 text-sm font-medium"
            >
              + New Task
            </button>
          )}
          <button
            onClick={() => router.push('/projects')}
            className="rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-600 hover:bg-gray-50 hover:text-gray-900"
          >
            Projects
          </button>
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-gray-200 rounded-full flex items-center justify-center dark:bg-slate-800">
              <span className="text-xs font-medium text-gray-600">
                {currentUser?.email?.[0]?.toUpperCase()}
              </span>
            </div>
            <div>
              <p className="text-xs font-medium text-gray-700">{currentUser?.email}</p>
              <p className="text-xs text-gray-400">{currentUser?.role}</p>
            </div>
          </div>
          <button
            onClick={() => { logoutUser(); router.push('/login'); }}
            className="rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-600 hover:bg-gray-50 hover:text-gray-900"
          >
            Logout
          </button>
        </div>
      </div>

      {!isManager && (
        <div className="px-6 pt-5">
          <div className="rounded-2xl border border-blue-200 bg-gradient-to-r from-blue-50 via-sky-50 to-indigo-50 px-4 py-3 shadow-sm dark:border-slate-800 dark:from-slate-900 dark:via-slate-900 dark:to-slate-800">
            <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
              <div>
                <p className="text-sm font-semibold text-blue-950">Employee status moves</p>
                <p className="text-sm text-blue-900/80">Drag tasks only through these allowed transitions.</p>
              </div>
              <div className="flex flex-wrap gap-2">
                {allowedEmployeeMoves.map((move) => (
                  <span key={move} className="rounded-full border border-blue-200 bg-white/80 px-3 py-1 text-xs font-medium text-blue-900 shadow-sm dark:border-slate-700 dark:bg-slate-800/80 dark:text-slate-100">
                    {move}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {loading ? <LoadingSpinner /> : (
        <DragDropContext onDragEnd={handleDragEnd}>
          <div className="flex gap-4 px-6 py-6 overflow-x-auto">
            {COLUMNS.map(column => (
              <div key={column} className="flex-shrink-0 w-72">
                <div className={`rounded-2xl border bg-gradient-to-b ${columnAccents[column]} px-3 py-3 mb-3 shadow-sm dark:border-slate-800 dark:from-slate-900 dark:to-slate-900`}>
                  <div className="flex justify-between items-center mb-1">
                    <h3 className="font-semibold text-gray-800 text-sm">{column}</h3>
                    <span className="bg-white/80 text-gray-700 text-xs rounded-full px-2 py-0.5 border border-white/60 shadow-sm dark:bg-slate-800/80 dark:text-slate-100 dark:border-slate-700">
                      {getTasksByStatus(column).length}
                    </span>
                  </div>
                  <p className="text-xs text-gray-600">
                    {column === 'To Do' && 'Queued for work'}
                    {column === 'In Progress' && 'Work currently underway'}
                    {column === 'In Review' && 'Waiting for review'}
                    {column === 'Done' && 'Completed items'}
                  </p>
                </div>
                <Droppable droppableId={column}>
                  {(provided, snapshot) => (
                    <div
                      ref={provided.innerRef}
                      {...provided.droppableProps}
                      className={`min-h-32 rounded-2xl p-2 space-y-2 transition-colors border ${snapshot.isDraggingOver
                        ? 'bg-white/90 border-blue-300 border-dashed shadow-lg shadow-blue-100 dark:bg-slate-900/90 dark:border-slate-700 dark:shadow-black/20'
                        : 'bg-white/70 border-white/60 shadow-sm dark:bg-slate-900/70 dark:border-slate-800 dark:shadow-black/20'
                        }`}
                    >
                      {getTasksByStatus(column).length === 0 && !snapshot.isDraggingOver && (
                        <div className="flex flex-col items-center justify-center py-8 text-gray-400">
                          <p className="text-sm font-medium">No tasks here</p>
                          <p className="text-xs mt-1 text-gray-400">Drop a card here</p>
                        </div>
                      )}
                      {getTasksByStatus(column).map((task, index) => (
                        <Draggable
                          key={task.taskId}
                          draggableId={task.taskId}
                          index={index}
                          isDragDisabled={!isTaskDraggable(task)}
                        >
                          {(provided, snapshot) => (
                            <div
                              ref={provided.innerRef}
                              {...provided.draggableProps}
                              {...provided.dragHandleProps}
                              onClick={() => setSelectedTaskId(task.taskId)}
                              className={`group overflow-hidden bg-white rounded-xl transition-all border border-transparent dark:bg-slate-900 ${!isTaskDraggable(task)
                                ? 'cursor-not-allowed opacity-85'
                                : 'cursor-pointer hover:border-blue-200 hover:shadow-md'
                                } ${snapshot.isDragging ? 'shadow-xl ring-2 ring-blue-300 rotate-1' : 'shadow-sm'
                                }`}
                            >
                              {task.imageUrl && (
                                <div className="relative h-24 w-full bg-gray-100">
                                  <Image
                                    src={task.imageUrl}
                                    alt="Task"
                                    fill
                                    sizes="288px"
                                    className="object-cover"
                                  />
                                  <div className="absolute inset-x-0 bottom-0 h-10 bg-gradient-to-t from-black/45 to-transparent" />
                                  <span className="absolute bottom-2 left-2 rounded-full bg-white/90 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-gray-600 shadow-sm">
                                    {task.status}
                                  </span>
                                </div>
                              )}
                              <div className="p-3">
                                <div className="flex items-start justify-between gap-2 mb-2">
                                  <p className="font-medium text-sm text-gray-800 leading-snug">{task.title}</p>
                                  {!task.imageUrl && (
                                    <span className="shrink-0 rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-gray-500">
                                      {task.status}
                                    </span>
                                  )}
                                </div>
                                <div className="flex justify-between items-center">
                                  <span className={`text-xs px-2 py-0.5 rounded font-medium ${priorityColors[task.priority] || 'bg-gray-100 text-gray-600'}`}>
                                    {task.priority}
                                  </span>
                                  <span className="text-xs text-gray-400">{task.deadline}</span>
                                </div>
                                {currentUser?.role === 'Manager' && (
                                  <span className="text-xs text-gray-500 bg-gray-100 px-2 py-0.5 rounded mt-2 inline-block">
                                    {task.teamId}
                                  </span>
                                )}
                                {!isManager && task.status === 'In Progress' && (
                                  <p className="mt-2 text-[11px] font-medium text-blue-700">Can move to To Do or In Review</p>
                                )}
                              </div>
                            </div>
                          )}
                        </Draggable>
                      ))}
                      {provided.placeholder}
                    </div>
                  )}
                </Droppable>
              </div>
            ))}
          </div>
        </DragDropContext>
      )}

      {selectedTaskId && (
        <TaskModal
          taskId={selectedTaskId}
          onClose={() => setSelectedTaskId(null)}
          onDelete={(id) => setTasks(prev => prev.filter(t => t.taskId !== id))}
        />
      )}
      {showCreateModal && (
        <CreateTaskModal
          onClose={() => setShowCreateModal(false)}
          onCreated={(newTask) => { setTasks(prev => [...prev, newTask]); setShowCreateModal(false); }}
        />
      )}
    </div>
  );
}