import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import { QueryClientProvider } from '@tanstack/react-query'
import App from './App.tsx'
import { queryClient } from './utils/queryClient'
import { RealtimeBridge } from './utils/realtime'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <RealtimeBridge />
      <App />
    </QueryClientProvider>
  </StrictMode>,
)
