# GitHub AI Test Case Generator

A full-stack application that connects to your GitHub repositories, lists code files, uses AI to generate test case summaries and code, and can create a pull request with the generated tests.

---
## App Demo

[![Watch the video](https://uxwing.com/wp-content/themes/uxwing/download/web-app-development/demo-button-label-icon.png)](https://github.com/UdayRaj04/testcasegenerator_using-github/blob/main/app_demo.mp4) 
---


## Features

- **GitHub Integration:**  
  Authenticate with GitHub and browse your repositories and files.

- **AI-Powered Test Case Suggestions:**  
  Select files and get AI-generated test case summaries for your code (supports Python, JavaScript, etc.).

- **Test Code Generation:**  
  Click a summary to generate complete test code (e.g., Python `unittest`, JavaScript `Jest`, etc.) using Google Gemini AI.

- **Batch Test Code Generation:**  
  Generate test code for all summaries at once.

- **Create Pull Request (Bonus):**  
  Automatically create a PR on GitHub with the generated test code.

---

## Tech Stack

- **Frontend:** React + Tailwind CSS
- **Backend:** Node.js (Express)
- **Authentication:** GitHub OAuth (passport-github2)
- **AI:** Google Gemini API
- **GitHub API:** octokit/rest.js

---

## Getting Started

### 1. Clone the Repository

```sh
git clone https://github.com/yourusername/testcase-git.git
cd testcase-git
```

### 2. Setup Environment Variables

Create `.env` files in both `backend/` and `frontend/` folders.

#### **Backend `.env`**
```
GITHUB_CLIENT_ID=your_github_client_id
GITHUB_CLIENT_SECRET=your_github_client_secret
GITHUB_CALLBACK_URL=http://localhost:5000/auth/github/callback
FRONTEND_URL=http://localhost:5173
SESSION_SECRET=your_session_secret
GEMINI_API_KEY=your_gemini_api_key
```

#### **Frontend `.env`**
```
VITE_API_URL=http://localhost:5000
```

### 3. Install Dependencies

#### **Backend**
```sh
cd backend
npm install
```

#### **Frontend**
```sh
cd ../frontend
npm install
```

### 4. Run the Application

#### **Backend**
```sh
npm run dev
```

#### **Frontend**
```sh
npm run dev
```

---

## Usage

1. **Login with GitHub:**  
   Click "Login with GitHub" and authorize the app.

2. **Browse Repositories & Files:**  
   Select a repository and browse its files/folders.

3. **Select Files:**  
   Click files to select them for test case generation.

4. **Generate Test Case Summaries:**  
   Click "Generate Test Case Summaries" to get AI-generated summaries.

5. **Generate Test Code:**  
   Click a summary to generate test code, or use "Generate All Test Code" for all summaries.

6. **Create Pull Request:**  
   Click "Create Pull Request" to submit the generated test code to your repo (creates a new branch and PR).

---


## Customization

- **Test Frameworks:**  
  The AI prompt can be adjusted to generate tests for your preferred framework (e.g., JUnit, Selenium, Jest, Pytest).

- **Supported Languages:**  
  Works with Python, JavaScript, TypeScript, Java, Go, Ruby, PHP, C#, etc.

---

## Security Notes

- **API Keys:**  
  Never commit your API keys. Use environment variables.

- **GitHub OAuth:**  
  Register your app at [GitHub Developer Settings](https://github.com/settings/developers) to get client ID/secret.

---
