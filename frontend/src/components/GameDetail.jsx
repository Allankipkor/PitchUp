import { useState, useEffect } from 'react';
import { gamesAPI, usersAPI, formatCurrency } from '../utils';

export default function GameDetail({ gameId, currentUser, onClose, onAuthRequired, onStateChange }) {
  const [game, setGame] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  
  // Tabs for the detail modal: 'details', 'roster', 'comments', 'organizer'
  const [activeTab, setActiveTab] = useState('details');
  const [commentText, setCommentText] = useState('');
  
  // Attendance state (for organizer review)
  const [attendance, setAttendance] = useState({});
  const [submittingAttendance, setSubmittingAttendance] = useState(false);

  // Participant reliability scores
  const [reliabilityScores, setReliabilityScores] = useState({});

  useEffect(() => {
    if (gameId) {
      fetchGameDetail();
    }
  }, [gameId, currentUser]);

  const fetchGameDetail = async () => {
    setLoading(true);
    setError('');
    try {
      const data = await gamesAPI.get(gameId);
      setGame(data);
      
      // Initialize attendance dictionary
      const attendanceMap = {};
      data.participants.forEach(p => {
        attendanceMap[p.user_id] = p.showed_up === null ? true : p.showed_up; // default to True for easy marking
      });
      setAttendance(attendanceMap);

      // Fetch reliability score for participants (to assist organizers in roster checks)
      const scores = {};
      const uniqueUserIds = [...new Set(data.participants.map(p => p.user_id))];
      for (const uid of uniqueUserIds) {
        try {
          const scoreData = await usersAPI.getReliability(uid);
          scores[uid] = scoreData;
        } catch (e) {
          // Ignore failed scores
        }
      }
      setReliabilityScores(scores);
    } catch (err) {
      setError(err.message || 'Failed to load game details.');
    } finally {
      setLoading(false);
    }
  };

  const handleJoin = async () => {
    if (!currentUser) {
      onAuthRequired();
      return;
    }
    setError('');
    try {
      await gamesAPI.join(gameId);
      await fetchGameDetail();
      if (onStateChange) onStateChange();
    } catch (err) {
      setError(err.message || 'Failed to join game.');
    }
  };

  const handleLeave = async () => {
    if (!currentUser) return;
    setError('');
    try {
      await gamesAPI.leave(gameId);
      await fetchGameDetail();
      if (onStateChange) onStateChange();
    } catch (err) {
      setError(err.message || 'Failed to leave game.');
    }
  };

  const handleAddComment = async (e) => {
    e.preventDefault();
    if (!commentText.trim()) return;
    if (!currentUser) {
      onAuthRequired();
      return;
    }
    setError('');
    try {
      await gamesAPI.addComment(gameId, commentText);
      setCommentText('');
      await fetchGameDetail();
    } catch (err) {
      setError(err.message || 'Failed to send comment.');
    }
  };

  const handleCancelGame = async () => {
    if (!confirm('Are you absolutely sure you want to cancel this game? All participants will be notified.')) return;
    setError('');
    try {
      await gamesAPI.cancel(gameId);
      onClose();
      if (onStateChange) onStateChange();
    } catch (err) {
      setError(err.message || 'Failed to cancel game.');
    }
  };

  const handleAttendanceChange = (userId, showedUp) => {
    setAttendance(prev => ({
      ...prev,
      [userId]: showedUp
    }));
  };

  const submitAttendanceLogs = async () => {
    setSubmittingAttendance(true);
    setError('');
    try {
      const payload = Object.entries(attendance).map(([userId, showedUp]) => ({
        user_id: userId,
        showed_up: showedUp
      }));
      await gamesAPI.recordAttendance(gameId, payload);
      alert('Attendance recorded successfully! Reliability metrics updated.');
      await fetchGameDetail();
    } catch (err) {
      setError(err.message || 'Failed to submit attendance.');
    } finally {
      setSubmittingAttendance(false);
    }
  };

  const copyShareLink = () => {
    const shareUrl = `${window.location.origin}/?game=${gameId}`;
    navigator.clipboard.writeText(shareUrl)
      .then(() => alert('Shareable game link copied to clipboard!'))
      .catch(() => alert('Failed to copy link.'));
  };

  if (loading) {
    return (
      <div className="modal-overlay">
        <div className="modal-content">
          <div className="modal-header">
            <h2 className="modal-title">Loading Details...</h2>
            <button className="btn-close" onClick={onClose}>×</button>
          </div>
          <div className="modal-body" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '200px' }}>
            <span style={{ color: 'var(--accent)' }}>Fetching pitch details...</span>
          </div>
        </div>
      </div>
    );
  }

  if (error && !game) {
    return (
      <div className="modal-overlay">
        <div className="modal-content">
          <div className="modal-header">
            <h2 className="modal-title">Error</h2>
            <button className="btn-close" onClick={onClose}>×</button>
          </div>
          <div className="modal-body">
            <p style={{ color: 'var(--danger)' }}>{error}</p>
          </div>
        </div>
      </div>
    );
  }

  const isOrganizer = currentUser && game.organizer_id === currentUser.id;
  const isJoined = currentUser && game.participants.some(p => p.user_id === currentUser.id);
  const isWaitlisted = currentUser && game.waitlist.some(p => p.user_id === currentUser.id);
  
  const isFull = game.spots_remaining === 0;
  const gamePassed = new Date(game.datetime) < new Date();
  
  const formattedDate = new Date(game.datetime).toLocaleDateString('en-GB', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
  });
  const formattedTime = new Date(game.datetime).toLocaleTimeString('en-GB', {
    hour: '2-digit', minute: '2-digit'
  });

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content large" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2 className="modal-title">{game.status === 'cancelled' ? '[CANCELLED] ' : ''}{game.title}</h2>
          <button className="btn-close" onClick={onClose}>×</button>
        </div>

        <div className="modal-body">
          {error && <p style={{ color: 'var(--danger)', marginBottom: '14px', fontWeight: 'bold' }}>{error}</p>}
          
          <div className="tabs-header">
            <button 
              className={`tab-btn ${activeTab === 'details' ? 'active' : ''}`}
              onClick={() => setActiveTab('details')}
            >
              Match Details
            </button>
            <button 
              className={`tab-btn ${activeTab === 'roster' ? 'active' : ''}`}
              onClick={() => setActiveTab('roster')}
            >
              Roster ({game.participants.length}/{game.spots_total})
            </button>
            <button 
              className={`tab-btn ${activeTab === 'comments' ? 'active' : ''}`}
              onClick={() => setActiveTab('comments')}
            >
              Comments ({game.comments.length})
            </button>
            {isOrganizer && (
              <button 
                className={`tab-btn ${activeTab === 'organizer' ? 'active' : ''}`}
                onClick={() => setActiveTab('organizer')}
              >
                Organizer Tools
              </button>
            )}
          </div>

          {/* TAB 1: DETAILS */}
          {activeTab === 'details' && (
            <div className="game-detail-layout">
              <div className="detail-meta-grid">
                <div className="meta-box">
                  <span className="meta-box-label">Kickoff Time</span>
                  <span className="meta-box-value">{formattedTime}</span>
                </div>
                <div className="meta-box">
                  <span className="meta-box-label">Kickoff Date</span>
                  <span className="meta-box-value">{formattedDate}</span>
                </div>
                <div className="meta-box">
                  <span className="meta-box-label">Format</span>
                  <span className="meta-box-value">{game.format}</span>
                </div>
                <div className="meta-box">
                  <span className="meta-box-label">Level</span>
                  <span className="meta-box-value" style={{ textTransform: 'capitalize' }}>{game.skill_level}</span>
                </div>
                <div className="meta-box">
                  <span className="meta-box-label">Spots Left</span>
                  <span className="meta-box-value" style={{ color: isFull ? 'var(--danger)' : 'var(--success)' }}>
                    {game.spots_remaining} / {game.spots_total}
                  </span>
                </div>
                <div className="meta-box">
                  <span className="meta-box-label">Cost</span>
                  <span className="meta-box-value">{formatCurrency(game.cost)}</span>
                </div>
              </div>

              <div className="game-description">
                <h4 style={{ color: 'var(--accent)', fontSize: '14px', marginBottom: '4px' }}>📍 Venue</h4>
                <p style={{ fontWeight: '500', marginBottom: '10px' }}>{game.address}</p>
                <h4 style={{ color: 'var(--accent)', fontSize: '14px', marginBottom: '4px' }}>📋 Match Organizer</h4>
                <p>{game.organizer.name}</p>
                {game.repeats_weekly && (
                  <p style={{ color: 'var(--accent)', fontSize: '12px', fontWeight: 'bold', marginTop: '10px' }}>
                    🔄 This game repeats weekly. Next week's slot is auto-created.
                  </p>
                )}
              </div>

              {/* Action buttons */}
              {game.status !== 'cancelled' && (
                <div className="join-section">
                  <div className="join-info">
                    {isJoined && <span className="join-info-title" style={{ color: 'var(--success)' }}>✓ You are joined!</span>}
                    {isWaitlisted && <span className="join-info-title" style={{ color: 'var(--warning)' }}>⏳ You are on the waitlist</span>}
                    {!isJoined && !isWaitlisted && (
                      <>
                        <span className="join-info-title">{isFull ? 'Waitlist Open' : 'Claim your spot'}</span>
                        <span className="join-info-subtitle">
                          {isFull ? 'Get promoted automatically if a spot opens up.' : 'Enter contact info upon click to register.'}
                        </span>
                      </>
                    )}
                  </div>
                  
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button className="btn-cancel" onClick={copyShareLink}>🔗 Share</button>
                    {isJoined && (
                      <button className="btn-cancel" onClick={handleLeave} style={{ borderColor: 'var(--danger)', color: 'var(--danger)' }}>
                        Leave Game
                      </button>
                    )}
                    {isWaitlisted && (
                      <button className="btn-cancel" onClick={handleLeave} style={{ borderColor: 'var(--danger)', color: 'var(--danger)' }}>
                        Cancel Waitlist
                      </button>
                    )}
                    {!isJoined && !isWaitlisted && (
                      <button 
                        className="btn-submit" 
                        onClick={handleJoin}
                        style={{ backgroundColor: isFull ? 'var(--warning)' : 'var(--accent)' }}
                      >
                        {isFull ? 'Join Waitlist' : 'I\'m In'}
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* TAB 2: ROSTER */}
          {activeTab === 'roster' && (
            <div>
              <h3 style={{ fontSize: '16px', marginBottom: '10px', color: 'var(--accent)' }}>Joined Players</h3>
              <div className="roster-list">
                {game.participants.length === 0 ? (
                  <p style={{ color: 'var(--text-secondary)', fontSize: '13px' }}>Nobody has joined yet.</p>
                ) : (
                  game.participants.map((p, index) => {
                    const rScore = reliabilityScores[p.user_id];
                    return (
                      <div key={p.id} className="roster-item">
                        <span className="roster-player-name">
                          {index + 1}. {p.user.name} {p.user_id === game.organizer_id && '👑'} 
                          {rScore && rScore.score !== null && (
                            <span style={{ fontSize: '11px', color: 'var(--text-secondary)', marginLeft: '8px' }}>
                              (Reliability: {rScore.score}%)
                            </span>
                          )}
                        </span>
                        <span className="roster-player-badge joined">Joined</span>
                      </div>
                    );
                  })
                )}
              </div>

              {game.waitlist.length > 0 && (
                <>
                  <h3 style={{ fontSize: '16px', margin: '20px 0 10px', color: 'var(--warning)' }}>Waitlist (Queue)</h3>
                  <div className="roster-list">
                    {game.waitlist.map((p, index) => {
                      const rScore = reliabilityScores[p.user_id];
                      return (
                        <div key={p.id} className="roster-item">
                          <span className="roster-player-name">
                            {index + 1}. {p.user.name}
                            {rScore && rScore.score !== null && (
                              <span style={{ fontSize: '11px', color: 'var(--text-secondary)', marginLeft: '8px' }}>
                                (Reliability: {rScore.score}%)
                              </span>
                            )}
                          </span>
                          <span className="roster-player-badge waitlisted">Waitlisted</span>
                        </div>
                      );
                    })}
                  </div>
                </>
              )}
            </div>
          )}

          {/* TAB 3: COMMENTS */}
          {activeTab === 'comments' && (
            <div>
              <div className="comments-thread">
                {game.comments.length === 0 ? (
                  <p style={{ color: 'var(--text-secondary)', textAlign: 'center', padding: '40px 0', fontSize: '13px' }}>
                    No comments yet. Coordinate kickoff details (e.g. "bringing bibs?") here.
                  </p>
                ) : (
                  game.comments.map(c => (
                    <div key={c.id} className="comment-item">
                      <div className="comment-author-row">
                        <span>{c.user.name} {c.user_id === game.organizer_id && '(Organizer)'}</span>
                        <span className="comment-time">{new Date(c.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                      </div>
                      <div className="comment-text">{c.text}</div>
                    </div>
                  ))
                )}
              </div>

              {game.status !== 'cancelled' && (
                <form onSubmit={handleAddComment} className="comment-input-form">
                  <input 
                    type="text" 
                    placeholder="Ask a question or type a message..." 
                    className="comment-input"
                    value={commentText}
                    onChange={(e) => setCommentText(e.target.value)}
                    required
                  />
                  <button type="submit" className="btn-send-comment">Post</button>
                </form>
              )}
            </div>
          )}

          {/* TAB 4: ORGANIZER TOOLS */}
          {activeTab === 'organizer' && isOrganizer && (
            <div>
              {/* Show contact details sheet since requester is verified owner */}
              <div className="organizer-panel">
                <h4 className="organizer-panel-title">📞 Participant Contact Details Sheet</h4>
                {game.participants_detail && game.participants_detail.length > 0 ? (
                  <table style={{ width: '100%', fontSize: '12px', borderCollapse: 'collapse', textAlign: 'left' }}>
                    <thead>
                      <tr style={{ borderBottom: '1px solid var(--border-color)', color: 'var(--accent)' }}>
                        <th style={{ padding: '6px 0' }}>Player</th>
                        <th>Email</th>
                        <th>Phone</th>
                        <th>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {game.participants_detail.map(p => (
                        <tr key={p.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
                          <td style={{ padding: '8px 0', fontWeight: 'bold' }}>{p.user_name}</td>
                          <td>{p.user_email}</td>
                          <td>{p.user_phone || 'None'}</td>
                          <td style={{ textTransform: 'capitalize' }}>{p.status}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <p style={{ fontSize: '13px' }}>No player contact details logged.</p>
                )}
              </div>

              {/* Attendance marking (only after kickoff passed) */}
              <div className="organizer-panel">
                <h4 className="organizer-panel-title">Show-up Attendance Log</h4>
                {!gamePassed ? (
                  <p style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
                    Attendance sheets become active once the game has kicked off on {formattedDate} @ {formattedTime}.
                  </p>
                ) : (
                  <div>
                    <p style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '10px' }}>
                      Mark players who actually showed up. Reliability scores will update.
                    </p>
                    <div className="attendance-list">
                      {game.participants.map(p => (
                        <div key={p.id} className="attendance-item">
                          <span style={{ fontSize: '13px', fontWeight: 'bold' }}>{p.user.name}</span>
                          <div className="attendance-actions">
                            <button 
                              className={`attendance-btn ${attendance[p.user_id] === true ? 'active-yes' : ''}`}
                              onClick={() => handleAttendanceChange(p.user_id, true)}
                            >
                              Showed Up
                            </button>
                            <button 
                              className={`attendance-btn ${attendance[p.user_id] === false ? 'active-no' : ''}`}
                              onClick={() => handleAttendanceChange(p.user_id, false)}
                            >
                              No-Show
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                    
                    <button 
                      className="btn-submit" 
                      onClick={submitAttendanceLogs} 
                      disabled={submittingAttendance}
                      style={{ marginTop: '16px', width: '100%' }}
                    >
                      {submittingAttendance ? 'Saving logs...' : 'Save Attendance Sheet'}
                    </button>
                  </div>
                )}
              </div>

              {/* Cancellation */}
              {game.status !== 'cancelled' && (
                <div style={{ marginTop: '20px' }}>
                  <button 
                    className="btn-cancel" 
                    onClick={handleCancelGame} 
                    style={{ borderColor: 'var(--danger)', color: 'var(--danger)', width: '100%' }}
                  >
                    Cancel Game Listing
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
