import express from 'express';
import session from 'express-session';
import passport from 'passport';
import { Strategy as GitHubStrategy } from 'passport-github2';
import { Octokit } from '@octokit/rest';
import cors from 'cors';
import bodyParser from 'body-parser';
import dotenv from 'dotenv';
import axios from 'axios';
import { GoogleGenerativeAI } from '@google/generative-ai';

dotenv.config();

const app = express();
app.use(cors({ origin: process.env.FRONTEND_URL, credentials: true }));
app.use(bodyParser.json());
app.use(
  session({
    secret: process.env.SESSION_SECRET || 'your_secret',
    resave: false,
    saveUninitialized: false,
    cookie: {
      secure: process.env.NODE_ENV === 'production',
      httpOnly: true,
      maxAge: 24 * 60 * 60 * 1000,
    }
  })
);
app.use(passport.initialize());
app.use(passport.session());

// Auth middleware
const ensureAuthenticated = (req, res, next) => {
  if (req.isAuthenticated()) return next();
  res.status(401).json({ error: 'Not authenticated' });
};

passport.serializeUser((user, done) => done(null, user));
passport.deserializeUser((obj, done) => done(null, obj));

passport.use(
  new GitHubStrategy(
    {
      clientID: process.env.GITHUB_CLIENT_ID,
      clientSecret: process.env.GITHUB_CLIENT_SECRET,
      callbackURL: process.env.GITHUB_CALLBACK_URL ,
      scope: ['repo']
    },
    (accessToken, refreshToken, profile, done) => {
      profile.accessToken = accessToken;
      return done(null, profile);
    }
  )
);

// Routes
app.get('/auth/github', passport.authenticate('github'));
app.get(
  '/auth/github/callback',
  passport.authenticate('github', { failureRedirect: '/' }),
  (req, res) => {
    res.redirect(process.env.FRONTEND_URL + '/dashboard');
  }
);

// app.get('/auth/logout', (req, res) => {
//   req.logout(() => {
//     req.session.destroy(err => {
//       if (err) console.log('Error destroying session:', err);
//       res.clearCookie('connect.sid');
//       res.redirect('http://localhost:5173');
//     });
//   });
// });

app.get('/auth/logout', (req, res) => {
  req.logout(function(err) {
    if (err) {
      console.log('Error during logout:', err);
      return res.status(500).json({ error: 'Logout failed' });
    }
    req.session.destroy(err => {
      if (err) {
        console.log('Error destroying session:', err);
        return res.status(500).json({ error: 'Session destroy failed' });
      }
      res.clearCookie('connect.sid');
      // Instead of redirect, send JSON so frontend can update state
      res.json({ success: true });
    });
  });
});

app.get('/auth/user', (req, res) => {
  if (!req.user) return res.status(401).json({ error: 'Not logged in' });
  res.json({ user: req.user });
});

// List user repositories
app.get('/api/repos', ensureAuthenticated, async (req, res) => {
  try {
    const octokit = new Octokit({ auth: req.user.accessToken });
    const repos = await octokit.paginate(octokit.repos.listForAuthenticatedUser);
    res.json(repos.map(r => ({ name: r.name, full_name: r.full_name })));
  } catch (error) {
    console.error('Error fetching repos:', error);
    res.status(500).json({ error: error.message || 'Failed to fetch repositories' });
  }
});

// List files and folders in a repo/path
app.get('/api/files', ensureAuthenticated, async (req, res) => {
  const { repo, path = '' } = req.query;
  if (!repo || !repo.includes('/')) {
    return res.status(400).json({ error: 'Invalid or missing repo parameter. Format should be owner/repo.' });
  }
  const [owner, repoName] = repo.split('/');
  const octokit = new Octokit({ auth: req.user.accessToken });

  try {
    const { data: repoData } = await octokit.repos.get({ owner, repo: repoName });
    const defaultBranch = repoData.default_branch;
    const { data } = await octokit.repos.getContent({
      owner,
      repo: repoName,
      path,
      ref: defaultBranch
    });

    const entries = Array.isArray(data) ? data : [data];
    const files = entries.filter(item => item.type === 'file').map(file => ({
      name: file.name,
      path: file.path,
      type: 'file',
      size: file.size,
      extension: file.name.split('.').pop() || '',
      download_url: file.download_url
    }));
    const folders = entries.filter(item => item.type === 'dir').map(folder => ({
      name: folder.name,
      path: folder.path,
      type: 'dir'
    }));

    res.json({ files: files || [], folders: folders || [], defaultBranch });
  } catch (error) {
    console.error('Error fetching files:', error);
    res.status(error.status || 500).json({ error: error.message || 'Unable to fetch repo contents' });
  }
});

