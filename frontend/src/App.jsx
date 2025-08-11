import { useEffect, useState } from 'react';
import axios from 'axios';
import Markdown from 'react-markdown'
import './App.css'

const App = () => {
  const [user, setUser] = useState(null);
  const [repos, setRepos] = useState([]);
  const [files, setFiles] = useState({ files: [], folders: [] });
  const [pathStack, setPathStack] = useState(['']);
  const [selectedRepo, setSelectedRepo] = useState('');
  const [selectedFiles, setSelectedFiles] = useState([]);
  const [testCaseSummaries, setTestCaseSummaries] = useState([]);
  const [rawSummaryText, setRawSummaryText] = useState('');
  const [testCode, setTestCode] = useState('');
  const [prUrl, setPrUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [defaultBranch, setDefaultBranch] = useState('main');

  const API_URL = import.meta.env.VITE_API_URL;

  useEffect(() => {
    const checkAuth = async () => {
      try {
        const res = await axios.get(`${API_URL}/auth/user`, {
          withCredentials: true
        });
        setUser(res.data.user);
      } catch {
        setUser(null);
      }
    };
    checkAuth();
  }, []);

  const fetchRepos = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await axios.get(`${API_URL}/api/repos`, {
        withCredentials: true
      });
      setRepos(res.data);
    } catch (error) {
      setError(error.response?.data?.error || 'Failed to load repositories');
      console.error('Repo load error:', error.response?.data || error.message);
    } finally {
      setLoading(false);
    }
  };

  const fetchFiles = async (repo, path = '') => {
    if (!repo) return;
    setLoading(true);
    setError('');
    try {
      const encodedPath = encodeURIComponent(path);
      const res = await axios.get(
        `${API_URL}/api/files?repo=${repo}&path=${encodedPath}`,
        { withCredentials: true }
      );
      setFiles(res.data);
      setDefaultBranch(res.data.defaultBranch || 'main');
    } catch (error) {
      setError(error.response?.data?.error || 'Failed to load files');
      console.error('File load error:', error.response?.data || error.message);
    } finally {
      setLoading(false);
    }
  };

  const loadFileContent = async (path) => {
    try {
      const encodedPath = encodeURIComponent(path);
      const res = await axios.get(
        `${API_URL}/api/content?repo=${selectedRepo}&path=${encodedPath}&branch=${defaultBranch}`,
        { withCredentials: true }
      );
      return res.data.content;
    } catch (error) {
      console.error("Content load error:", error);
      return `// Error loading file content: ${error.response?.data?.error || 'File not found'}`;
    }
  };

  const handleRepoChange = async (repoFullName) => {
    setSelectedRepo(repoFullName);
    setFiles({ files: [], folders: [] });
    setPathStack(['']);
    setSelectedFiles([]);
    setTestCaseSummaries([]);
    setTestCode('');
    setPrUrl('');
    await fetchFiles(repoFullName, '');
  };

  const navigateFolder = (folderPath) => {
    const newStack = [...pathStack, folderPath];
    setPathStack(newStack);
    fetchFiles(selectedRepo, folderPath);
  };

  const goBack = () => {
    if (pathStack.length > 1) {
      const newStack = [...pathStack];
      newStack.pop();
      setPathStack(newStack);
      const prevPath = newStack[newStack.length - 1] || '';
      fetchFiles(selectedRepo, prevPath);
    }
  };

  const toggleFileSelection = async (file) => {
    setLoading(true);
    try {
      const existingIndex = selectedFiles.findIndex(f => f.path === file.path);
      if (existingIndex >= 0) {
        setSelectedFiles(prev => prev.filter(f => f.path !== file.path));
      } else {
        const content = await loadFileContent(file.path);
        const language = file.extension;
        console.log("===file content ------",content);
        setSelectedFiles(prev => [
          ...prev,
          {
            ...file,
            content,
            language
          }
        ]);
      }
    } catch (error) {
      setError('Failed to load file content');
      console.error('File content error:', error);
    } finally {
      setLoading(false);
    }
  };

 const generateTestSummaries = async () => {
  if (selectedFiles.length === 0) {
    setError('Please select at least one file');
    return;
  }
  setLoading(true);
  setError('');
  try {
    // Debug: log selected files
    console.log('Sending files for summary:', selectedFiles);

    const res = await axios.post(
      `${API_URL}/api/testcases/summaries`,
      {
        files: selectedFiles.map(f => ({
          filename: f.name,
          language: f.language,
          content: f.content
        }))
      },
      { withCredentials: true }
    );
    // Debug: log response
    console.log('Summary response:', res.data);

    if (res.data.summaries && res.data.summaries.length > 0) {
      setTestCaseSummaries(res.data.summaries);
      setRawSummaryText(res.data.rawText || '');
    } else {
      setError('No summaries returned. Try different files.');
    }
  } catch (error) {
    setError(error.response?.data?.error || 'Failed to generate test summaries');
    console.error('Summary generation error:', error.response?.data || error.message);
  } finally {
    setLoading(false);
  }
};

