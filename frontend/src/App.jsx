import { useState, useEffect } from 'react';
import { authAPI, inboxAPI } from './utils';
import MapBrowse from './components/MapBrowse';
import ClubDirectory from './components/ClubDirectory';
import Inbox from './components/Inbox';
import Auth from './components/Auth';
import GameDetail from './components/GameDetail';
import PostGameForm from './components/PostGameForm';

export default function App() {
  const [currentUser, setCurrentUser] = useState(null);
  const [activeTab, setActiveTab] = useState('browse'); // 'browse', 'clubs', 'inbox', 'auth'
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  
  // Modal toggles
  const [selectedGameId, setSelectedGameId] = useState(null);
  const [showPostForm, setShowPostForm] = useState(false);
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [verifyToken, setVerifyToken] = useState(null);
  
  // Profile settings inputs
  const [profileName, setProfileName] = useState('');
  const [profilePhone, setProfilePhone] = useState('');
  const [profileError, setProfileError] = useState('');
  const [profileSaving, setProfileSaving] = useState(false);

  // Unread notifications badge count
  const [unreadCount, setUnreadCount] = useState(0);

  // Parse URL queries on load (magic links and shared game listings)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const token = params.get('token');
    const gameId = params.get('game');
    
    // Support router paths like /verify?token=XYZ
    const path = window.location.pathname;
    
    if (token || path === '/verify') {
      const urlToken = token || params.get('token');
      if (urlToken) {
        setVerifyToken(urlToken);
        setActiveTab('auth');
        // Clean URL query parameter to avoid infinite loops or double submits
        window.history.replaceState({}, document.title, window.location.pathname);
      }
    } else if (gameId) {
      setSelectedGameId(gameId);
      window.history.replaceState({}, document.title, window.location.pathname);
    }

    // Try to auto-resolve active session from cookies
    checkAuthSession();
  }, []);

  // Poll unread notifications if logged in
  useEffect(() => {
    let interval = null;
    if (currentUser) {
      fetchUnreadCount();
      interval = setInterval(fetchUnreadCount, 20000); // Check every 20s
    } else {
      setUnreadCount(0);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [currentUser]);

  const checkAuthSession = async () => {
    try {
      const user = await authAPI.getMe();
      setCurrentUser(user);
      setProfileName(user.name);
      setProfilePhone(user.phone || '');
    } catch (e) {
      // Not logged in or expired session
      setCurrentUser(null);
    }
  };

  const fetchUnreadCount = async () => {
    try {
      const data = await inboxAPI.list();
      const unread = data.filter(n => !n.read).length;
      setUnreadCount(unread);
    } catch (e) {
      // Ignore count fetch failures
    }
  };

  const handleLoginSuccess = (user) => {
    setCurrentUser(user);
    setProfileName(user.name);
    setProfilePhone(user.phone || '');
    setVerifyToken(null);
    setActiveTab('browse');
  };

  const handleLogout = async () => {
    try {
      await authAPI.logout();
    } catch (e) {
      // Ignore logout API failures
    }
    setCurrentUser(null);
    setShowProfileModal(false);
    setActiveTab('browse');
    window.location.reload();
  };

  const handleSaveProfile = async (e) => {
    e.preventDefault();
    setProfileSaving(true);
    setProfileError('');
    try {
      const user = await authAPI.updateMe(profileName, profilePhone);
      setCurrentUser(user);
      setShowProfileModal(false);
      alert('Profile updated successfully!');
    } catch (err) {
      setProfileError(err.message || 'Failed to update profile.');
    } finally {
      setProfileSaving(false);
    }
  };

  const triggerPostGame = () => {
    if (!currentUser) {
      setActiveTab('auth');
      return;
    }
    setShowPostForm(true);
  };

  return (
    <div className={`app-container ${activeTab === 'browse' ? 'hide-header-mobile' : ''}`}>
      {/* HEADER */}
      <header className="app-header">
        <div className="app-logo" onClick={() => setActiveTab('browse')} style={{ cursor: 'pointer' }}>
          PITCH<span className="logo-accent">UP</span>⚽
        </div>
        
        <nav className="app-nav">
          <button 
            className={`nav-link ${activeTab === 'browse' ? 'active' : ''}`}
            onClick={() => setActiveTab('browse')}
          >
            Browse
          </button>
          <button 
            className={`nav-link ${activeTab === 'clubs' ? 'active' : ''}`}
            onClick={() => setActiveTab('clubs')}
          >
            Clubs
          </button>
          <button 
            className={`nav-link ${activeTab === 'inbox' ? 'active' : ''}`}
            onClick={() => {
              if (!currentUser) {
                setActiveTab('auth');
              } else {
                setActiveTab('inbox');
              }
            }}
          >
            Inbox {unreadCount > 0 && <span style={{ background: 'var(--danger)', color: '#fff', fontSize: '10px', padding: '2px 6px', borderRadius: '10px', marginLeft: '4px' }}>{unreadCount}</span>}
          </button>
        </nav>

        <div>
          {currentUser ? (
            <button className="profile-btn" onClick={() => setShowProfileModal(true)}>
              👤 {currentUser.name}
            </button>
          ) : (
            <button className="btn-post-game" onClick={() => setActiveTab('auth')}>
              Sign In
            </button>
          )}
        </div>
      </header>

      {/* CORE SCREENS */}
      <main className="main-content">
        {activeTab === 'browse' && (
          <MapBrowse 
            onSelectGame={(id) => setSelectedGameId(id)}
            triggerPostGame={triggerPostGame}
            onAuthRequired={() => setActiveTab('auth')}
          />
        )}
        
        {activeTab === 'clubs' && (
          <ClubDirectory 
            currentUser={currentUser}
            onAuthRequired={() => setActiveTab('auth')}
          />
        )}
        
        {activeTab === 'inbox' && (
          <Inbox 
            currentUser={currentUser}
            onAuthRequired={() => setActiveTab('auth')}
            onSelectGame={(id) => {
              setSelectedGameId(id);
              setActiveTab('browse');
            }}
          />
        )}
        
        {activeTab === 'auth' && (
          <Auth 
            onLoginSuccess={handleLoginSuccess}
            verifyToken={verifyToken}
          />
        )}
      </main>

      {/* BOTTOM MOBILE NAV BAR */}
      <nav className="app-bottom-nav">
        <button 
          className={`bottom-nav-link ${activeTab === 'browse' ? 'active' : ''}`}
          onClick={() => setActiveTab('browse')}
        >
          <span className="bottom-nav-icon">🗺️</span>
          <span className="bottom-nav-label">Browse</span>
        </button>
        <button 
          className={`bottom-nav-link ${activeTab === 'clubs' ? 'active' : ''}`}
          onClick={() => setActiveTab('clubs')}
        >
          <span className="bottom-nav-icon">🛡️</span>
          <span className="bottom-nav-label">Clubs</span>
        </button>
        <button 
          className={`bottom-nav-link ${activeTab === 'inbox' ? 'active' : ''}`}
          onClick={() => {
            if (!currentUser) {
              setActiveTab('auth');
            } else {
              setActiveTab('inbox');
            }
          }}
        >
          <span className="bottom-nav-icon">
            📥
            {unreadCount > 0 && <span className="bottom-nav-badge">{unreadCount}</span>}
          </span>
          <span className="bottom-nav-label">Inbox</span>
      </nav>

      {/* FLOATING HAMBURGER MENU FOR MOBILE BROWSE VIEW */}
      {activeTab === 'browse' && (
        <button 
          className="mobile-hamburger-btn" 
          onClick={() => setMobileMenuOpen(true)}
          aria-label="Open Navigation Menu"
        >
          ☰
        </button>
      )}

      {/* MOBILE NAVIGATION MENU OVERLAY */}
      {mobileMenuOpen && (
        <div className="mobile-nav-overlay" onClick={() => setMobileMenuOpen(false)}>
          <div className="mobile-nav-menu" onClick={(e) => e.stopPropagation()}>
            <div className="mobile-nav-header">
              <div className="app-logo">
                PITCH<span className="logo-accent">UP</span>⚽
              </div>
              <button className="btn-close" onClick={() => setMobileMenuOpen(false)}>×</button>
            </div>
            <div className="mobile-nav-body">
              <button 
                type="button"
                className={`mobile-nav-item ${activeTab === 'browse' ? 'active' : ''}`}
                onClick={() => { setActiveTab('browse'); setMobileMenuOpen(false); }}
              >
                🗺️ Browse Games
              </button>
              <button 
                type="button"
                className={`mobile-nav-item ${activeTab === 'clubs' ? 'active' : ''}`}
                onClick={() => { setActiveTab('clubs'); setMobileMenuOpen(false); }}
              >
                🛡️ Club Directory
              </button>
              <button 
                type="button"
                className={`mobile-nav-item ${activeTab === 'inbox' ? 'active' : ''}`}
                onClick={() => { 
                  if (!currentUser) {
                    setActiveTab('auth');
                  } else {
                    setActiveTab('inbox');
                  }
                  setMobileMenuOpen(false); 
                }}
              >
                📥 Inbox {unreadCount > 0 && <span className="bottom-nav-badge" style={{ position: 'static', marginLeft: '6px' }}>{unreadCount}</span>}
              </button>
              
              <div style={{ marginTop: 'auto', paddingTop: '20px', borderTop: '1px solid var(--border-color)' }}>
                {currentUser ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    <button type="button" className="profile-btn-mobile" onClick={() => { setShowProfileModal(true); setMobileMenuOpen(false); }}>
                      👤 {currentUser.name} (Settings)
                    </button>
                    <button type="button" className="btn-cancel" onClick={() => { handleLogout(); setMobileMenuOpen(false); }} style={{ borderColor: 'var(--danger)', color: 'var(--danger)', width: '100%' }}>
                      Log Out
                    </button>
                  </div>
                ) : (
                  <button type="button" className="btn-submit" onClick={() => { setActiveTab('auth'); setMobileMenuOpen(false); }} style={{ width: '100%' }}>
                    Sign In
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* FLOATING MODALS */}
      
      {/* 1. Game Details Modal */}
      {selectedGameId && (
        <GameDetail 
          gameId={selectedGameId}
          currentUser={currentUser}
          onClose={() => setSelectedGameId(null)}
          onAuthRequired={() => {
            setSelectedGameId(null);
            setActiveTab('auth');
          }}
          onStateChange={fetchUnreadCount}
        />
      )}

      {/* 2. Host Game Form Modal */}
      {showPostForm && (
        <PostGameForm 
          currentUser={currentUser}
          onClose={() => setShowPostForm(false)}
          onGameCreated={(game) => {
            setShowPostForm(false);
            setSelectedGameId(game.id); // Open newly hosted game details immediately!
          }}
          onAuthRequired={() => {
            setShowPostForm(false);
            setActiveTab('auth');
          }}
        />
      )}

      {/* 3. User Profile Update Modal */}
      {showProfileModal && currentUser && (
        <div className="modal-overlay" onClick={() => setShowProfileModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2 className="modal-title">My Profile Settings</h2>
              <button className="btn-close" onClick={() => setShowProfileModal(false)}>×</button>
            </div>

            <form onSubmit={handleSaveProfile}>
              <div className="modal-body">
                {profileError && <p style={{ color: 'var(--danger)', marginBottom: '14px' }}>{profileError}</p>}
                
                <div className="form-group">
                  <label className="form-label">Email (Immutable)</label>
                  <input 
                    type="email" 
                    className="form-input" 
                    value={currentUser.email} 
                    disabled 
                    style={{ opacity: 0.6 }}
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">Display Name</label>
                  <input 
                    type="text" 
                    className="form-input" 
                    value={profileName}
                    onChange={(e) => setProfileName(e.target.value)}
                    required
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">Phone Number (For Match Coordination)</label>
                  <input 
                    type="tel" 
                    className="form-input" 
                    placeholder="e.g. 07123456789"
                    value={profilePhone}
                    onChange={(e) => setProfilePhone(e.target.value)}
                  />
                  <p style={{ fontSize: '11px', color: 'var(--text-dim)', marginTop: '4px' }}>
                    Note: Your contact details are ONLY shared with organizers of games you actively join.
                  </p>
                </div>
              </div>

              <div className="modal-footer" style={{ justifyContent: 'space-between' }}>
                <button type="button" className="btn-cancel" onClick={handleLogout} style={{ borderColor: 'var(--danger)', color: 'var(--danger)' }}>
                  Log Out
                </button>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button type="button" className="btn-cancel" onClick={() => setShowProfileModal(false)}>Cancel</button>
                  <button type="submit" className="btn-submit" disabled={profileSaving}>
                    {profileSaving ? 'Saving...' : 'Save Settings'}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
