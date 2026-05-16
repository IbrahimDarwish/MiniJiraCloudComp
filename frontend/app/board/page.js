'use client';
import { useState, useEffect } from 'react';
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

export default function BoardPage() {
  const router = useRouter();
  const [tasks, setTasks] = useState([]);
  const [teams, setTeams] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedTaskId, setSelectedTaskId] = useState(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [selectedTeamFilter, setSelectedTeamFilter] = useState('');
  const [currentUser, setCurrentUser] = useState(null);

  useEffect(() => {
    setCurrentUser(getCurrentUser());
  }, []);

  useEffect(() => {
    if (currentUser === null) return;
    if (!currentUser) { router.push('/login'); return; }
    fetchTasks();
    if (currentUser.role === 'Manager') fetchTeams();
  }, [currentUser]);

  const fetchTasks = async (teamId = '') => {
    setLoading(true);
    try {
      const res = await getTasks(teamId ? { teamId } : {});
      setTasks(res.data);
    } catch (err) { toast.error('Failed to load tasks'); }
    finally { setLoading(false); }
  };

  const fetchTeams = async () => {
    try {
      const res = await getTeams();
      setTeams(res.data);
    } catch (err) { console.error('Failed to load teams'); }
  };

  const handleDragEnd = async (result) => {
    if (!result.destination) return;
    if (result.destination.droppableId === result.source.droppableId) return;
    const taskId = result.draggableId;
    const newStatus = result.destination.droppableId;
    setTasks(prev => prev.map(t => t.taskId === taskId ? { ...t, status: newStatus } : t));
    try {
      await updateTaskStatus(taskId, newStatus);
      toast.success(`Moved to ${newStatus}`);
    } catch (err) {
      toast.error('Failed to update status');
      fetchTasks(selectedTeamFilter);
    }
  };

  const getTasksByStatus = (status) => tasks.filter(t => t.status === status);

  return (
    <div className="min-h-screen bg-gray-100">
      <Toaster position="top-right" />
      <div className="bg-white shadow-sm px-6 py-4 flex justify-between items-center">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-blue-500 rounded-lg flex items-center justify-center">
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
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-gray-200 rounded-full flex items-center justify-center">
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
            className="text-gray-400 hover:text-gray-600 text-sm"
          >
            Logout
          </button>
        </div>
      </div>

      {loading ? <LoadingSpinner /> : (
        <DragDropContext onDragEnd={handleDragEnd}>
          <div className="flex gap-4 px-6 py-6 overflow-x-auto">
            {COLUMNS.map(column => (
              <div key={column} className="flex-shrink-0 w-72">
                <div className="flex justify-between items-center mb-3">
                  <h3 className="font-semibold text-gray-700 text-sm">{column}</h3>
                  <span className="bg-gray-200 text-gray-600 text-xs rounded-full px-2 py-0.5">
                    {getTasksByStatus(column).length}
                  </span>
                </div>
                <Droppable droppableId={column}>
                  {(provided, snapshot) => (
                    <div
                      ref={provided.innerRef}
                      {...provided.droppableProps}
                      className={`min-h-32 rounded-xl p-2 space-y-2 transition-colors ${
                        snapshot.isDraggingOver
                          ? 'bg-blue-50 border-2 border-blue-200 border-dashed'
                          : 'bg-gray-200'
                      }`}
                    >
                      {getTasksByStatus(column).length === 0 && !snapshot.isDraggingOver && (
                        <div className="flex flex-col items-center justify-center py-8 text-gray-400">
                          <p className="text-sm">No tasks here</p>
                        </div>
                      )}
                      {getTasksByStatus(column).map((task, index) => (
                        <Draggable key={task.taskId} draggableId={task.taskId} index={index}>
                          {(provided, snapshot) => (
                            <div
                              ref={provided.innerRef}
                              {...provided.draggableProps}
                              {...provided.dragHandleProps}
                              onClick={() => setSelectedTaskId(task.taskId)}
                              className={`bg-white p-3 rounded-lg cursor-pointer transition-all ${
                                snapshot.isDragging ? 'shadow-xl rotate-2' : 'shadow-sm hover:shadow-md'
                              }`}
                            >
                              <p className="font-medium text-sm text-gray-800 mb-2">{task.title}</p>
                              {task.imageUrl && (
                                <img src={task.imageUrl} alt="Task" className="w-full h-24 object-cover rounded mb-2" />
                              )}
                              <div className="flex justify-between items-center">
                                <span className={`text-xs px-2 py-0.5 rounded font-medium ${priorityColors[task.priority] || 'bg-gray-100 text-gray-600'}`}>
                                  {task.priority}
                                </span>
                                <span className="text-xs text-gray-400">{task.deadline}</span>
                              </div>
                              {currentUser?.role === 'Manager' && (
                                <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded mt-2 inline-block">
                                  {task.teamId}
                                </span>
                              )}
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