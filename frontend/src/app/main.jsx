// [AGENT] React 앱 진입 파일 — StrictMode + App 렌더링
// 연관: App.jsx
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './style/index.css'
import App from './App.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
