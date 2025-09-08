import { useState, useEffect } from 'react';
import './App.css';

function App() {
  const [step, setStep] = useState('signin');
  const [credentials, setCredentials] = useState({ username: '', password: '' });
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [token, setToken] = useState(localStorage.getItem('token'));
  const [userRole, setUserRole] = useState(null);
  const [files, setFiles] = useState([]);
  const [file, setFile] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [favorites, setFavorites] = useState(() => JSON.parse(localStorage.getItem('favorites')) || []);
  const [view, setView] = useState('all');
  const [uploading, setUploading] = useState(false);

 
  const [showRename, setShowRename] = useState(false);
  const [renameOld, setRenameOld] = useState('');
  const [renameNew, setRenameNew] = useState('');
  const [renameError, setRenameError] = useState('');
  const [renaming, setRenaming] = useState(false);

  useEffect(() => {
    if (!token) return;
    try {
      const parts = token.split('.');
      if (parts.length !== 3) throw new Error("Invalid JWT");
      const payload = JSON.parse(atob(parts[1]));
      setUserRole(payload.role);
      localStorage.setItem('token', token);
      fetchFiles(token);
      setStep('authenticated');
    } catch {
      setUserRole(null);
      localStorage.removeItem('token');
    }
  }, [token]);

  useEffect(() => {
    localStorage.setItem('favorites', JSON.stringify(favorites));
  }, [favorites]);

  const fetchFiles = async (authToken) => {
    try {
      const res = await fetch('http://localhost:5000/files', {
        headers: authToken ? { Authorization: `Bearer ${authToken}` } : {},
      });
      const data = await res.json();
      setFiles(data);
    } catch (e) {
      console.error('Failed to fetch files', e);
    }
  };

  const handleSignIn = async () => {
    setError('');
    const res = await fetch('http://localhost:5000/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(credentials),
    });
    const data = await res.json();
    if (data.step === 'need_sms') setStep('need_sms');
    else setError(data.error || 'Login failed.');
  };

  const handleSendCode = async () => {
    setError('');
    const res = await fetch('http://localhost:5000/send-code', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone }),
    });
    const data = await res.json();
    if (data.status === 'pending') setStep('totp');
    else setError(data.error || 'Failed to send code.');
  };

  const handleVerifyCode = async () => {
    setError('');
    const res = await fetch('http://localhost:5000/verify-code', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: credentials.username, phone, code }),
    });
    const data = await res.json();
    if (data.token) setToken(data.token);
    else setError(data.error || 'Invalid code.');
  };

  const handleLogout = () => {
    localStorage.removeItem('token');
    setToken(null);
    setUserRole(null);
    setStep('signin');
    setFiles([]);
    setPhone('');
    setCode('');
  };

  const handleUpload = async () => {
    if (!file) return alert('Please select a file to upload.');
    setUploading(true);
    const form = new FormData();
    form.append('file', file);

    try {
      const res = await fetch('http://localhost:5000/upload', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: form,
      });

      if (!res.ok) {
        const errText = await res.text();
        alert('Upload error: ' + errText);
        setUploading(false);
        return;
      }

      await fetchFiles(token);
      setFile(null);
      document.querySelector('.file-input').value = ''; // clear input
    } catch (err) {
      alert('Upload failed: ' + err.message);
    }
    setUploading(false);
  };

  const handleDelete = async (filename) => {
    if (!window.confirm(`Delete "${filename}"?`)) return;

    try {
      const res = await fetch('http://localhost:5000/files', {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ filename }),
      });

      if (!res.ok) {
        const errText = await res.text();
        alert('Delete error: ' + errText);
        return;
      }

      await fetchFiles(token);
    } catch (err) {
      alert('Delete failed: ' + err.message);
    }
  };

  const handleFavoriteToggle = (filename) => {
    setFavorites(prev =>
      prev.includes(filename)
        ? prev.filter(f => f !== filename)
        : [...prev, filename]
    );
  };

  const onDrop = (e) => {
    e.preventDefault();
    const droppedFile = e.dataTransfer.files[0];
    if (droppedFile) {
      setFile(droppedFile);
    }
  };

  // Always pass just the file name to DELETE, never the URL!
  const filteredFiles = files
    .filter(f => view === 'all' || favorites.includes(f.split('/').pop()))
    .filter(f => f.toLowerCase().includes(searchTerm.toLowerCase()));

  const downloadFile = (link, filename) => {
    const a = document.createElement('a');
    a.href = link;
    a.setAttribute('download', filename);
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  
  const handleRename = async (e) => {
    e.preventDefault();
    if (!renameOld || !renameNew) {
      setRenameError("Both fields required");
      return;
    }
    setRenaming(true);
    setRenameError('');
    try {
      const res = await fetch('http://localhost:5000/rename-file', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ oldName: renameOld, newName: renameNew }),
      });
      if (!res.ok) {
        const err = await res.json();
        setRenameError(err.error || 'Rename failed');
      } else {
        await fetchFiles(token);
        setShowRename(false);
        setRenameOld('');
        setRenameNew('');
      }
    } catch (err) {
      setRenameError('Rename failed: ' + err.message);
    }
    setRenaming(false);
  };

  return (
    <div className="app">
      {step !== 'authenticated' ? (
        <div className="auth-container">
          <h1>Login</h1>
          {step === 'signin' && (
            <div className="form-box">
              <input
                placeholder="Username"
                value={credentials.username}
                onChange={e => setCredentials({ ...credentials, username: e.target.value })}
              />
              <input
                type="password"
                placeholder="Password"
                value={credentials.password}
                onChange={e => setCredentials({ ...credentials, password: e.target.value })}
              />
              <button onClick={handleSignIn}>Sign In</button>
              {error && <p className="error">{error}</p>}
            </div>
          )}
          {step === 'need_sms' && (
            <div className="form-box">
              <input
                placeholder="Phone number (+1234567890)"
                value={phone}
                onChange={e => setPhone(e.target.value)}
              />
              <button onClick={handleSendCode}>Send Code</button>
              {error && <p className="error">{error}</p>}
            </div>
          )}
          {step === 'totp' && (
            <div className="form-box">
              <input
                placeholder="6-digit code"
                value={code}
                onChange={e => setCode(e.target.value)}
              />
              <button onClick={handleVerifyCode}>Verify Code</button>
              {error && <p className="error">{error}</p>}
            </div>
          )}
        </div>
      ) : (
        <div className="dashboard" onDragOver={e => e.preventDefault()} onDrop={onDrop}>
          <aside className="sidebar">
            <h2>FileDrive</h2>
            <nav>
              <ul>
                <li onClick={() => setView('all')}>📁 All Files</li>
                <li onClick={() => setView('favorites')}>⭐ Favorites</li>
              </ul>
            </nav>
          </aside>

          <main className="main-content">
            <div className="top-bar">
              <div className="left-controls">
                <h1>Your Files</h1>
                <input
                  className="search-input"
                  placeholder="Search files..."
                  value={searchTerm}
                  onChange={e => setSearchTerm(e.target.value)}
                />
              </div>
              <div className="right-controls">
                <span className="user-info">
                  {credentials.username} ({userRole})
                </span>
                {userRole === 'admin' && (
                  <>
                    <input
                      className="file-input"
                      type="file"
                      onChange={e => setFile(e.target.files[0])}
                    />
                    <button
                      className="upload-btn"
                      onClick={handleUpload}
                      disabled={!file || uploading}
                    >
                      {uploading ? 'Uploading...' : 'Upload File'}
                    </button>
                    <button
                      className="upload-btn"
                      style={{ background: '#ffc107', color: '#333' }}
                      onClick={() => setShowRename(true)}
                    >
                      Rename
                    </button>
                  </>
                )}
                <button className="logout-btn" onClick={handleLogout}>Logout</button>
              </div>
            </div>

            <div className="file-grid">
              {filteredFiles.map(link => {
                const fname = link.split('/').pop();
                const isFavorited = favorites.includes(fname);
                return (
                  <div className="file-card" key={fname}>
                    <div className="file-info">
                      <span className="file-name">{fname}</span>
                      <div className="file-actions icon-actions">
                        <button
                          className="icon-btn"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleFavoriteToggle(fname);
                          }}
                          title={isFavorited ? 'Unfavorite' : 'Favorite'}
                        >
                          <span role="img" aria-label="Favorite">
                            {isFavorited ? '⭐' : '☆'}
                          </span>
                        </button>

                        <button
                          className="icon-btn"
                          title="Download"
                          onClick={(e) => {
                            e.stopPropagation();
                            downloadFile(link, fname);
                          }}
                        >
                          <span role="img" aria-label="Download">⬇️</span>
                        </button>

                        {userRole === 'admin' && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDelete(fname);
                            }}
                            className="icon-btn delete-icon"
                            title="Delete"
                          >
                            <span role="img" aria-label="Delete">🗑️</span>
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </main>
        </div>
      )}

      {/* --- RENAME MODAL --- */}
      {showRename && (
        <div className="file-preview-modal" onClick={() => setShowRename(false)}>
          <div className="file-preview-box" onClick={e => e.stopPropagation()}>
            <button className="close-preview" onClick={() => setShowRename(false)}>×</button>
            <h2>Rename a File</h2>
            <form onSubmit={handleRename}>
              <div>
                <label>
                  File to rename:
                  <select value={renameOld} onChange={e => setRenameOld(e.target.value)}>
                    <option value="">-- Select file --</option>
                    {files.map(f => {
                      const fname = f.split('/').pop();
                      return <option key={fname} value={fname}>{fname}</option>
                    })}
                  </select>
                </label>
              </div>
              <div style={{ marginTop: '1em' }}>
                <label>
                  New name:
                  <input
                    type="text"
                    value={renameNew}
                    onChange={e => setRenameNew(e.target.value)}
                    placeholder="Enter new file name (with extension)"
                  />
                </label>
              </div>
              <button
                type="submit"
                disabled={renaming}
                style={{ marginTop: '1em', background: '#ffc107', color: '#333' }}
              >
                {renaming ? 'Renaming...' : 'Rename'}
              </button>
              {renameError && <div className="error">{renameError}</div>}
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
