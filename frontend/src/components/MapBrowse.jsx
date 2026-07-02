import { useState, useEffect, useRef } from 'react';
import L from 'leaflet';
import { gamesAPI, formatCurrency } from '../utils';

// Fix Leaflet marker icons in React imports
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
});

export default function MapBrowse({ onSelectGame, triggerPostGame, onAuthRequired }) {
  const [games, setGames] = useState([]);
  const [loading, setLoading] = useState(false);
  const [viewMode, setViewMode] = useState('list'); // 'list' or 'map' (for mobile responsive toggling)
  
  // Filters
  const [format, setFormat] = useState('');
  const [skillLevel, setSkillLevel] = useState('');
  const [date, setDate] = useState('');
  
  // Geolocation / Map tracking
  const [userLoc, setUserLoc] = useState(null);
  
  const mapRef = useRef(null);
  const mapInstance = useRef(null);
  const markersGroup = useRef(null);

  // Initialize Map
  useEffect(() => {
    if (!mapInstance.current && mapRef.current) {
      // Default to London center
      const defaultLat = 51.5074;
      const defaultLng = -0.1278;
      
      const map = L.map(mapRef.current, {
        zoomControl: true,
      }).setView([defaultLat, defaultLng], 12);
      
      // Use CartoDB Dark Matter tile layer for the premium sporty dark mode feel!
      L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
        subdomains: 'abcd',
        maxZoom: 20
      }).addTo(map);

      markersGroup.current = L.layerGroup().addTo(map);
      mapInstance.current = map;
      
      // Fix mobile touch/click event interception in Leaflet popups
      map.on('popupopen', (e) => {
        const container = e.popup._container;
        if (container) {
          const button = container.querySelector('.popup-view-details-btn');
          if (button) {
            const handleSelect = (event) => {
              event.preventDefault();
              event.stopPropagation();
              const gameId = button.getAttribute('data-game-id');
              if (gameId) {
                window.dispatchGameSelect(gameId);
              }
            };
            button.onclick = handleSelect;
            // Listen to touch events directly to bypass Leaflet click blocks on mobile
            button.ontouchend = handleSelect;
          }
        }
      });
      
      // Try to get user location on start
      locateUser(false); 
    }

    return () => {
      // Cleanup on unmount
      if (mapInstance.current) {
        mapInstance.current.remove();
        mapInstance.current = null;
      }
    };
  }, []);

  // Fetch Games
  useEffect(() => {
    fetchGames();
  }, [format, skillLevel, date, userLoc]);

  // Update Markers when Games change
  useEffect(() => {
    if (mapInstance.current && markersGroup.current) {
      markersGroup.current.clearLayers();
      
      games.forEach(game => {
        // Customize marker behavior
        const marker = L.marker([game.latitude, game.longitude])
          .bindPopup(`
            <div style="font-family: 'Inter', sans-serif; color: #000; padding: 4px;">
              <strong style="display:block; font-size:14px; font-family: 'Oswald', sans-serif; text-transform:uppercase;">${game.title}</strong>
              <span style="font-size:11px; color:#555;">${game.format} • ${game.skill_level}</span>
              <div style="margin-top:6px; display:flex; justify-content:space-between; align-items:center;">
                <span style="font-weight:bold; font-size:12px; color: ${game.spots_remaining === 0 ? '#ff3b30' : '#34c759'}">
                  ${game.spots_remaining === 0 ? 'Full' : `${game.spots_remaining} left`}
                </span>
                <button class="popup-view-details-btn" data-game-id="${game.id}" style="background:#bfff00; border:none; padding:4px 8px; font-weight:bold; font-size:11px; cursor:pointer; border-radius:3px; font-family: 'Oswald', sans-serif; text-transform:uppercase;">
                  View Details
                </button>
              </div>
            </div>
          `);
        markersGroup.current.addLayer(marker);
      });
      
      // If we have markers and userLoc is not set, zoom map to fit markers
      if (games.length > 0 && !userLoc && mapInstance.current) {
        const bounds = L.latLngBounds(games.map(g => [g.latitude, g.longitude]));
        mapInstance.current.fitBounds(bounds, { padding: [50, 50] });
      }
    }
  }, [games]);

  // Expose function globally so the Leaflet HTML popups can callback into React
  useEffect(() => {
    window.dispatchGameSelect = (id) => {
      onSelectGame(id);
    };
    return () => {
      delete window.dispatchGameSelect;
    };
  }, [onSelectGame]);

  const fetchGames = async () => {
    setLoading(true);
    try {
      const filters = { format, skill_level: skillLevel, date };
      if (userLoc) {
        filters.lat = userLoc.lat;
        filters.lng = userLoc.lng;
        filters.radius_km = 20.0;
      }
      const data = await gamesAPI.list(filters);
      setGames(data);
    } catch (err) {
      console.error('Error fetching games:', err);
    } finally {
      setLoading(false);
    }
  };

  const locateUser = (pan = true) => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const { latitude, longitude } = position.coords;
          const loc = { lat: latitude, lng: longitude };
          setUserLoc(loc);
          
          if (mapInstance.current && pan) {
            mapInstance.current.setView([latitude, longitude], 13);
            
            // Add or move a user position marker
            if (window.userMarker) {
              window.userMarker.setLatLng([latitude, longitude]);
            } else {
              const myIcon = L.divIcon({
                className: 'user-location-marker',
                html: '<div style="width:18px; height:18px; background:#007aff; border:3px solid #fff; border-radius:50%; box-shadow:0 0 10px rgba(0,0,0,0.5)"></div>',
                iconSize: [18, 18],
                iconAnchor: [9, 9]
              });
              window.userMarker = L.marker([latitude, longitude], { icon: myIcon })
                .addTo(mapInstance.current)
                .bindPopup("You are here");
            }
          }
        },
        (error) => {
          console.warn('Geolocation failed:', error);
        }
      );
    }
  };

  const resetFilters = () => {
    setFormat('');
    setSkillLevel('');
    setDate('');
    setUserLoc(null);
    if (mapInstance.current) {
      mapInstance.current.setView([51.5074, -0.1278], 12);
    }
  };

  return (
    <div className="browse-layout">
      {/* Search and List Sidebar */}
      <div className={`sidebar-container ${viewMode === 'map' ? 'hidden' : ''}`}>
        <div className="filter-bar">
          <div className="filter-row">
            <div className="filter-group">
              <label className="filter-label">Format</label>
              <select 
                className="filter-select" 
                value={format} 
                onChange={(e) => setFormat(e.target.value)}
              >
                <option value="">All</option>
                <option value="5-a-side">5-a-side</option>
                <option value="7-a-side">7-a-side</option>
                <option value="11-a-side">11-a-side</option>
              </select>
            </div>
            
            <div className="filter-group">
              <label className="filter-label">Skill</label>
              <select 
                className="filter-select"
                value={skillLevel}
                onChange={(e) => setSkillLevel(e.target.value)}
              >
                <option value="">All</option>
                <option value="casual">Casual</option>
                <option value="competitive">Competitive</option>
              </select>
            </div>

            <div className="filter-group">
              <label className="filter-label">Date</label>
              <input 
                type="date" 
                className="filter-input"
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
            </div>
          </div>

          <div className="filter-actions">
            <button className="btn-reset" onClick={resetFilters}>Reset</button>
            <button className="btn-post-game" onClick={triggerPostGame}>+ Post Game</button>
          </div>
        </div>

        <div className="listings-container">
          <h2 className="section-title">
            Games Nearby
            <span style={{ fontSize: '12px', color: 'var(--accent)' }}>
              {loading ? 'Searching...' : `${games.length} games`}
            </span>
          </h2>
          
          {loading && games.length === 0 ? (
            <p style={{ textAlign: 'center', margin: '40px 0', color: 'var(--text-secondary)' }}>Searching pitches...</p>
          ) : games.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--text-secondary)' }}>
              <p>No games matching filters.</p>
              <p style={{ fontSize: '12px', marginTop: '6px', color: 'var(--text-dim)' }}>
                Host your own pickup game and share the link!
              </p>
            </div>
          ) : (
            games.map(game => {
              // Extract date formatting
              const dt = new Date(game.datetime);
              const dateStr = dt.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
              const timeStr = dt.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
              const isFull = game.spots_remaining === 0;

              return (
                <div 
                  key={game.id} 
                  className={`game-card format-${game.format.split('-')[0]}`}
                  onClick={() => onSelectGame(game.id)}
                >
                  <div className="game-card-header">
                    <h3 className="game-card-title">{game.title}</h3>
                    <span className={`game-card-badge level-${game.skill_level}`}>
                      {game.skill_level}
                    </span>
                  </div>
                  
                  <div style={{ fontSize: '13px', fontWeight: '500', marginBottom: '8px', color: 'var(--text-primary)' }}>
                    📍 {game.address.split(',')[0]}
                  </div>

                  <div className="game-card-detail-row">
                    <span>📅 {dateStr} @ {timeStr}</span>
                    <span>⚽ {game.format}</span>
                  </div>

                  <div className="game-card-footer">
                    <span className={`spots-badge ${isFull ? 'full' : 'open'}`}>
                      {isFull ? '🚫 GAME FULL' : `🔥 ${game.spots_remaining} spots open`}
                    </span>
                    <span className="cost-display">
                      {formatCurrency(game.cost)}
                    </span>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Map Content */}
      <div className="map-container-wrapper">
        <div ref={mapRef} style={{ width: '100%', height: '100%' }}></div>
        <button className="near-me-btn" onClick={() => locateUser(true)}>
          🎯 Near Me
        </button>
        <button className="floating-add-game-btn" onClick={triggerPostGame} title="Host Pickup Game">
          ➕
        </button>
      </div>

      {/* Mobile Toggle Bar */}
      <div className="mobile-view-toggle">
        <button 
          className={`mobile-toggle-btn ${viewMode === 'list' ? 'active' : ''}`}
          onClick={() => setViewMode('list')}
        >
          List view
        </button>
        <button 
          className={`mobile-toggle-btn ${viewMode === 'map' ? 'active' : ''}`}
          onClick={() => setViewMode('map')}
        >
          Map view
        </button>
      </div>
    </div>
  );
}