// Get file content
app.get('/api/content', ensureAuthenticated, async (req, res) => {
  const { repo, path, branch } = req.query;
  const [owner, repoName] = repo.split('/');
  const octokit = new Octokit({ auth: req.user.accessToken });

  try {
    const { data: fileData } = await octokit.repos.getContent({
      owner,
      repo: repoName,
      path,
      ref: branch || 'main'
    });

    if (Array.isArray(fileData)) {
      return res.status(400).json({ error: 'Path is a directory' });
    }

    if (fileData.download_url) {
      const contentRes = await axios.get(fileData.download_url, {
        headers: { Authorization: `token ${req.user.accessToken}` }
      });
      return res.json({ content: contentRes.data });
    }

    if (fileData.content) {
      const content = Buffer.from(fileData.content, 'base64').toString('utf8');
      return res.json({ content });
    }

    res.status(404).json({ error: 'File content not available' });
  } catch (error) {
    console.error('Error getting content:', error);
    if (error.status === 404) {
      res.status(404).json({ error: 'File not found' });
    } else {
      res.status(500).json({ 
        error: 'Failed to get file content',
        details: error.message
      });
    }
  }
});

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// Generate test case summaries for multiple files

app.post('/api/testcases/summaries', ensureAuthenticated, async (req, res) => {
  try {
    const { files } = req.body;
    if (!files || !files.length) {
      return res.status(400).json({ error: 'No files provided' });
    }

    // const prompt = `Generate comprehensive test case summaries for the following code files:\n\n${
    //   files.map(file => 
    //     `File: ${file.filename}\nLanguage: ${file.language}\nCode:\n${file.content.substring(0, 2000)}`
    //   ).join('\n\n')
    // }\n\nProvide each test case summary as a separate bullet point.`;

    const prompt = `Generate comprehensive test case summary for the following code files:\n\n${
      files.map(file => 
        `File: ${file.filename}\nLanguage: ${file.language}\nCode:\n${file.content}`
      ).join('\n\n')
    }\n\nProvide each test case summary as a separate bullet point.`;

    console.log("promt ---",prompt);

    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
    const result = await model.generateContent(prompt);
    const response = await result.response;
    const text = response.text();

    console.log("promt textttt ---",text);

    // More robust summary extraction
    let summaries = [];
    // Try splitting by newlines and filtering lines that look like summaries
    //summaries = [...text.matchAll(/\*\*Test Case \d+:.*?(?=\n\*\*Test Case \d+:|\Z)/gms)].map(match => match[0].trim());

    summaries = [...text.matchAll(/\* \*\*Test Case \d+:[\s\S]*?(?=\n\* \*\*Test Case \d+:|\n$)/g)].map(match => match[0].trim());
    
    // text.split('\n')
    //   .map(line => line.trim())
    //   .filter(line => line.length > 0 && (
    //     line.startsWith('-') ||
    //     line.match(/^\d+\./) ||
    //     line.match(/Test case/i)
    //   ))
    //   .map(line => line.replace(/^[-\d+\.\s]+/, '').trim());
  //   summaries = text.split(/\*+\s*Test Case\s*\d+:/i)
  // .map((chunk, i) => {
  //   if (i === 0) return null; // First chunk is before Test Case 1
  //   return `**Test Case ${i}:** ${chunk.trim()}`;
  // })
  // .filter(Boolean);

    // If still empty, try splitting by double newlines (paragraphs)
    if (summaries.length === 0) {
      summaries = text.split('\n\n').map(s => s.trim()).filter(s => s.length > 0);
    }
    console.log("trimed text",summaries);
    res.json({ summaries , rawText: text});
  } catch (error) {
    console.error('Error generating test summaries:', error);
    res.status(500).json({ error: 'Failed to generate test summaries' });
  }
});