// New function to generate code for all summaries (raw text)
const generateAllTestCode = async () => {
  if (!rawSummaryText || selectedFiles.length === 0) return;
  setLoading(true);
  setError('');
  try {
    const res = await axios.post(
      `${API_URL}/api/testcases/code`,
      {
        summary: rawSummaryText,
        files: selectedFiles.map(f => ({
          filename: f.name,
          language: f.language,
          content: f.content
        }))
      },
      { withCredentials: true }
    );
    if (res.data.testCode && res.data.testCode.trim().length > 0) {
      setTestCode(res.data.testCode);
    } else {
      setError('No test code returned. Try another summary or file.');
    }
  } catch (error) {
    setError('Failed to generate test code');
    console.error('Test generation error:', error);
  } finally {
    setLoading(false);
  }
};

  const generateTestCode = async (summary) => {
  if (!summary || selectedFiles.length === 0) return;
  setLoading(true);
  setError('');
  try {
    const res = await axios.post(
      `${API_URL}/api/testcases/code`,
      {
        summary,
        files: selectedFiles.map(f => ({
          filename: f.name,
          language: f.language,
          content: f.content
        }))
      },
      { withCredentials: true }
    );
    console.log('Test code response:', res.data); // Debug log
    if (res.data.testCode && res.data.testCode.trim().length > 0) {
  setTestCode(res.data.testCode);
} else {
  setError('No test code returned. Try another summary or file.');
}
  } catch (error) {
    setError('Failed to generate test code');
    console.error('Test generation error:', error);
  } finally {
    setLoading(false);
  }
};

  const createPR = async () => {
    if (!testCode || selectedFiles.length === 0) {
      setError('No test code to submit');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const languages = selectedFiles.map(f => f.language);
      const languageCount = languages.reduce((acc, lang) => {
        acc[lang] = (acc[lang] || 0) + 1;
        return acc;
      }, {});
      const primaryLanguage = Object.entries(languageCount)
        .sort((a, b) => b[1] - a[1])[0][0];
      const res = await axios.post(
        `${API_URL}/api/create-pr`,
        {
          repo: selectedRepo,
          testCode,
          language: primaryLanguage
        },
        { withCredentials: true }
      );
      setPrUrl(res.data.url);
    } catch (error) {
      setError('Failed to create pull request');
      console.error('PR creation error:', error);
    } finally {
      setLoading(false);
    }
  };

  const logout = async () => {
    try {
      await axios.get(`${API_URL}/auth/logout`, {
        withCredentials: true
      });
      setUser(null);
      setSelectedFiles([]);
      setTestCaseSummaries([]);
      setTestCode('');
      setPrUrl('');
      window.location.href = '/';
    } catch (error) {
      console.error('Logout error:', error);
    }
  };

  const authgit = `${API_URL}/auth/github`;

  if (!user) {
    // return (
    //   <div style={styles.container}>
    //     <h2>Test Case Generator</h2>
    //     <a href="http://localhost:5000/auth/github" style={styles.loginButton}>
    //       Login with GitHub
    //     </a>
    //   </div>
    // );
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50">
        <h2 className="text-3xl font-bold mb-6 text-gray-800">Test Case Generator</h2>
        <a
          href={authgit}
          className="px-6 py-3 bg-gray-900 text-white rounded shadow hover:bg-gray-700 transition"
        >
          Login with GitHub
        </a>
      </div>
    );
  }

  return (
    <div className=" mx-auto p-6 bg-white rounded-lg shadow-md mt-8">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-bold text-gray-800">Welcome {user.username}</h2>
        <button
          onClick={logout}
          className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700 transition"
        >
          Logout
        </button>
      </div>

      {/* {error && (
        <div className="mb-4 p-3 bg-red-100 text-red-700 border border-red-300 rounded">
          {error}
        </div>
      )}
      {loading && (
        <div className="mb-4 p-3 bg-blue-100 text-blue-700 border border-blue-300 rounded">
          Loading...
        </div>
      )} */}
      {/* Toast for error */}
{error && (
  <div className="fixed top-6 right-6 z-50 bg-red-600 text-white px-6 py-3 rounded shadow-lg flex items-center space-x-2 animate-fade-in">
    <span>❌</span>
    <span>{error}</span>
    <button
      className="ml-4 text-white hover:text-gray-200 font-bold"
      onClick={() => setError('')}
      aria-label="Close"
    >
      ×
    </button>
  </div>
)}

{/* Toast for loading */}
{loading && (
  <div className="fixed top-6 left-1/2 transform -translate-x-1/2 z-50 bg-blue-600 text-white px-6 py-3 rounded shadow-lg flex items-center space-x-2 animate-fade-in"

>
    <svg className="animate-spin h-5 w-5 mr-2 text-white" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none"/>
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
    </svg>
    <span>Loading...</span>
  </div>
)}

      <div className="mb-8 p-4 border rounded bg-gray-50">
        <h3 className="text-lg font-semibold mb-2 text-gray-700">Repositories</h3>
        <button
          onClick={fetchRepos}
          disabled={loading}
          className="px-4 py-2 bg-blue-600 text-white rounded mr-2 hover:bg-blue-700 transition"
        >
          {repos.length ? 'Refresh Repositories' : 'Load Repositories'}
        </button>
        <select
          value={selectedRepo}
          onChange={e => handleRepoChange(e.target.value)}
          className="px-3 py-2 border rounded w-full max-w-md mt-2"
        >
          <option value="">Select a repository</option>
          {repos.map(repo => (
            <option key={repo.full_name} value={repo.full_name}>
              {repo.full_name}
            </option>
          ))}
        </select>
      </div>

      {selectedRepo && (
        <div className="mb-8 p-4 border rounded bg-gray-50">
          <h3 className="text-lg font-semibold mb-2 text-gray-700">Files</h3>
          <div className="flex items-center mb-3">
            <span className="font-semibold text-gray-600">Current Path:</span>
            <span className="ml-2 font-mono text-gray-500">{pathStack.join('/')}</span>
            {pathStack.length > 1 && (
              <button
                onClick={goBack}
                className="ml-4 px-2 py-1 bg-gray-300 text-gray-700 rounded hover:bg-gray-400 transition"
              >
                ⬅️ Back
              </button>
            )}
          </div>
          <ul className="max-h-64 overflow-y-auto border rounded p-2 bg-white">
            {files.folders.map(folder => (
              <li key={folder.path}>
                <button
                  className="flex items-center w-full text-left px-2 py-1 hover:bg-gray-100 rounded"
                  onClick={() => navigateFolder(folder.path)}
                >
                  <span className="mr-2">📁</span> {folder.name}
                </button>
              </li>
            ))}
            {files.files.map(file => (
              <li key={file.path}>
                <button
                  className="flex items-center w-full text-left px-2 py-1 hover:bg-gray-100 rounded"
                  onClick={() => toggleFileSelection(file)}
                >
                  <span className="mr-2">📄</span> {file.name}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {selectedFiles.length > 0 && (
        <div className="mb-8 p-4 border rounded bg-gray-50">
          <h3 className="text-lg font-semibold mb-2 text-gray-700">
            Selected Files ({selectedFiles.length})
          </h3>
          <ul className="mb-3">
            {selectedFiles.map((file, i) => (
              <li key={i} className="py-1 border-b last:border-b-0 text-gray-600">
                {file.name} <span className="text-xs text-gray-400">({file.language})</span>
              </li>
            ))}
          </ul>
          <button
            onClick={generateTestSummaries}
            disabled={loading}
            className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 transition font-bold"
          >
            Generate Test Case Summaries
          </button>
        </div>
      )}

      {/* {testCaseSummaries.length > 0 && (
        <div className="mb-8 p-4 border rounded bg-gray-50">
          <h3 className="text-lg font-semibold mb-2 text-gray-700">Test Case Summaries</h3>
          <ul>
            {testCaseSummaries.map((summary, i) => (
              <li key={i} className="mb-2">
                <button
                  onClick={() => generateTestCode(summary)}
                  disabled={loading}
                  className="w-full text-left px-3 py-2 bg-gray-200 hover:bg-gray-300 rounded transition"
                >
                  <Markdown>{summary}</Markdown>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )} */}

      {testCaseSummaries.length > 0 && (
  <div className="mb-8 p-4 border rounded bg-gray-50">
    <div className="flex justify-between items-center mb-2">
      <h3 className="text-lg font-semibold text-gray-700">Test Case Summaries</h3>
      <button
        onClick={generateAllTestCode}
        disabled={loading}
        className="px-4 py-2 bg-indigo-600 text-white rounded hover:bg-indigo-700 transition font-bold"
      >
        🧩 Generate All Test Code
      </button>
    </div>
    <ul>
      {testCaseSummaries.map((summary, i) => (
        <li key={i} className="mb-2">
          <button
            onClick={() => generateTestCode(summary)}
            disabled={loading}
            className="w-full text-left px-3 py-2 bg-gray-200 hover:bg-gray-300 rounded transition"
          >
            <Markdown>{summary}</Markdown>
          </button>
        </li>
      ))}
    </ul>
  </div>
)}




      {typeof testCode === 'string' && testCode.trim().length > 0 && (
        <div className="mb-8 p-4 border rounded bg-gray-50">
          <h3 className="text-lg font-semibold mb-2 text-gray-700">Generated Test Code</h3>
          <pre className="p-4 bg-gray-900 text-green-200 rounded overflow-x-auto max-h-96 whitespace-pre-wrap">
            {testCode}
          </pre>
          <button
            onClick={createPR}
            disabled={loading}
            className="px-4 py-2 bg-purple-700 text-white rounded hover:bg-purple-800 transition font-bold mt-3"
          >
            🔀 Create Pull Request
          </button>
        </div>
      )}

      {prUrl && (
        <div className="mb-8 p-4 border rounded bg-gray-50 flex items-center">
          <a
            href={prUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 transition"
          >
            ✅ View Pull Request on GitHub
          </a>
        </div>
      )}
    </div>
  );

//   return (
//     <div style={styles.container}>
//       <div style={styles.header}>
//         <h2>Welcome {user.username}</h2>
//         <button onClick={logout} style={styles.logoutButton}>
//           Logout
//         </button>
//       </div>

//       {error && <div style={styles.error}>{error}</div>}
//       {loading && <div style={styles.loading}>Loading...</div>}

//       <div style={styles.section}>
//         <h3>Repositories</h3>
//         <button
//           onClick={fetchRepos}
//           disabled={loading}
//           style={styles.button}
//         >
//           {repos.length ? 'Refresh Repositories' : 'Load Repositories'}
//         </button>
//         <select
//           value={selectedRepo}
//           onChange={e => handleRepoChange(e.target.value)}
//         >
//           <option value="">Select a repository</option>
//           {repos.map(repo => (
//             <option key={repo.full_name} value={repo.full_name}>
//               {repo.full_name}
//             </option>
//           ))}
//         </select>
//       </div>

//       {selectedRepo && (
//         <div style={styles.section}>
//           <h3>Files</h3>
//           <div style={styles.pathContainer}>
//             <span style={styles.pathLabel}>Current Path: </span>
//             <span style={styles.pathText}>{pathStack.join('/')}</span>
//             {pathStack.length > 1 && (
//               <button onClick={goBack} style={styles.smallButton}>
//                 ⬅️ Back
//               </button>
//             )}
//           </div>
//           <div style={styles.fileList}>
//             <ul>
//               {files.folders.map(folder => (
//                 <li key={folder.path}>
//                   <button
//                     style={styles.folderButton}
//                     onClick={() => navigateFolder(folder.path)}
//                   >
//                     📁 {folder.name}
//                   </button>
//                 </li>
//               ))}
//               {files.files.map(file => (
//                 <li key={file.path}>
//                   <button
//                     style={styles.fileButton}
//                     onClick={() => toggleFileSelection(file)}
//                   >
//                     📄 {file.name}
//                   </button>
//                 </li>
//               ))}
//             </ul>
//           </div>
//         </div>
//       )}

//       {selectedFiles.length > 0 && (
//         <div style={styles.section}>
//           <h3>Selected Files ({selectedFiles.length})</h3>
//           <ul style={styles.selectedFilesList}>
//             {selectedFiles.map((file, i) => (
//               <li key={i} style={styles.selectedFileItem}>
//                 {file.name} ({file.language})
//               </li>
//             ))}
//           </ul>
//           <button
//             onClick={generateTestSummaries}
//             disabled={loading}
//             style={styles.generateButton}
//           >
//             🧠 Generate Test Case Summaries
//           </button>
//         </div>
//       )}

//       {testCaseSummaries.length > 0 && (
//         <div style={styles.section}>
//           <h3>Test Case Summaries</h3>
//           <ul style={styles.summaryList}>
//             {testCaseSummaries.map((summary, i) => (
//               <li key={i} style={styles.summaryItem}>
//                 <button
//                   onClick={() => generateTestCode(summary)}
//                   disabled={loading}
//                   style={styles.summaryButton}
//                 >
//                   <Markdown>{summary}</Markdown>
//                 </button>
//               </li>
//             ))}
//           </ul>
//         </div>
//       )}

//       {error && <div style={styles.error}>{error}</div>}
// {/* <div>
//   <strong>Raw testCode:</strong>
//   <pre>{JSON.stringify(testCode)}</pre>
// </div> */}
// {typeof testCode === 'string' && testCode.trim().length > 0 && (
//   <div style={styles.section}>
//     <h3>Generated Test Code</h3>
//     <pre style={styles.codeBlock}>{testCode}</pre>
//     <button
//       onClick={createPR}
//       disabled={loading}
//       style={styles.prButton}
//     >
//       🔀 Create Pull Request
//     </button>
//   </div>
// )}

//       {prUrl && (
//         <div style={styles.section}>
//           <a href={prUrl} target="_blank" rel="noopener noreferrer" style={styles.prLink}>
//             ✅ View Pull Request on GitHub
//           </a>
//         </div>
//       )}
//     </div>
//   );
};


// Styles
// const styles = {
//   container: {
//     padding: '20px',
//     maxWidth: '800px',
//     margin: '0 auto',
//     fontFamily: 'Arial, sans-serif'
//   },
//   header: {
//     display: 'flex',
//     justifyContent: 'space-between',
//     alignItems: 'center',
//     marginBottom: '20px'
//   },
//   loginButton: {
//     display: 'inline-block',
//     padding: '10px 15px',
//     backgroundColor: '#24292e',
//     color: 'white',
//     textDecoration: 'none',
//     borderRadius: '5px',
//     fontWeight: 'bold'
//   },
//   logoutButton: {
//     padding: '8px 12px',
//     backgroundColor: '#dc3545',
//     color: 'white',
//     border: 'none',
//     borderRadius: '4px',
//     cursor: 'pointer'
//   },
//   section: {
//     marginBottom: '30px',
//     padding: '15px',
//     border: '1px solid #ddd',
//     borderRadius: '5px',
//     backgroundColor: '#f9f9f9'
//   },
//   button: {
//     padding: '8px 15px',
//     margin: '5px',
//     backgroundColor: '#007bff',
//     color: 'white',
//     border: 'none',
//     borderRadius: '4px',
//     cursor: 'pointer'
//   },
//   smallButton: {
//     padding: '5px 10px',
//     marginLeft: '10px',
//     backgroundColor: '#6c757d',
//     color: 'white',
//     border: 'none',
//     borderRadius: '4px',
//     cursor: 'pointer'
//   },
//   generateButton: {
//     padding: '10px 15px',
//     backgroundColor: '#28a745',
//     color: 'white',
//     border: 'none',
//     borderRadius: '4px',
//     cursor: 'pointer',
//     fontWeight: 'bold',
//     marginTop: '10px'
//   },
//   prButton: {
//     padding: '10px 15px',
//     backgroundColor: '#6f42c1',
//     color: 'white',
//     border: 'none',
//     borderRadius: '4px',
//     cursor: 'pointer',
//     fontWeight: 'bold',
//     marginTop: '10px'
//   },
//   select: {
//     padding: '8px',
//     margin: '10px 0',
//     width: '100%',
//     maxWidth: '400px'
//   },
//   pathContainer: {
//     display: 'flex',
//     alignItems: 'center',
//     marginBottom: '15px'
//   },
//   pathLabel: {
//     fontWeight: 'bold'
//   },
//   pathText: {
//     marginLeft: '5px',
//     fontFamily: 'monospace'
//   },
//   fileList: {
//     maxHeight: '300px',
//     overflowY: 'auto',
//     border: '1px solid #ddd',
//     borderRadius: '4px',
//     padding: '10px'
//   },
//   fileItem: {
//     display: 'flex',
//     alignItems: 'center',
//     margin: '5px 0'
//   },
//   folderButton: {
//     padding: '5px',
//     backgroundColor: 'transparent',
//     border: 'none',
//     cursor: 'pointer',
//     textAlign: 'left',
//     display: 'flex',
//     alignItems: 'center'
//   },
//   fileButton: {
//     padding: '5px',
//     backgroundColor: 'transparent',
//     border: 'none',
//     cursor: 'pointer',
//     textAlign: 'left',
//     display: 'flex',
//     alignItems: 'center'
//   },
//   checkbox: {
//     marginRight: '10px'
//   },
//   selectedFilesList: {
//     listStyleType: 'none',
//     padding: 0
//   },
//   selectedFileItem: {
//     padding: '5px 0',
//     borderBottom: '1px solid #eee'
//   },
//   summaryList: {
//     listStyleType: 'none',
//     padding: 0
//   },
//   summaryItem: {
//     margin: '10px 0'
//   },
//   summaryButton: {
//     padding: '10px',
//     width: '100%',
//     textAlign: 'left',
//     backgroundColor: '#e9ecef',
//     border: '1px solid #ced4da',
//     borderRadius: '4px',
//     cursor: 'pointer'
//   },
//   codeBlock: {
//     padding: '15px',
//     backgroundColor: '#2d2d2d',
//     color: '#f8f8f2',
//     borderRadius: '4px',
//     overflowX: 'auto',
//     maxHeight: '400px',
//     whiteSpace: 'pre-wrap'
//   },
//   prLink: {
//     display: 'inline-block',
//     padding: '10px',
//     backgroundColor: '#28a745',
//     color: 'white',
//     textDecoration: 'none',
//     borderRadius: '4px'
//   },
//   error: {
//     padding: '10px',
//     backgroundColor: '#f8d7da',
//     color: '#721c24',
//     border: '1px solid #f5c6cb',
//     borderRadius: '4px',
//     margin: '10px 0'
//   },
//   loading: {
//     padding: '10px',
//     backgroundColor: '#cce5ff',
//     color: '#004085',
//     border: '1px solid #b8daff',
//     borderRadius: '4px',
//     margin: '10px 0'
//   }
// };

export default App;