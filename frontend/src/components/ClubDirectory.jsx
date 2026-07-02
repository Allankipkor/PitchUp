import { useState, useEffect, useRef } from 'react';
import L from 'leaflet';
import { clubsAPI, geocodeAddress } from '../utils';

export default function ClubDirectory({ currentUser, onAuthRequired }) {
  const [clubs, setClubs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState('');

  // Form fields
  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [latitude, setLatitude] = useState('');
  const [longitude, setLongitude] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [description, setDescription] = useState('');
  const [positions, setPositions] = useState({
    Goalkeeper: false,
    Defender: false,
    Midfielder: false,
    Striker: false,
  });
  
  const [geocoding, setGeocoding] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const mapRef = useRef(null);
  const mapInstance = useRef(null);
  const markerRef = useRef(null);

  useEffect(() => {
    fetchClubs();
  }, []);

  // Initialize Map for club listing form
  useEffect(() => {
    if (showForm && !mapInstance.current && mapRef.current) {
      const defaultLat = 51.5074;
      const defaultLng = -0.1278;

      const map = L.map(mapRef.current, {
        zoomControl: true,
      }).setView([defaultLat, defaultLng], 11);

      L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
        attribution: '&copy; OpenStreetMap contributors'
      }).addTo(map);

      const marker = L.marker([defaultLat, defaultLng], {
        draggable: true
      }).addTo(map);

      marker.on('dragend', () => {
        const position = marker.getLatLng();
        setLatitude(position.lat.toFixed(6));
        setLongitude(position.lng.toFixed(6));
      });

      map.on('click', (e) => {
        marker.setLatLng(e.latlng);
        setLatitude(e.latlng.lat.toFixed(6));
        setLongitude(e.latlng.lng.toFixed(6));
      });

      mapInstance.current = map;
      markerRef.current = marker;
      setLatitude(defaultLat.toFixed(6));
      setLongitude(defaultLng.toFixed(6));
    }

    return () => {
      if (!showForm && mapInstance.current) {
        mapInstance.current.remove();
        mapInstance.current = null;
      }
    };
  }, [showForm]);

  const fetchClubs = async () => {
    setLoading(true);
    try {
      const data = await clubsAPI.list();
      setClubs(data);
    } catch (err) {
      console.error('Error fetching clubs:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleOpenForm = () => {
    if (!currentUser) {
      onAuthRequired();
      return;
    }
    setError('');
    setShowForm(true);
    
    // Autofill contact email with user email
    if (currentUser) {
      setContactEmail(currentUser.email);
    }
  };

  const handleAddressLookup = async () => {
    if (!address.trim()) return;
    setGeocoding(true);
    setError('');
    try {
      const data = await geocodeAddress(address);
      if (data && data.latitude && data.longitude) {
        setLatitude(data.latitude.toFixed(6));
        setLongitude(data.longitude.toFixed(6));
        setAddress(data.address);
        
        if (mapInstance.current && markerRef.current) {
          const latLng = [data.latitude, data.longitude];
          mapInstance.current.setView(latLng, 14);
          markerRef.current.setLatLng(latLng);
        }
      }
    } catch (err) {
      setError(err.message || 'Address lookup failed. Try pinning manually on map.');
    } finally {
      setGeocoding(false);
    }
  };

  const handlePositionToggle = (pos) => {
    setPositions(prev => ({
      ...prev,
      [pos]: !prev[pos]
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const lookingForList = Object.entries(positions)
      .filter(([_, checked]) => checked)
      .map(([pos, _]) => pos);

    if (!name || !address || !latitude || !longitude || !contactEmail || !description) {
      setError('Please fill in all required fields and set home ground coordinates.');
      return;
    }

    if (lookingForList.length === 0) {
      setError('Please select at least one recruiting position.');
      return;
    }

    setSubmitting(true);
    setError('');

    try {
      const payload = {
        name,
        address,
        latitude: parseFloat(latitude),
        longitude: parseFloat(longitude),
        contact_email: contactEmail,
        contact_phone: contactPhone || null,
        looking_for: lookingForList,
        description,
        status: 'recruiting'
      };

      await clubsAPI.create(payload);
      setShowForm(false);
      
      // Reset form fields
      setName('');
      setAddress('');
      setContactPhone('');
      setDescription('');
      setPositions({ Goalkeeper: false, Defender: false, Midfielder: false, Striker: false });
      
      fetchClubs();
    } catch (err) {
      setError(err.message || 'Failed to list club.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="clubs-layout">
      <div className="clubs-header">
        <div>
          <h2 style={{ fontSize: '24px' }}>Clubs Directory</h2>
          <p style={{ color: 'var(--text-secondary)', fontSize: '13px' }}>
            Find grassroots clubs recruiting players or list your own squad.
          </p>
        </div>
        <button className="btn-post-game" onClick={handleOpenForm}>+ List your club</button>
      </div>

      {loading && clubs.length === 0 ? (
        <p style={{ textAlign: 'center', margin: '40px 0', color: 'var(--text-secondary)' }}>Searching club houses...</p>
      ) : clubs.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '60px 20px', background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: '8px' }}>
          <p style={{ color: 'var(--text-secondary)' }}>No clubs registered in directory yet.</p>
          <p style={{ fontSize: '12px', marginTop: '6px', color: 'var(--text-dim)' }}>
            Be the first to list your local squad looking for new talent!
          </p>
        </div>
      ) : (
        <div className="clubs-grid">
          {clubs.map(club => (
            <div key={club.id} className="club-card">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <h3 className="club-card-title">{club.name}</h3>
                <span className="club-recruiting-badge">{club.status}</span>
              </div>
              
              <div style={{ fontSize: '12px', fontWeight: '500', color: 'var(--text-primary)' }}>
                📍 {club.address.split(',')[0]}
              </div>

              <div className="club-description">{club.description}</div>

              <div>
                <span className="club-positions-label">Recruiting:</span>
                <div className="club-positions-list">
                  {club.looking_for.map(pos => (
                    <span key={pos} className="club-position-tag">{pos}</span>
                  ))}
                </div>
              </div>

              <div className="club-contact-info">
                <strong>Owner:</strong> {club.owner.name} <br/>
                <strong>Email:</strong> {club.contact_email} 
                {club.contact_phone && <> <br/><strong>Phone:</strong> {club.contact_phone}</>}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* List Club Modal Form */}
      {showForm && (
        <div className="modal-overlay" onClick={() => setShowForm(false)}>
          <div className="modal-content large" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2 className="modal-title">List Your Football Club</h2>
              <button className="btn-close" onClick={() => setShowForm(false)}>×</button>
            </div>

            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', height: 'calc(100% - 60px)' }}>
              <div className="modal-body">
                {error && <p style={{ color: 'var(--danger)', marginBottom: '14px', fontWeight: 'bold' }}>{error}</p>}
                
                <div className="form-grid">
                  <div className="form-group form-full">
                    <label className="form-label">Club Name</label>
                    <input 
                      type="text" 
                      className="form-input" 
                      placeholder="e.g. North London FC"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      required
                    />
                  </div>

                  <div className="form-group">
                    <label className="form-label">Contact Email</label>
                    <input 
                      type="email" 
                      className="form-input"
                      value={contactEmail}
                      onChange={(e) => setContactEmail(e.target.value)}
                      required
                    />
                  </div>

                  <div className="form-group">
                    <label className="form-label">Contact Phone (Optional)</label>
                    <input 
                      type="tel" 
                      className="form-input"
                      placeholder="e.g. 07123456789"
                      value={contactPhone}
                      onChange={(e) => setContactPhone(e.target.value)}
                    />
                  </div>

                  <div className="form-group form-full">
                    <label className="form-label">Recruiting Positions (Select all that apply)</label>
                    <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', marginTop: '6px' }}>
                      {Object.keys(positions).map(pos => (
                        <label key={pos} className="form-checkbox-row" style={{ marginTop: 0 }}>
                          <input 
                            type="checkbox"
                            checked={positions[pos]}
                            onChange={() => handlePositionToggle(pos)}
                          />
                          <span>{pos}</span>
                        </label>
                      ))}
                    </div>
                  </div>

                  <div className="form-group form-full">
                    <label className="form-label">Home Ground / Clubhouse Address Lookup</label>
                    <div className="address-lookup-group">
                      <input 
                        type="text" 
                        className="form-input"
                        placeholder="Type ground address or postcode..."
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
                    <label className="form-label">Pin Clubhouse Location (Drag pin or click map to correct location)</label>
                    <div ref={mapRef} className="form-map-picker"></div>
                    <div style={{ display: 'flex', gap: '10px', fontSize: '11px', color: 'var(--text-secondary)', marginTop: '4px' }}>
                      <span>Lat: {latitude}</span>
                      <span>Lng: {longitude}</span>
                    </div>
                  </div>

                  <div className="form-group form-full">
                    <label className="form-label">Short Description / Recruitment Blurb</label>
                    <textarea 
                      className="form-textarea" 
                      placeholder="e.g. We play Saturdays in the County league. Looking for an experienced goalkeeper and center back to strengthen our first team..."
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      required
                    />
                  </div>
                </div>
              </div>

              <div className="modal-footer">
                <button type="button" className="btn-cancel" onClick={() => setShowForm(false)} disabled={submitting}>Cancel</button>
                <button type="submit" className="btn-submit" disabled={submitting}>
                  {submitting ? 'Registering Club...' : 'List Club'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
