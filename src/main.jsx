import React from 'react'
import ReactDOM from 'react-dom/client'
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClient } from './lib/queryClient'
import { OnlineProvider } from './lib/OnlineContext'
import App from './App'
import './index.css'

ReactDOM.createRoot(document.getElementById('app')).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <OnlineProvider>
        <App />
      </OnlineProvider>
    </QueryClientProvider>
  </React.StrictMode>
)
