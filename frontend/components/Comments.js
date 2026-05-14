'use client';
import { useState, useEffect } from 'react';
import { getComments, createComment, deleteComment } from '../utils/api';
import { getCurrentUser } from '../utils/auth';
import toast from 'react-hot-toast';

export default function Comments({ taskId }) {
  const [comments, setComments] = useState([]);
  const [newComment, setNewComment] = useState('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const currentUser = getCurrentUser();

  useEffect(() => { fetchComments(); }, [taskId]);

  const fetchComments = async () => {
    setLoading(true);
    try {
      const res = await getComments(taskId);
      setComments(res.data);
    } catch (err) { toast.error('Failed to load comments'); }
    finally { setLoading(false); }
  };

  const handleSubmit = async () => {
    if (!newComment.trim()) return;
    setSubmitting(true);
    try {
      const res = await createComment(taskId, newComment);
      setComments([...comments, res.data]);
      setNewComment('');
      toast.success('Comment added');
    } catch (err) { toast.error('Failed to add comment'); }
    finally { setSubmitting(false); }
  };

  const handleDelete = async (commentId) => {
    try {
      await deleteComment(commentId);
      setComments(comments.filter(c => c.commentId !== commentId));
      toast.success('Comment deleted');
    } catch (err) { toast.error('Failed to delete comment'); }
  };

  return (
    <div className="mt-6">
      <h3 className="font-semibold text-gray-700 mb-3 text-sm uppercase tracking-wide">
        Comments ({comments.length})
      </h3>
      {loading ? (
        <p className="text-gray-400 text-sm">Loading comments...</p>
      ) : (
        <>
          {comments.length === 0 ? (
            <p className="text-gray-400 text-sm mb-4 text-center py-4 bg-gray-50 rounded">
              No comments yet. Be the first!
            </p>
          ) : (
            <div className="space-y-3 mb-4 max-h-60 overflow-y-auto">
              {comments.map((comment) => (
                <div key={comment.commentId} className="bg-gray-50 p-3 rounded-lg">
                  <div className="flex justify-between items-start">
                    <div className="flex-1">
                      <p className="text-sm font-medium text-blue-600">{comment.author}</p>
                      <p className="text-sm text-gray-700 mt-1">{comment.text}</p>
                      <p className="text-xs text-gray-400 mt-1">
                        {new Date(comment.createdAt).toLocaleString()}
                      </p>
                    </div>
                    {(currentUser?.username === comment.author ||
                      currentUser?.role === 'Manager') && (
                      <button
                        onClick={() => handleDelete(comment.commentId)}
                        className="text-red-400 hover:text-red-600 text-xs ml-2"
                      >
                        Delete
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
          <div className="flex gap-2">
            <input
              className="flex-1 border rounded-lg p-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
              placeholder="Write a comment..."
              value={newComment}
              onChange={(e) => setNewComment(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
            />
            <button
              onClick={handleSubmit}
              disabled={submitting}
              className="bg-blue-500 text-white px-4 py-2 rounded-lg text-sm hover:bg-blue-600 disabled:opacity-50"
            >
              {submitting ? '...' : 'Send'}
            </button>
          </div>
        </>
      )}
    </div>
  );
}