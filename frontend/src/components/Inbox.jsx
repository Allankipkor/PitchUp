import { useState, useEffect } from 'react';
import { inboxAPI } from '../utils';

export default function Inbox({ currentUser, onAuthRequired, onSelectGame }) {
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!currentUser) {
      onAuthRequired();
      return;
    }
    fetchNotifications();
  }, [currentUser]);

  const fetchNotifications = async () => {
    setLoading(true);
    setError('');
    try {
      const data = await inboxAPI.list();
      setNotifications(data);
    } catch (err) {
      setError(err.message || 'Failed to fetch inbox notifications.');
    } finally {
      setLoading(false);
    }
  };

  const handleMarkRead = async (id, e) => {
    e.stopPropagation(); // Prevent trigger click on parent container if we add one
    try {
      await inboxAPI.markRead(id);
      // Update local state to mark as read
      setNotifications(prev => 
        prev.map(n => n.id === id ? { ...n, read: true } : n)
      );
    } catch (err) {
      console.error('Failed to mark notification read:', err);
    }
  };

  if (!currentUser) {
    return (
      <div className="inbox-layout" style={{ textAlign: 'center', padding: '40px' }}>
        <p style={{ color: 'var(--text-secondary)' }}>You must be signed in to access your organizer inbox.</p>
      </div>
    );
  }

  return (
    <div className="inbox-layout">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <h2 style={{ fontSize: '24px' }}>In-app Inbox</h2>
        <button className="btn-reset" onClick={fetchNotifications} style={{ textDecoration: 'none', color: 'var(--accent)', fontWeight: 'bold' }}>
          🔄 Refresh
        </button>
      </div>

      {error && <p style={{ color: 'var(--danger)', marginBottom: '14px' }}>{error}</p>}
      
      {loading && notifications.length === 0 ? (
        <p style={{ textAlign: 'center', margin: '40px 0', color: 'var(--text-secondary)' }}>Loading messages...</p>
      ) : notifications.length === 0 ? (
        <div className="inbox-empty">
          <p style={{ fontSize: '18px', fontWeight: 'bold', marginBottom: '6px' }}>Your Inbox is Empty ⚽</p>
          <p style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
            When players join games you host, or when you are promoted from waitlists, you will receive alerts here.
          </p>
        </div>
      ) : (
        <div className="notifications-list">
          {notifications.map(notif => {
            const dateStr = new Date(notif.created_at).toLocaleDateString('en-GB', {
              day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit'
            });

            return (
              <div 
                key={notif.id} 
                className={`notification-card ${!notif.read ? 'unread' : ''}`}
                style={{ cursor: notif.related_game_id ? 'pointer' : 'default' }}
                onClick={() => notif.related_game_id && onSelectGame(notif.related_game_id)}
              >
                <div style={{ flex: 1 }}>
                  <p className="notification-message">{notif.message}</p>
                  <p className="notification-time">📅 {dateStr} {notif.related_game_id && <span style={{ color: 'var(--accent)', marginLeft: '8px' }}>(Click to view match)</span>}</p>
                </div>
                
                {!notif.read && (
                  <button 
                    className="btn-mark-read" 
                    onClick={(e) => handleMarkRead(notif.id, e)}
                  >
                    Mark Read
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