// Generate test code for a specific summary
app.post('/api/testcases/code', ensureAuthenticated, async (req, res) => {
  try {
    const { summary, files } = req.body;
    if (!summary || !files || !files.length) {
      return res.status(400).json({ error: 'Missing required data' });
    }

    // Define the prompt variable here!
    const prompt = `Generate complete test code implementation for the following test case summary:\n\n"${summary}"\n\nRelated code files:\n\n${
      files.map(file => 
        `File: ${file.filename}\nLanguage: ${file.language}\nCode:\n${file.content}`
      ).join('\n\n')
    }\n\nAt the top of the generated test code, include the test case summary (in short) as a comment.
Then provide only the test code without any explanations.`;

    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
    let result, response, text;
    try {
      result = await model.generateContent(prompt);
      response = await result.response;
      text = response.text();
      console.log('Gemini test code response:', text);
    } catch (aiError) {
      console.error('Gemini API error:', aiError);
      return res.status(500).json({ error: 'Gemini API error', details: aiError.message });
    }

    // ...existing extraction logic...
    let code = text;
    const match = text.match(/```[\w]*\n([\s\S]*?)```/);
    if (match) {
      code = match[1].trim();
    } else {
      const lines = text.split('\n').filter(line =>
        line.trim().length > 0 &&
        (line.trim().startsWith('import') ||
         line.trim().startsWith('def ') ||
         line.trim().startsWith('class ') ||
         line.trim().startsWith('from ') ||
         line.trim().startsWith('test_') ||
         line.trim().startsWith('describe(') ||
         line.trim().startsWith('it('))
      );
      if (lines.length > 0) {
        code = lines.join('\n');
      }
    }
    res.json({ testCode: code });
  } catch (error) {
    console.error('Error generating test code:', error);
    res.status(500).json({ error: 'Failed to generate test code' });
  }
});

// Create PR with generated test code
app.post('/api/create-pr', ensureAuthenticated, async (req, res) => {
  const { repo, testCode, language, testFileName = 'generated_tests' } = req.body;
  const [owner, repoName] = repo.split('/');
  const octokit = new Octokit({ auth: req.user.accessToken });

  const extensions = {
    js: '.test.js',
    ts: '.test.ts',
    py: '_test.py',
    java: 'Test.java',
    go: '_test.go',
    rb: '_spec.rb',
    php: 'Test.php',
    cs: 'Tests.cs'
  };
  
  const extension = extensions[language] || '.test.js';
  const testFilePath = `tests/${testFileName}${extension}`;
  const branchName = `add-tests-${Date.now()}`;

  try {
    const { data: repoData } = await octokit.repos.get({ owner, repo: repoName });
    const defaultBranch = repoData.default_branch || 'main';

    const { data: baseRef } = await octokit.git.getRef({ 
      owner, 
      repo: repoName, 
      ref: `heads/${defaultBranch}` 
    });
    
    await octokit.git.createRef({
      owner,
      repo: repoName,
      ref: `refs/heads/${branchName}`,
      sha: baseRef.object.sha,
    });

    await octokit.repos.createOrUpdateFileContents({
      owner,
      repo: repoName,
      path: testFilePath,
      message: 'Add generated test cases',
      content: Buffer.from(testCode).toString('base64'),
      branch: branchName
    });

    const { data: pr } = await octokit.pulls.create({
      owner,
      repo: repoName,
      title: 'Auto-generated test cases',
      head: branchName,
      base: defaultBranch,
      body: 'This PR adds automatically generated test cases'
    });

    res.json({ url: pr.html_url });
  } catch (error) {
    console.error('Error creating PR:', error);
    res.status(500).json({ error: 'Failed to create pull request' });
  }
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Internal server error' });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));