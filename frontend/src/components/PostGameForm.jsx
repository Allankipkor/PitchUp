import { useState, useEffect, useRef } from 'react';
import L from 'leaflet';
import { gamesAPI, geocodeAddress } from '../utils';

export default function PostGameForm({ onClose, onGameCreated, onAuthRequired, currentUser }) {
  const [title, setTitle] = useState('');
  const [format, setFormat] = useState('5-a-side');
  const [skillLevel, setSkillLevel] = useState('casual');
  const [datetime, setDatetime] = useState('');
  const [spotsTotal, setSpotsTotal] = useState(10);
  const [cost, setCost] = useState('');
  const [address, setAddress] = useState('');
  const [latitude, setLatitude] = useState('');
  const [longitude, setLongitude] = useState('');
  const [repeatsWeekly, setRepeatsWeekly] = useState(false);
  
  const [geocoding, setGeocoding] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const mapRef = useRef(null);
  const mapInstance = useRef(null);
  const markerRef = useRef(null);

  // Initialize Map for location selection
  useEffect(() => {
    // If not authenticated, prompt auth
    if (!currentUser) {
      onAuthRequired();
      onClose();
      return;
    }

    if (!mapInstance.current && mapRef.current) {
      const defaultLat = 51.5074;
      const defaultLng = -0.1278;

      const map = L.map(mapRef.current, {
        zoomControl: true,
      }).setView([defaultLat, defaultLng], 11);

      L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
        attribution: '&copy; OpenStreetMap',
        maxZoom: 20
      }).addTo(map);

      // Create draggable selector marker
      const marker = L.marker([defaultLat, defaultLng], {
        draggable: true
      }).addTo(map);

      // Update lat/lng state when marker is dragged
      marker.on('dragend', () => {
        const position = marker.getLatLng();
        setLatitude(position.lat.toFixed(6));
        setLongitude(position.lng.toFixed(6));
      });

      // Handle map clicks to place marker
      map.on('click', (e) => {
        marker.setLatLng(e.latlng);
        setLatitude(e.latlng.lat.toFixed(6));
        setLongitude(e.latlng.lng.toFixed(6));
      });

      mapInstance.current = map;
      markerRef.current = marker;
      
      // Init input states
      setLatitude(defaultLat.toFixed(6));
      setLongitude(defaultLng.toFixed(6));
    }

    return () => {
      if (mapInstance.current) {
        mapInstance.current.remove();
        mapInstance.current = null;
      }
    };
  }, [currentUser]);

  // Geocode input text address
  const handleAddressLookup = async () => {
    if (!address.trim()) return;
    setGeocoding(true);
    setError('');
    try {
      const data = await geocodeAddress(address);
      if (data && data.latitude && data.longitude) {
        setLatitude(data.latitude.toFixed(6));
        setLongitude(data.longitude.toFixed(6));
        setAddress(data.address); // Use formatted address from geocoder
        
        if (mapInstance.current && markerRef.current) {
          const latLng = [data.latitude, data.longitude];
          mapInstance.current.setView(latLng, 14);
          markerRef.current.setLatLng(latLng);
        }
      }
    } catch (err) {
      setError(err.message || 'Address lookup failed. Try pinning location manually on map.');
    } finally {
      setGeocoding(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!title || !datetime || !spotsTotal || !latitude || !longitude || !address) {
      setError('Please fill in all required fields and set a pitch location.');
      return;
    }
    
    setSubmitting(true);
    setError('');

    try {
      const payload = {
        title,
        format,
        skill_level: skillLevel,
        datetime: new Date(datetime).toISOString(),
        spots_total: parseInt(spotsTotal),
        cost: cost ? parseFloat(cost) : null,
        address,
        latitude: parseFloat(latitude),
        longitude: parseFloat(longitude),
        repeats_weekly: repeatsWeekly
      };

      const game = await gamesAPI.create(payload);
      onGameCreated(game);
    } catch (err) {
      setError(err.message || 'Failed to post game. Please check inputs.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content large" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2 className="modal-title">Host a Pickup Match</h2>
          <button className="btn-close" onClick={onClose}>×</button>
        </div>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', height: 'calc(100% - 60px)' }}>
          <div className="modal-body">
            {error && <p style={{ color: 'var(--danger)', marginBottom: '14px', fontWeight: 'bold' }}>{error}</p>}
            
            <div className="form-grid">
              <div className="form-group form-full">
                <label className="form-label">Game Title / Name</label>
                <input 
                  type="text" 
                  className="form-input" 
                  placeholder="e.g. Wednesday Night 5s"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  required
                />
              </div>

              <div className="form-group">
                <label className="form-label">Format</label>
                <select className="form-select" value={format} onChange={(e) => setFormat(e.target.value)}>
                  <option value="5-a-side">5-a-side</option>
                  <option value="7-a-side">7-a-side</option>
                  <option value="11-a-side">11-a-side</option>
                </select>
              </div>

              <div className="form-group">
                <label className="form-label">Skill Level</label>
                <select className="form-select" value={skillLevel} onChange={(e) => setSkillLevel(e.target.value)}>
                  <option value="casual">Casual (Fun / All Welcome)</option>
                  <option value="competitive">Competitive (Experienced / Fast-paced)</option>
                </select>
              </div>

              <div className="form-group">
                <label className="form-label">Kickoff Date & Time</label>
                <input 
                  type="datetime-local" 
                  className="form-input"
                  value={datetime}
                  onChange={(e) => setDatetime(e.target.value)}
                  required
                />
              </div>

              <div className="form-group">
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                  <div>
                    <label className="form-label">Total Spots</label>
                    <input 
                      type="number" 
                      className="form-input"
                      min="2"
                      value={spotsTotal}
                      onChange={(e) => setSpotsTotal(e.target.value)}
                      required
                    />
                  </div>
                  <div>
                    <label className="form-label">Cost per Player (£)</label>
                    <input 
                      type="number" 
                      className="form-input"
                      step="0.01"
                      placeholder="e.g. 5.50 (leave blank for free)"
                      value={cost}
                      onChange={(e) => setCost(e.target.value)}
                    />
                  </div>
                </div>
              </div>

              <div className="form-group form-full">
                <label className="form-label">Pitch Address / Venue Lookup</label>
                <div className="address-lookup-group">
                  <input 
                    type="text" 
                    className="form-input"
                    placeholder="Type address or park name..."
                    value={address}
                    onChange={(e) => setAddress(e.target.value)}
                    required
                  />
                  <button type="button" className="btn-lookup" onClick={handleAddressLookup} disabled={geocoding}>
                    {geocoding ? 'Locating...' : 'Find on Map'}
                  </button>
                </div>
              </div>

              <div className="form-group form-full">
                <label className="form-label">Verify Pitch Position (Drag pin or click map to correct location)</label>
                <div ref={mapRef} className="form-map-picker"></div>
                <div style={{ display: 'flex', gap: '10px', fontSize: '11px', color: 'var(--text-secondary)', marginTop: '4px' }}>
                  <span>Lat: {latitude}</span>
                  <span>Lng: {longitude}</span>
                </div>
              </div>

              <div className="form-group form-full">
                <label className="form-checkbox-row">
                  <input 
                    type="checkbox"
                    checked={repeatsWeekly}
                    onChange={(e) => setRepeatsWeekly(e.target.checked)}
                  />
                  <span>🔄 Repeats Weekly (Auto-creates slot for following week)</span>
                </label>
              </div>
            </div>
          </div>

          <div className="modal-footer">
            <button type="button" className="btn-cancel" onClick={onClose} disabled={submitting}>Cancel</button>
            <button type="submit" className="btn-submit" disabled={submitting}>
              {submitting ? 'Creating Game...' : 'Host Game'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
